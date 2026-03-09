import { supabase } from "@/lib/supabase/browser-client";
import { TablesInsert, TablesUpdate } from "@/supabase/types";
import mammoth from "mammoth";
import { toast } from "sonner";
import { uploadFile } from "./storage/files";
import JSZip from "jszip";
import {
  analyzeExcelFile,
  analyzePowerPointFile,
} from "@/lib/retrieval/processing/pdf1";
import mime from "mime-types";
import { ChatSettings } from "@/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/files" });
export const getFileById = async (fileId: string) => {
  const { data: file, error } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (!file) {
    throw new Error(error.message);
  }

  return file;
};

export const getFileWorkspacesByWorkspaceId = async (workspaceId: string) => {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select(
      `
      id,
      name,
      user_id,
      files (*)
    `,
    )
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    throw new Error(error.message);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(`developer_mode`)
    .eq("user_id", workspace.user_id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!profile?.developer_mode) {
    workspace.files = workspace.files.map(chatFile => {
      const fileFromFiles = workspace.files.find(
        file => file.id === chatFile.id,
      );
      if (fileFromFiles) {
        const rawType = fileFromFiles.original_type || fileFromFiles.type;
        let fileExtension = mime.extension(rawType);
        if (!fileExtension && /^[a-z]+$/i.test(rawType)) {
          fileExtension = rawType;
        }
        return {
          ...chatFile,
          type: fileFromFiles.original_type || chatFile.type,
          file_path: fileFromFiles.original_file_path || chatFile.file_path,
          name:
            chatFile.name.replace(/\.[^.]+$/, `.${fileExtension}`) ||
            chatFile.name,
        };
      }
      return chatFile;
    });
  }
  return workspace;
};

export const getFileWorkspacesByFileId = async (fileId: string) => {
  const { data: file, error } = await supabase
    .from("files")
    .select(
      `
      id, 
      name, 
      workspaces (*)
    `,
    )
    .eq("id", fileId)
    .single();

  if (!file) {
    throw new Error(error.message);
  }

  return file;
};

export const createFileBasedOnExtension = async (
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local",
  chatSettings?: ChatSettings,
  processedFile?: File,
) => {
  const fileExtension = file.name.split(".").pop();
  const originalFile = file;

  if (processedFile) {
    file = processedFile;
    if (file.name.endsWith(".txt") || file.type === "text/plain") {
      fileRecord.type = "txt";
    } else {
      fileRecord.type = file.type;
    }
    return createFile(
      file,
      fileRecord,
      workspace_id,
      embeddingsProvider,
      originalFile,
      chatSettings,
    );
  }

  if (fileExtension === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({
      arrayBuffer,
    });

    return createDocXFile(
      result.value,
      file,
      fileRecord,
      workspace_id,
      embeddingsProvider,
      chatSettings,
    );
  } else {
    return createFile(
      file,
      fileRecord,
      workspace_id,
      embeddingsProvider,
      null,
      chatSettings,
    );
  }
};

// For non-docx files
export const createFile = async (
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local",
  originalFile?: File,
  chatSettings?: ChatSettings,
) => {
  if (file.type === "application/zip") {
    originalFile = originalFile || file;
    const zip = new JSZip();
    const _zipContent = await zip.loadAsync(file);

    let combinedContent = "";
    const fileNames = [];
    const zipFileName = file.name.replace(/\.[^/.]+$/, "");

    const processZipEntry = async (relativePath, zipEntry) => {
      const isSystemFile =
        relativePath.includes(".DS_Store") ||
        relativePath.startsWith("__MACOSX") ||
        relativePath.startsWith("._");
      const isImageFile = /\.(png|jpg|jpeg|gif|bmp|svg)$/.test(
        zipEntry.name.toLowerCase(),
      );
      const isExcludedDir =
        relativePath.includes("/Fonts/") ||
        relativePath.includes("/icons/") ||
        relativePath.includes("/Tests/");
      const isGitFileOrDir =
        relativePath.includes("/.git/") || relativePath.includes(".git/");

      if (isSystemFile || isImageFile || isExcludedDir || isGitFileOrDir) {
        return;
      }

      if (zipEntry.dir) {
        return;
      }

      if (zipEntry.name.endsWith(".zip")) {
        const nestedZip = new JSZip();
        const nestedZipContent = await zipEntry.async("arraybuffer");
        const nestedZipFiles = await nestedZip.loadAsync(nestedZipContent);

        await Promise.all(
          Object.keys(nestedZipFiles.files).map(async nestedRelativePath => {
            const nestedZipEntry = nestedZipFiles.files[nestedRelativePath];
            await processZipEntry(nestedRelativePath, nestedZipEntry);
          }),
        );
        return;
      }

      const fileContent = await zipEntry.async("text");
      if (fileContent.trim()) {
        combinedContent += `File: ${zipEntry.name}\n\n${fileContent}\n\n`;
        fileNames.push(zipEntry.name);
      } else {
        logger.info("File is empty", { name: zipEntry.name });
      }
    };

    await Promise.all(
      Object.keys(zip.files).map(async relativePath => {
        const zipEntry = zip.files[relativePath];
        await processZipEntry(relativePath, zipEntry);
      }),
    );

    if (fileNames.length === 0 || combinedContent.trim() === "") {
      throw new Error("No valid files to combine from the ZIP archive.");
    }

    const combinedFileName = `${zipFileName}.txt`;
    const combinedFile = new File([combinedContent], combinedFileName, {
      type: "text/plain",
      lastModified: new Date().getTime(),
    });

    const combinedFileRecord = {
      ...fileRecord,
      name: combinedFileName,
      type: combinedFile.type,
      description: "",
    };

    const { data: createdFile, error } = await supabase
      .from("files")
      .insert([combinedFileRecord])
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await createFileWorkspace({
      user_id: createdFile.user_id,
      file_id: createdFile.id,
      workspace_id,
    });

    const filePath = await uploadFile(combinedFile, {
      name: createdFile.name,
      user_id: createdFile.user_id,
      file_id: createdFile.name,
    });

    await updateFile(createdFile.id, {
      file_path: filePath,
    });

    if (originalFile) {
      const originalFilePath = await uploadFile(originalFile, {
        name: originalFile.name,
        user_id: createdFile.user_id,
        file_id: `${createdFile.name}_original`,
      });

      await updateFile(createdFile.id, {
        original_file_path: originalFilePath,
        original_type: originalFile.type,
      });
    }

    const formData = new FormData();
    formData.append("file_id", createdFile.id);
    formData.append("embeddingsProvider", embeddingsProvider);
    formData.append("chatSettings", JSON.stringify(chatSettings));
    const response = await fetch("/api/retrieval/process", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const jsonText = await response.text();
      const json = JSON.parse(jsonText);
      logger.error("Error processing file", {
        fileId: createdFile.id,
        status: response.status,
        message: json.message,
      });
      toast.error("Failed to process file. Reason: " + json.message, {
        duration: 10000,
      });
      await deleteFile(createdFile.id);
    }

    const fetchedFile = await getFileById(createdFile.id);
    return fetchedFile;
  }

  // Handle Excel files
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  ) {
    originalFile = originalFile || file;
    const combinedFile = await analyzeExcelFile(file);

    const createdFile = await createFile(
      combinedFile,
      {
        ...fileRecord,
        name: combinedFile.name,
        type: combinedFile.type,
        description: "",
      },
      workspace_id,
      embeddingsProvider,
      originalFile,
      chatSettings,
    );
    return createdFile;
  }

  // Handle power point files
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.type === "application/vnd.ms-powerpoint"
  ) {
    originalFile = originalFile || file;
    const combinedFile = await analyzePowerPointFile(file);

    const createdFile = await createFile(
      combinedFile,
      {
        ...fileRecord,
        name: combinedFile.name,
        type: combinedFile.type,
        description: "",
      },
      workspace_id,
      embeddingsProvider,
      originalFile,
      chatSettings,
    );
    return createdFile;
  }

  // Handle non-ZIP files
  let validFilename = fileRecord.name
    .replace(/[^a-z0-9.]/gi, "_")
    .toLowerCase();
  const extension = file.name.split(".").pop();
  const extensionIndex = validFilename.lastIndexOf(".");
  const baseName = validFilename.substring(
    0,
    extensionIndex < 0 ? undefined : extensionIndex,
  );
  const maxBaseNameLength = 100 - (extension?.length || 0) - 1;
  if (baseName.length > maxBaseNameLength) {
    fileRecord.name =
      baseName.substring(0, maxBaseNameLength) + "." + extension;
  } else {
    fileRecord.name = baseName + "." + extension;
  }
  const { data: createdFile, error } = await supabase
    .from("files")
    .insert([fileRecord])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createFileWorkspace({
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    workspace_id,
  });

  const filePath = await uploadFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.name,
  });

  await updateFile(createdFile.id, {
    file_path: filePath,
  });
  // Handle original file upload
  if (originalFile) {
    const originalFilePath = await uploadFile(originalFile, {
      name: originalFile.name,
      user_id: createdFile.user_id,
      file_id: `${createdFile.name}_original`,
    });

    await updateFile(createdFile.id, {
      original_file_path: originalFilePath,
      original_type: originalFile.type,
    });
  }
  const formData = new FormData();
  formData.append("file_id", createdFile.id);
  formData.append("embeddingsProvider", embeddingsProvider);
  formData.append("chatSettings", JSON.stringify(chatSettings));
  const response = await fetch("/api/retrieval/process", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const jsonText = await response.text();
    const json = JSON.parse(jsonText);
    logger.error("Error processing file", {
      fileId: createdFile.id,
      status: response.status,
      message: json.message,
    });
    toast.error("Failed to process file. Reason:" + json.message, {
      duration: 10000,
    });
    await deleteFile(createdFile.id);
  }

  const fetchedFile = await getFileById(createdFile.id);

  return fetchedFile;
};

// // Handle docx files
export const createDocXFile = async (
  text: string,
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local",
  chatSettings?: ChatSettings,
) => {
  const { data: createdFile, error } = await supabase
    .from("files")
    .insert([fileRecord])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createFileWorkspace({
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    workspace_id,
  });

  const filePath = await uploadFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.name,
  });

  await updateFile(createdFile.id, {
    file_path: filePath,
  });

  const response = await fetch("/api/retrieval/process/docx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      fileId: createdFile.id,
      embeddingsProvider,
      fileExtension: "docx",
      chatSettings: chatSettings,
    }),
  });

  if (!response.ok) {
    const jsonText = await response.text();
    const json = JSON.parse(jsonText);
    logger.error("Error processing file", {
      fileId: createdFile.id,
      status: response.status,
      message: json.message,
    });
    toast.error("Failed to process file. Reason:" + json.message, {
      duration: 10000,
    });
    await deleteFile(createdFile.id);
  }

  const fetchedFile = await getFileById(createdFile.id);

  return fetchedFile;
};

export function normalizeFileName(fileName: string): string {
  let validFilename = fileName.replace(/[^a-z0-9.]/gi, "_").toLowerCase();
  const extensionIndex = validFilename.lastIndexOf(".");
  const extension =
    extensionIndex >= 0 ? validFilename.substring(extensionIndex + 1) : "";
  const baseName =
    extensionIndex >= 0
      ? validFilename.substring(0, extensionIndex)
      : validFilename;

  const maxBaseNameLength = 100 - (extension?.length || 0) - 1;

  if (baseName.length > maxBaseNameLength) {
    return baseName.substring(0, maxBaseNameLength) + "." + extension;
  } else {
    return extension ? baseName + "." + extension : baseName;
  }
}
export const checkFileExistence = async (fileName: string, userId: string) => {
  const incomingBaseName = normalizeFileName(fileName);
  const incomingNameWithoutExt = incomingBaseName.replace(/\.[^/.]+$/, "");
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const matchedFile = data.find(file => {
    const dbBaseName = normalizeFileName(file.name);
    const dbNameWithoutExt = dbBaseName.replace(/\.[^/.]+$/, "");
    return dbNameWithoutExt === incomingNameWithoutExt;
  });
  return matchedFile ?? null;
};

export const createFiles = async (
  files: TablesInsert<"files">[],
  workspace_id: string,
) => {
  const { data: createdFiles, error } = await supabase
    .from("files")
    .insert(files)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  await createFileWorkspaces(
    createdFiles.map(file => ({
      user_id: file.user_id,
      file_id: file.id,
      workspace_id,
    })),
  );

  return createdFiles;
};

export const createFileWorkspace = async (item: {
  user_id: string;
  file_id: string;
  workspace_id: string;
}) => {
  // Check if the relationship already exists
  const exists = await checkFileInWorkspace(item.file_id, item.workspace_id);
  if (exists) {
    // Return existing relationship
    const { data: existingWorkspace, error } = await supabase
      .from("file_workspaces")
      .select("*")
      .eq("file_id", item.file_id)
      .eq("workspace_id", item.workspace_id)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return existingWorkspace;
  }

  const { data: createdFileWorkspace, error } = await supabase
    .from("file_workspaces")
    .insert([item])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdFileWorkspace;
};

export const createFileWorkspaces = async (
  items: { user_id: string; file_id: string; workspace_id: string }[],
) => {
  // Filter out items that might already exist to avoid duplicates
  const uniqueItems = [];

  for (const item of items) {
    const exists = await checkFileInWorkspace(item.file_id, item.workspace_id);
    if (!exists) {
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) {
    return []; // All relationships already exist
  }

  const { data: createdFileWorkspaces, error } = await supabase
    .from("file_workspaces")
    .insert(uniqueItems)
    .select("*");

  if (error) throw new Error(error.message);

  return createdFileWorkspaces;
};

export const updateFile = async (
  fileId: string,
  file: TablesUpdate<"files">,
) => {
  const { data: updatedFile, error } = await supabase
    .from("files")
    .update(file)
    .eq("id", fileId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedFile;
};

export const deleteFile = async (fileId: string) => {
  const { error } = await supabase.from("files").delete().eq("id", fileId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const deleteFileWorkspace = async (
  fileId: string,
  workspaceId: string,
) => {
  const { error } = await supabase
    .from("file_workspaces")
    .delete()
    .eq("file_id", fileId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  return true;
};

export const checkFileInWorkspace = async (
  fileId: string,
  workspaceId: string,
) => {
  const { data, error } = await supabase
    .from("file_workspaces")
    .select("file_id, workspace_id")
    .eq("file_id", fileId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    logger.error("Error checking file in workspace", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error(error.message);
  }

  return !!data;
};
