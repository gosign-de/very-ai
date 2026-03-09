"use client";

import { ChatbotUIContext } from "@/context/context";
import { getFileFromStorage } from "@/db/storage/files";
import useHotkey from "@/lib/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { ChatFile, MessageImage } from "@/types";
import mime from "mime-types";
import {
  IconCircleFilled,
  IconFileFilled,
  IconFileTypeCsv,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeTxt,
  IconJson,
  IconLoader2,
  IconMarkdown,
  IconX,
} from "@tabler/icons-react";
import Image from "next/image";
import { FC, useContext, useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { SwipeableItem } from "../ui/swipeable-item";
import { AnimatePresence } from "framer-motion";
import { FilePreview } from "../ui/file-preview";
import { WithTooltip } from "../ui/with-tooltip";
import { ChatRetrievalSettings } from "./chat-retrieval-settings";
import { useTranslation } from "react-i18next";
import { FilePiiIndicator } from "@/components/files/file-pii-indicator";
import { toast } from "sonner";

interface ChatFilesDisplayProps {}

export const ChatFilesDisplay: FC<ChatFilesDisplayProps> = ({}) => {
  const { t } = useTranslation();

  useHotkey("f", () => setShowFilesDisplay(prev => !prev));
  useHotkey("e", () => setUseRetrieval(prev => !prev));

  const {
    files,
    newMessageImages,
    setNewMessageImages,
    newMessageFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    showFilesDisplay,
    chatFiles,
    chatImages,
    setChatImages,
    setChatFiles,
    setUseRetrieval,
    selectedChat,
    profile,
    assistantDirectModeWebhook,
    selectedAssistant,
  } = useContext(ChatbotUIContext);

  const [selectedFile, setSelectedFile] = useState<ChatFile | null>(null);
  const [selectedImage, setSelectedImage] = useState<MessageImage | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [filteredFiles, setFilteredFiles] = useState<ChatFile[]>([]);
  const toastShownRef = useRef<Set<string>>(new Set());

  const messageImages = [
    ...newMessageImages.filter(
      image =>
        image.chatId === selectedChat?.id &&
        !chatImages.some(chatImage => chatImage.messageId === image.messageId),
    ),
    ...chatImages.filter(
      image =>
        image.messageId &&
        image.base64 &&
        !newMessageImages.some(newImage => newImage.url === image.url),
    ),
  ];
  const chatFilteredFiles = () => {
    setFilteredFiles(
      newMessageFiles.filter(
        file => !file.chatId || file.chatId === selectedChat?.id,
      ),
    );
  };

  useEffect(() => {
    chatFilteredFiles();
  }, [newMessageFiles, selectedChat?.id]);

  let combinedChatFiles = [
    ...filteredFiles.filter(
      file => !chatFiles.some(chatFile => chatFile.id === file.id),
    ),
    ...chatFiles,
  ];

  useEffect(() => {
    const processingFile = combinedChatFiles.find(file => {
      if (toastShownRef.current.has(file.id)) {
        return false;
      }
      const fileFromFiles = files.find(f => f.id === file.id);
      return (
        fileFromFiles?.processing_status === "processing" &&
        (fileFromFiles?.processing_progress ?? 0) >= 0
      );
    });

    if (processingFile) {
      toastShownRef.current.add(processingFile.id);
      toast.info(
        "File too large, uploading is in progress. You can start conversation.",
        {
          id: `file-upload-${processingFile.id}`,
          duration: 5000,
          position: "top-center",
        },
      );
    }
  }, [combinedChatFiles, files]);

  if (!profile?.developer_mode) {
    combinedChatFiles = combinedChatFiles.map(chatFile => {
      const fileFromFiles = files.find(file => file.id === chatFile.id);
      if (fileFromFiles) {
        const rawType = fileFromFiles.original_type || fileFromFiles.type;
        let fileExtension = mime.extension(rawType);
        if (!fileExtension && /^[a-z]+$/i.test(rawType)) {
          fileExtension = rawType;
        }
        return {
          ...chatFile,
          type: fileFromFiles.original_type || chatFile.type,
          name:
            chatFile.name.replace(/\.[^.]+$/, `.${fileExtension}`) ||
            chatFile.name,
        };
      }

      return chatFile;
    });
  } else {
    combinedChatFiles = combinedChatFiles.map(chatFile => {
      const fileFromFiles = files.find(file => file.id === chatFile.id);
      if (fileFromFiles) {
        return {
          ...chatFile,
          type: fileFromFiles.type,
          name: fileFromFiles.name,
        };
      }

      return chatFile;
    });
  }

  const combinedMessageFiles = [...messageImages, ...combinedChatFiles];

  const getLinkAndView = async (file: ChatFile) => {
    const fileRecord = files.find(f => f.id === file.id);

    if (!fileRecord) return;

    const link = await getFileFromStorage(fileRecord.file_path);
    window.open(link, "_blank");
  };

  // For thinking-enabled webhooks, don't show file display UI
  // Signature assistants should still show their reference image
  const isSignatureAssistant =
    selectedAssistant?.role === "signature-assistant";

  if (assistantDirectModeWebhook && !isSignatureAssistant) {
    return null;
  }

  return showFilesDisplay && combinedMessageFiles.length > 0 ? (
    <>
      {showPreview && selectedImage && (
        <FilePreview
          type="image"
          item={selectedImage}
          isOpen={showPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowPreview(isOpen);
            setSelectedImage(null);
          }}
        />
      )}

      {showPreview && selectedFile && (
        <FilePreview
          type="file"
          item={selectedFile}
          isOpen={showPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowPreview(isOpen);
            setSelectedFile(null);
          }}
        />
      )}

      <div className="space-y-2">
        <div className="relative flex w-full items-center justify-center">
          <Button
            className="relative flex h-[32px] w-[140px] space-x-2"
            onClick={() => setShowFilesDisplay(false)}
          >
            <RetrievalToggle />

            <div>{t("Hide files")}</div>

            <div onClick={e => e.stopPropagation()}>
              <ChatRetrievalSettings />
            </div>
          </Button>
        </div>

        <div className="overflow-auto">
          <div className="bg-background relative flex max-h-[360px] flex-col gap-2 space-y-1 overflow-y-auto overflow-x-hidden rounded-xl border-2 p-2 text-sm">
            {messageImages.map((image, index) => (
              <div
                key={index}
                className="relative flex h-[64px] cursor-pointer items-center space-x-4 rounded-xl hover:opacity-50"
              >
                <Image
                  className="rounded"
                  style={{
                    minWidth: "56px",
                    minHeight: "56px",
                    maxHeight: "56px",
                    maxWidth: "56px",
                  }}
                  src={image.base64}
                  alt="File image"
                  width={56}
                  height={56}
                  onClick={() => {
                    setSelectedImage(image);
                    setShowPreview(true);
                  }}
                />

                <IconX
                  className="bg-muted-foreground border-primary absolute right-[-6px] top-[-2px] flex size-5 cursor-pointer items-center justify-center rounded-full border-DEFAULT text-[10px] hover:border-red-500 hover:bg-white hover:text-red-500"
                  onClick={e => {
                    e.stopPropagation();

                    const updatedNewMessageImages = newMessageImages.filter(
                      f => f.url !== image.url,
                    );
                    setNewMessageImages(updatedNewMessageImages);

                    const updatedChatImages = chatImages.filter(
                      f => f.url !== image.url,
                    );
                    setChatImages(updatedChatImages);
                  }}
                />
              </div>
            ))}
            <AnimatePresence>
              {combinedChatFiles.map((file, index) =>
                file.status === "loading" ? (
                  <div
                    key={index}
                    className="relative flex h-[64px] items-center space-x-4 rounded-xl border-2 px-4 py-3"
                  >
                    <div className="rounded bg-blue-500 p-1">
                      <IconLoader2 className="animate-spin" />
                    </div>

                    <div className="truncate text-sm">
                      <div className="truncate">{file.name}</div>
                      <div className="truncate opacity-50">{file.type}</div>
                    </div>
                  </div>
                ) : (
                  <SwipeableItem
                    key={file.id}
                    file={file}
                    onDelete={() => {
                      setNewMessageFiles(
                        newMessageFiles.filter(f => f.id !== file.id),
                      );
                      setChatFiles(chatFiles.filter(f => f.id !== file.id));
                    }}
                    onClick={() => getLinkAndView(file)}
                  >
                    <div className="rounded bg-blue-500 p-1">
                      {(() => {
                        let fileExtension = file.type.includes("/")
                          ? file.type.split("/")[1]
                          : file.type;

                        switch (fileExtension) {
                          case "pdf":
                            return <IconFileTypePdf />;
                          case "markdown":
                            return <IconMarkdown />;
                          case "txt":
                            return <IconFileTypeTxt />;
                          case "json":
                            return <IconJson />;
                          case "csv":
                            return <IconFileTypeCsv />;
                          case "docx":
                            return <IconFileTypeDocx />;
                          default:
                            return <IconFileFilled />;
                        }
                      })()}
                    </div>

                    <div className="truncate text-sm">
                      <div className="truncate">{file.name}</div>
                    </div>

                    <div className="ml-auto" onClick={e => e.stopPropagation()}>
                      <FilePiiIndicator fileId={file.id} />
                    </div>
                  </SwipeableItem>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  ) : (
    combinedMessageFiles.length > 0 && (
      <div className="flex w-full items-center justify-center space-x-2">
        <Button
          className="relative flex h-[32px] w-[200px] space-x-2"
          onClick={() => setShowFilesDisplay(true)}
        >
          <RetrievalToggle />

          <div>
            {combinedMessageFiles.length === 1
              ? t("View 1 file")
              : t("View {{count}} files", {
                  count: combinedMessageFiles.length,
                })}
          </div>

          <div onClick={e => e.stopPropagation()}>
            <ChatRetrievalSettings />
          </div>
        </Button>
      </div>
    )
  );
};

const RetrievalToggle = ({}) => {
  const { useRetrieval, setUseRetrieval } = useContext(ChatbotUIContext);
  const { t } = useTranslation();

  return (
    <div className="flex items-center">
      <WithTooltip
        delayDuration={0}
        side="top"
        display={
          <div>
            {useRetrieval
              ? t(
                  "File retrieval is enabled on the selected files for this message. Click the indicator to disable.",
                )
              : t(
                  "Click the indicator to enable file retrieval for this message.",
                )}
          </div>
        }
        trigger={
          <IconCircleFilled
            className={cn(
              "p-1",
              useRetrieval ? "text-green-500" : "text-red-500",
              useRetrieval ? "hover:text-green-200" : "hover:text-red-200",
            )}
            size={24}
            onClick={e => {
              e.stopPropagation();
              setUseRetrieval(prev => !prev);
            }}
          />
        }
      />
    </div>
  );
};
