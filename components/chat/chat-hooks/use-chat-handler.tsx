import { ChatbotUIContext } from "@/context/context";
import { getAssistantCollectionsByAssistantId } from "@/db/assistant-collections";
import { getAssistantFilesByAssistantId } from "@/db/assistant-files";
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools";
import { updateChat } from "@/db/chats";
import { getCollectionFilesByCollectionId } from "@/db/collection-files";
import { deleteMessagesIncludingAndAfter } from "@/db/messages";
import { buildFinalMessages } from "@/lib/build-prompt";
import { getWorkspaceContextLength } from "@/lib/chat-setting-limits";
import { getPIIProtectionSettings } from "@/lib/config/pii-protection-settings";
import { validateAgainstSchema } from "@/lib/n8n/schema-validator";
import { supabase } from "@/lib/supabase/browser-client";
import { Tables } from "@/supabase/types";
import {
  ChatMessage,
  ChatPayload,
  GeneratedText,
  LLMID,
  ModelProvider,
} from "@/types";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef } from "react";
import logger from "@/app/utils/logger";
import { toast } from "sonner";

import { LLM_LIST } from "../../../lib/models/llm/llm-list";
import { validateAndGetAvailableModelAsync } from "../../../lib/models/model-availability";
import {
  createTempMessages,
  handleCreateChat,
  handleCreateMessages,
  handleHostedChat,
  handleLocalChat,
  handleRetrieval,
  processResponse,
  validateChatSettings,
} from "../chat-helpers";

export const useChatHandler = () => {
  const router = useRouter();

  const {
    userInput,
    chatFiles,
    setUserInput,
    setNewMessageImages,
    profile,
    setIsGenerating,
    setChatMessages,
    setFirstTokenReceived,
    selectedChat,
    selectedWorkspace,
    setSelectedChat,
    setChats,
    setSelectedTools,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
    abortController,
    setAbortController,
    chatSettings,
    newMessageImages,
    selectedAssistant,
    chatMessages,
    chatImages,
    setChatImages,
    setChatFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    newMessageFiles,
    chatFileItems,
    setChatFileItems,
    setToolInUse,
    useRetrieval,
    sourceCount,
    setIsPromptPickerOpen,
    setIsFilePickerOpen,
    selectedTools,
    selectedPreset,
    setChatSettings,
    models,
    isPromptPickerOpen,
    isFilePickerOpen,
    isToolPickerOpen,
    setPinnedMessages,
    isThinking: _isThinking,
    setIsThinking,
    setThinkingContent,
    assistantDirectModeWebhook,
    setAssistantDirectModeWebhook,
  } = useContext(ChatbotUIContext);

  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isPromptPickerOpen || !isFilePickerOpen || !isToolPickerOpen) {
      chatInputRef.current?.focus();
    }
  }, [isPromptPickerOpen, isFilePickerOpen, isToolPickerOpen]);

  // Cache direct mode webhook when assistant is selected
  // RLS policy allows group members to see webhook assignments for shared assistants
  useEffect(() => {
    const checkDirectMode = async () => {
      if (!selectedAssistant) {
        setAssistantDirectModeWebhook(null);
        return;
      }

      try {
        // Query webhook assignments for this assistant
        // RLS policy handles access control - allows viewing assignments for:
        // 1. User's own assignments
        // 2. Assistants shared with user's groups
        const { data: assignments, error } = await supabase
          .from("n8n_webhook_assignments")
          .select(
            `
            webhook_id,
            n8n_webhooks (
              id,
              name,
              description,
              schema,
              thinking_steps_enabled,
              timeout_minutes,
              status
            )
          `,
          )
          .eq("entity_type", "assistant")
          .eq("entity_id", selectedAssistant.id);

        if (error) {
          logger.warn("[Direct Mode] Error loading webhooks", {
            error: error.message,
            assistantId: selectedAssistant.id,
          });
          setAssistantDirectModeWebhook(null);
          return;
        }

        // Find active webhook assignment:
        // 1. For signature assistants: any active webhook triggers direct mode
        // 2. For other assistants: only thinking_steps_enabled webhooks trigger direct mode
        const isSignatureAssistant =
          selectedAssistant.role === "signature-assistant";

        const directModeAssignment = assignments?.find((a: any) => {
          const webhook = a.n8n_webhooks;
          if (!webhook || webhook.status !== "active") return false;
          // Signature assistants use any assigned webhook in direct mode
          if (isSignatureAssistant) return true;
          // Other assistants require thinking_steps_enabled
          return webhook.thinking_steps_enabled === true;
        });

        if (directModeAssignment?.n8n_webhooks) {
          setAssistantDirectModeWebhook(directModeAssignment.n8n_webhooks);
        } else {
          setAssistantDirectModeWebhook(null);
        }
      } catch (error) {
        logger.error("[Direct Mode] Error checking webhook", {
          error: error instanceof Error ? error.message : String(error),
          assistantId: selectedAssistant.id,
        });
        setAssistantDirectModeWebhook(null);
      }
    };

    checkDirectMode();
  }, [selectedAssistant?.id]); // Re-check when assistant changes

  // NEW: Handle direct webhook execution (bypasses AI)
  const handleDirectWebhookExecution = async (
    messageContent: string,
    files?: File[],
  ) => {
    if (
      !assistantDirectModeWebhook ||
      !selectedAssistant ||
      !profile ||
      !selectedWorkspace ||
      !chatSettings
    ) {
      logger.error("[Direct Execute] Missing required data", {
        hasWebhook: !!assistantDirectModeWebhook,
        hasAssistant: !!selectedAssistant,
        hasProfile: !!profile,
        hasWorkspace: !!selectedWorkspace,
        hasSettings: !!chatSettings,
      });
      return;
    }

    if (!messageContent && (!files || files.length === 0)) {
      toast.error("Please enter a message or attach files");
      return;
    }

    // Validate input against webhook schema if schema exists
    const isSignatureAssistant =
      selectedAssistant?.role === "signature-assistant";

    if (assistantDirectModeWebhook.schema && !isSignatureAssistant) {
      const validationResult = validateAgainstSchema(
        { message: messageContent, files },
        assistantDirectModeWebhook.schema,
      );

      if (!validationResult.valid) {
        // Show dynamic error message from validator
        const errorMessage =
          validationResult.guidance ||
          validationResult.error ||
          "Invalid input";
        toast.error(errorMessage);
        logger.warn("[Direct Execute] Schema validation failed", {
          error: validationResult.error,
          guidance: validationResult.guidance,
          webhookName: assistantDirectModeWebhook.name,
        });
        return;
      }
    }

    try {
      setIsGenerating(true);

      // Capture files BEFORE clearing anything
      const filesToSend = files && files.length > 0 ? [...files] : [];

      // Clear input and files immediately for instant feedback
      // This prevents re-processing the same files on cancel/error
      setUserInput("");
      setNewMessageFiles([]);
      setNewMessageImages([]);
      setShowFilesDisplay(false);

      // Create AbortController for the request
      const abortController = new AbortController();
      (window as any).__currentDirectExecuteAbort = abortController;

      // Build user message content
      const userMessageContent =
        filesToSend.length > 0
          ? `${filesToSend.map(f => f.name).join(", ")} sent to ${selectedAssistant.name}${messageContent ? `\n\n${messageContent}` : ""}`
          : messageContent;

      // Create temp messages
      createTempMessages(
        userMessageContent,
        chatMessages,
        chatSettings,
        [],
        false,
        setChatMessages,
        selectedAssistant,
      );

      // Build FormData with ALL files
      const formData = new FormData();
      formData.append("assistant_id", selectedAssistant.id);

      if (selectedChat) {
        formData.append("chat_id", selectedChat.id);
      }

      if (messageContent) {
        formData.append("message", messageContent);
      }

      // Append all files
      for (const file of filesToSend) {
        formData.append("files", file);
      }

      // Single API call with all files
      const response = await fetch("/api/n8n/direct-execute", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      // Clean up abort controller
      delete (window as any).__currentDirectExecuteAbort;

      // Check if user cancelled
      if (abortController.signal.aborted) {
        setChatMessages(prev => prev.slice(0, -2));
        toast.info("Request cancelled by user");
        setIsGenerating(false);
        return;
      }

      const data = await response.json();

      logger.info("[Direct Execute] Response received", {
        success: data.success,
        multiFile: data.multi_file,
        webhookName: data.webhook_name,
        executionId: data.execution_id,
        executions: data.executions,
      });

      if (!response.ok) {
        // Check if this is a validation error that should show toast (educational)
        if (data.showToast) {
          setChatMessages(prev => prev.slice(0, -2));
          toast.error(data.error || "Validation failed", {
            description: data.guidance,
            duration: 8000,
          });
        } else {
          // Runtime error - show in chat
          setChatMessages(prev => {
            const messages = [...prev];
            const lastMessage = messages[messages.length - 1];

            if (lastMessage && lastMessage.message.role === "assistant") {
              lastMessage.message.content = `❌ **Error:**\n\n${data.error}\n\n${data.guidance || "Please try again or contact support."}`;
            }

            return messages;
          });
        }

        setIsGenerating(false);
        return;
      }

      // Handle response - could be single, multi-file, or sync mode
      const isMultiFile = data.multi_file === true;
      const isSyncMode = data.sync_mode === true;
      const webhookName = data.webhook_name;

      // Create or get chat
      let currentChat = selectedChat;

      if (!currentChat) {
        currentChat = await handleCreateChat(
          chatSettings,
          profile,
          selectedWorkspace,
          userMessageContent,
          selectedAssistant,
          [],
          setSelectedChat,
          setChats,
          setChatFiles,
        );

        logger.info("[Direct Execute] Chat created", {
          chatId: currentChat.id,
        });
      } else {
        const updatedChat = await updateChat(currentChat.id, {
          updated_at: new Date().toISOString(),
        });

        setChats(prevChats =>
          prevChats.map(prevChat =>
            prevChat.id === updatedChat.id ? updatedChat : prevChat,
          ),
        );
      }

      // Sync mode: signature assistant returns the result directly
      if (isSyncMode) {
        const assistantContent =
          data.response || JSON.stringify(data.raw_data, null, 2);

        // Create messages with the actual response
        await handleCreateMessages(
          chatMessages,
          currentChat,
          profile,
          { modelId: chatSettings.model } as any,
          userMessageContent,
          { fullText: assistantContent } as GeneratedText,
          [],
          false,
          [],
          setChatMessages,
          setChatFileItems,
          setChatImages,
          selectedAssistant,
          null,
        );

        logger.success("[Direct Execute] Sync execution complete", {
          webhookName,
          responseLength: assistantContent.length,
        });
      } else {
        // Async mode: show "Executing..." and enter polling/thinking-steps UI
        const initialAssistantContent = `Executing workflow: ${webhookName || "Processing"}...`;

        // Build pin_metadata based on single vs multi-file
        let pinMetadata: any;

        if (isMultiFile && data.executions) {
          // Multi-file: store array of executions
          pinMetadata = {
            n8n_direct_mode: true,
            webhook_name: webhookName,
            multi_file: true,
            total_files: data.total_files,
            processed: data.processed,
            executions: data.executions, // Array of { file_name, execution_id }
          };
        } else {
          // Single file/message
          pinMetadata = {
            execution_id: data.execution_id,
            webhook_name: webhookName,
            n8n_direct_mode: true,
            file_name: filesToSend.length > 0 ? filesToSend[0].name : undefined,
          };
        }

        // Create messages
        await handleCreateMessages(
          chatMessages,
          currentChat,
          profile,
          { modelId: chatSettings.model } as any,
          userMessageContent,
          { fullText: initialAssistantContent } as GeneratedText,
          [],
          false,
          [],
          setChatMessages,
          setChatFileItems,
          setChatImages,
          selectedAssistant,
          null,
        );

        // Update the assistant message with pin_metadata
        setChatMessages(prev => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage && lastMessage.message.role === "assistant") {
            lastMessage.message.pin_metadata = JSON.stringify(pinMetadata);
          }
          return updated;
        });

        // Persist pin_metadata to database
        const lastMessages = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", currentChat.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (lastMessages.data) {
          await supabase
            .from("messages")
            .update({
              pin_metadata: JSON.stringify(pinMetadata),
            })
            .eq("id", lastMessages.data.id);
        }
      }

      logger.success("[Direct Execute] Execution complete", {
        isMultiFile,
        isSyncMode,
        totalFiles: filesToSend.length,
        processed: data.processed || 1,
      });
    } catch (error) {
      // Clean up abort controller
      delete (window as any).__currentDirectExecuteAbort;

      // Check if this was an abort error
      if (error instanceof Error && error.name === "AbortError") {
        setChatMessages(prev => prev.slice(0, -2));
        toast.info("Request cancelled by user");
        logger.info("[Direct Execute] Request aborted by user");
      } else {
        setChatMessages(prev => {
          const withoutTemp = prev.slice(0, -2);
          return withoutTemp.length > 0 ? withoutTemp : prev;
        });

        logger.error("[Direct Execute] Unexpected error", {
          error: error instanceof Error ? error.message : String(error),
        });

        toast.error("Failed to execute webhook", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewChat = async (groupId?: string) => {
    logger.info("Starting new chat", {
      groupId,
      hasSelectedAssistant: !!selectedAssistant,
      hasSelectedPreset: !!selectedPreset,
    });
    setPinnedMessages([]);
    if (!selectedWorkspace) return;
    setUserInput("");
    setChatMessages([]);
    setSelectedChat(null);
    setChatFileItems([]);
    setIsGenerating(false);
    setFirstTokenReceived(false);
    setChatFiles([]);
    setChatImages([]);
    setNewMessageFiles([]);
    setNewMessageImages([]);
    setShowFilesDisplay(false);
    setIsPromptPickerOpen(false);
    setIsFilePickerOpen(false);
    setSelectedTools([]);
    setToolInUse("none");

    // Reset thinking state
    setIsThinking(false);
    setThinkingContent("");

    if (selectedAssistant) {
      // const encryptedPrompt = selectedAssistant.prompt;
      setChatSettings(prevSettings => ({
        ...prevSettings,
        model: selectedAssistant.model as LLMID,
        imageModel: selectedAssistant.image_model as LLMID,
        prompt: selectedAssistant.prompt,
        temperature: selectedAssistant.temperature,
        role: selectedAssistant?.role,
        group_id: groupId,
        contextLength: selectedAssistant.context_length,
        includeProfileContext: selectedAssistant.include_profile_context,
        includeWorkspaceInstructions:
          selectedAssistant.include_workspace_instructions,
        embeddingsProvider: selectedAssistant.embeddings_provider as
          | "openai"
          | "local",
      }));

      // Fetch assistant files, collections, and tools in parallel for better performance
      const [
        assistantFilesResult,
        assistantCollectionsResult,
        assistantToolsResult,
      ] = await Promise.all([
        getAssistantFilesByAssistantId(selectedAssistant.id),
        getAssistantCollectionsByAssistantId(selectedAssistant.id),
        getAssistantToolsByAssistantId(selectedAssistant.id),
      ]);

      const assistantFiles = assistantFilesResult.files;
      const assistantCollections = assistantCollectionsResult.collections;
      const assistantTools = assistantToolsResult.tools;

      // Fetch all collection files in parallel
      const collectionFilesResults = await Promise.all(
        assistantCollections.map(collection =>
          getCollectionFilesByCollectionId(collection.id),
        ),
      );
      const allCollectionFiles = collectionFilesResults.flatMap(
        result => result.files,
      );
      const allFiles = [...assistantFiles, ...allCollectionFiles];

      setSelectedTools(assistantTools);
      setChatFiles(
        allFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          file: null,
        })),
      );

      if (allFiles.length > 0) setShowFilesDisplay(true);
    } else if (selectedPreset) {
      // const encryptedPrompt = selectedPreset.prompt;
      setChatSettings(prevSettings => ({
        ...prevSettings,
        model: selectedPreset.model as LLMID,
        imageModel: selectedPreset.image_model as LLMID,
        prompt: selectedPreset.prompt,
        temperature: selectedPreset.temperature,
        group_id: groupId,
        contextLength: selectedPreset.context_length,
        includeProfileContext: selectedPreset.include_profile_context,
        includeWorkspaceInstructions:
          selectedPreset.include_workspace_instructions,
        embeddingsProvider: selectedPreset.embeddings_provider as
          | "openai"
          | "local",
      }));
    } else if (selectedWorkspace) {
      // const encryptedPrompt =
      //   selectedWorkspace.default_prompt ||
      //   "You are a friendly, helpful AI assistant.";
      setChatSettings(prevSettings => ({
        ...prevSettings,
        model: (selectedWorkspace.default_model || "gpt-4o") as LLMID,
        imageModel: (selectedWorkspace.default_image_model ||
          "flux.1") as LLMID,
        prompt:
          selectedWorkspace.default_prompt ||
          "You are a friendly, helpful AI assistant.",
        temperature: selectedWorkspace.default_temperature || 0.5,
        group_id: groupId,
        contextLength: getWorkspaceContextLength(
          selectedWorkspace.default_context_length,
          (selectedWorkspace.default_model || "gpt-4o") as LLMID,
        ),
        includeProfileContext:
          selectedWorkspace.include_profile_context || true,
        includeWorkspaceInstructions:
          selectedWorkspace.include_workspace_instructions || true,
        embeddingsProvider: selectedWorkspace.embeddings_provider as
          | "openai"
          | "local",
        is_temp_chat: false,
      }));
    }

    // Navigate to the chat page after setup
    logger.success("New chat initialized", {
      workspaceId: selectedWorkspace.id,
    });
    return router.push(`/${selectedWorkspace.id}/chat`);
  };

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus();
  };

  const handleStopMessage = () => {
    // Check for direct mode abort controller
    const directExecuteAbort = (window as any).__currentDirectExecuteAbort;
    if (directExecuteAbort) {
      directExecuteAbort.abort();
      logger.info("[Direct Execute] Aborted by user");
      return;
    }

    // Normal mode abort controller
    if (abortController) {
      abortController.abort();
    }
    logger.info("Message generation aborted by user");
  };

  // useEffect(() => {}, [chatSettings]);

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean,
    enableSearch?: boolean,
    enableMaps?: boolean,
  ) => {
    const startingInput = messageContent;
    const groupId = chatSettings?.group_id;

    // check if the signature assistant is configured with a webhook
    if (
      selectedAssistant?.role === "signature-assistant" &&
      !assistantDirectModeWebhook
    ) {
      toast.error(
        "This signature assistant is not configured with a webhook yet.",
        { duration: 8000 },
      );
      return;
    }

    let pdfMergeDownloadUrl: string | null = null;
    let pdfMergeErrorMessage: string | null = null;

    // Mock LLM mode: return pre-built responses when no LLM providers are configured
    const noModelsAvailable =
      availableHostedModels.length === 0 &&
      availableLocalModels.length === 0 &&
      availableOpenRouterModels.length === 0;
    if (noModelsAvailable) {
      try {
        setUserInput("");
        setIsGenerating(true);
        setIsPromptPickerOpen(false);
        setIsFilePickerOpen(false);

        const { tempAssistantChatMessage } = createTempMessages(
          messageContent,
          chatMessages,
          chatSettings!,
          [],
          isRegeneration,
          setChatMessages,
          selectedAssistant,
        );

        // Simulate typing delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const mockResponses = [
          `This is a demo response. In production, this would be handled by your configured LLM provider (e.g., GPT-4, Claude, Gemini).\n\nYou said: "${messageContent}"\n\nTo get real AI responses, configure an LLM provider API key in your environment variables.`,
          `**Demo Mode Active**\n\nI received your message: "${messageContent}"\n\nThis is a mock response. Connect an LLM provider in settings to get real AI responses.\n\nSupported providers:\n- OpenAI (GPT-4, GPT-4o)\n- Anthropic (Claude)\n- Google (Gemini)\n- Azure OpenAI\n- DeepSeek\n- Ollama (local)`,
          `Hello! I'm running in demo mode.\n\nYour message: "${messageContent}"\n\nTo enable real AI conversations, add your API key to the environment configuration. Very AI supports multiple LLM providers for enterprise use.`,
        ];

        const mockResponse =
          mockResponses[Math.floor(Math.random() * mockResponses.length)];

        // Update the assistant message with mock content
        setChatMessages(prev =>
          prev.map(msg => {
            if (msg.message.id === tempAssistantChatMessage.message.id) {
              return {
                ...msg,
                message: { ...msg.message, content: mockResponse },
              };
            }
            return msg;
          }),
        );

        setIsGenerating(false);
        setFirstTokenReceived(false);

        // Persist chat and messages to database
        let currentChat = selectedChat ? { ...selectedChat } : null;

        if (!currentChat) {
          currentChat = await handleCreateChat(
            chatSettings!,
            profile!,
            selectedWorkspace!,
            messageContent,
            selectedAssistant!,
            newMessageFiles,
            setSelectedChat,
            setChats,
            setChatFiles,
            groupId,
          );
        } else {
          const updatedChat = await updateChat(currentChat.id, {
            updated_at: new Date().toISOString(),
          });
          setChats(prevChats =>
            prevChats.map(prevChat =>
              prevChat.id === updatedChat.id ? updatedChat : prevChat,
            ),
          );
        }

        await handleCreateMessages(
          chatMessages,
          currentChat,
          profile!,
          { modelId: chatSettings!.model } as any,
          messageContent,
          { fullText: mockResponse } as GeneratedText,
          newMessageImages,
          isRegeneration,
          [],
          setChatMessages,
          setChatFileItems,
          setChatImages,
          selectedAssistant,
          null,
        );

        setNewMessageImages([]);
        return;
      } catch (error) {
        setIsGenerating(false);
        setFirstTokenReceived(false);
        setUserInput(messageContent);
        logger.error("Mock mode error", {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    try {
      logger.info("Sending message", {
        length: messageContent?.length || 0,
        isRegeneration,
        enableSearch: !!enableSearch,
        enableMaps: !!enableMaps,
        model: chatSettings?.model,
      });
      setUserInput("");
      setIsGenerating(true);
      setIsPromptPickerOpen(false);
      setIsFilePickerOpen(false);

      // Clear any previous thinking state for gemini-2.5-pro and gemini-2.5-flash
      if (
        chatSettings?.model === "gemini-2.5-pro" ||
        chatSettings?.model === "gemini-2.5-flash"
      ) {
        setIsThinking(false);
        setThinkingContent("");
      }

      // setNewMessageImages([]);

      const newAbortController = new AbortController();
      setAbortController(newAbortController);

      // Get available model data, with fallback for deprecated models
      const availableModelId = await validateAndGetAvailableModelAsync(
        chatSettings?.model,
      );
      const availableImageModelId = await validateAndGetAvailableModelAsync(
        chatSettings?.imageModel,
      );

      let modelData = [
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
      ].find(llm => llm.modelId === availableModelId);

      let imageModelData = [
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
      ].find(llm => llm.modelId === availableImageModelId);

      validateChatSettings(
        chatSettings,
        modelData,
        profile,
        selectedWorkspace,
        messageContent,
      );

      let currentChat = selectedChat ? { ...selectedChat } : null;

      const b64Images = newMessageImages.map(image => image.base64);

      let retrievedFileItems: Tables<"file_items">[] = [];
      // Skip retrieval for special assistant roles that handle files directly
      const skipRetrieval =
        selectedAssistant?.role === "signature-assistant" ||
        selectedAssistant?.role === "pdf_merger";

      if (
        (newMessageFiles.length > 0 || chatFiles.length > 0) &&
        useRetrieval &&
        !skipRetrieval
      ) {
        setToolInUse("retrieval");

        retrievedFileItems = await handleRetrieval(
          userInput,
          newMessageFiles,
          chatFiles,
          chatSettings!.embeddingsProvider,
          sourceCount,
        );
      }
      if (selectedAssistant?.role === "pdf_merger") {
        const pdfFilesFromNew = newMessageFiles.filter(f => {
          const isPdfByType =
            f.type === "pdf" ||
            f.type === "application/pdf" ||
            f.type?.toLowerCase().includes("pdf");
          const isPdfByExtension = f.name?.toLowerCase().endsWith(".pdf");
          const isPdfByFileType =
            f.file?.type === "application/pdf" || f.file?.type?.includes("pdf");

          const isPdf = isPdfByType || isPdfByExtension || isPdfByFileType;
          return isPdf;
        });

        if (pdfFilesFromNew.length >= 2) {
          try {
            logger.info(
              "[PDF MERGE] Triggering merge for files:",
              pdfFilesFromNew.map(f => f.name || f.id || "unnamed"),
            );

            const formData = new FormData();
            if (profile?.user_id) {
              formData.append("user_id", profile.user_id);
            }
            const filePromises = pdfFilesFromNew.map(async fileItem => {
              if (fileItem.file) {
                if (fileItem.file.type !== "application/pdf") {
                  const blob = new Blob([fileItem.file], {
                    type: "application/pdf",
                  });
                  return new File([blob], fileItem.name, {
                    type: "application/pdf",
                  });
                }
                return fileItem.file;
              }

              // Fetch from storage
              try {
                const { getFileFromStorage } =
                  await import("@/db/storage/files");
                const { getFileById } = await import("@/db/files");
                const fileRecord = await getFileById(fileItem.id);
                const pathToUse =
                  fileRecord?.original_file_path || fileRecord?.file_path;

                if (!pathToUse) {
                  return null;
                }
                const signedUrl = await getFileFromStorage(pathToUse);
                const response = await fetch(signedUrl);

                if (!response.ok) {
                  return null;
                }

                const blob = await response.blob();
                let fileName = fileItem.name || fileRecord?.name || "file.pdf";
                if (!fileName.toLowerCase().endsWith(".pdf")) {
                  fileName = fileName.replace(/\.(txt|text)$/i, "") + ".pdf";
                }

                const file = new File([blob], fileName, {
                  type: "application/pdf",
                });
                return file;
              } catch (fetchError) {
                logger.error("[PDF MERGE] Failed to fetch file", {
                  fileId: fileItem.id,
                  error:
                    fetchError instanceof Error
                      ? fetchError.message
                      : String(fetchError),
                });
                return null;
              }
            });

            const filesToMerge = (await Promise.all(filePromises)).filter(
              (f): f is File => f !== null,
            );

            if (filesToMerge.length < 2) {
              logger.warn("[PDF MERGE] Not enough files could be fetched", {
                requested: pdfFilesFromNew.length,
                fetched: filesToMerge.length,
              });

              // Set error message for assistant to show
              pdfMergeDownloadUrl = null;
              pdfMergeErrorMessage = `Failed to merge PDFs. Only ${filesToMerge.length} of ${pdfFilesFromNew.length} files could be loaded. Please try uploading the files again.`;
            } else {
              filesToMerge.forEach(file => {
                formData.append("files", file);
              });
              const resp = await fetch("/api/pdf/merge", {
                method: "POST",
                body: formData,
              });

              if (resp.ok) {
                const data = await resp.json();
                const downloadUrl = data?.url as string | undefined;
                if (downloadUrl) {
                  logger.info(
                    "[PDF MERGE] Success. Download URL:",
                    downloadUrl,
                  );
                  pdfMergeDownloadUrl = downloadUrl;
                } else {
                  pdfMergeErrorMessage =
                    "Failed to merge PDFs. No download URL received.";
                }
              } else {
                const errJson = await resp.json().catch(() => ({}));
                logger.warn("[PDF MERGE] Failed to merge PDFs", errJson);
                pdfMergeErrorMessage = `Failed to merge PDFs: ${errJson.error || "Unknown error"}`;
              }
            }
          } catch (mergeError) {
            logger.error("[PDF MERGE] Unexpected error", {
              error:
                mergeError instanceof Error
                  ? mergeError.message
                  : String(mergeError),
            });
            pdfMergeErrorMessage = `Failed to merge PDFs: ${mergeError instanceof Error ? mergeError.message : "Unknown error"}`;
          }
        } else {
          if (pdfFilesFromNew.length === 1) {
            pdfMergeErrorMessage =
              "Please upload at least 2 PDF files to merge.";
          } else if (pdfFilesFromNew.length === 0) {
            pdfMergeErrorMessage =
              "No PDF files found. Please upload at least 2 PDF files to merge.";
          }
        }
      }

      // Create temp messages
      const { tempUserChatMessage, tempAssistantChatMessage } =
        createTempMessages(
          messageContent,
          chatMessages,
          chatSettings!,
          b64Images,
          isRegeneration,
          setChatMessages,
          selectedAssistant,
          modelData?.modelId,
        );

      if (pdfMergeDownloadUrl || pdfMergeErrorMessage) {
        const responseContent = pdfMergeDownloadUrl
          ? `Your PDF has been successfully merged!\n\n[Download Merged PDF](${pdfMergeDownloadUrl})`
          : pdfMergeErrorMessage;

        setChatMessages(prev =>
          prev.map(chatMessage => {
            if (
              chatMessage.message.id === tempAssistantChatMessage.message.id
            ) {
              return {
                ...chatMessage,
                message: {
                  ...chatMessage.message,
                  content: responseContent,
                },
              };
            }
            return chatMessage;
          }),
        );

        setIsGenerating(false);
        setFirstTokenReceived(false);
        let currentChat = selectedChat ? { ...selectedChat } : null;

        if (!currentChat) {
          currentChat = await handleCreateChat(
            chatSettings!,
            profile!,
            selectedWorkspace!,
            messageContent,
            selectedAssistant!,
            newMessageFiles,
            setSelectedChat,
            setChats,
            setChatFiles,
            groupId,
          );
        } else {
          const updatedChat = await updateChat(currentChat.id, {
            updated_at: new Date().toISOString(),
          });

          setChats(prevChats => {
            const updatedChats = prevChats.map(prevChat =>
              prevChat.id === updatedChat.id ? updatedChat : prevChat,
            );
            return updatedChats;
          });
        }

        // Save messages to database
        await handleCreateMessages(
          chatMessages,
          currentChat,
          profile!,
          modelData!,
          messageContent,
          {
            fullText: responseContent,
          } as GeneratedText,
          newMessageImages,
          isRegeneration,
          [],
          setChatMessages,
          setChatFileItems,
          setChatImages,
          selectedAssistant,
          null,
        );

        setNewMessageImages([]);
        logger.success("PDF merge completed");
        return;
      }

      let userPiiData: any = null;
      let contentForAI = messageContent;

      // Check if PII protection is enabled in admin settings
      const piiSettings = await getPIIProtectionSettings(modelData?.modelId);
      if (piiSettings && piiSettings.enabled) {
        setChatMessages(prev =>
          prev.map(msg => {
            if (
              msg.message.role === "user" &&
              msg.message.content === messageContent
            ) {
              return {
                ...msg,
                metadata: {
                  piiProcessing: true, // Show "Checking for sensitive information..."
                },
              };
            }
            return msg;
          }),
        );

        try {
          const piiResponse = await fetch("/api/pii/process-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: messageContent,
              model_id: modelData?.modelId,
              language: "en",
            }),
          });

          if (piiResponse.ok) {
            const piiData = await piiResponse.json();
            if (piiData.piiDetected && piiData.redactedContent) {
              userPiiData = {
                redactedContent: piiData.redactedContent,
                piiEntities: piiData.entities,
                tokenMap: piiData.tokenMap,
              };
              contentForAI = piiData.redactedContent;
            }
          }
        } catch (error) {
          logger.warn("[PII] PII detection failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      // STEP 3: Update temp user message with PII data and remove loading
      setChatMessages(prev =>
        prev.map(msg => {
          if (
            msg.message.role === "user" &&
            msg.message.content === messageContent
          ) {
            return {
              ...msg,
              message: {
                ...msg.message,
                content: userPiiData?.redactedContent || messageContent,
                original_content: messageContent,
                pii_entities: userPiiData?.piiEntities || null,
                pii_token_map: userPiiData?.tokenMap || null,
              },
              metadata: {
                piiProcessing: false,
              },
            };
          }
          return msg;
        }),
      );

      // STEP 4: Update the temp message content for AI (use redacted)
      if (userPiiData && contentForAI !== messageContent) {
        tempUserChatMessage.message.content = contentForAI;
      }

      // Create payload with available models for API calls
      let payload: ChatPayload = {
        chatSettings: {
          ...chatSettings!,
          model: availableModelId,
          imageModel: availableImageModelId,
        },
        workspaceInstructions: selectedWorkspace!.instructions || "",
        chatMessages: isRegeneration
          ? [...chatMessages]
          : [...chatMessages, tempUserChatMessage],
        assistant: selectedChat?.assistant_id ? selectedAssistant : null,
        messageFileItems: retrievedFileItems,
        chatFileItems: chatFileItems,
        enableSearch: enableSearch,
        enableMaps: enableMaps,
      };

      let generatedText: GeneratedText;

      if (selectedTools.length > 0) {
        setToolInUse("Tools");

        const formattedMessages = await buildFinalMessages(
          payload,
          profile!,
          chatImages,
        );

        const response = await fetch("/api/chat/tools", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chatSettings: payload.chatSettings,
            messages: formattedMessages,
            selectedTools,
          }),
        });

        setToolInUse("none");

        generatedText = await processResponse(
          response,
          isRegeneration
            ? payload.chatMessages[payload.chatMessages.length - 1]
            : tempAssistantChatMessage,
          true,
          newAbortController,
          setFirstTokenReceived,
          setChatMessages,
          setToolInUse,
        );
      } else {
        if (modelData!.provider === "ollama") {
          generatedText = await handleLocalChat(
            payload,
            profile!,
            chatSettings!,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            setToolInUse,
          );
        } else {
          generatedText = await handleHostedChat(
            userInput,
            payload,
            profile!,
            modelData!,
            imageModelData!,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            newMessageImages,
            chatImages,
            chatMessages,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            setToolInUse,
          );

          if (
            /<<imageUrlStart>>.*?<<imageUrlEnd>>/.test(generatedText.fullText)
          ) {
            modelData = imageModelData;
          }
        }
      }

      if (!currentChat) {
        currentChat = await handleCreateChat(
          chatSettings!,
          profile!,
          selectedWorkspace!,
          messageContent,
          selectedAssistant!,
          newMessageFiles,
          setSelectedChat,
          setChats,
          setChatFiles,
          groupId,
        );
      } else {
        const updatedChat = await updateChat(currentChat.id, {
          updated_at: new Date().toISOString(),
        });

        setChats(prevChats => {
          const updatedChats = prevChats.map(prevChat =>
            prevChat.id === updatedChat.id ? updatedChat : prevChat,
          );

          return updatedChats;
        });
      }

      await handleCreateMessages(
        chatMessages,
        currentChat,
        profile!,
        modelData!,
        messageContent,
        generatedText,
        newMessageImages,
        isRegeneration,
        retrievedFileItems,
        setChatMessages,
        setChatFileItems,
        setChatImages,
        selectedAssistant,
        userPiiData,
      );

      setNewMessageImages([]);

      setIsGenerating(false);
      setFirstTokenReceived(false);
      setIsThinking(false);
      setThinkingContent("");
      logger.success("Message handled successfully");
    } catch (error) {
      setIsGenerating(false);
      setFirstTokenReceived(false);
      setIsThinking(false);
      setThinkingContent("");
      setUserInput(startingInput);
      logger.error("Failed to send message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleSendEdit = async (
    editedContent: string,
    sequenceNumber: number,
  ) => {
    if (!selectedChat) return;

    await deleteMessagesIncludingAndAfter(
      selectedChat.user_id,
      selectedChat.id,
      sequenceNumber,
    );

    const filteredMessages = chatMessages.filter(
      chatMessage => chatMessage.message.sequence_number < sequenceNumber,
    );

    setChatMessages(filteredMessages);

    handleSendMessage(editedContent, filteredMessages, false);
  };

  return {
    chatInputRef,
    prompt,
    handleNewChat,
    handleSendMessage,
    handleFocusChatInput,
    handleStopMessage,
    handleSendEdit,
    handleDirectWebhookExecution,
  };
};
