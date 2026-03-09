"use client";

import { createClientLogger } from "@/lib/logger/client";
import { FileIcon } from "@/components/ui/file-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FILE_DESCRIPTION_MAX, FILE_NAME_MAX } from "@/db/limits";
import { getFileFromStorage } from "@/db/storage/files";
import { Tables } from "@/supabase/types";
import { FC, useState, useEffect } from "react";
import { SidebarItem } from "../all/sidebar-display-item";
import { useTranslation } from "react-i18next";
import { FilePiiIndicator } from "@/components/files/file-pii-indicator";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const logger = createClientLogger({ component: "FileItem" });

interface FileItemProps {
  file: Tables<"files">;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (fileId: string) => void;
}

export const FileItem: FC<FileItemProps> = ({
  file: initialFile,
  isSelectable = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { t } = useTranslation();
  const supabase = createClient();

  const [file, setFile] = useState(initialFile);
  const [name, setName] = useState(initialFile.name);
  const [isTyping, _setIsTyping] = useState(false);
  const [description, setDescription] = useState(initialFile.description);

  useEffect(() => {
    setFile(initialFile);
    setName(initialFile.name);
    setDescription(initialFile.description);
  }, [initialFile]);

  useEffect(() => {
    if (file.processing_status !== "processing") {
      return;
    }
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("files")
          .select("processing_status, processing_progress, tokens")
          .eq("id", file.id)
          .single();

        if (error) {
          logger.error("Error fetching file progress", {
            error: String(error),
          });
          return;
        }

        if (data) {
          setFile(prev => ({
            ...prev,
            processing_status: data.processing_status,
            processing_progress: data.processing_progress,
            tokens: data.tokens,
          }));
          if (data.processing_status !== "processing") {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        logger.error("Error polling file progress", { error: String(error) });
      }
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [file.id, file.processing_status, supabase]);

  const getLinkAndView = async () => {
    const link = await getFileFromStorage(file.file_path);
    window.open(link, "_blank");
  };

  const isProcessing = file.processing_status === "processing";
  const progress = file.processing_progress || 0;

  return (
    <SidebarItem
      item={file}
      isTyping={isTyping}
      contentType="files"
      icon={
        <div className="flex items-center gap-2">
          {isSelectable && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(file.id)}
              onClick={e => e.stopPropagation()}
            />
          )}

          <div className="relative">
            <FileIcon type={file.type} size={30} />
            {isProcessing && (
              <div className="bg-background absolute -right-1 -top-1 rounded-full">
                <Loader2 className="size-4 animate-spin text-blue-500" />
              </div>
            )}
          </div>
        </div>
      }
      updateState={{ name, description }}
      renderInputs={() => (
        <>
          <div
            className="cursor-pointer underline hover:opacity-50"
            onClick={getLinkAndView}
          >
            {t("View")} {file.name}
          </div>

          <div className="flex flex-col justify-between">
            <div>{file.type}</div>

            <div>{formatFileSize(file.size)}</div>

            <div className="flex items-center gap-2">
              <span>
                {file.tokens.toLocaleString()} {t("tokens")}
              </span>
              {isProcessing && (
                <span className="flex items-center gap-1 text-sm text-blue-500">
                  <Loader2 className="size-3 animate-spin" />
                  {progress}%
                </span>
              )}
            </div>
          </div>

          {/* Processing Status Bar */}
          {isProcessing && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  Processing...
                </span>
                <span className="text-blue-600 dark:text-blue-400">
                  {progress}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* PII Indicator Badge */}
          <div className="pt-2">
            <FilePiiIndicator fileId={file.id} />
          </div>

          <div className="space-y-1">
            <Label>{t("Name")}</Label>

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

export const formatFileSize = (sizeInBytes: number): string => {
  let size = sizeInBytes;
  let unit = "bytes";

  if (size >= 1024) {
    size /= 1024;
    unit = "KB";
  }

  if (size >= 1024) {
    size /= 1024;
    unit = "MB";
  }

  if (size >= 1024) {
    size /= 1024;
    unit = "GB";
  }

  return `${size.toFixed(2)} ${unit}`;
};
