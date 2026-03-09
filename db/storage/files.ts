import { supabase } from "@/lib/supabase/browser-client";
import { toast } from "sonner";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/storage/files" });

const BASE_CHUNK_LIMIT = parseInt(
  process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT || "10000000",
  10,
);

const DEFAULT_CHUNK_SIZE = parseInt(
  process.env.NEXT_PUBLIC_CHUNK_UPLOAD_SIZE || `${BASE_CHUNK_LIMIT}`,
  10,
);

const CHUNK_SIZE = Math.max(
  512 * 1024,
  Math.min(DEFAULT_CHUNK_SIZE, BASE_CHUNK_LIMIT),
);

const CHUNK_FOLDER = "__chunks";

const uploadLargeFileInChunks = async (
  file: File,
  payload: {
    name: string;
    user_id: string;
    file_id: string;
  },
  expectedFilePath: string,
) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    const formData = new FormData();
    formData.append("chunk", blob, `${payload.file_id}.part-${chunkIndex}`);
    formData.append("chunkIndex", chunkIndex.toString());
    formData.append("totalChunks", totalChunks.toString());
    formData.append("fileId", payload.file_id);
    formData.append("fileName", payload.name);
    formData.append("contentType", file.type || "application/octet-stream");
    formData.append("fileSize", file.size.toString());
    formData.append("chunkSize", blob.size.toString());
    formData.append("offset", start.toString());
    formData.append("userId", payload.user_id);

    const response = await fetch("/api/files/chunk-upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = "Failed to upload file chunk";
      try {
        const errorJson = await response.json();
        errorMessage = errorJson?.error || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (chunkIndex === totalChunks - 1) {
      if (!result?.completed) {
        throw new Error("Failed to finalize chunked upload");
      }

      if (result?.filePath && result.filePath !== expectedFilePath) {
        throw new Error("Chunked upload completed with unexpected path");
      }
    }
  }
};

export const uploadFile = async (
  file: File,
  payload: {
    name: string;
    user_id: string;
    file_id: string;
  },
) => {
  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString("base64")}`;

  if (file.size > BASE_CHUNK_LIMIT) {
    await uploadLargeFileInChunks(file, payload, filePath);
    return filePath;
  }

  const { error } = await supabase.storage
    .from("files")
    .upload(filePath, file, {
      upsert: true,
    });

  if (error) {
    throw new Error("Error uploading file");
  }

  return filePath;
};

const decodeStoragePath = (path?: string | null) => {
  if (!path || typeof path !== "string") return null;
  const firstSlash = path.indexOf("/");
  if (firstSlash === -1) return null;

  return {
    userId: path.slice(0, firstSlash),
    encodedFileId: path.slice(firstSlash + 1),
  };
};

const cleanupChunkArtifacts = async (userId: string, encodedFileId: string) => {
  if (!userId || !encodedFileId) return;

  const chunkPrefix = `${userId}/${CHUNK_FOLDER}/${encodedFileId}`;

  const { data, error } = await supabase.storage
    .from("files")
    .list(chunkPrefix);

  if (error || !data || data.length === 0) {
    return;
  }

  const chunkPaths = data.map(entry => `${chunkPrefix}/${entry.name}`);
  await supabase.storage.from("files").remove(chunkPaths);
};

export const deleteFileFromStorage = async (
  filePath: string,
  originalFilePath?: string | null,
  developer_mode?: boolean | null,
) => {
  const pathsToRemove = new Set<string>();
  const appendPath = (path?: string | null) => {
    if (path && path.trim()) {
      pathsToRemove.add(path);
    }
  };

  appendPath(filePath);
  appendPath(originalFilePath);

  const applyCounterpartRemoval = async (
    referencePath?: string | null,
    toggleMode?: "addOriginal" | "removeOriginalSuffix",
  ) => {
    const decoded = decodeStoragePath(referencePath);
    if (!decoded) return decoded;

    const { userId, encodedFileId } = decoded;
    const fileId = Buffer.from(encodedFileId, "base64").toString("utf-8");

    if (toggleMode === "addOriginal") {
      const originalId = `${fileId}_original`;
      appendPath(`${userId}/${Buffer.from(originalId).toString("base64")}`);
    } else if (
      toggleMode === "removeOriginalSuffix" &&
      fileId.endsWith("_original")
    ) {
      const baseId = fileId.replace(/_original$/, "");
      appendPath(`${userId}/${Buffer.from(baseId).toString("base64")}`);
    }

    await cleanupChunkArtifacts(userId, encodedFileId);

    return decoded;
  };

  const _primaryDecoded = await applyCounterpartRemoval(
    filePath,
    developer_mode ? "addOriginal" : "removeOriginalSuffix",
  );

  if (originalFilePath) {
    await applyCounterpartRemoval(originalFilePath);
  }

  const { error } = await supabase.storage
    .from("files")
    .remove(Array.from(pathsToRemove));

  if (error) {
    toast.error("Failed to remove file!");
  }
};

export const getFileFromStorage = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(filePath, 60 * 60 * 24); // 24hrs

  if (error) {
    logger.error("Error uploading file", {
      filePath,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error("Error downloading file");
  }

  return data.signedUrl;
};
