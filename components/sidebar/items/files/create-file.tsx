"use client";

import { createClientLogger } from "@/lib/logger/client";
import { ACCEPTED_FILE_TYPES } from "@/components/chat/chat-hooks/use-select-file-handler";
import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { FILE_DESCRIPTION_MAX, FILE_NAME_MAX } from "@/db/limits";
import { TablesInsert } from "@/supabase/types";
import { FC, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { checkFileExistence, checkFileInWorkspace } from "@/db/files";
import { createFileWorkspace } from "@/db/files";
import { toast } from "sonner";
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
import JSZip from "jszip";

const logger = createClientLogger({ component: "CreateFile" });

interface CreateFileProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const CreateFile: FC<CreateFileProps> = ({ isOpen, onOpenChange }) => {
  const { t } = useTranslation();
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext);

  const [name, setName] = useState("");
  const [isTyping, _setIsTyping] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const ACCEPTED_FILE_TYPES_NO_IMAGES = ACCEPTED_FILE_TYPES.split(",")
    .filter(type => !type.startsWith("image/"))
    .join(",");

  const handleSelectedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const file = e.target.files[0];
    if (!file) return;

    // Basic size validation only
    const DEFAULT_FILE_SIZE_LIMIT = 10485760;
    const MAX_NON_IMAGE_SIZE = process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT
      ? parseInt(process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT, 10)
      : DEFAULT_FILE_SIZE_LIMIT;
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
          `File must be less than ${Math.floor(MAX_NON_IMAGE_SIZE / 1000000)}MB`,
        ),
        {
          duration: 5000,
        },
      );
      return;
    }

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

    // Check for unsupported formats
    if (fileExtension === "doc") {
      toast.error("Only DOCX file is supported", { duration: 10000 });
      return;
    }

    if (fileExtension === "ppt") {
      toast.error(
        t(
          "PPT files are not supported. Please convert your file to PPTX format before uploading",
        ),
        { duration: 10000 },
      );
      return;
    }

    // Store both the original file and the selected file
    setSelectedFile(file);
    setOriginalFile(file);
    const fileNameWithoutExtension = file.name
      .split(".")
      .slice(0, -1)
      .join(".");
    setName(fileNameWithoutExtension);
  };

  const processFile = useCallback(
    async (file: File): Promise<File> => {
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
      let finalFile: File = file;

      // Image compression
      if (file.type.includes("image")) {
        const MAX_IMAGE_SIZE = 3145728; // 3MB
        const COMPRESSION_THRESHOLD = 1048576; // 1MB
        const TARGET_SIZE = 1; // 1MB

        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error(t(`Image file size must be less than 3MB.`));
        }

        if (file.size > COMPRESSION_THRESHOLD) {
          const options = {
            maxSizeMB: TARGET_SIZE,
            maxWidthorHeight: 1920,
            useWebWorker: true,
          };
          finalFile = await imageCompression(file, options);

          if (finalFile.size > COMPRESSION_THRESHOLD) {
            throw new Error("Failed to compress image to 1MB");
          }
        }
        return finalFile;
      }

      // PDF processing
      if (file.type === "application/pdf") {
        const result = await analyzeWithFormRecognizer(file);
        return result;
      }

      // Word processing
      if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileExtension === "docx"
      ) {
        const result = await analyzeWordFile(file);
        return result;
      }

      // Excel processing
      if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        fileExtension === "xlsx" ||
        fileExtension === "xls"
      ) {
        const combinedFile = await analyzeExcelFile(file);
        const imagesExtract = await extractExcelImages(file);

        if (imagesExtract !== null) {
          const pdfFile = await createPdfFromZip(imagesExtract);
          const extractedTextFromImages =
            await analyzeWithFormRecognizer(pdfFile);
          const extractedTextContent = await readFileAsText(
            extractedTextFromImages,
          );
          const combinedFileContent = await readFileAsText(combinedFile);

          const updatedContent = `${combinedFileContent}\n\n${extractedTextContent}`;
          const updatedBlob = new Blob([updatedContent], {
            type: "text/plain",
          });

          return new File([updatedBlob], combinedFile.name, {
            type: "text/plain",
            lastModified: new Date().getTime(),
          });
        }
        return combinedFile;
      }

      // PowerPoint processing
      if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        file.type === "application/vnd.ms-powerpoint" ||
        fileExtension === "pptx"
      ) {
        const combinedFile = await analyzePowerPointFile(file);
        const imagesExtract = await extractPowerPointImages(file);
        let embeddedExcelData = "";

        // Extract embedded Excel files
        const embeddedFiles = await extractEmbeddedFilesFromPowerPoint(file);
        if (embeddedFiles && embeddedFiles.length > 0) {
          for (const embeddedFile of embeddedFiles) {
            if (embeddedFile.type === "excel") {
              const excelData = await analyzeExcelFile(
                new File([embeddedFile.file], "embedded-excel-file.xlsx", {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
              );
              embeddedExcelData += `${await readFileAsText(excelData)}\n\n`;
            }
          }
        }

        const combinedFileContent = await readFileAsText(combinedFile);

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

          return new File([updatedBlob], combinedFile.name, {
            type: "text/plain",
            lastModified: new Date().getTime(),
          });
        } else {
          const updatedContent = `${combinedFileContent}\n\n${embeddedExcelData}`;
          const updatedBlob = new Blob([updatedContent], {
            type: "text/plain",
          });

          return new File([updatedBlob], combinedFile.name, {
            type: "text/plain",
            lastModified: new Date().getTime(),
          });
        }
      }

      // ZIP processing
      if (file.type === "application/zip") {
        const zip = new JSZip();
        const _zipContent = await zip.loadAsync(file);

        let combinedContent = "";
        const fileNames: string[] = [];
        const zipFileName = file.name.replace(/\.[^/.]+$/, "");
        let imageFiles: any[] = [];

        const processZipEntry = async (relativePath: string, zipEntry: any) => {
          const isSystemFile =
            relativePath.includes(".DS_Store") ||
            relativePath.startsWith("__MACOSX") ||
            relativePath.startsWith("._");
          const isImageFile = /\.(png|jpg|jpeg|gif|bmp|svg)$/.test(
            zipEntry.name.toLowerCase(),
          );
          const isExcelFile = /\.(xlsx|xls)$/.test(zipEntry.name.toLowerCase());
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
            relativePath.includes("/.git/") || relativePath.includes(".git/");

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
              const excelFileContent = await zipEntry.async("arraybuffer");
              const excelFile = new File([excelFileContent], zipEntry.name, {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              });
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
              logger.error(`Failed to process Excel file: ${zipEntry.name}`, {
                error: String(error),
              });
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
              logger.error(`Failed to process Word file: ${zipEntry.name}`, {
                error: String(error),
              });
            }
            return;
          }

          if (isPowerPointFile) {
            try {
              const powerPointFileContent = await zipEntry.async("arraybuffer");
              const powerPointFile = new File(
                [powerPointFileContent],
                zipEntry.name,
                {
                  type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                },
              );

              const analyzedPowerPoint =
                await analyzePowerPointFile(powerPointFile);
              const pptTextContent = await readFileAsText(analyzedPowerPoint);

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
            const nestedZip = new JSZip();
            const nestedZipContent = await zipEntry.async("arraybuffer");
            const nestedZipFiles = await nestedZip.loadAsync(nestedZipContent);
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
          throw new Error("No valid files to combine from the ZIP archive.");
        }

        const combinedFileName = `${zipFileName}.txt`;
        return new File([combinedContent], combinedFileName, {
          type: "text/plain",
          lastModified: new Date().getTime(),
        });
      }
      return file;
    },
    [t],
  );

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  return (
    <SidebarCreateItem
      contentType="files"
      createState={
        {
          file: selectedFile,
          user_id: profile.user_id,
          name,
          description,
          file_path: "",
          size: selectedFile?.size || 0,
          tokens: 0,
          type: selectedFile?.type || 0,
        } as TablesInsert<"files">
      }
      isOpen={isOpen}
      isTyping={isTyping}
      onOpenChange={onOpenChange}
      onBeforeCreate={async () => {
        if (!selectedFile || !originalFile || !profile || !selectedWorkspace) {
          throw new Error("Missing required data");
        }

        const existingFile = await checkFileExistence(
          selectedFile.name,
          profile.user_id,
        );

        if (existingFile) {
          const isInWorkspace = await checkFileInWorkspace(
            existingFile.id,
            selectedWorkspace.id,
          );

          if (isInWorkspace) {
            throw new Error(t("file_already_uploaded"));
          } else {
            try {
              await createFileWorkspace({
                user_id: profile.user_id,
                file_id: existingFile.id,
                workspace_id: selectedWorkspace.id,
              });
              toast.success(t("File added to workspace"));
              throw new Error("FILE_ADDED_TO_WORKSPACE");
            } catch (error) {
              if (
                error instanceof Error &&
                error.message === "FILE_ADDED_TO_WORKSPACE"
              ) {
                throw error;
              }
              logger.error("Error adding file to workspace", {
                error: String(error),
              });
              throw new Error(t("Failed to add file to workspace"));
            }
          }
        }

        const processedFile = await processFile(selectedFile);
        return processedFile;
      }}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>{t("File")}</Label>

            <Input
              type="file"
              id="file-input"
              onChange={handleSelectedFile}
              accept={ACCEPTED_FILE_TYPES_NO_IMAGES}
              className="hidden"
            />

            <label
              htmlFor="file-input"
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:none flex h-10 w-full cursor-pointer rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-offset-2"
            >
              <span id="file-input-placeholder" className="pr-2">
                {selectedFile ? selectedFile.name : t("Choose file")}
              </span>
              {!selectedFile && <span>{t("No file chosen")}</span>}
            </label>
          </div>

          <div className="space-y-1">
            <Label>
              {t("Name")} <span className="text-red-500">*</span>
            </Label>

            <Input
              placeholder={t("File name...")}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={FILE_NAME_MAX}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("Description")}</Label>

            <Input
              placeholder={t("File description...")}
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={FILE_DESCRIPTION_MAX}
            />
          </div>
        </>
      )}
    />
  );
};
