"use client";

import Loading from "@/app/[locale]/loading";
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
import { ChatbotUIContext } from "@/context/context";
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools";
import { getChatFilesByChatId } from "@/db/chat-files";
import { getChatById } from "@/db/chats";
import { getMessageFileItemsByMessageId } from "@/db/message-file-items";
import { getMessagesByChatId } from "@/db/messages";
import { getMessageImageFromStorage } from "@/db/storage/message-images";
import { convertBlobToBase64 } from "@/lib/blob-to-b64";
import useHotkey from "@/lib/hooks/use-hotkey";
import { LLMID, MessageImage } from "@/types";
import { useParams } from "next/navigation";
import { FC, useContext, useEffect, useState, useRef } from "react";
import { ChatHelp } from "./chat-help";
import { useScroll } from "./chat-hooks/use-scroll";
import { ChatInput } from "./chat-input";
import { ChatMessages } from "./chat-messages";
import { ChatScrollButtons } from "./chat-scroll-buttons";
import { ChatSecondaryButtons } from "./chat-secondary-buttons";
import { IconUpload, IconInfoCircle } from "@tabler/icons-react";
import { useSelectFileHandler } from "./chat-hooks/use-select-file-handler";
import { useTranslation } from "react-i18next";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "ChatUI" });
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { IconPinned } from "@tabler/icons-react";
import Image from "next/image";
import { ModelIcon } from "../models/model-icon";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import { updateChatModel } from "@/db/chats";
import {
  getModelInfo,
  validateAndGetAvailableModelAsync,
} from "@/lib/models/model-availability";
import { IconMoodSmile } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase/browser-client";
import { IconMessageCircle } from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModelSwitcher } from "./model-switcher";
// import { DeprecatedModelWarning } from "./deprecated-model-warning";

interface ChatUIProps {}

export const ChatUI: FC<ChatUIProps> = ({}) => {
  useHotkey("o", () => handleNewChat());

  const params = useParams();

  const {
    setChatMessages,
    selectedChat,
    setSelectedChat,
    setChatSettings,
    chatSettings,
    setChatImages,
    assistants,
    setSelectedAssistant,
    setChatFileItems,
    setChatFiles,
    setShowFilesDisplay,
    setUseRetrieval,
    setSelectedTools,
    setPinnedMessages,
    pinnedMessages,
    chatMessages,
    setLocalIsPinned,
    setNewMessageFiles,
    setNewMessageImages,
    assistantDirectModeWebhook,
    selectedAssistant,
  } = useContext(ChatbotUIContext);

  const { handleNewChat, handleFocusChatInput } = useChatHandler();

  const {
    messagesStartRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    setIsAtBottom,
    isAtTop,
    isAtBottom,
    isOverflowing,
    scrollToTop,
  } = useScroll();

  const [loading, setLoading] = useState(true);
  const [acceptedFile, setAcceptedFile] = useState(null);
  const { filesToAccept, handleSelectDeviceFile } = useSelectFileHandler();
  const { t } = useTranslation();
  const [isHoveringPin, setIsHoveringPin] = useState(false);
  const previousModelRef = useRef<string | null>(null);

  const onDrop = (droppedFiles: any) => {
    if (droppedFiles.length > 0) {
      logger.info("File dropped", { count: droppedFiles.length });
      // For direct mode or signature assistant, replace existing files and handle all dropped files at once
      const isSignatureAssistant =
        selectedAssistant?.role === "signature-assistant";
      if (assistantDirectModeWebhook || isSignatureAssistant) {
        // Pass all files at once with replaceAll=true
        handleSelectDeviceFile(droppedFiles as File[], true);
      } else {
        // Normal mode: process all dropped files
        handleSelectDeviceFile(droppedFiles as File[], false);
      }
    } else {
      logger.warn("File drop failed");
      toast.error(t("Failed to upload file"));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });

  useEffect(() => {
    if (!selectedChat?.id || !chatSettings?.model) return;

    if (previousModelRef.current === null) {
      previousModelRef.current = chatSettings.model;
      return;
    }

    if (previousModelRef.current !== chatSettings.model) {
      updateChatModel(selectedChat.id, chatSettings.model);
      previousModelRef.current = chatSettings.model;
    }
  }, [chatSettings?.model, selectedChat?.id]);

  useEffect(() => {
    previousModelRef.current = null;
  }, [params.chatid]);

  useEffect(() => {
    const fetchData = async () => {
      // Clear any previously selected files when switching chats
      setNewMessageFiles([]);
      setNewMessageImages([]);

      // Run fetchMessages and fetchChat in parallel for faster loading
      await Promise.all([fetchMessages(), fetchChat()]);

      scrollToBottom();
      setIsAtBottom(true);
    };

    if (params.chatid) {
      fetchData().then(() => {
        handleFocusChatInput();
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [params.chatid]);

  const fetchMessages = async () => {
    const fetchedMessages = await getMessagesByChatId(params.chatid as string);

    // Build image promises
    const imagePromises: Promise<MessageImage>[] = fetchedMessages.flatMap(
      message =>
        message.image_paths
          ? message.image_paths.map(async imagePath => {
              const url = await getMessageImageFromStorage(imagePath);

              if (url) {
                try {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const base64 = await convertBlobToBase64(blob);

                  return {
                    messageId: message.id,
                    path: imagePath,
                    base64,
                    url,
                    file: null,
                  };
                } catch (error) {
                  logger.error(`Error fetching image ${imagePath}`, {
                    error: String(error),
                  });
                  return {
                    messageId: message.id,
                    path: imagePath,
                    base64: "",
                    url,
                    file: null,
                  };
                }
              }

              return {
                messageId: message.id,
                path: imagePath,
                base64: "",
                url,
                file: null,
              };
            })
          : [],
    );

    // Build file item promises
    const messageFileItemPromises = fetchedMessages.map(message =>
      getMessageFileItemsByMessageId(message.id),
    );

    // Run all async operations in parallel for better performance
    const [images, messageFileItems, chatFiles] = await Promise.all([
      Promise.all(imagePromises.flat()),
      Promise.all(messageFileItemPromises),
      getChatFilesByChatId(params.chatid as string),
    ]);

    setChatImages(images);

    const uniqueFileItems = messageFileItems.flatMap(item => item.file_items);
    setChatFileItems(uniqueFileItems);

    setChatFiles(
      chatFiles.files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        file: null,
      })),
    );

    setUseRetrieval(true);
    setShowFilesDisplay(true);

    const fetchedChatMessages = fetchedMessages.map(message => {
      return {
        message,
        fileItems: messageFileItems
          .filter(messageFileItem => messageFileItem.id === message.id)
          .flatMap(messageFileItem =>
            messageFileItem.file_items.map(fileItem => fileItem.id),
          ),
        metadata: message.pin_metadata ? JSON.parse(message.pin_metadata) : {},
      };
    });
    const pinned = fetchedChatMessages.filter(msg => msg.message.is_pin);
    setChatMessages(fetchedChatMessages);
    setPinnedMessages(pinned);
  };

  const scrollToPinMessage = (messageId: string) => {
    const target = document.getElementById(`message-${messageId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const unPinMessage = async (messageId: string) => {
    setLocalIsPinned((prev: any) => ({ ...prev, [messageId]: false }));
    const updatedChatMessages = chatMessages.map(msg =>
      msg.message.id === messageId
        ? {
            ...msg,
            message: { ...msg.message, is_pin: false },
          }
        : msg,
    );
    setChatMessages(updatedChatMessages);

    const updatedMessage = updatedChatMessages.find(
      m => m.message.id === messageId,
    );
    if (!updatedMessage) return;

    setPinnedMessages(prev => prev.filter(p => p.message.id !== messageId));

    // Update in database
    const { error } = await supabase
      .from("messages")
      .update({
        is_pin: false,
        pin_metadata: null,
      })
      .eq("id", messageId);

    if (error) {
      logger.error("Error updating pin status", {
        error: String(error.message),
      });
      setLocalIsPinned((prev: any) => ({ ...prev, [messageId]: true }));
      setChatMessages(chatMessages);
      setPinnedMessages(prev => [...prev, updatedMessage]);
    }
  };

  const fetchChat = async () => {
    const chat = await getChatById(params.chatid as string);
    if (!chat) return;

    let assistant = null;
    if (chat.assistant_id) {
      assistant = assistants.find(
        assistant => assistant.id === chat.assistant_id,
      );

      if (assistant) {
        setSelectedAssistant(assistant);

        const assistantTools = (
          await getAssistantToolsByAssistantId(assistant.id)
        ).tools;
        setSelectedTools(assistantTools);
      }
    } else {
      // Clear assistant selection when switching to a normal chat
      setSelectedAssistant(null);
      setSelectedTools([]);
    }

    setSelectedChat(chat);
    const getCurrentModel = (modelString: string | null): string => {
      if (!modelString) return "";
      const models = modelString.split(",").map(m => m.trim());
      return models[models.length - 1];
    };

    const currentModel = getCurrentModel(chat.model);
    const currentImageModel = getCurrentModel(chat.image_model);

    // Validate both models in parallel for better performance
    const [validatedModel, validatedImageModel] = await Promise.all([
      validateAndGetAvailableModelAsync(currentModel as LLMID),
      validateAndGetAvailableModelAsync(currentImageModel as LLMID),
    ]);

    setChatSettings({
      model: validatedModel,
      imageModel: validatedImageModel,
      prompt: chat.prompt,
      temperature: chat.temperature,
      role: assistant?.role,
      contextLength: chat.context_length,
      includeProfileContext: chat.include_profile_context,
      includeWorkspaceInstructions: chat.include_workspace_instructions,
      embeddingsProvider: chat.embeddings_provider as "openai" | "local",
      is_temp_chat: chat.is_temp_chat,
    });
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div
      {...getRootProps()}
      className=" relative flex size-full flex-col items-center justify-center"
    >
      <input {...getInputProps()} accept={filesToAccept} type="file" multiple />

      {isDragActive && (
        <div className="bg-background/70 absolute inset-0 z-10 flex items-center justify-center bg-opacity-50 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-4 rounded-lg p-6 opacity-100 shadow-lg ">
            <IconUpload className="size-12" />
            <div className="text-ellipsis text-center font-semibold tracking-wide">
              {t("Drag and Drop the files here...")}
            </div>
          </div>
        </div>
      )}
      <div className="absolute left-4 top-2.5 flex justify-center">
        <ChatScrollButtons
          isAtTop={isAtTop}
          isAtBottom={isAtBottom}
          isOverflowing={isOverflowing}
          scrollToTop={scrollToTop}
          scrollToBottom={scrollToBottom}
        />
      </div>

      <div className="absolute right-4 top-1 flex h-[40px] items-center space-x-2">
        <ModelSwitcher />
        <ChatSecondaryButtons />
      </div>

      <div className="bg-secondary flex max-h-[50px] min-h-[50px] w-full items-center justify-center border-b-2 font-bold">
        <div className="flex flex-col items-center text-center">
          {selectedChat?.is_temp_chat ? (
            <>
              <div className="flex items-center space-x-1">
                <IconMessageCircle className="animate-spin-slow size-5" />
                <span className="max-w-[200px] truncate sm:max-w-[400px] md:max-w-[500px] lg:max-w-[600px] xl:max-w-[700px]">
                  {t("Temporary Chat")}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <IconInfoCircle className="size-5 cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] rounded-lg p-3 text-center text-sm shadow-md">
                      {t(
                        "Temporary chat will disappear as soon as you reload the page or close the chat window. You won't be able to view this conversation again later.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-muted-foreground max-w-[200px] truncate text-sm font-bold sm:max-w-[400px] md:max-w-[500px] lg:max-w-[600px] xl:max-w-[700px]">
                {selectedChat?.name || "Chat"}
              </span>
            </>
          ) : (
            <span className="max-w-[200px] truncate sm:max-w-[400px] md:max-w-[500px] lg:max-w-[600px] xl:max-w-[700px]">
              {selectedChat?.name || "Chat"}
            </span>
          )}
        </div>
      </div>

      {/* Show deprecated model warning if the chat is using a deprecated model */}
      {/* {selectedChat && (
        <DeprecatedModelWarning
          modelId={selectedChat.model as any}
          onModelUpdate={(newModelId) => {
            setChatSettings(prev => ({
              ...prev,
              model: newModelId,
            }));
          }}
        />
      )} */}

      {pinnedMessages.length > 0 && (
        <div className="w-full">
          {pinnedMessages.map(pinnedItem => {
            const { message } = pinnedItem;
            const metadata = pinnedItem.metadata || {};

            return (
              <div
                key={message.id}
                className="bg-primary/10 border-border w-full border-b px-4 py-3 shadow-sm"
                onClick={() => scrollToPinMessage(message.id)}
              >
                <div className="mx-auto flex max-w-screen-md items-start gap-2">
                  <div
                    className="relative flex items-center space-x-2"
                    onMouseEnter={() => setIsHoveringPin(true)}
                    onMouseLeave={() => setIsHoveringPin(false)}
                  >
                    <IconPinned
                      className="text-primary mt-1 shrink-0 cursor-pointer"
                      size={16}
                      onClick={() => unPinMessage(message.id)}
                    />
                    {isHoveringPin && (
                      <span className="text-muted-foreground text-xs">
                        Unpin
                      </span>
                    )}
                  </div>

                  {message.role === "user" &&
                    (metadata.profileImage ? (
                      <Image
                        className="size-[24px] shrink-0 rounded-full"
                        src={metadata.profileImage}
                        height={24}
                        width={24}
                        alt="user image"
                      />
                    ) : (
                      <IconMoodSmile className="bg-primary text-secondary border-primary size-[24px] shrink-0 rounded-full border p-1" />
                    ))}

                  {message.role === "assistant" &&
                    metadata.modelIcon &&
                    (metadata.modelIcon.startsWith?.("data") ? (
                      <Image
                        className="size-[24px] shrink-0 rounded-full"
                        src={metadata.modelIcon}
                        height={24}
                        width={24}
                        alt="assistant image"
                      />
                    ) : (
                      <ModelIcon
                        provider={
                          (
                            getModelInfo(metadata.modelIcon as any) ||
                            LLM_LIST.find(
                              llm => llm.modelId === metadata.modelIcon,
                            )
                          )?.provider || "custom"
                        }
                        height={24}
                        width={24}
                        className="shrink-0"
                      />
                    ))}
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center">
                      {metadata.profileName && message.role === "user" && (
                        <span className="text-primary mr-1 text-xs font-bold">
                          {metadata.profileName}
                        </span>
                      )}
                      {metadata.modelName && message.role === "assistant" && (
                        <span className="text-primary mr-1 text-xs font-bold">
                          {metadata.modelName}
                        </span>
                      )}
                    </div>

                    <div className="text-primary line-clamp-1 text-sm">
                      {message.content}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="flex size-full flex-col overflow-auto border-b"
        onScroll={handleScroll}
      >
        <div ref={messagesStartRef} />

        <ChatMessages />

        <div ref={messagesEndRef} data-messages-end />
      </div>

      <div className="relative w-full min-w-[300px] items-end px-2 pb-3 pt-0 sm:w-[550px] sm:pb-8 sm:pt-5 lg:w-[650px] xl:w-[700px]">
        <ChatInput
          acceptedFile={acceptedFile}
          setAcceptedFile={setAcceptedFile}
        />
      </div>

      <div className="absolute bottom-2 right-2 hidden md:block lg:bottom-4 lg:right-4">
        <ChatHelp />
      </div>
    </div>
  );
};
