import { createClientLogger } from "@/lib/logger/client";
import { ChatbotUIContext } from "@/context/context";
import {
  createFile,
  getFileWorkspacesByWorkspaceId,
  checkFileExistence,
  checkFileInWorkspace,
  createFileWorkspace,
} from "@/db/files";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import JSZip from "jszip";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import imageCompression from "browser-image-compression";
import {
  analyzeWithFormRecognizer,
  analyzeExcelFile,
  analyzePowerPointFile,
  extractExcelImages,
  extractPowerPointImages,
  extractEmbeddedFilesFromPowerPoint,
  createPdfFromZip,
  createPdfFromImages,
  readFileAsText,
  analyzeWordFile,
} from "@/lib/retrieval/processing/pdf1";
import { v4 as uuidv4 } from "uuid";
import { createChatFiles } from "@/db/chat-files";
export const ACCEPTED_FILE_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/json",
  "text/markdown",
  "application/pdf",
  "text/plain",
  "text/php",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

const logger = createClientLogger({ component: "UseSelectFileHandler" });

export const useSelectFileHandler = () => {
  const { t } = useTranslation();
  const {
    selectedWorkspace,
    profile,
    chatSettings,
    setNewMessageImages,
    setNewMessageFiles,
    setShowFilesDisplay,
    setFiles,
    setUseRetrieval,
    setChatFiles,
    selectedChat,
    selectedAssistant,
    assistantDirectModeWebhook,
  } = useContext(ChatbotUIContext);

  const [filesToAccept, setFilesToAccept] = useState(ACCEPTED_FILE_TYPES);

  useEffect(() => {
    handleFilesToAccept();
  }, [chatSettings?.model]);

  const handleFilesToAccept = () => {
    const model = chatSettings?.model;
    const FULL_MODEL = LLM_LIST.find(llm => llm.modelId === model);

    if (!FULL_MODEL) return;

    setFilesToAccept(
      FULL_MODEL.imageInput
        ? `${ACCEPTED_FILE_TYPES},image/*`
        : ACCEPTED_FILE_TYPES,
    );
  };

  const handleSelectDeviceFile = async (
    fileOrFiles: File | File[],
    replaceAll: boolean = false,
  ) => {
    if (!profile || !selectedWorkspace || !chatSettings) return;

    // Normalize input to array
    const filesToProcess = Array.isArray(fileOrFiles)
      ? fileOrFiles
      : [fileOrFiles];
    if (filesToProcess.length === 0) return;

    // DIRECT MODE: Skip all DB/storage operations, keep file in memory only (for signature assistant as well)
    if (
      assistantDirectModeWebhook ||
      selectedAssistant?.role === "signature-assistant"
    ) {
      // Create all new file objects at once
      const newFiles = filesToProcess.map(file => {
        const uniqueId = uuidv4();
        const simplifiedFileType = file.type.split("/")[1] || "file";
        return {
          id: uniqueId,
          name: file.name,
          type: simplifiedFileType,
          file: file,
          status: "uploaded" as const,
          chatId: selectedChat?.id,
        };
      });

      // Single state update with all files
      setNewMessageFiles(prev => {
        // If replaceAll is true, start fresh with just these files
        if (replaceAll) {
          return newFiles;
        }
        // Otherwise, add to existing, replacing any with same name
        let result = [...prev];
        for (const newFile of newFiles) {
          const existingIndex = result.findIndex(f => f.name === newFile.name);
          if (existingIndex >= 0) {
            result[existingIndex] = newFile;
          } else {
            result.push(newFile);
          }
        }
        return result;
      });

      setShowFilesDisplay(true);
      return; // Exit early - no DB/storage operations
    }

    // NORMAL MODE: Continue with full file upload and DB save for all files
    await Promise.all(
      filesToProcess.map(async file => {
        logger.info("[Multi-file Upload] Processing file", {
          data: { name: file?.name, type: file?.type },
        });
        if (!file) return;
        const MAX_NON_IMAGE_SIZE = 10485760;
        const EXEMPT_TYPES = [
          "image",
          "pdf",
          "wordprocessingml", // docx
          "spreadsheetml", // xlsx
          "presentationml", // pptx
          "ms-excel", // xls
          "zip",
          "csv",
          "json",
          "text",
        ];

        const isExempt = EXEMPT_TYPES.some(type => file.type.includes(type));
        if (!isExempt && file.size > MAX_NON_IMAGE_SIZE) {
          toast.error(
            t(
              "To avoid unnecessary costs, we kindly ask you not to upload large files. This helps us maintain the efficiency of the system and provide an optimal user experience. Thank you for your understanding!",
            ),
            {
              duration: 5000,
            },
          );
          return;
        }
        setShowFilesDisplay(true);
        setUseRetrieval(true);

        if (file) {
          const uniqueId = uuidv4();
          const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
          let simplifiedFileType = file.type.split("/")[1];
          let reader = new FileReader();
          let processedFile: File = file;
          if (file.type.includes("image")) {
            const MAX_IMAGE_SIZE = 3145728; // 3MB in bytes
            const COMPRESSION_THRESHOLD = 1048576; // 1MB in bytes
            const TARGET_SIZE = 1; // 1MB target for compression

            // Reject images > 3MB
            if (file.size > MAX_IMAGE_SIZE) {
              toast.error(t(`Image file size must be less than 3MB.`), {
                duration: 5000,
              });
              return; // Skip this file if image is too large
            }

            // Compress images between 1MB and 3MB to 1MB
            if (file.size > COMPRESSION_THRESHOLD) {
              try {
                const options = {
                  maxSizeMB: TARGET_SIZE,
                  maxWidthorHeight: 1920,
                  useWebWorker: true, // improve performance
                };
                processedFile = await imageCompression(file, options);

                // Verify compression result
                if (processedFile.size > COMPRESSION_THRESHOLD) {
                  toast.error("Failed to compress image to 1MB", {
                    duration: 2000,
                  });
                  return; // Skip this file if compression fails
                }
              } catch (error) {
                toast.error("Comression failed: " + error.message, {
                  duration: 2000,
                });
                return; // Skip this file if compression error
              }
            }
            reader.readAsDataURL(file);
          } else if (ACCEPTED_FILE_TYPES.split(",").includes(file.type)) {
            if (simplifiedFileType.includes("vnd.adobe.pdf")) {
              simplifiedFileType = "pdf";
            } else if (
              simplifiedFileType.includes(
                "vnd.openxmlformats-officedocument.wordprocessingml.document",
              ) ||
              simplifiedFileType.includes("docx")
            ) {
              simplifiedFileType = "docx";
            } else if (simplifiedFileType.includes("zip")) {
              simplifiedFileType = "zip";
            } else if (
              simplifiedFileType.includes(
                "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ) ||
              simplifiedFileType.includes("xlsx")
            ) {
              simplifiedFileType = "xlsx";
            } else if (
              simplifiedFileType.includes("vnd.ms-excel") ||
              simplifiedFileType.includes("xls")
            ) {
              simplifiedFileType = "xls";
            } else if (
              simplifiedFileType.includes(
                "vnd.openxmlformats-officedocument.presentationml.presentation",
              ) ||
              simplifiedFileType.includes("pptx")
            ) {
              simplifiedFileType = "pptx";
            } else if (
              simplifiedFileType.includes("vnd.ms-powerpoint") ||
              simplifiedFileType.includes("ppt")
            ) {
              simplifiedFileType = "ppt";
            }
          } else {
            toast.error(t("Unsupported file type"));
          }
          // Immediately check the file name extension for DOC files.
          if (fileExtension === "doc") {
            toast.error("Only DOCX file is supported", { duration: 10000 });
            return; // Skip unsupported DOC files
          }

          if (fileExtension === "ppt") {
            toast.error(
              t(
                "PPT files are not supported. Please convert your file to PPTX format before uploading",
                { duration: 10000 },
              ),
            );
            return; // Skip unsupported PPT files
          }

          setNewMessageFiles(prev => [
            ...prev,
            {
              id: uniqueId,
              name: file.name,
              type: simplifiedFileType,
              file: processedFile || file,
              status: "loading",
              chatId: selectedChat?.id,
            },
          ]);

          const saveFileDuringChat = async createdFile => {
            try {
              await createChatFiles([
                {
                  user_id: profile.user_id,
                  chat_id: selectedChat.id,
                  file_id: createdFile.id,
                },
              ]);
              setChatFiles(prev => {
                if (prev.find(file => file.id === createdFile.id)) {
                  return prev;
                }
                return [...prev, createdFile];
              });
            } catch (error) {
              logger.error("Error saving file to chat", {
                error: String(error),
              });
            }
          };

          if (simplifiedFileType === "pdf") {
            // For signature-assistant, skip PDF-to-text conversion and keep the raw PDF
            if (selectedAssistant?.role === "signature-assistant") {
              try {
                // Check if file already exists
                const existingFile = await checkFileExistence(
                  file.name,
                  profile.user_id,
                );

                if (existingFile) {
                  // Check if the existing file is already in the workspace
                  const isInWorkspace = await checkFileInWorkspace(
                    existingFile.id,
                    selectedWorkspace.id,
                  );

                  if (!isInWorkspace) {
                    // Add the existing file to the current workspace
                    await createFileWorkspace({
                      user_id: profile.user_id,
                      file_id: existingFile.id,
                      workspace_id: selectedWorkspace.id,
                    });
                  }

                  setNewMessageFiles(prev =>
                    prev.map(item =>
                      item.id === uniqueId
                        ? {
                            id: existingFile.id,
                            name: existingFile.name,
                            type: "pdf",
                            file: file,
                            status: "uploaded",
                            chatId: selectedChat?.id,
                          }
                        : item,
                    ),
                  );

                  if (selectedChat?.id) {
                    await saveFileDuringChat(existingFile);
                  }

                  return;
                }

                // Upload the raw PDF file to storage
                const { uploadFile } = await import("@/db/storage/files");
                const { supabase } =
                  await import("@/lib/supabase/browser-client");

                const fileId = uuidv4();
                const filePath = await uploadFile(file, {
                  name: file.name,
                  user_id: profile.user_id,
                  file_id: fileId,
                });

                // Create file record in database (without processing/embedding)
                const { data: createdFile, error: insertError } = await supabase
                  .from("files")
                  .insert([
                    {
                      user_id: profile.user_id,
                      name: file.name,
                      description: "PDF for signature analysis",
                      file_path: filePath,
                      original_file_path: filePath,
                      size: file.size,
                      type: "pdf",
                      original_type: "application/pdf",
                      tokens: 0,
                      sharing: "private",
                    },
                  ])
                  .select("*")
                  .single();

                if (insertError) {
                  throw insertError;
                }

                // Create file workspace association
                await createFileWorkspace({
                  user_id: profile.user_id,
                  file_id: createdFile.id,
                  workspace_id: selectedWorkspace.id,
                });

                setFiles(prev => [...prev, createdFile]);

                setNewMessageFiles(prev =>
                  prev.map(item =>
                    item.id === uniqueId
                      ? {
                          id: createdFile.id,
                          name: file.name,
                          type: "pdf",
                          file: file,
                          status: "uploaded",
                          chatId: selectedChat?.id,
                        }
                      : item,
                  ),
                );

                if (selectedChat?.id) {
                  await saveFileDuringChat(createdFile);
                }

                return;
              } catch (error) {
                logger.error(
                  "Error creating PDF file for signature-assistant",
                  { error: String(error) },
                );
                toast.error(
                  "Failed to upload PDF file. " + (error?.message || ""),
                );
                setNewMessageFiles(prev =>
                  prev.filter(item => item.id !== uniqueId),
                );
                return;
              }
            }
            const existingFile = await checkFileExistence(
              file.name,
              profile.user_id,
            );
            if (!existingFile) {
              const result = await analyzeWithFormRecognizer(file);
              const createdFile = await createFile(
                result,
                {
                  user_id: profile.user_id,
                  description: "",
                  file_path: result.name,
                  name: result.name,
                  size: result.size,
                  tokens: 0,
                  type: "txt",
                },
                selectedWorkspace.id,
                chatSettings.embeddingsProvider,
                file,
                chatSettings,
              );

              setFiles(prev => [...prev, createdFile]);

              setNewMessageFiles(prev =>
                prev.map(item =>
                  item.id === uniqueId
                    ? {
                        id: createdFile.id,
                        name: result.name,
                        type: "txt",
                        file: result,
                        status: "uploaded",
                        chatId: selectedChat?.id,
                      }
                    : item,
                ),
              );
              if (selectedChat?.id) {
                await saveFileDuringChat(createdFile);
              }
              const fileData = await getFileWorkspacesByWorkspaceId(
                selectedWorkspace.id,
              );
              setFiles(fileData.files || []);
              logger.info("[Multi-file Upload] Successfully processed PDF", {
                data: file.name,
              });
              return; // Done processing this file
            } else {
              // Check if the existing file is already in the workspace
              const isInWorkspace = await checkFileInWorkspace(
                existingFile.id,
                selectedWorkspace.id,
              );

              if (!isInWorkspace) {
                // Add the existing file to the current workspace
                try {
                  await createFileWorkspace({
                    user_id: profile.user_id,
                    file_id: existingFile.id,
                    workspace_id: selectedWorkspace.id,
                  });

                  // Update the file in the UI
                  setNewMessageFiles(prev =>
                    prev.map(item =>
                      item.id === uniqueId
                        ? {
                            id: existingFile.id,
                            name: existingFile.name,
                            type: "txt",
                            file: file,
                            status: "uploaded",
                            chatId: selectedChat?.id,
                          }
                        : item,
                    ),
                  );

                  if (selectedChat?.id) {
                    await saveFileDuringChat(existingFile);
                  }

                  // Refresh the files list
                  const fileData = await getFileWorkspacesByWorkspaceId(
                    selectedWorkspace.id,
                  );
                  setFiles(fileData.files || []);

                  toast.success(t("File added to workspace"));
                  return; // Done processing this file
                } catch (error) {
                  logger.error("Error adding file to workspace", {
                    error: String(error),
                  });
                  toast.error(t("Failed to add file to workspace"));
                }
              } else {
                toast.error(t("file_already_uploaded"));
              }

              setNewMessageFiles(prev =>
                prev.filter(item => item.id !== uniqueId),
              );
              return; // Done processing this file
            }
          }
          // Check if the file is a legacy DOC file and show an error toast.
          if (simplifiedFileType === "doc") {
            toast.error("Only DOCX file is supported", { duration: 10000 });
            return; // Skip DOC files
          }

          // Check if the file is a legacy PPT file and show an error toast.
          if (simplifiedFileType === "ppt") {
            toast.error(
              t(
                "PPT files are not supported. Please convert your file to PPTX format before uploading",
                { duration: 10000 },
              ),
            );
            return; // Skip PPT files
          }

          if (simplifiedFileType === "docx") {
            try {
              const result = await analyzeWordFile(file);
              const existingFile = await checkFileExistence(
                file.name,
                profile.user_id,
              );
              if (!existingFile) {
                const createdFile = await createFile(
                  result,
                  {
                    user_id: profile.user_id,
                    description: "",
                    file_path: result.name,
                    name: result.name,
                    size: result.size,
                    tokens: 0,
                    type: "txt",
                  },
                  selectedWorkspace.id,
                  chatSettings.embeddingsProvider,
                  file,
                  chatSettings,
                );

                setFiles(prev => [...prev, createdFile]);

                setNewMessageFiles(prev =>
                  prev.map(item =>
                    item.id === uniqueId
                      ? {
                          id: createdFile.id,
                          name: result.name,
                          type: "txt",
                          file: result,
                          status: "uploaded",
                          chatId: selectedChat?.id,
                        }
                      : item,
                  ),
                );
                if (selectedChat?.id) {
                  await saveFileDuringChat(createdFile);
                }
              } else {
                // Check if the existing file is already in the workspace
                const isInWorkspace = await checkFileInWorkspace(
                  existingFile.id,
                  selectedWorkspace.id,
                );

                if (!isInWorkspace) {
                  // Add the existing file to the current workspace
                  try {
                    await createFileWorkspace({
                      user_id: profile.user_id,
                      file_id: existingFile.id,
                      workspace_id: selectedWorkspace.id,
                    });

                    // Update the file in the UI
                    setNewMessageFiles(prev =>
                      prev.map(item =>
                        item.id === uniqueId
                          ? {
                              id: existingFile.id,
                              name: existingFile.name,
                              type: "txt",
                              file: result,
                              status: "uploaded",
                              chatId: selectedChat?.id,
                            }
                          : item,
                      ),
                    );

                    if (selectedChat?.id) {
                      await saveFileDuringChat(existingFile);
                    }

                    // Refresh the files list
                    const fileData = await getFileWorkspacesByWorkspaceId(
                      selectedWorkspace.id,
                    );
                    setFiles(fileData.files || []);

                    toast.success(t("File added to workspace"));
                    return; // Done processing this file
                  } catch (error) {
                    logger.error("Error adding file to workspace", {
                      error: String(error),
                    });
                    toast.error(t("Failed to add file to workspace"));
                  }
                } else {
                  toast.error(t("file_already_uploaded"));
                }

                setNewMessageFiles(prev =>
                  prev.filter(item => item.id !== uniqueId),
                );

                return; // Done processing this file
              }
            } catch (error) {
              logger.error("Error processing Word file", {
                error: String(error),
              });
              toast.error("Failed to process Word file. " + error?.message, {
                duration: 10000,
              });
            }
            const fileData = await getFileWorkspacesByWorkspaceId(
              selectedWorkspace.id,
            );
            setFiles(fileData.files || []);
            return; // Done processing this file
          }
          if (
            simplifiedFileType === "xlsx" ||
            simplifiedFileType === "xls" ||
            simplifiedFileType === "pptx" ||
            simplifiedFileType === "ppt"
          ) {
            let combinedFile;
            let imagesExtract;
            let embeddedExcelData = "";

            try {
              if (
                simplifiedFileType === "xlsx" ||
                simplifiedFileType === "xls"
              ) {
                combinedFile = await analyzeExcelFile(file);
                imagesExtract = await extractExcelImages(file);
              } else if (
                simplifiedFileType === "pptx" ||
                simplifiedFileType === "ppt"
              ) {
                combinedFile = await analyzePowerPointFile(file);
                imagesExtract = await extractPowerPointImages(file);

                // Extract embedded Excel files from PowerPoint slides
                const embeddedFiles =
                  await extractEmbeddedFilesFromPowerPoint(file);
                if (embeddedFiles && embeddedFiles.length > 0) {
                  for (const embeddedFile of embeddedFiles) {
                    if (embeddedFile.type === "excel") {
                      const excelData = await analyzeExcelFile(
                        new File(
                          [embeddedFile.file],
                          "embedded-excel-file.xlsx",
                          {
                            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          },
                        ),
                      );
                      embeddedExcelData += `${await readFileAsText(excelData)}\n\n`;
                    }
                  }
                }
              }

              let filename = file.name.replace(/\.[^/.]+$/, "");
              filename = `${filename}.txt`;

              const existingFile = await checkFileExistence(
                filename,
                profile.user_id,
              );
              let updatedFile;
              const combinedFileContent = await readFileAsText(combinedFile);

              // Process extracted image data and embedded Excel data
              if (imagesExtract !== null) {
                const pdfFile = await createPdfFromZip(imagesExtract);
                const extractedTextFromImages =
                  await analyzeWithFormRecognizer(pdfFile);
                const extractedTextContent = await readFileAsText(
                  extractedTextFromImages,
                );

                const updatedContent = `${combinedFileContent}\n\n${extractedTextContent}\n\n${embeddedExcelData}`;
                const updatedBlob = new Blob([updatedContent], {
                  type: "text/plain",
                });

                updatedFile = new File([updatedBlob], filename, {
                  type: "text/plain",
                  lastModified: new Date().getTime(),
                });
              } else {
                const updatedContent = `${combinedFileContent}\n\n${embeddedExcelData}`;
                const updatedBlob = new Blob([updatedContent], {
                  type: "text/plain",
                });

                updatedFile = new File([updatedBlob], filename, {
                  type: "text/plain",
                  lastModified: new Date().getTime(),
                });
              }
              if (!existingFile) {
                const createdFile = await createFile(
                  updatedFile,
                  {
                    user_id: profile.user_id,
                    description: "",
                    file_path: updatedFile.name,
                    name: updatedFile.name,
                    size: updatedFile.size,
                    tokens: 0,
                    type: "txt",
                  },
                  selectedWorkspace.id,
                  chatSettings.embeddingsProvider,
                  file,
                  chatSettings,
                );

                // Update state with the new file
                setFiles(prev => [...prev, createdFile]);

                setNewMessageFiles(prev =>
                  prev.map(item =>
                    item.id === uniqueId
                      ? {
                          id: createdFile.id,
                          name: combinedFile.name,
                          type: "txt",
                          file: combinedFile,
                          status: "uploaded",
                          chatId: selectedChat?.id,
                        }
                      : item,
                  ),
                );
                if (selectedChat?.id) {
                  await saveFileDuringChat(createdFile);
                }
              } else {
                // Check if the existing file is already in the workspace
                const isInWorkspace = await checkFileInWorkspace(
                  existingFile.id,
                  selectedWorkspace.id,
                );

                if (!isInWorkspace) {
                  // Add the existing file to the current workspace
                  try {
                    await createFileWorkspace({
                      user_id: profile.user_id,
                      file_id: existingFile.id,
                      workspace_id: selectedWorkspace.id,
                    });

                    // Update the file in the UI
                    setNewMessageFiles(prev =>
                      prev.map(item =>
                        item.id === uniqueId
                          ? {
                              id: existingFile.id,
                              name: existingFile.name,
                              type: "txt",
                              file: updatedFile,
                              status: "uploaded",
                              chatId: selectedChat?.id,
                            }
                          : item,
                      ),
                    );

                    if (selectedChat?.id) {
                      await saveFileDuringChat(existingFile);
                    }

                    // Refresh the files list
                    const fileData = await getFileWorkspacesByWorkspaceId(
                      selectedWorkspace.id,
                    );
                    setFiles(fileData.files || []);

                    toast.success(t("File added to workspace"));
                    return; // Done processing this file
                  } catch (error) {
                    logger.error("Error adding file to workspace", {
                      error: String(error),
                    });
                    toast.error(t("Failed to add file to workspace"));
                  }
                } else {
                  toast.error(t("file_already_uploaded"));
                }

                setNewMessageFiles(prev =>
                  prev.filter(item => item.id !== uniqueId),
                );

                return; // Done processing this file
              }
            } catch (error) {
              logger.error("An error occurred while processing the file", {
                error: String(error),
              });
              throw new Error(
                `Could not process the file: ${error.message || error}`,
              );
            }
            const fileData = await getFileWorkspacesByWorkspaceId(
              selectedWorkspace.id,
            );
            setFiles(fileData.files || []);
            return; // Done processing this file
          }
          // Handle ZIP files
          if (simplifiedFileType === "zip") {
            const existingFile = await checkFileExistence(
              file.name,
              profile.user_id,
            );
            const zip = new JSZip();
            const _zipContent = await zip.loadAsync(file);

            let combinedContent = "";
            const fileNames = [];
            const zipFileName = file.name.replace(/\.[^/.]+$/, "");
            let imageFiles = [];

            const processZipEntry = async (relativePath, zipEntry) => {
              const isSystemFile =
                relativePath.includes(".DS_Store") ||
                relativePath.startsWith("__MACOSX") ||
                relativePath.startsWith("._");
              const isImageFile = /\.(png|jpg|jpeg|gif|bmp|svg)$/.test(
                zipEntry.name.toLowerCase(),
              );
              const isExcelFile = /\.(xlsx|xls)$/.test(
                zipEntry.name.toLowerCase(),
              );
              const isPowerPointFile = /\.(pptx|ppt)$/.test(
                zipEntry.name.toLowerCase(),
              );
              const isWordFile = /\.(docx)$/.test(zipEntry.name.toLowerCase());
              if (zipEntry.name.toLowerCase().endsWith(".doc")) {
                toast.error("Only DOCX file is supported", { duration: 10000 });
                return;
              }
              const isExcludedDir =
                relativePath.includes("/Fonts/") ||
                relativePath.includes("/icons/") ||
                relativePath.includes("/Tests/");
              const isGitFileOrDir =
                relativePath.includes("/.git/") ||
                relativePath.includes(".git/");
              if (isSystemFile || isExcludedDir || isGitFileOrDir) {
                return;
              }
              if (zipEntry.dir) {
                return;
              }
              if (isImageFile) {
                imageFiles.push(zipEntry);
                return;
              }
              if (isExcelFile) {
                try {
                  // Extract Excel file from ZIP
                  const excelFileContent = await zipEntry.async("arraybuffer");
                  const excelFile = new File(
                    [excelFileContent],
                    zipEntry.name,
                    {
                      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    },
                  );
                  const analyzedExcel = await analyzeExcelFile(excelFile);
                  const excelTextContent = await readFileAsText(analyzedExcel);
                  const imagesExtract = await extractExcelImages(excelFile);
                  let imageTextContent = "";

                  if (imagesExtract) {
                    const pdfFile = await createPdfFromZip(imagesExtract);
                    const extractedTextFromImages =
                      await analyzeWithFormRecognizer(pdfFile);
                    imageTextContent = (await readFileAsText(
                      extractedTextFromImages,
                    )) as string;
                  }
                  let combinedFileContent = `File: ${zipEntry.name}\n\n${excelTextContent}\n\n`;
                  if (imageTextContent.trim()) {
                    combinedFileContent += `Images:\n\n${imageTextContent}\n\n`;
                  }
                  combinedContent += combinedFileContent;
                  fileNames.push(zipEntry.name);
                } catch (error) {
                  logger.error(
                    `Failed to process Excel file: ${zipEntry.name}`,
                    { error: String(error) },
                  );
                }
                return;
              }

              if (isWordFile) {
                try {
                  const wordFileContent = await zipEntry.async("arraybuffer");
                  const wordFile = new File([wordFileContent], zipEntry.name, {
                    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  });
                  const analyzedWord = await analyzeWordFile(wordFile);
                  const wordTextContent = await readFileAsText(analyzedWord);
                  combinedContent += `File: ${zipEntry.name}\n\n${wordTextContent}\n\n`;
                  fileNames.push(zipEntry.name);
                } catch (error) {
                  logger.error(
                    `Failed to process Word file: ${zipEntry.name}`,
                    { error: String(error) },
                  );
                }
                return;
              }
              if (isPowerPointFile) {
                try {
                  const powerPointFileContent =
                    await zipEntry.async("arraybuffer");
                  const powerPointFile = new File(
                    [powerPointFileContent],
                    zipEntry.name,
                    {
                      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    },
                  );

                  const analyzedPowerPoint =
                    await analyzePowerPointFile(powerPointFile);
                  const pptTextContent =
                    await readFileAsText(analyzedPowerPoint);

                  const imagesExtract =
                    await extractPowerPointImages(powerPointFile);
                  let imageTextContent = "";

                  if (imagesExtract) {
                    const pdfFile = await createPdfFromZip(imagesExtract);
                    const extractedTextFromImages =
                      await analyzeWithFormRecognizer(pdfFile);
                    imageTextContent = (await readFileAsText(
                      extractedTextFromImages,
                    )) as string;
                  }

                  let combinedFileContent = `File: ${zipEntry.name}\n\n${pptTextContent}\n\n`;
                  if (imageTextContent.trim()) {
                    combinedFileContent += `Images:\n\n${imageTextContent}\n\n`;
                  }
                  combinedContent += combinedFileContent;
                  fileNames.push(zipEntry.name);
                } catch (error) {
                  logger.error(
                    `Failed to process PowerPoint file: ${zipEntry.name}`,
                    { error: String(error) },
                  );
                }
                return;
              }

              if (zipEntry.name.endsWith(".zip")) {
                // Handle nested zip files
                const nestedZip = new JSZip();
                const nestedZipContent = await zipEntry.async("arraybuffer");
                const nestedZipFiles =
                  await nestedZip.loadAsync(nestedZipContent);
                await Promise.all(
                  Object.keys(nestedZipFiles.files).map(
                    async nestedRelativePath => {
                      const nestedZipEntry =
                        nestedZipFiles.files[nestedRelativePath];
                      await processZipEntry(nestedRelativePath, nestedZipEntry);
                    },
                  ),
                );
                return;
              }
              const fileContent = await zipEntry.async("text");
              if (fileContent.trim()) {
                combinedContent += `File: ${zipEntry.name}\n\n${fileContent}\n\n`;
                fileNames.push(zipEntry.name);
              } else {
                logger.info(`File is empty: ${zipEntry.name}`);
              }
            };
            await Promise.all(
              Object.keys(zip.files).map(async relativePath => {
                const zipEntry = zip.files[relativePath];
                await processZipEntry(relativePath, zipEntry);
              }),
            );
            if (imageFiles.length > 0) {
              const pdfFile = await createPdfFromImages(imageFiles);
              const extractedTextFromImages =
                await analyzeWithFormRecognizer(pdfFile);
              const extractedTextContent = await readFileAsText(
                extractedTextFromImages,
              );
              combinedContent += `\n\nExtracted Text from Images:\n\n${extractedTextContent}`;
            }
            if (fileNames.length === 0 && combinedContent.trim() === "") {
              throw new Error(
                "No valid files to combine from the ZIP archive.",
              );
            }
            const combinedFileName = `${zipFileName}.txt`;
            const combinedFile = new File([combinedContent], combinedFileName, {
              type: "text/plain",
              lastModified: new Date().getTime(),
            });
            if (!existingFile) {
              const createdFile = await createFile(
                combinedFile,
                {
                  user_id: profile.user_id,
                  description: "",
                  file_path: combinedFileName,
                  name: combinedFileName,
                  size: combinedFile.size,
                  tokens: 0,
                  type: "txt",
                },
                selectedWorkspace.id,
                chatSettings.embeddingsProvider,
                file,
                chatSettings,
              );

              setFiles(prev => [...prev, createdFile]);

              setNewMessageFiles(prev =>
                prev.map(item =>
                  item.id === uniqueId
                    ? {
                        id: createdFile.id,
                        name: combinedFileName,
                        type: "txt",
                        file: combinedFile,
                        status: "uploaded",
                        chatId: selectedChat?.id,
                      }
                    : item,
                ),
              );
              if (selectedChat?.id) {
                await saveFileDuringChat(createdFile);
              }
              const fileData = await getFileWorkspacesByWorkspaceId(
                selectedWorkspace.id,
              );
              setFiles(fileData.files || []);
              return; // Done processing this file
            } else {
              // Check if the existing file is already in the workspace
              const isInWorkspace = await checkFileInWorkspace(
                existingFile.id,
                selectedWorkspace.id,
              );

              if (!isInWorkspace) {
                // Add the existing file to the current workspace
                try {
                  await createFileWorkspace({
                    user_id: profile.user_id,
                    file_id: existingFile.id,
                    workspace_id: selectedWorkspace.id,
                  });

                  // Update the file in the UI
                  setNewMessageFiles(prev =>
                    prev.map(item =>
                      item.id === uniqueId
                        ? {
                            id: existingFile.id,
                            name: existingFile.name,
                            type: "txt",
                            file: combinedFile,
                            status: "uploaded",
                            chatId: selectedChat?.id,
                          }
                        : item,
                    ),
                  );

                  if (selectedChat?.id) {
                    await saveFileDuringChat(existingFile);
                  }

                  // Refresh the files list
                  const fileData = await getFileWorkspacesByWorkspaceId(
                    selectedWorkspace.id,
                  );
                  setFiles(fileData.files || []);

                  toast.success(t("File added to workspace"));
                  return; // Done processing this file
                } catch (error) {
                  logger.error("Error adding file to workspace", {
                    error: String(error),
                  });
                  toast.error(t("Failed to add file to workspace"));
                }
              } else {
                toast.error(t("file_already_uploaded"));
              }

              setNewMessageFiles(prev =>
                prev.filter(item => item.id !== uniqueId),
              );

              return; // Done processing this file
            }
          }

          // Handle non-ZIP files - Wrap in Promise to properly await file reading
          await new Promise<void>((resolve, reject) => {
            reader.onloadend = async function () {
              try {
                if (file.type.includes("image")) {
                  const imageUrl = URL.createObjectURL(processedFile);
                  const base64Data = reader.result;

                  if (base64Data) {
                    setNewMessageImages(prev => [
                      ...prev,
                      {
                        messageId: "temp",
                        path: "",
                        base64: base64Data,
                        url: imageUrl,
                        file: processedFile,
                        chatId: selectedChat?.id,
                      },
                    ]);

                    setNewMessageFiles(prev =>
                      prev.filter(f => f.status !== "loading"),
                    );
                    resolve(); // Resolve after image processing
                  } else {
                    reject(new Error("Failed to read image data"));
                  }
                } else {
                  // Upload non-ZIP files
                  const existingFile = await checkFileExistence(
                    file.name,
                    profile.user_id,
                  );
                  logger.info("image file uploaded", { data: file.name });
                  if (!existingFile) {
                    const createdFile = await createFile(
                      file,
                      {
                        user_id: profile.user_id,
                        description: "",
                        file_path: "",
                        name: file.name,
                        size: file.size,
                        tokens: 0,
                        type: file.type,
                      },
                      selectedWorkspace.id,
                      chatSettings.embeddingsProvider,
                      null,
                      chatSettings,
                    );

                    setFiles(prev => [...prev, createdFile]);

                    setNewMessageFiles(prev =>
                      prev.map(item =>
                        item.id === uniqueId
                          ? {
                              id: createdFile.id,
                              name: createdFile.name,
                              type: createdFile.type,
                              file: file,
                              status: "uploaded",
                              chatId: selectedChat?.id,
                            }
                          : item,
                      ),
                    );
                    if (selectedChat?.id) {
                      await saveFileDuringChat(createdFile);
                    }
                    resolve(); // Resolve after successful upload
                  } else {
                    // Check if the existing file is already in the workspace
                    const isInWorkspace = await checkFileInWorkspace(
                      existingFile.id,
                      selectedWorkspace.id,
                    );

                    if (!isInWorkspace) {
                      // Add the existing file to the current workspace
                      try {
                        await createFileWorkspace({
                          user_id: profile.user_id,
                          file_id: existingFile.id,
                          workspace_id: selectedWorkspace.id,
                        });

                        // Update the file in the UI
                        setNewMessageFiles(prev =>
                          prev.map(item =>
                            item.id === uniqueId
                              ? {
                                  id: existingFile.id,
                                  name: existingFile.name,
                                  type: existingFile.type,
                                  file: file,
                                  status: "uploaded",
                                  chatId: selectedChat?.id,
                                }
                              : item,
                          ),
                        );

                        if (selectedChat?.id) {
                          await saveFileDuringChat(existingFile);
                        }

                        // Refresh the files list
                        const fileData = await getFileWorkspacesByWorkspaceId(
                          selectedWorkspace.id,
                        );
                        setFiles(fileData.files || []);

                        toast.success(t("File added to workspace"));
                        resolve(); // Resolve after success
                      } catch (error) {
                        logger.error("Error adding file to workspace", {
                          error: String(error),
                        });
                        toast.error(t("Failed to add file to workspace"));
                        reject(error);
                      }
                    } else {
                      toast.error(t("file_already_uploaded"));
                      setNewMessageFiles(prev =>
                        prev.filter(item => item.id !== uniqueId),
                      );
                      resolve(); // Resolve even if file already exists
                    }
                  }
                }
              } catch (error: unknown) {
                const err =
                  error instanceof Error ? error : new Error(String(error));
                toast.error("Failed to upload. " + err.message, {
                  duration: 10000,
                });
                setNewMessageImages(prev =>
                  prev.filter(img => img.messageId !== "temp"),
                );
                setNewMessageFiles(prev =>
                  prev.filter(file => file.status !== "loading"),
                );
                reject(error);
              }
            };

            reader.onerror = () => {
              reject(new Error("FileReader error"));
            };

            if (!file.type.includes("image")) {
              reader.readAsArrayBuffer(file);
            }
          });
        }
      }),
    ); // End of Promise.all processing all files
  };

  return {
    handleSelectDeviceFile,
    filesToAccept,
  };
};
