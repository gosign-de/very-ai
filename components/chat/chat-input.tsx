"use client";

import { ChatbotUIContext } from "@/context/context";
import useHotkey from "@/lib/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import {
  IconBolt,
  IconCirclePlus,
  IconPlayerStopFilled,
  IconSend,
  IconWorld,
  IconBrain,
  IconList,
  IconMap,
} from "@tabler/icons-react";
import Image from "next/image";
import { FC, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { TextareaAutosize } from "../ui/textarea-autosize";
import { ChatCommandInput } from "./chat-command-input";
import { ChatFilesDisplay } from "./chat-files-display";
import { useChatHandler } from "./chat-hooks/use-chat-handler";
import { useChatHistoryHandler } from "./chat-hooks/use-chat-history";
import { usePromptAndCommand } from "./chat-hooks/use-prompt-and-command";
import { useSelectFileHandler } from "./chat-hooks/use-select-file-handler";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { OneDrivePickerV8Button } from "../onedrive/onedrive-picker-v8-button";
import { SharePointPickerButton } from "../sharepoint/sharepoint-picker-button";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "ChatInput" });

interface ChatInputProps {
  acceptedFile: File | null;
  setAcceptedFile: (file: File | null) => void;
}
export const ChatInput: FC<ChatInputProps> = ({
  acceptedFile,
  setAcceptedFile,
}) => {
  const { t } = useTranslation();

  useHotkey("l", () => {
    handleFocusChatInput();
  });

  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [enableSearch, setEnableSearch] = useState<boolean>(false);
  const [enableMaps, setEnableMaps] = useState<boolean>(false);
  const [isOneDriveEnabled, setIsOneDriveEnabled] = useState<boolean>(false); // Will be fetched from admin_settings
  const [isSharePointEnabled, setIsSharePointEnabled] =
    useState<boolean>(false); // Will be fetched from admin_settings

  // Fetch OneDrive and SharePoint settings from admin_settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/admin/settings");
        if (response.ok) {
          const settings = await response.json();
          setIsOneDriveEnabled(settings.onedrive_enabled ?? false);
          setIsSharePointEnabled(settings.sharepoint_enabled ?? false);
        }
      } catch (error) {
        logger.error("Failed to fetch admin settings", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Default to disabled if fetch fails
        setIsOneDriveEnabled(false);
        setIsSharePointEnabled(false);
      }
    };
    fetchSettings();
  }, []);

  const {
    isAssistantPickerOpen,
    focusAssistant,
    setFocusAssistant,
    userInput,
    chatMessages,
    isGenerating,
    selectedPreset,
    selectedAssistant,
    focusPrompt,
    setFocusPrompt,
    focusFile,
    focusTool,
    setFocusTool,
    isToolPickerOpen,
    isPromptPickerOpen,
    setIsPromptPickerOpen,
    isFilePickerOpen,
    setFocusFile,
    chatSettings,
    setChatSettings,
    selectedTools,
    setSelectedTools,
    assistantImages,
    groupassistantImages,
    selectedChat,
    contentState,
    archivedChatIds,
    assistantDirectModeWebhook,
    newMessageFiles,
    setNewMessageFiles,
    setNewMessageImages,
  } = useContext(ChatbotUIContext);

  const {
    chatInputRef,
    handleSendMessage,
    handleStopMessage,
    handleFocusChatInput,
    handleDirectWebhookExecution,
  } = useChatHandler();
  const [disableInput, setDisableInput] = useState(false);
  const { handleInputChange } = usePromptAndCommand();

  const { filesToAccept, handleSelectDeviceFile } = useSelectFileHandler();
  useEffect(() => {
    const isArchivedChat = archivedChatIds.includes(selectedChat?.id);
    setDisableInput(isArchivedChat);
  }, [selectedChat, contentState, archivedChatIds]);

  const {
    setNewMessageContentToNextUserMessage,
    setNewMessageContentToPreviousUserMessage,
  } = useChatHistoryHandler();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAutoSendingRef = useRef(false);
  const lastProcessedFileIdsRef = useRef<string>("");
  const newMessageFilesRef = useRef(newMessageFiles);

  // Keep ref in sync with state for use in timeouts
  useEffect(() => {
    newMessageFilesRef.current = newMessageFiles;
  }, [newMessageFiles]);

  useEffect(() => {
    setTimeout(() => {
      handleFocusChatInput();
    }, 200); // FIX: hacky
  }, [selectedPreset, selectedAssistant]);

  useEffect(() => {
    isAutoSendingRef.current = false;
    lastProcessedFileIdsRef.current = "";
  }, [selectedChat?.id]);

  // Clear files and reset state when new chat is started (selectedChat becomes null)
  useEffect(() => {
    if (!selectedChat && assistantDirectModeWebhook) {
      // New chat with direct mode webhook - clear all files immediately
      setNewMessageFiles([]);
      setNewMessageImages([]);
    }
  }, [
    selectedChat,
    assistantDirectModeWebhook,
    setNewMessageFiles,
    setNewMessageImages,
  ]);

  // Auto-send files in direct mode when files are added
  // Track which files have been processed to avoid re-sending
  useEffect(() => {
    if (!assistantDirectModeWebhook) return;

    const currentFileCount = newMessageFiles.length;
    if (currentFileCount === 0) {
      // Files cleared, reset tracking
      lastProcessedFileIdsRef.current = "";
      return;
    }

    // Create a unique signature of current files
    const currentFileIds = newMessageFiles
      .map(f => f.id)
      .sort()
      .join(",");

    // Skip if we've already processed these exact files
    if (currentFileIds === lastProcessedFileIdsRef.current) {
      return;
    }

    // Skip if already sending or generating
    if (isGenerating || isAutoSendingRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      // Re-check conditions inside timeout
      if (isAutoSendingRef.current || isGenerating) return;

      // Re-check file signature
      const newFileIds = newMessageFiles
        .map(f => f.id)
        .sort()
        .join(",");
      if (newFileIds === lastProcessedFileIdsRef.current || newFileIds === "")
        return;

      const files = newMessageFiles
        .map(f => f.file)
        .filter((f): f is File => f !== null);

      if (files.length > 0) {
        isAutoSendingRef.current = true;
        lastProcessedFileIdsRef.current = newFileIds;
        handleDirectWebhookExecution(userInput, files);
        // Reset sending flag after execution starts
        setTimeout(() => {
          isAutoSendingRef.current = false;
        }, 1000);
      }
    }, 400); // Slightly longer delay to ensure all files are in state

    return () => clearTimeout(timeoutId);
  }, [
    newMessageFiles,
    assistantDirectModeWebhook,
    isGenerating,
    handleDirectWebhookExecution,
    userInput,
  ]);

  // Automatically disable search and maps after response generation is finished
  const prevIsGenerating = useRef(isGenerating);

  useEffect(() => {
    if (prevIsGenerating.current && !isGenerating) {
      setEnableSearch(false);
      setEnableMaps(false);
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isTyping && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      setIsPromptPickerOpen(false);

      // In direct mode, allow sending with just files (no text required)
      const hasFilesInDirectMode =
        assistantDirectModeWebhook && newMessageFiles.length > 0;
      if (!userInput && !hasFilesInDirectMode) return;

      // Check for direct mode and route accordingly
      if (assistantDirectModeWebhook) {
        // Direct execution (bypasses AI)
        const files = newMessageFiles
          .map(f => f.file)
          .filter((f): f is File => f !== null);
        handleDirectWebhookExecution(userInput, files);
      } else {
        // Normal AI flow
        handleSendMessage(
          userInput,
          chatMessages,
          false,
          enableSearch,
          enableMaps,
        );
      }
    }

    // Consolidate conditions to avoid TypeScript error
    if (
      isPromptPickerOpen ||
      isFilePickerOpen ||
      isToolPickerOpen ||
      isAssistantPickerOpen
    ) {
      if (
        event.key === "Tab" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        // Toggle focus based on picker type
        if (isPromptPickerOpen) setFocusPrompt(!focusPrompt);
        if (isFilePickerOpen) setFocusFile(!focusFile);
        if (isToolPickerOpen) setFocusTool(!focusTool);
        if (isAssistantPickerOpen) setFocusAssistant(!focusAssistant);
      }
    }

    if (event.key === "ArrowUp" && event.shiftKey && event.ctrlKey) {
      event.preventDefault();
      setNewMessageContentToPreviousUserMessage();
    }

    if (event.key === "ArrowDown" && event.shiftKey && event.ctrlKey) {
      event.preventDefault();
      setNewMessageContentToNextUserMessage();
    }

    //use shift+ctrl+up and shift+ctrl+down to navigate through chat history
    if (event.key === "ArrowUp" && event.shiftKey && event.ctrlKey) {
      event.preventDefault();
      setNewMessageContentToPreviousUserMessage();
    }

    if (event.key === "ArrowDown" && event.shiftKey && event.ctrlKey) {
      event.preventDefault();
      setNewMessageContentToNextUserMessage();
    }

    if (
      isAssistantPickerOpen &&
      (event.key === "Tab" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown")
    ) {
      event.preventDefault();
      setFocusAssistant(!focusAssistant);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    // const imagesAllowed = LLM_LIST.find(
    //   llm => llm.modelId === chatSettings?.model
    // )?.imageInput

    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf("image") === 0) {
        // if (!imagesAllowed) {
        //   toast.error(
        //     t(`Images are not supported for this model. Use models like GPT-4 Vision instead.`)
        //   )
        //   return
        // }
        const file = item.getAsFile();
        if (!file) return;
        handleSelectDeviceFile(file);
      }
    }
  };

  useEffect(() => {
    if (acceptedFile && typeof handleSelectDeviceFile === "function") {
      handleSelectDeviceFile(acceptedFile);
      setAcceptedFile(null);
    }
  }, [acceptedFile, setAcceptedFile, handleSelectDeviceFile]);

  return (
    <>
      <div className="flex flex-col flex-wrap justify-center gap-2">
        <ChatFilesDisplay />

        {selectedTools &&
          selectedTools.map((tool, index) => (
            <div
              key={index}
              className="flex justify-center"
              onClick={() =>
                setSelectedTools(
                  selectedTools.filter(
                    selectedTool => selectedTool.id !== tool.id,
                  ),
                )
              }
            >
              <div className="flex cursor-pointer items-center justify-center space-x-1 rounded-lg bg-purple-600 px-3 py-1 hover:opacity-50">
                <IconBolt size={20} />

                <div>{tool.name}</div>
              </div>
            </div>
          ))}

        {selectedAssistant && (
          <div className="border-primary mx-auto flex w-fit items-center space-x-2 rounded-lg border p-1.5">
            {selectedAssistant.image_path && (
              <Image
                className="rounded"
                src={
                  assistantImages.find(
                    img => img.path === selectedAssistant.image_path,
                  )?.base64 ||
                  groupassistantImages.find(
                    img => img.path === selectedAssistant.image_path,
                  )?.base64 ||
                  ""
                }
                width={28}
                height={28}
                alt={selectedAssistant.name}
              />
            )}
            <div className="text-sm font-bold">
              {t("Talking to")} {selectedAssistant.name}
            </div>
          </div>
        )}
      </div>

      <div
        className={`border-input bg-inputBg relative mt-3 flex min-h-[60px] w-full rounded-xl border-2 ${
          disableInput
            ? "pointer-events-none cursor-not-allowed opacity-50"
            : ""
        } flex-col`}
      >
        <div className="absolute bottom-[76px] left-0 max-h-[300px] w-full overflow-auto rounded-xl dark:border-none">
          <ChatCommandInput />
        </div>

        {/* Hidden input to select files from device */}
        <Input
          ref={fileInputRef}
          className="hidden"
          type="file"
          multiple
          onChange={e => {
            if (!e.target.files || e.target.files.length === 0) return;
            const filesArray = Array.from(e.target.files);
            if (assistantDirectModeWebhook) {
              handleSelectDeviceFile(filesArray, true);
            } else {
              handleSelectDeviceFile(filesArray, false);
            }
            e.target.value = "";
          }}
          accept={filesToAccept}
        />

        {/* Layout with Search button and advanced features */}
        <>
          <div className="flex-1">
            <TextareaAutosize
              textareaRef={chatInputRef}
              className="ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring text-md flex w-full resize-none rounded-md border-none bg-transparent px-4 py-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t("Ask anything. Type @  /  #  !")}
              onValueChange={handleInputChange}
              value={userInput}
              minRows={1}
              maxRows={18}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCompositionStart={() => setIsTyping(true)}
              onCompositionEnd={() => setIsTyping(false)}
            />
          </div>

          {/* Button row */}
          <div className="flex items-center gap-2 px-3 py-2">
            <IconCirclePlus
              className="cursor-pointer hover:opacity-50"
              size={28}
              onClick={() => fileInputRef.current?.click()}
            />

            {/* Search button for all models */}
            <button
              onClick={() => {
                const newState = !enableSearch;
                setEnableSearch(newState);
                if (newState) setEnableMaps(false);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all",
                enableSearch
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95",
              )}
            >
              <IconWorld size={14} />
              <span>{t("Search")}</span>
            </button>

            {/* Google Maps button */}
            {(chatSettings?.model === "gemini-2.5-pro" ||
              chatSettings?.model === "gemini-2.5-flash") && (
              <button
                onClick={() => {
                  const newState = !enableMaps;
                  setEnableMaps(newState);
                  if (newState) setEnableSearch(false);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all",
                  enableMaps
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95",
                )}
              >
                <IconMap size={14} />
                <span>{t("Maps")}</span>
              </button>
            )}

            {chatSettings?.model === "gpt-5.1" && (
              <>
                {/* Thinking Process Dropdown */}
                <Select
                  value={chatSettings?.thinkingProcess || "high"}
                  onValueChange={(
                    value: "none" | "minimal" | "low" | "medium" | "high",
                  ) =>
                    setChatSettings({
                      ...chatSettings,
                      thinkingProcess: value,
                    })
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "flex h-6 w-auto items-center justify-center gap-1 rounded-full px-2.5 text-xs transition-all",
                      "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95",
                    )}
                  >
                    <IconBrain size={14} />
                    <SelectValue placeholder="High" />
                  </SelectTrigger>

                  <SelectContent className="bg-background w-auto min-w-[120px] rounded-lg border p-1 shadow-md">
                    {/* Header with explanation */}
                    <div className="text-muted-foreground border-b px-2 py-1.5 text-xs font-semibold">
                      {t("Reasoning Effort Level")}
                    </div>

                    <SelectItem
                      value="none"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("None")}
                    </SelectItem>

                    <SelectItem
                      value="minimal"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Minimal")}
                    </SelectItem>
                    <SelectItem
                      value="low"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Low")}
                    </SelectItem>

                    <SelectItem
                      value="medium"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Medium")}
                    </SelectItem>

                    <SelectItem
                      value="high"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("High")}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Summary Dropdown */}
                <Select
                  value={chatSettings?.summary || "auto"}
                  onValueChange={(value: "auto" | "concise" | "detailed") =>
                    setChatSettings({
                      ...chatSettings,
                      summary: value,
                    })
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "flex h-6 w-auto items-center justify-center gap-1 rounded-full px-2.5 text-xs transition-all",
                      "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95",
                    )}
                  >
                    <IconList size={14} />
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>

                  <SelectContent className="bg-background w-auto min-w-[120px] rounded-lg border p-1 shadow-md">
                    {/* Header with explanation */}
                    <div className="text-muted-foreground border-b px-2 py-1.5 text-xs font-semibold">
                      {t("Summary")}
                    </div>

                    <SelectItem
                      value="auto"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Auto")}
                    </SelectItem>

                    <SelectItem
                      value="concise"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Concise")}
                    </SelectItem>

                    <SelectItem
                      value="detailed"
                      className="hover:bg-muted/50 data-[highlighted]:bg-muted/50 rounded-md py-1.5 pl-8 pr-2 text-xs"
                    >
                      {t("Detailed")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {isOneDriveEnabled && (
              <OneDrivePickerV8Button
                onFilesSelected={async files => {
                  // Process each file through the existing file handler
                  for (const file of files) {
                    handleSelectDeviceFile(file);
                  }
                }}
                multiSelect={true}
                className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all active:scale-95"
              />
            )}

            {isSharePointEnabled && (
              <SharePointPickerButton
                onFilesSelected={async files => {
                  // Process each file through the existing file handler
                  for (const file of files) {
                    handleSelectDeviceFile(file);
                  }
                }}
                multiSelect={true}
                className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all active:scale-95"
              />
            )}

            <div className="ml-auto">
              {isGenerating ? (
                <IconPlayerStopFilled
                  className="hover:bg-background animate-pulse cursor-pointer rounded bg-transparent p-1"
                  onClick={handleStopMessage}
                  size={30}
                />
              ) : (
                <IconSend
                  className={cn(
                    "bg-primary text-secondary cursor-pointer rounded p-1",
                    // In direct mode with files, allow sending without text
                    !userInput &&
                      !(
                        assistantDirectModeWebhook && newMessageFiles.length > 0
                      ) &&
                      "cursor-not-allowed opacity-50",
                  )}
                  onClick={() => {
                    // In direct mode, allow sending with just files (no text required)
                    const hasFilesInDirectMode =
                      assistantDirectModeWebhook && newMessageFiles.length > 0;
                    if (!userInput && !hasFilesInDirectMode) return;

                    // Check for direct mode and route accordingly
                    if (assistantDirectModeWebhook) {
                      // Direct execution (bypasses AI)
                      const files = newMessageFiles
                        .map(f => f.file)
                        .filter((f): f is File => f !== null);
                      logger.info(
                        "[Chat Input Button] Extracted files for direct mode",
                        {
                          newMessageFilesCount: newMessageFiles.length,
                          extractedFilesCount: files.length,
                          fileNames: files.map(f => f.name),
                        },
                      );
                      handleDirectWebhookExecution(userInput, files);
                    } else {
                      // Normal AI flow
                      handleSendMessage(
                        userInput,
                        chatMessages,
                        false,
                        enableSearch,
                        enableMaps,
                      );
                    }
                  }}
                  size={30}
                />
              )}
            </div>
          </div>
        </>
      </div>
    </>
  );
};
