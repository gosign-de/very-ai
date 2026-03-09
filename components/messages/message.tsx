"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
import { ChatbotUIContext } from "@/context/context";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import { getModelInfo } from "@/lib/models/model-availability";
import { cn } from "@/lib/utils";
import { Tables } from "@/supabase/types";
import { LLM, LLMID, MessageImage, ModelProvider } from "@/types";

import {
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconMoodSmile,
  IconPencil,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import Image from "next/image";
import { FC, useContext, useEffect, useRef, useState } from "react";
import { ModelIcon } from "../models/model-icon";
import { Button } from "../ui/button";
import { FileIcon } from "../ui/file-icon";
import { FilePreview } from "../ui/file-preview";
import { TextareaAutosize } from "../ui/textarea-autosize";
import { WithTooltip } from "../ui/with-tooltip";
import { MessageActions } from "./message-actions";
import { MessageMarkdown } from "./message-markdown";
import { ThinkingDisplay } from "./thinking-display";
import { ThinkingSteps } from "./thinking-steps";
import { GroundingDisplay } from "../chat/grounding-display";
import { useTranslation } from "react-i18next";
import ToolInUse from "./ToolInUse";
import { supabase } from "@/lib/supabase/browser-client";
import { MessagePiiIndicator } from "./message-pii-indicator";

const logger = createClientLogger({ component: "Message" });
const ICON_SIZE = 32;

interface MessageProps {
  message: Tables<"messages">;
  fileItems: Tables<"file_items">[];
  index: number;
  isEditing: boolean;
  isLast: boolean;
  onStartEdit: (message: Tables<"messages">) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (value: string, sequenceNumber: number) => void;
  metadata?: any;
  piiTokenMap?: Record<string, string>;
  // Props lifted from parent to avoid N+1 queries
  profileImages?: { id: string; base64: string }[];
  isGroupChat?: boolean;
  currentUserName?: string | null;
}

export const Message: FC<MessageProps> = ({
  message,
  fileItems,
  index,
  isEditing,
  isLast,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  metadata,
  piiTokenMap = {},
  profileImages = [],
  isGroupChat = false,
  currentUserName = null,
}) => {
  const { t } = useTranslation();
  const {
    assistants,
    profile,
    isGenerating,
    setIsGenerating,
    firstTokenReceived,
    availableLocalModels,
    availableOpenRouterModels,
    chatMessages,
    selectedAssistant,
    chatImages,
    assistantImages,
    toolInUse: _toolInUse,
    files,
    models,
    pinnedMessages: _pinnedMessages,
    setPinnedMessages,
    setChatMessages,
    localIsPinned,
    setLocalIsPinned,
    isThinking,
    thinkingContent,
  } = useContext(ChatbotUIContext);

  const { handleSendMessage } = useChatHandler();

  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [editedMessage, setEditedMessage] = useState(message.content);

  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<MessageImage | null>(null);
  const [showFileItemPreview, setShowFileItemPreview] = useState(false);
  const [selectedFileItem, setSelectedFileItem] =
    useState<Tables<"file_items"> | null>(null);

  const [viewSources, setViewSources] = useState(false);
  const [isPiiRevealed, setIsPiiRevealed] = useState(false);
  const [revealedContent, setRevealedContent] = useState<string | null>(null);
  const [isUserPiiRevealed, setIsUserPiiRevealed] = useState(false);

  // Function to replace PII tokens with actual values
  const replacePiiTokens = (
    content: string,
    tokenMap: Record<string, string>,
  ) => {
    let replacedContent = content;
    Object.entries(tokenMap).forEach(([token, value]) => {
      replacedContent = replacedContent.replace(
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        value,
      );
    });
    return replacedContent;
  };

  // Extract thinking content and regular content from message
  const extractThinkingContent = (content: string) => {
    const thinkingMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : "";
    const regularContent = content
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    return { thinkingContent, regularContent };
  };

  // Extract grounding content from message
  const extractGroundingContent = (content: string) => {
    const groundingMatch = content.match(/<grounding>([\s\S]*?)<\/grounding>/);
    const groundingContent = groundingMatch ? groundingMatch[1].trim() : "";
    const contentWithoutGrounding = content
      .replace(/<grounding>[\s\S]*?<\/grounding>/g, "")
      .trim();
    return { groundingContent, contentWithoutGrounding };
  };

  // Check if the current model supports thinking
  const isThinkingModel = (modelId: string) => {
    const thinkingModels = [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "deepseek-r1",
      "deepseek-ai/deepseek-r1-0528-maas",
    ];
    return thinkingModels.includes(modelId);
  };

  const {
    thinkingContent: messageThinkingContent,
    regularContent: contentAfterThinking,
  } = extractThinkingContent(message.content);

  const { groundingContent, contentWithoutGrounding: regularContent } =
    extractGroundingContent(contentAfterThinking);

  // Parse grounding metadata if available
  let groundingMetadata = null;
  if (groundingContent) {
    try {
      groundingMetadata = JSON.parse(groundingContent);
    } catch (e) {
      logger.error("Failed to parse grounding metadata", { error: String(e) });
    }
  }

  // Extract thinking steps data from pin_metadata (supports single and multi-file)
  const extractThinkingStepsData = (
    content: string,
    pinMetadata?: string,
  ): {
    singleExecutionId: string | null;
    multiExecutions: Array<{ file_name: string; execution_id: string }> | null;
  } => {
    // First check pin_metadata (for direct mode webhooks)
    if (pinMetadata) {
      try {
        const metadata = JSON.parse(pinMetadata);
        if (metadata.n8n_direct_mode) {
          // If completed flag is set for single file, don't show ThinkingSteps
          if (metadata.completed && !metadata.multi_file) {
            return {
              singleExecutionId: null,
              multiExecutions: null,
            };
          }
          // Multi-file mode
          if (metadata.multi_file && metadata.executions) {
            return {
              singleExecutionId: null,
              multiExecutions: metadata.executions,
            };
          }
          // Single execution mode
          if (metadata.execution_id) {
            return {
              singleExecutionId: metadata.execution_id,
              multiExecutions: null,
            };
          }
        }
      } catch (_e) {
        // Invalid JSON, continue to content check
      }
    }

    // Fallback to content extraction (legacy format)
    const match = content.match(
      /<thinking-execution>(.*?)<\/thinking-execution>/,
    );
    return {
      singleExecutionId: match ? match[1] : null,
      multiExecutions: null,
    };
  };

  const thinkingStepsData = extractThinkingStepsData(
    regularContent,
    message.pin_metadata || undefined,
  );
  const contentForMarkdown = regularContent
    .replace(/<thinking-execution>.*?<\/thinking-execution>/g, "")
    .trim();

  const handleCopy = () => {
    const markdownImagePattern =
      /!\[Alt text\]\(<<imageUrlStart>>(.*?)<<imageUrlEnd>>\)/s;
    const contentToCopy = regularContent
      .replace(markdownImagePattern, "$1")
      .trim();

    if (navigator.clipboard) {
      navigator.clipboard.writeText(contentToCopy);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = contentToCopy;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  const handleSendEdit = () => {
    onSubmitEdit(editedMessage, message.sequence_number);
    onCancelEdit();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isEditing && event.key === "Enter" && event.metaKey) {
      handleSendEdit();
    }
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    await handleSendMessage(
      editedMessage || chatMessages[chatMessages.length - 2].message.content,
      chatMessages,
      true,
    );
  };

  const handleStartEdit = () => {
    onStartEdit(message);
  };

  const handlePinMessages = async (
    messageId: string,
    isCurrentlyPinned: boolean,
  ) => {
    if (!isCurrentlyPinned) {
      setLocalIsPinned(prev => ({ ...prev, [messageId]: true }));
    } else {
      setLocalIsPinned(prev => ({ ...prev, [messageId]: false }));
    }

    const pinnedMessageData = {
      messageId,
      isPinned: !isCurrentlyPinned,
      profileName: message.role === "user" ? displayName : null,
      profileImage: message.role === "user" ? displayImage : null,
      modelName:
        message.role === "assistant"
          ? message.assistant_id
            ? assistants.find(a => a.id === message.assistant_id)?.name || ""
            : selectedAssistant?.name || MODEL_DATA?.modelName
          : null,
      modelIcon:
        message.role === "assistant"
          ? messageAssistantImage || (MODEL_DATA ? MODEL_DATA.modelId : null)
          : null,
      role: message.role,
    };
    const updatedChatMessages = chatMessages.map(msg =>
      msg.message.id === messageId
        ? {
            ...msg,
            message: { ...msg.message, is_pin: !isCurrentlyPinned },
          }
        : msg,
    );
    setChatMessages(updatedChatMessages);
    const updatedMessage = updatedChatMessages.find(
      m => m.message.id === messageId,
    );
    if (!updatedMessage) return;

    if (!isCurrentlyPinned) {
      setPinnedMessages(prev => [
        ...prev,
        {
          ...updatedMessage,
          metadata: pinnedMessageData,
        },
      ]);
    } else {
      setPinnedMessages(prev => prev.filter(p => p.message.id !== messageId));
    }
    // Update in database
    const { error } = await supabase
      .from("messages")
      .update({
        is_pin: !isCurrentlyPinned,
        pin_metadata: !isCurrentlyPinned
          ? JSON.stringify(pinnedMessageData)
          : null,
      })
      .eq("id", messageId);

    if (error) {
      logger.error("Error updating pin status", {
        error: String(error.message),
      });
      setLocalIsPinned(isCurrentlyPinned);
      setChatMessages(chatMessages);
      if (!isCurrentlyPinned) {
        setPinnedMessages(prev => prev.filter(p => p.message.id !== messageId));
      } else {
        const originalMsg = chatMessages.find(m => m.message.id === messageId);
        if (originalMsg) {
          setPinnedMessages(prev => [...prev, originalMsg]);
        }
      }
    }
  };

  useEffect(() => {
    setEditedMessage(regularContent);

    if (isEditing && editInputRef.current) {
      const input = editInputRef.current;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, [isEditing, regularContent]);

  const MODEL_DATA =
    getModelInfo(message.model as any) ||
    ([
      ...models.map(model => ({
        modelId: model.model_id as LLMID,
        modelName: model.name,
        provider: "custom" as ModelProvider,
        hostedId: model.id,
        platformLink: "",
        imageInput: false,
      })),
      ...LLM_LIST,
      ...availableLocalModels,
      ...availableOpenRouterModels,
    ].find(llm => llm.modelId === message.model) as LLM);

  const messageAssistantImage = assistantImages.find(
    image => image.assistantId === message.assistant_id,
  )?.base64;

  const _selectedAssistantImage = assistantImages.find(
    image => image.path === selectedAssistant?.image_path,
  )?.base64;

  const modelDetails =
    getModelInfo(message.model as any) ||
    LLM_LIST.find(model => model.modelId === message.model);

  const fileAccumulator: Record<
    string,
    {
      id: string;
      name: string;
      count: number;
      type: string;
      description: string;
    }
  > = {};

  const fileSummary = fileItems.reduce((acc, fileItem) => {
    const parentFile = files.find(file => file.id === fileItem.file_id);
    if (parentFile) {
      if (!acc[parentFile.id]) {
        acc[parentFile.id] = {
          id: parentFile.id,
          name: parentFile.name,
          count: 1,
          type: parentFile.type,
          description: parentFile.description,
        };
      } else {
        acc[parentFile.id].count += 1;
      }
    }
    return acc;
  }, fileAccumulator);

  // Use profile data from props (fetched once in parent) instead of fetching per message
  const profileImg = profileImages.find(image => {
    if (message.session_id) {
      return image.id === message.session_id;
    } else {
      return false;
    }
  });
  const displayImage = isGroupChat ? profileImg?.base64 : profile?.image_url;
  const displayName = currentUserName;

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "flex w-full justify-center",
        message.role === "user" ? "" : "bg-secondary",
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="relative flex w-full flex-col p-6 sm:w-[550px] sm:px-0 lg:w-[650px] xl:w-[700px]">
        <div className="absolute right-5 top-7 sm:right-0">
          <MessageActions
            onCopy={handleCopy}
            onEdit={handleStartEdit}
            isAssistant={message.role === "assistant"}
            isLast={isLast}
            isEditing={isEditing}
            isHovering={isHovering}
            onRegenerate={handleRegenerate}
            onPin={() => handlePinMessages(message.id, message.is_pin)}
            isPinned={
              localIsPinned[message.id] !== undefined
                ? localIsPinned[message.id]
                : message.is_pin
            }
          />
        </div>
        <div className="space-y-3">
          {message.role === "system" ? (
            <div className="flex items-center space-x-4">
              <IconPencil
                className="border-primary bg-primary text-secondary rounded border-DEFAULT p-1"
                size={ICON_SIZE}
              />
              <div className="text-lg font-semibold">{t("Prompt")}</div>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              {message.role === "assistant" ? (
                // message.chat_id !== "" &&
                messageAssistantImage ? (
                  <Image
                    style={{
                      width: `${ICON_SIZE}px`,
                      height: `${ICON_SIZE}px`,
                    }}
                    className="rounded"
                    src={messageAssistantImage}
                    alt={t("assistant image")}
                    height={ICON_SIZE}
                    width={ICON_SIZE}
                  />
                ) : MODEL_DATA ? (
                  <WithTooltip
                    display={<div>{MODEL_DATA?.modelName}</div>}
                    trigger={
                      <ModelIcon
                        provider={modelDetails?.provider || "custom"}
                        height={ICON_SIZE}
                        width={ICON_SIZE}
                      />
                    }
                  />
                ) : (
                  <div className="animate-shimmer size-8 rounded-[16px] bg-white"></div>
                )
              ) : displayImage ? (
                <Image
                  className={`size-[32px] rounded`}
                  src={displayImage}
                  height={32}
                  width={32}
                  alt="user image"
                />
              ) : (
                <IconMoodSmile
                  className="bg-primary text-secondary border-primary rounded border-DEFAULT p-1"
                  size={ICON_SIZE}
                />
              )}
              <div className="font-semibold">
                {message.role === "assistant" ? (
                  message.assistant_id ? (
                    assistants.find(
                      assistant => assistant.id === message.assistant_id,
                    )?.name || ""
                  ) : selectedAssistant ? (
                    selectedAssistant?.name
                  ) : MODEL_DATA ? (
                    MODEL_DATA?.modelName
                  ) : (
                    <div className="animate-shimmer h-6 w-16 rounded bg-white"></div>
                  )
                ) : (
                  displayName
                )}
              </div>
            </div>
          )}
          {/* Show thinking display only when there's actual thinking content AND it's a thinking model */}
          {message.role === "assistant" &&
            isThinkingModel(message.model) &&
            (messageThinkingContent ||
              (isThinking &&
                isLast &&
                isGenerating &&
                thinkingContent &&
                thinkingContent.trim())) && (
              <ThinkingDisplay
                thinkingContent={messageThinkingContent || thinkingContent}
                isVisible={true}
                isStreaming={
                  isThinking &&
                  isLast &&
                  isGenerating &&
                  !messageThinkingContent
                }
              />
            )}
          {!firstTokenReceived &&
          isGenerating &&
          isLast &&
          message.role === "assistant" ? (
            <ToolInUse role={message.role} isLast={isLast} />
          ) : isEditing ? (
            <TextareaAutosize
              textareaRef={editInputRef}
              className="text-md"
              value={editedMessage}
              onValueChange={setEditedMessage}
              maxRows={20}
            />
          ) : (
            <>
              <MessageMarkdown
                content={
                  message.role === "assistant" &&
                  isPiiRevealed &&
                  revealedContent
                    ? revealedContent
                    : message.role === "user" &&
                        (message as any).original_content &&
                        isUserPiiRevealed
                      ? (message as any).original_content
                      : contentForMarkdown
                }
                role={message.role}
                isLast={isLast}
              />
              {/* Single execution ThinkingSteps */}
              {thinkingStepsData.singleExecutionId && (
                <ThinkingSteps
                  executionId={thinkingStepsData.singleExecutionId}
                  messageId={message.id}
                />
              )}
              {/* Multi-file ThinkingSteps - render one for each file */}
              {thinkingStepsData.multiExecutions &&
                thinkingStepsData.multiExecutions.map((execution, index) => (
                  <div key={execution.execution_id} className="mt-4">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      📄 File {index + 1}/
                      {thinkingStepsData.multiExecutions!.length}:{" "}
                      {execution.file_name}
                    </div>
                    <ThinkingSteps
                      executionId={execution.execution_id}
                      messageId={`${message.id}-${index}`}
                      showResultInline={true}
                      fileName={execution.file_name}
                    />
                  </div>
                ))}
              {/* Display PII indicator and reveal button for user messages */}
              {message.role === "user" &&
                (metadata?.piiProcessing ||
                  ((message as any).pii_entities &&
                    (message as any).pii_entities.length > 0)) && (
                  <div className="mt-3 flex items-center gap-3">
                    <MessagePiiIndicator
                      messageId={message.id}
                      originalContent={
                        (message as any).original_content || message.content
                      }
                      redactedContent={message.content}
                      piiEntities={(message as any).pii_entities}
                      role={message.role as "user" | "assistant"}
                      isProcessing={metadata?.piiProcessing}
                    />
                    {!metadata?.piiProcessing &&
                      (message as any).original_content && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setIsUserPiiRevealed(!isUserPiiRevealed)
                          }
                          className="border-border hover:bg-accent h-7 gap-1.5 rounded-full bg-transparent px-3 text-xs"
                        >
                          {isUserPiiRevealed ? (
                            <>
                              <IconEyeOff size={14} />
                              {t("Hide Original")}
                            </>
                          ) : (
                            <>
                              <IconEye size={14} />
                              {t("Reveal Original")}
                            </>
                          )}
                        </Button>
                      )}
                  </div>
                )}
              {/* Display reveal button for assistant messages if PII tokens detected */}
              {message.role === "assistant" &&
                regularContent.includes("[") &&
                regularContent.match(/\[[A-Za-z]+_[a-z0-9]+\]/i) && (
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!isPiiRevealed) {
                          // Replace PII tokens with actual values from the token map
                          const revealed = replacePiiTokens(
                            regularContent,
                            piiTokenMap,
                          );
                          setRevealedContent(revealed);
                          setIsPiiRevealed(true);
                        } else {
                          setIsPiiRevealed(false);
                          setRevealedContent(null);
                        }
                      }}
                      className="border-muted-foreground/30 hover:bg-accent h-7 gap-1.5 rounded-full border bg-transparent px-3 text-xs"
                    >
                      {isPiiRevealed ? (
                        <>
                          <IconEyeOff size={14} />
                          {t("Hide Original")}
                        </>
                      ) : (
                        <>
                          <IconEye size={14} />
                          {t("Reveal Original")}
                        </>
                      )}
                    </Button>
                  </div>
                )}
            </>
          )}
          {/* Display grounding information for assistant messages */}
          {message.role === "assistant" && groundingMetadata && (
            <GroundingDisplay groundingMetadata={groundingMetadata} />
          )}
        </div>

        {fileItems.length > 0 && (
          <div className="border-primary mt-6 border-t pt-4 font-bold">
            {!viewSources ? (
              <div
                className="flex cursor-pointer items-center text-lg hover:opacity-50"
                onClick={() => setViewSources(true)}
              >
                {fileItems.length}
                {fileItems.length > 1 ? t("Sources") : t("Source")}
                {t("from")} {Object.keys(fileSummary).length}{" "}
                {Object.keys(fileSummary).length > 1 ? t("Files") : t("File")}{" "}
                <IconCaretRightFilled className="ml-1" />
              </div>
            ) : (
              <>
                <div
                  className="flex cursor-pointer items-center text-lg hover:opacity-50"
                  onClick={() => setViewSources(false)}
                >
                  {fileItems.length}
                  {fileItems.length > 1 ? t("Sources") : t("Source")}
                  {t("from")} {Object.keys(fileSummary).length}{" "}
                  {Object.keys(fileSummary).length > 1 ? t("Files") : t("File")}{" "}
                  <IconCaretDownFilled className="ml-1" />
                </div>

                <div className="mt-3 space-y-4">
                  {Object.values(fileSummary).map((file, index) => (
                    <div key={index}>
                      <div className="flex items-center space-x-2">
                        <div>
                          <FileIcon type={file.type} />
                        </div>

                        <div className="truncate">{file.name}</div>
                      </div>

                      {fileItems
                        .filter(fileItem => {
                          const parentFile = files.find(
                            parentFile => parentFile.id === fileItem.file_id,
                          );
                          return parentFile?.id === file.id;
                        })
                        .map((fileItem, index) => (
                          <div
                            key={index}
                            className="ml-8 mt-1.5 flex cursor-pointer items-center space-x-2 hover:opacity-50"
                            onClick={() => {
                              setSelectedFileItem(fileItem);
                              setShowFileItemPreview(true);
                            }}
                          >
                            <div className="text-sm font-normal">
                              <span className="mr-1 text-lg font-bold">-</span>{" "}
                              {fileItem.content.substring(0, 200)}...
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {message.image_paths.map((path, idx) => {
            const item = chatImages.find(image => image.path === path);
            if (!item) return null;

            const isFirstOccurrence = !chatMessages
              .slice(0, index)
              .some(prevMsg =>
                prevMsg.message.image_paths.some(prevPath => {
                  const prevItem = chatImages.find(
                    img => img.path === prevPath,
                  );
                  return prevItem?.base64 === item.base64;
                }),
              );

            if (!isFirstOccurrence) return null;

            return (
              <Image
                key={`${item.base64}-${idx}`}
                className="cursor-pointer rounded hover:opacity-50"
                src={item.base64}
                alt="Uploaded content"
                width={300}
                height={250}
                onClick={() => {
                  setSelectedImage({
                    messageId: message.id,
                    path,
                    base64: item.base64,
                    url: item.url || "",
                    file: null,
                  });
                  setShowImagePreview(true);
                }}
                loading="lazy"
              />
            );
          })}
        </div>
        {isEditing && (
          <div className="mt-4 flex justify-center space-x-2">
            <Button size="sm" onClick={handleSendEdit}>
              {t("Save & Send")}
            </Button>

            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              {t("Cancel")}
            </Button>
          </div>
        )}
      </div>

      {showImagePreview && selectedImage && (
        <FilePreview
          type="image"
          item={selectedImage}
          isOpen={showImagePreview}
          onOpenChange={(isOpen: boolean) => {
            setShowImagePreview(isOpen);
            setSelectedImage(null);
          }}
        />
      )}

      {showFileItemPreview && selectedFileItem && (
        <FilePreview
          type="file_item"
          item={selectedFileItem}
          isOpen={showFileItemPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowFileItemPreview(isOpen);
            setSelectedFileItem(null);
          }}
        />
      )}
    </div>
  );
};
