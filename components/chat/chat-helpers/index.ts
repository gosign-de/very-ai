import { createClientLogger } from "@/lib/logger/client";
import { createChatFiles } from "@/db/chat-files";
import { createChat } from "@/db/chats";
import { createMessageFileItems } from "@/db/message-file-items";
import { createMessages, updateMessage } from "@/db/messages";
import { uploadMessageImage } from "@/db/storage/message-images";
import {
  buildFinalMessages,
  adaptMessagesForGoogleGemini,
} from "@/lib/build-prompt";
import { consumeReadableStream } from "@/lib/consume-stream";
import { Tables, TablesInsert } from "@/supabase/types";
import {
  ChatFile,
  ChatMessage,
  ChatPayload,
  ChatSettings,
  LLM,
  MessageImage,
  GeneratedText,
} from "@/types";
import React from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUserSessionId } from "@/db/profile";
import { getFileById } from "@/db/files";
import { getFileFromStorage } from "@/db/storage/files";

const logger = createClientLogger({ component: "ChatHelpers" });

interface RequestBody {
  chatSettings: ChatSettings;
  messages: any[];
  customModelId: string;
  base64Images: unknown[];
  action: string;
  profile: Tables<"profiles">;
  customPrompt: any;
  provider?: string;
  enableSearch?: boolean;
  enableMaps?: boolean;
  format_FileData?: {
    prompt: string;
    file_ids: string[];
  };
  pdfData?: {
    pdfContent: string | null;
    userId: string;
    tableData?: {} | null;
  };
  crawlerData?: {
    url: string;
    userId: string;
    maxPages: number;
    maxDepth: number;
    extractTextOption: boolean;
  };
  searchWeb?: {
    query: string;
  };
}

export const validateChatSettings = (
  chatSettings: ChatSettings | null,
  modelData: LLM | undefined,
  profile: Tables<"profiles"> | null,
  selectedWorkspace: Tables<"workspaces"> | null,
  messageContent: string,
) => {
  if (!chatSettings) {
    throw new Error("Chat settings not found");
  }

  if (!modelData) {
    throw new Error("Model not found");
  }

  if (!profile) {
    throw new Error("Profile not found");
  }

  if (!selectedWorkspace) {
    throw new Error("Workspace not found");
  }

  if (!messageContent) {
    throw new Error("Message content not found");
  }
};

export const getChatContext = async (messageContent: string) => {
  const response = await fetch("/api/chat/azure/context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${messageContent}`,
    }),
  });

  const { message } = await response.json();
  return message;
};

export const handleRetrieval = async (
  userInput: string,
  newMessageFiles: ChatFile[],
  chatFiles: ChatFile[],
  embeddingsProvider: "openai" | "local",
  sourceCount: number,
) => {
  const response = await fetch("/api/retrieval/retrieve", {
    method: "POST",
    body: JSON.stringify({
      userInput,
      fileIds: [...newMessageFiles, ...chatFiles].map(file => file.id),
      embeddingsProvider,
      sourceCount,
    }),
  });

  if (!response.ok) {
    throw new Error(`Retrieval failed: ${response.status}`);
  }

  const { results } = (await response.json()) as {
    results: Tables<"file_items">[];
  };

  return results;
};

export const createTempMessages = (
  messageContent: string,
  chatMessages: ChatMessage[],
  chatSettings: ChatSettings,
  b64Images: string[],
  isRegeneration: boolean,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  selectedAssistant: Tables<"assistants"> | null,
  modelId?: string,
) => {
  let tempUserChatMessage: ChatMessage = {
    message: {
      chat_id: "",
      assistant_id: null,
      content: messageContent,
      created_at: "",
      id: uuidv4(),
      image_paths: b64Images,
      model: modelId || chatSettings.model || "",
      role: "user",
      sequence_number: chatMessages.length,
      updated_at: "",
      user_id: "",
      session_id: "",
      is_pin: false,
      pin_metadata: "",
      original_content: null,
      pii_entities: null,
      pii_token_map: null,
    },
    fileItems: [],
  };

  let tempAssistantChatMessage: ChatMessage = {
    message: {
      chat_id: "",
      assistant_id: selectedAssistant?.id || null,
      content: "",
      created_at: "",
      id: uuidv4(),
      image_paths: [],
      model: modelId || chatSettings.model || "",
      role: "assistant",
      sequence_number: chatMessages.length + 1,
      updated_at: "",
      user_id: "",
      session_id: "",
      is_pin: false,
      pin_metadata: "",
      original_content: null,
      pii_entities: null,
      pii_token_map: null,
    },
    fileItems: [],
  };

  let newMessages = [];

  if (isRegeneration) {
    const lastMessageIndex = chatMessages.length - 1;
    chatMessages[lastMessageIndex].message.content = "";
    newMessages = [...chatMessages];
  } else {
    newMessages = [
      ...chatMessages,
      tempUserChatMessage,
      tempAssistantChatMessage,
    ];
  }

  setChatMessages(newMessages);

  return {
    tempUserChatMessage,
    tempAssistantChatMessage,
  };
};

export const handleLocalChat = async (
  payload: ChatPayload,
  profile: Tables<"profiles">,
  chatSettings: ChatSettings,
  tempAssistantMessage: ChatMessage,
  isRegeneration: boolean,
  newAbortController: AbortController,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
) => {
  const formattedMessages = await buildFinalMessages(payload, profile, []);

  // Ollama API: https://github.com/jmorganca/ollama/blob/main/docs/api.md
  const response = await fetchChatResponse(
    process.env.NEXT_PUBLIC_OLLAMA_URL + "/api/chat",
    {
      model: chatSettings.model,
      messages: formattedMessages,
      options: {
        temperature: payload.chatSettings.temperature,
      },
    },
    false,
    newAbortController,
    setIsGenerating,
    setChatMessages,
  );

  return await processResponse(
    response,
    isRegeneration
      ? payload.chatMessages[payload.chatMessages.length - 1]
      : tempAssistantMessage,
    false,
    newAbortController,
    setFirstTokenReceived,
    setChatMessages,
    setToolInUse,
  );
};

export const updateMessages = (
  context,
  modelData: LLM,
  imageModelData: LLM,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) => {
  setChatMessages(prevMessages => {
    // Ensure there are at least two messages
    if (prevMessages.length < 2) return prevMessages;

    // Update the last two messages (user message and assistant message)
    const updatedMessages = [...prevMessages];
    const userMessageIndex = updatedMessages.length - 2;
    const assistantMessageIndex = updatedMessages.length - 1;

    // Update user message model
    updatedMessages[userMessageIndex] = {
      ...updatedMessages[userMessageIndex],
      message: {
        ...updatedMessages[userMessageIndex].message,
        model:
          context.action === "image"
            ? imageModelData.modelId
            : modelData.modelId,
      },
    };

    // Update assistant message model
    updatedMessages[assistantMessageIndex] = {
      ...updatedMessages[assistantMessageIndex],
      message: {
        ...updatedMessages[assistantMessageIndex].message,
        model:
          context.action === "image"
            ? imageModelData.modelId
            : modelData.modelId,
      },
    };

    return updatedMessages;
  });
};

const _customActionEndpoints: Record<string, string> = {
  image: "/api/chat/azure/imagine",
  video: "/api/chat/video/generate",
  websearch: "/api/chat/azure/websearch/n8n/google",
  o1Preview: "/api/chat/azure/o1-preview",
  post: "/api/chat/azure/post",
  translate: "/api/chat/azure/translate",
  translateUpdate: "/api/chat/azure/translate-update",
  letterhead: "/api/chat/azure/letterhead",
  sharepoint: "/api/chat/azure/sharepoint",
  pdf: "/api/chat/azure/pdf",
  crawl: "/api/chat/azure/crawler",
  format_file: "/api/chat/azure/format_file/",
};

const handleFunctionCall = (functionName, functionArguments) => {
  const responseFunctionCall = {
    generateImage: {
      action: "image",
      prompt: functionArguments?.prompt,
    },
    create_pdf: {
      action: "pdf",
      pdf_content: functionArguments?.content,
      table_data: functionArguments?.tableData,
    },
    crawlWebsite: {
      action: "crawl",
      url: functionArguments?.url,
      maxPages: functionArguments?.maxPages || 10,
      maxDepth: functionArguments?.maxDepth || 2,
      extractTextOption:
        functionArguments?.extractTextOption !== undefined
          ? functionArguments?.extractTextOption
          : true,
    },
    searchWeb: {
      action: "websearch",
      function_name: "searchWeb",
      query: functionArguments?.query,
    },
    format_file: {
      action: "format_file",
      function_name: "format_file",
      prompt: functionArguments?.prompt, // should be the user's query
      file_ids: functionArguments?.file_ids, // should be an array of file IDs, e.g. ["abc123"]
    },
  };

  const defaultResponse = { action: false };
  const responseBody = responseFunctionCall[functionName] || defaultResponse;
  return responseBody;
};
async function handleRetrieveEmbeddings(
  userInput: string,
  payload: any,
  functionCallResponse: Response,
) {
  const fileId = (await functionCallResponse.json()).file.id;
  const formData = new FormData();
  const embeddingsProvider = payload.chatSettings.embeddingsProvider;
  formData.append("file_id", fileId);
  formData.append("embeddingsProvider", embeddingsProvider);
  formData.append("action", "crawl");
  formData.append("chatSettings", JSON.stringify(payload.chatSettings || {}));

  try {
    const response = await fetch("/api/retrieval/process", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    // Handle different response statuses
    if (response.status === 202) {
      // Processing started, need to poll for completion

      const retrievedFileId = await pollForCompletion(
        fileId,
        result.totalChunks,
      );

      const retrievedFileItems = await handleRetrieval(
        userInput,
        [{ id: retrievedFileId, name: "temp", type: "file", file: null }],
        [],
        payload.chatSettings!.embeddingsProvider,
        4,
      );
      return retrievedFileItems;
    } else if (response.status === 200) {
      // Completed immediately
      const retrievedFileId = result.fileId;

      const retrievedFileItems = await handleRetrieval(
        userInput,
        [{ id: retrievedFileId, name: "temp", type: "file", file: null }],
        [],
        payload.chatSettings!.embeddingsProvider,
        4,
      );
      return retrievedFileItems;
    } else {
      throw new Error(result.message || "Processing failed");
    }
  } catch (error) {
    throw error;
  }
}

// Polling function to check processing status
async function pollForCompletion(
  fileId: string,
  totalChunks: number,
  maxAttempts: number = 60, // 5 minutes with 5-second intervals
  interval: number = 5000, // 5 seconds
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`/api/retrieval/status/${fileId}`);
      const status = await response.json();

      if (status.processing_status === "completed") {
        return fileId;
      } else if (status.processing_status === "error") {
        throw new Error(status.error_message || "Processing failed");
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (_error) {
      // If it's the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw new Error("Processing timeout or failed");
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  throw new Error("Processing timeout");
}
function normalizeProvider(modelData: LLM, profile: any): string {
  if (
    modelData.provider?.toLowerCase().includes("gemini") ||
    modelData.provider?.toLowerCase().includes("vertex") ||
    modelData.provider?.toLowerCase().includes("google")
  ) {
    return "google";
  }
  if (modelData.provider === "openai" && profile.use_azure_openai) {
    return "azure";
  }
  if (modelData.provider === "openai") {
    return "openai";
  }
  if (modelData.provider === "deepseek") {
    return "deepseek";
  }
  // fallback:
  return modelData.provider;
}

const getProviderEndpoint = (action: string, provider: string) => {
  switch (action) {
    case "image":
      if (provider === "google") {
        return "/api/chat/google/imagine";
      } else if (provider === "deepseek") {
        return "/api/chat/deepseek/imagine";
      } else {
        return "/api/chat/azure/imagine";
      }
    case "pdf":
      if (provider === "google") {
        return "/api/chat/google/pdf";
      } else if (provider === "deepseek") {
        return "/api/chat/deepseek/pdf";
      } else {
        return "/api/chat/azure/pdf";
      }
    case "crawl":
      if (provider === "google") {
        return "/api/chat/google/crawler";
      } else if (provider === "deepseek") {
        return "/api/chat/deepseek/crawler";
      } else {
        return "/api/chat/azure/crawler";
      }
    case "websearch":
      return "/api/chat/azure/websearch/n8n/google";
    case "format_file":
      if (provider === "google") {
        return "/api/chat/google/format_file/";
      } else if (provider === "deepseek") {
        return "/api/chat/deepseek/format_file/";
      } else {
        return "/api/chat/azure/format_file/";
      }
    default:
      return provider === "custom"
        ? "/api/chat/custom"
        : `/api/chat/${provider}`;
  }
};

// Fixed section of handleHostedChat function
export const handleHostedChat = async (
  userInput: string,
  payload: ChatPayload,
  profile: Tables<"profiles">,
  modelData: LLM,
  imageModelData: LLM,
  tempAssistantChatMessage: ChatMessage,
  isRegeneration: boolean,
  newAbortController: AbortController,
  newMessageImages: MessageImage[],
  chatImages: MessageImage[],
  chatMessages,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
): Promise<GeneratedText> => {
  let _toolTextCall = false;
  let _functionCallText = "";
  // Initial message formatting setup
  const draftMessages = await buildFinalMessages(payload, profile, chatImages);

  // Convert newMessageImages to base64
  const base64Images = await Promise.all(
    newMessageImages.map(async image => {
      const response = await fetch(image.url);
      const blob = await response.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }),
  );

  const updateToolInUse = (action: string) => {
    const toolMap = {
      image: "image",
      pdf: "pdf",
      crawl: "crawler",
      websearch: "websearch",
      format_file: "Format File",
    };
    setToolInUse(toolMap[action] || "none");
  };

  const provider = normalizeProvider(modelData, profile);
  const selectedModel = payload.chatSettings.model;

  const body = {
    chatSettings: {
      ...payload.chatSettings,
      model: selectedModel,
    },
    actualModel: selectedModel,
    messages: draftMessages,
    customModelId: provider === "custom" ? modelData.hostedId : "",
    base64Images: base64Images,
    enableSearch: payload.enableSearch,
    enableMaps: payload.enableMaps,
    assistant_id: payload.assistant?.id || null,
    // Include sequential processing metadata if present
    ...((payload as any).sequentialProcessing && {
      sequentialProcessing: (payload as any).sequentialProcessing,
    }),
    // Include other metadata that might be needed
    tokenCount: (payload as any).tokenCount,
    hybridModeActive: (payload as any).hybridModeActive,
    totalChunkTokens: (payload as any).totalChunkTokens,
    chunkLimitExceeded: (payload as any).chunkLimitExceeded,
  };

  const apiEndpoint =
    provider === "google"
      ? "/api/chat/google"
      : provider === "azure"
        ? "/api/chat/azure"
        : provider === "custom"
          ? "/api/chat/custom"
          : `/api/chat/${provider}`;

  type functionCallType = {
    action?: string;
    prompt?: string;
    file_ids?: string[];
    user_id?: string;
    pdf_content?: string;
    table_data?: {};
    query?: string;
    url?: string;
    description?: string;
    maxPages?: number;
    maxDepth?: number;
    extractTextOption?: boolean;
  };

  let functionCall: functionCallType = {};

  // Check if this will be sequential processing and set tool state early
  if ((payload as any).sequentialProcessing?.enabled) {
    setToolInUse("Format File");
  }

  const response = await fetchChatResponse(
    apiEndpoint,
    body,
    true,
    newAbortController,
    setIsGenerating,
    setChatMessages,
    setToolInUse,
  );

  let formattedMessages: any[] = [];
  if (provider === "google") {
    try {
      formattedMessages = await adaptMessagesForGoogleGemini(
        payload,
        draftMessages,
        "false",
      );
    } catch (_error) {
      // Error in adaptMessagesForGoogleGemini
    }
  } else {
    formattedMessages = draftMessages;
  }

  const isFunctionCalling = response.headers.get("Function-Call");
  const textResponse = response.headers.get("Text-Response");
  const isSequentialProcessing = response.headers.get("Sequential-Processing");
  const isSequentialComplete = response.headers.get("Sequential-Complete");

  // Handle sequential processing complete response
  if (isSequentialComplete === "true") {
    try {
      const responseData = await response.json();
      if (responseData.generatedText) {
        return responseData.generatedText;
      }
    } catch (_error) {}
    return {
      name: null,
      args: null,
      fullText: "Sequential processing completed.",
    };
  }

  // Handle sequential processing response
  if (isSequentialProcessing === "true") {
    // Don't update messages here - model info is already set in createTempMessages
    // This prevents duplicate model display during loading

    // Keep the Format File tool state active - it will be reset when processing completes
    // Return empty response as the processing is handled separately
    return { name: null, args: null, fullText: "" };
  }

  // FIXED: Handle regular text responses properly
  if (!isFunctionCalling) {
    updateMessages(false, modelData, imageModelData, setChatMessages);

    // Handle text-based responses
    if (textResponse) {
      const apiEndpoint =
        provider === "custom" ? "/api/chat/custom" : `/api/chat/${provider}`;

      const body = {
        chatSettings: payload.chatSettings,
        messages: formattedMessages,
        customModelId: provider === "custom" ? modelData.hostedId : "",
        base64Images: base64Images,
        enableSearch: payload.enableSearch,
      };

      const textResponseResult = await fetchChatResponse(
        apiEndpoint,
        body,
        true,
        newAbortController,
        setIsGenerating,
        setChatMessages,
        setToolInUse,
      );

      // FIXED: Return the processed response properly
      return await processResponse(
        textResponseResult,
        isRegeneration
          ? payload.chatMessages[payload.chatMessages.length - 1]
          : tempAssistantChatMessage,
        true,
        newAbortController,
        setFirstTokenReceived,
        setChatMessages,
        setToolInUse,
      );
    }

    // FIXED: Handle regular responses when no function calling and no text response header
    // Process the original response for regular text
    try {
      // Check if response is successful
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return {
          name: null,
          args: null,
          fullText: `Error: ${response.status} ${response.statusText}. ${errorText}`,
        };
      }

      // For thinking endpoint, check if we have a streaming response
      const contentType = response.headers.get("content-type");

      // If it's a streaming response, process it as such
      if (contentType?.includes("text/plain") || response.body) {
        const { name, args, fullText } = await processResponse(
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

        // If we found a function call in the response, handle it
        if (name && args) {
          try {
            const context = typeof args === "string" ? JSON.parse(args) : args;
            const res = handleFunctionCall(name, context);
            functionCall = res;
            updateToolInUse(functionCall.action);
            _toolTextCall = true;
            _functionCallText = fullText;
            // Continue to function call processing below
          } catch (_e) {
            return { name: null, args: null, fullText };
          }
        } else {
          // Return regular text response properly
          return { name: null, args: null, fullText };
        }
      } else {
        // Try to parse as JSON for non-streaming responses
        try {
          const jsonResponse = await response.json();

          const toolCall = jsonResponse.tool_calls?.[0]?.function;
          if (toolCall && toolCall.arguments) {
            const context =
              typeof toolCall.arguments === "string"
                ? JSON.parse(toolCall.arguments)
                : toolCall.arguments;
            const res = handleFunctionCall(toolCall.name, context);
            functionCall = res;
            updateToolInUse(functionCall.action);
            _toolTextCall = true;
            _functionCallText =
              jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
            // Continue to function call processing below
          } else {
            // Return the text content from JSON response
            const textContent =
              jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text ||
              jsonResponse.message ||
              jsonResponse.content ||
              JSON.stringify(jsonResponse);
            return { name: null, args: null, fullText: textContent };
          }
        } catch (_jsonError) {
          const textContent = await response
            .text()
            .catch(() => "Unable to read response");
          return { name: null, args: null, fullText: textContent };
        }
      }
    } catch (processError) {
      // Return more detailed error information
      return {
        name: null,
        args: null,
        fullText: `Error processing response: ${processError.message || processError}`,
      };
    }
  } else {
    // Handle explicit function calling
    try {
      const geminiResponse = await response.json();
      const toolCall = geminiResponse.tool_calls?.[0]?.function;
      let context = null;

      if (toolCall && toolCall.arguments) {
        context =
          typeof toolCall.arguments === "string"
            ? JSON.parse(toolCall.arguments)
            : toolCall.arguments;
      }

      functionCall = context || geminiResponse;
      updateToolInUse(functionCall.action);
      _toolTextCall = true;
      _functionCallText =
        geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (_error) {
      return {
        name: null,
        args: null,
        fullText: "Error parsing function call",
      };
    }
  }

  // Rest of the function call handling logic remains the same...
  // [Include the rest of your function call handling code here]

  // Determine tool in use and update modelData if needed
  if (functionCall && functionCall.action === "image") {
    modelData = imageModelData;
  }

  // Update tool state before messages (matching old implementation)
  updateToolInUse(functionCall && functionCall.action);

  updateMessages(
    functionCall && functionCall.action,
    modelData,
    imageModelData,
    setChatMessages,
  );

  //Create the new request body for function calling
  const requestBody: RequestBody = {
    chatSettings: payload.chatSettings,
    messages: draftMessages,
    customModelId: provider === "custom" ? modelData.hostedId : "",
    base64Images,
    action: functionCall?.action,
    profile,
    customPrompt: functionCall?.prompt,
    provider: provider,
    enableSearch: payload.enableSearch,
  };

  switch (functionCall?.action) {
    case "pdf": {
      const { pdf_content, user_id: _user_id, table_data } = functionCall;

      requestBody.pdfData = {
        pdfContent: pdf_content,
        userId: profile?.user_id,
        tableData: table_data,
      };
      break;
    }
    case "format_file": {
      const { prompt, file_ids: _file_ids } = functionCall;

      requestBody.format_FileData = {
        prompt: `${userInput} ${prompt}`.trim(),
        file_ids: payload.messageFileItems.map(item => item.file_id),
      };
      break;
    }
    case "crawl": {
      const {
        url,
        user_id: _user_id,
        maxPages,
        maxDepth,
        extractTextOption,
      } = functionCall;
      requestBody.crawlerData = {
        url,
        userId: profile?.user_id,
        maxPages,
        maxDepth,
        extractTextOption,
      };
      break;
    }
    case "websearch": {
      const { query } = functionCall;
      requestBody.searchWeb = {
        query,
      };
      break;
    }
  }

  // const functionCallApiEndpoint = functionCall.action
  //   ? customActionEndpoints[functionCall.action] || ""
  //   : provider === "custom"
  //     ? "/api/chat/custom"
  //     : `/api/chat/${provider}`;
  const functionCallApiEndpoint = getProviderEndpoint(
    functionCall.action,
    provider,
  );

  const functionCallResponse = await fetchChatResponse(
    functionCallApiEndpoint,
    requestBody,
    true,
    newAbortController,
    setIsGenerating,
    setChatMessages,
  );

  switch (functionCall.action) {
    case "format_file": {
      // Await the actual response from the endpoint
      const responseJson = await functionCallResponse.json();
      // Use the actual message or formattedContent from the endpoint
      let msgReturn = responseJson.message;
      if (responseJson.formattedContent) {
        msgReturn += `\n\nFormatted Content:\n${responseJson.formattedContent}`;
      }
      const lastChatMessage = isRegeneration
        ? payload.chatMessages[payload.chatMessages.length - 1]
        : tempAssistantChatMessage;
      setChatMessages(prev =>
        prev.map(chatMessage => {
          if (chatMessage.message.id === lastChatMessage.message.id) {
            return {
              ...chatMessage,
              message: {
                ...chatMessage.message,
                content: msgReturn,
              },
            };
          }
          return chatMessage;
        }),
      );
      // Reset tool state after format_file completion
      setToolInUse("none");
      return { name: null, args: null, fullText: msgReturn };
    }
    case "image": {
      let message = (await functionCallResponse.json()).imageUrl;
      let msgReturn;
      const lastChatMessage = isRegeneration
        ? payload.chatMessages[payload.chatMessages.length - 1]
        : tempAssistantChatMessage;
      setChatMessages(prev =>
        prev.map(chatMessage => {
          if (chatMessage.message.id === lastChatMessage.message.id) {
            msgReturn = `${chatMessage.message.content}
                ![Alt text](${message})`;
            return {
              ...chatMessage,
              message: {
                ...chatMessage.message,
                content: msgReturn,
              },
            };
          }
          return chatMessage;
        }),
      );
      // Reset tool state after image completion
      setToolInUse("none");
      return { name: null, args: null, fullText: msgReturn };
    }
    case "pdf": {
      const message = (await functionCallResponse.json()).message;
      const extractFileId = (content, prefix) => {
        const prefixIndex = content.indexOf(prefix);
        if (prefixIndex === -1) return { fileId: null, remainingContent: null };

        const startIndex = prefixIndex + prefix.length;
        const endIndex = content.indexOf("<<END>>", startIndex);
        if (endIndex === -1) return { fileId: null, remainingContent: null };

        const fileId = content.substring(startIndex, endIndex).trim();
        const remainingContent = content
          .substring(endIndex + "<<END>>".length)
          .trim();

        return { fileId, remainingContent };
      };

      const processFile = async fileId => {
        try {
          // Fetch file path and URL
          const filePath = (await getFileById(fileId)).file_path;
          const fileUrl = await getFileFromStorage(filePath);
          return fileUrl;
        } catch (error) {
          logger.error(`Error processing file ID ${fileId}`, {
            error: String(error),
          });
        }
      };
      let msgReturn;
      const { fileId, remainingContent } = extractFileId(message, "pdfFileId:");
      const pdfFileUrl = await processFile(fileId);
      const lastChatMessage = isRegeneration
        ? payload.chatMessages[payload.chatMessages.length - 1]
        : tempAssistantChatMessage;
      setChatMessages(prev =>
        prev.map(chatMessage => {
          if (chatMessage.message.id === lastChatMessage.message.id) {
            msgReturn = `${chatMessage.message.content} Your pdf is successfully created
                [Download File](${pdfFileUrl}) ${remainingContent}`;
            return {
              ...chatMessage,
              message: {
                ...chatMessage.message,
                content: msgReturn,
              },
            };
          }
          return chatMessage;
        }),
      );
      // Reset tool state after PDF completion
      setToolInUse("none");
      return { name: null, args: null, fullText: msgReturn };
    }
    case "crawl": {
      const retrievedFileItems = await handleRetrieveEmbeddings(
        userInput,
        payload,
        functionCallResponse,
      );

      const payloadCopy = { ...payload };
      payloadCopy.messageFileItems = retrievedFileItems;
      const formattedMessages = await buildFinalMessages(
        payloadCopy,
        profile,
        chatImages,
      );

      try {
        // Format messages for Google Gemini API
        const googleFormattedMessages = await adaptMessagesForGoogleGemini(
          payloadCopy,
          formattedMessages,
          "false",
        );

        // Use Gemini model for crawler responses
        const googleModel = payload.chatSettings.model.includes("gemini")
          ? payload.chatSettings.model
          : "gemini-2.5-flash"; // Default to a Gemini model with large context window

        const requestBody = {
          chatSettings: {
            ...payload.chatSettings,
            model: googleModel,
            temperature: payload.chatSettings.temperature,
          },
          messages: googleFormattedMessages,
          base64Images: base64Images,
          enableSearch: payload.enableSearch,
        };

        const googleApiEndpoint = "/api/chat/google";

        // Call the Google API endpoint
        const response = await fetchChatResponse(
          googleApiEndpoint,
          requestBody,
          true,
          newAbortController,
          setIsGenerating,
          setChatMessages,
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `Google API error: ${errorData.message || response.statusText}`,
          );
        }

        // Process the streaming response with thinking content support
        const result = await processResponse(
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

        // Reset tool state after crawl completion
        setToolInUse("none");
        return result;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        toast.error(`Error processing crawler data: ${err.message}`, {
          duration: 3000,
        });

        const gptRequestBody = {
          chatSettings: {
            ...payload.chatSettings,
            model: "gpt-4o", // Use GPT-4o as fallback
          },
          messages: formattedMessages,
          customModelId: "",
          base64Images: base64Images,
          enableSearch: payload.enableSearch,
        };
        // Use fetchChatResponse to ensure streaming for Azure fallback
        const gptResponse = await fetchChatResponse(
          "/api/chat/azure/embeddings",
          gptRequestBody,
          true,
          newAbortController,
          setIsGenerating,
          setChatMessages,
        );
        const jsonResponse = await gptResponse.json(); // Parse the JSON body
        // Reset tool state after fallback completion
        setToolInUse("none");
        // Ensure the parsed response contains the expected structure
        if (jsonResponse?.message) {
          return { name: null, args: null, fullText: jsonResponse.message }; // Extract and return the content
        } else {
          throw new Error(
            "Failed to retrieve message content from embeddings response.",
          );
        }
      }
    }
    case "websearch":
      // Check if this is a streaming response that might contain thinking content
      const contentType = functionCallResponse.headers.get("content-type");

      if (contentType?.includes("text/plain") || functionCallResponse.body) {
        // Process streaming response with thinking content support
        const result = await processResponse(
          functionCallResponse,
          isRegeneration
            ? payload.chatMessages[payload.chatMessages.length - 1]
            : tempAssistantChatMessage,
          true,
          newAbortController,
          setFirstTokenReceived,
          setChatMessages,
          setToolInUse,
        );

        // Reset tool state after websearch completion
        setToolInUse("none");
        return result;
      } else {
        // Fallback to JSON parsing for non-streaming responses
        const { output, function_name } = await functionCallResponse.json();

        // Reset tool state after websearch completion
        setToolInUse("none");

        return {
          name: null,
          args: null,
          fullText:
            function_name === "save_memory"
              ? `${function_name}:${output}`
              : output,
        };
      }
    default:
      return { name: null, args: null, fullText: null };
  }
};

// Handle sequential processing for large files
const handleSequentialProcessing = async (
  sequentialData: any,
  originalBody: any,
  controller: AbortController,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
): Promise<GeneratedText> => {
  const {
    fileId,
    totalChunks: _totalChunks,
    chunksPerBatch,
    totalBatches,
    model,
    provider,
    maxBatchTokens,
  } = sequentialData;

  // Log current messages to see their model info

  // Messages should already have model info from createTempMessages
  // Don't create a new message - use the existing temp assistant message

  const findings: string[] = [];
  let currentBatchStart = 0;
  let successfulBatches = 0;

  // Get user query from the sequential processing data
  const userQuery =
    sequentialData.userQuery ||
    originalBody.messages?.[originalBody.messages.length - 1]?.content ||
    "";

  // Process each batch sequentially
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    if (controller.signal.aborted) break;

    // Update tool state to show current batch
    setToolInUse(
      `Processing your file. Step ${batchIndex + 1} of ${totalBatches} in progress`,
    );

    try {
      // Skip chunk 0 (summary statistics) for regular batches
      // It will be included only in the final synthesis
      const adjustedBatchStart =
        currentBatchStart === 0 ? 1 : currentBatchStart;
      const adjustedBatchSize =
        currentBatchStart === 0 ? chunksPerBatch - 1 : chunksPerBatch;

      // Call analyze-file route for this batch
      const batchResponse = await fetch("/api/chat/analyze-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          userQuery,
          batchStart: adjustedBatchStart,
          batchSize: adjustedBatchSize,
          model,
          provider,
          temperature: originalBody.chatSettings?.temperature || 0.7,
          skipSummaryChunk: true, // Flag to ensure chunk 0 is skipped
          maxBatchTokens, // Pass the token limit for dynamic batching
        }),
        signal: controller.signal,
      });

      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        throw new Error(`Batch ${batchIndex + 1} failed: ${errorText}`);
      }

      const batchResult = await batchResponse.json();

      if (batchResult.findings) {
        // Prioritize first batch (it has summary stats)
        if (batchIndex === 0) {
          findings.unshift(batchResult.findings); // Add to beginning
        } else {
          findings.push(batchResult.findings);
        }
        successfulBatches++;

        // Log raw findings after first batch
        if (batchIndex === 0) {
        }
      } else {
      }

      // Update batch start, accounting for skipped summary chunk
      if (currentBatchStart === 0) {
        currentBatchStart = batchResult.nextBatchStart || adjustedBatchSize + 1;
      } else {
        currentBatchStart =
          batchResult.nextBatchStart || currentBatchStart + chunksPerBatch;
      }

      // Check if we need to continue
      if (!batchResult.hasMore) {
        break;
      }

      // Add a 2-second delay between batches to avoid rate limiting
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      const errorMessage = error.message || "Unknown error";
      const _isTimeout =
        errorMessage.includes("timeout") ||
        errorMessage.includes("Headers Timeout");

      // Continue processing without updating UI - keep showing loading animation

      // Continue with next batch instead of breaking
      currentBatchStart += chunksPerBatch;
      continue;
    }
  }

  // Final synthesis of all findings
  if (findings.length > 0 && !controller.signal.aborted) {
    const isGoogleModel = provider === "google";

    // Estimate total tokens in findings to check if synthesis is feasible
    const findingsText = findings.join("\n\n");
    const estimatedFindingsTokens = Math.ceil(findingsText.length / 4);
    const maxSynthesisTokens = isGoogleModel ? 1000000 : 100000; // Conservative limits

    // If findings are too large for synthesis, return raw findings
    if (estimatedFindingsTokens > maxSynthesisTokens) {
      const rawFindingsMessage = `📊 **Analysis Complete - Raw Findings**\n\n**Query**: ${userQuery}\n\n**Processed**: ${successfulBatches} batches\n\n**Note**: The findings were too large for automatic synthesis (${estimatedFindingsTokens} tokens). Here are the raw findings from each batch:\n\n---\n\n${findings.map((finding, idx) => `**Batch ${idx + 1}:**\n${finding}`).join("\n\n---\n\n")}`;

      setChatMessages(prev => {
        const messages = [...prev];
        const lastMessage = messages[messages.length - 1];
        lastMessage.message.content = rawFindingsMessage;
        return messages;
      });

      setToolInUse("none");
      setIsGenerating(false);

      return {
        fullText: rawFindingsMessage,
        name: null,
        args: null,
      };
    }

    // Update tool state for synthesis
    setToolInUse("Synthesizing results");

    try {
      const synthesisResponse = await fetch("/api/chat/analyze-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId, // Include fileId to fetch summary chunk
          userQuery,
          model,
          provider,
          temperature: originalBody.chatSettings?.temperature || 0.7,
          previousFindings: findings,
          isFinalSynthesis: true,
          includeSummaryChunk: true, // Flag to include chunk 0 in synthesis
          enableThinking: isGoogleModel, // Enable thinking for Gemini models
        }),
        signal: controller.signal,
      });

      if (synthesisResponse.ok) {
        const finalResult = await synthesisResponse.json();

        // Update the last message with the final synthesized response
        const responseText = finalResult.response || "Analysis complete.";

        // Append raw findings as a collapsible section for reference
        const responseWithFindings = `${responseText}\n\n---\n\n<details>\n<summary>📋 View Raw Findings from ${successfulBatches} Batches</summary>\n\n${findings.map((finding, idx) => `**Batch ${idx + 1}:**\n${finding}`).join("\n\n---\n\n")}\n\n</details>`;

        setChatMessages(prev => {
          const messages = [...prev];
          const lastMessage = messages[messages.length - 1];

          // For Google models, thinking content might be embedded in the response
          if (isGoogleModel && responseText.includes("<think>")) {
          }

          lastMessage.message.content = responseWithFindings;

          return messages;
        });

        // Return the response as GeneratedText so it flows through normal message creation
        setToolInUse("none");
        setIsGenerating(false);

        return {
          fullText: responseWithFindings,
          name: null,
          args: null,
        };
      } else {
        const errorText = await synthesisResponse.text();
        logger.error("[Synthesis] Failed", { error: String(errorText) });

        // Return raw findings when synthesis fails
        const errorMessage = `⚠️ **Synthesis Failed - Raw Findings Provided**\n\n**Query**: ${userQuery}\n\n**Processed**: ${successfulBatches} batches\n\n**Error**: Synthesis failed (likely due to token limits or API error)\n\n**Raw Findings**:\n\n${findings.map((finding, idx) => `**Batch ${idx + 1}:**\n${finding}`).join("\n\n---\n\n")}`;

        setChatMessages(prev => {
          const messages = [...prev];
          const lastMessage = messages[messages.length - 1];
          lastMessage.message.content = errorMessage;
          return messages;
        });

        setToolInUse("none");
        setIsGenerating(false);

        return {
          fullText: errorMessage,
          name: null,
          args: null,
        };
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error(`Error synthesizing results: ${err.message}`);

      // Return raw findings when synthesis throws an error
      const errorMessage = `⚠️ **Synthesis Error - Raw Findings Provided**\n\n**Query**: ${userQuery}\n\n**Processed**: ${successfulBatches} batches\n\n**Error**: ${err.message}\n\n**Raw Findings**:\n\n${findings.map((finding, idx) => `**Batch ${idx + 1}:**\n${finding}`).join("\n\n---\n\n")}`;

      setChatMessages(prev => {
        const messages = [...prev];
        const lastMessage = messages[messages.length - 1];
        lastMessage.message.content = errorMessage;
        return messages;
      });

      setToolInUse("none");
      setIsGenerating(false);

      return {
        fullText: errorMessage,
        name: null,
        args: null,
      };
    }
  } else if (findings.length === 0) {
    // No findings collected

    const errorMessage = `⚠️ **No Data Found**\n\nNo findings were collected from the ${totalBatches} batches processed.\n\nPlease verify your file and try again.`;

    setChatMessages(prev => {
      const messages = [...prev];
      const lastMessage = messages[messages.length - 1];
      lastMessage.message.content = errorMessage;
      return messages;
    });

    setToolInUse("none");
    setIsGenerating(false);

    return {
      fullText: errorMessage,
      name: null,
      args: null,
    };
  }

  // This should not be reached
  setToolInUse("none");
  setIsGenerating(false);

  return {
    fullText: "Analysis completed but no results were generated.",
    name: null,
    args: null,
  };
};

export const fetchChatResponse = async (
  url: string,
  body: object,
  isHosted: boolean,
  controller: AbortController,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse?: React.Dispatch<React.SetStateAction<string>>,
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    // If the user navigated away or cancelled, fetch may reject with an AbortError.
    if (err.name === "AbortError") {
      // Return a synthetic 499-like response to indicate client cancelled request.
      try {
        setIsGenerating(false);
      } catch {}
      return new Response(null, {
        status: 499,
        statusText: "Client Closed Request",
      });
    }
    // For other network errors, surface a toast and rethrow a response-like error
    try {
      toast.error(`${err.message || "Network error"}`, { duration: 2000 });
    } catch {}
    try {
      setIsGenerating(false);
      setChatMessages(prev => prev.slice(0, -2));
    } catch {}
    return new Response(
      JSON.stringify({ message: err.message || "Network error" }),
      { status: 499 },
    );
  }

  // Check for sequential processing response
  if (
    response.ok &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    try {
      const responseClone = response.clone(); // Clone to read without consuming
      const responseData = await responseClone.json(); // Parse as JSON

      if (responseData.type === "sequential_processing") {
        // Set tool in use immediately for file analysis
        if (setToolInUse) {
          setToolInUse("Format File");
        }

        // Handle sequential processing and return the result
        if (setToolInUse) {
          const generatedText = await handleSequentialProcessing(
            responseData,
            body,
            controller,
            setIsGenerating,
            setChatMessages,
            setToolInUse,
          );

          return new Response(
            JSON.stringify({
              type: "sequential_complete",
              generatedText: generatedText,
              metadata: {
                totalChunksProcessed: responseData.totalChunks || 0,
                fileId: responseData.fileId,
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Sequential-Complete": "true",
              },
            },
          );
        }
      }

      // Not sequential processing, return original response
      return response; // Return the original response, not a new one
    } catch (_error) {
      // Failed to parse as JSON, return original response
      return response;
    }
  }

  if (!response.ok) {
    if (response.status === 404 && !isHosted) {
      toast.error(
        "Model not found. Make sure you have it downloaded via Ollama.",
      );
    }

    let errorMessage = "Request failed";
    try {
      const errorData = await response.json();
      if (errorData?.message) errorMessage = errorData.message as string;
      toast.error(errorMessage, { duration: 2000 });
    } catch {
      toast.error(errorMessage, { duration: 2000 });
    }

    setIsGenerating(false);
    setChatMessages(prevMessages => prevMessages.slice(0, -2));
  }

  return response;
};

export const processResponse = async (
  response: Response,
  lastChatMessage: ChatMessage,
  isHosted: boolean,
  controller: AbortController,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
) => {
  let fullText = "";
  let toolCalls = "";
  let isCollectingFunctionArgs = false;
  let parts = null;

  if (response.body) {
    try {
      let isFirstChunk = true;
      await consumeReadableStream(
        response.body,
        chunk => {
          // On first chunk, clear the tool state and mark that we've received content
          if (isFirstChunk) {
            setFirstTokenReceived(true);
            setToolInUse("none"); // Reset tool state when response starts streaming
            isFirstChunk = false;
          }

          // Handle tool calling markers
          if (
            chunk.includes("<tool-calling>") ||
            chunk.includes("<tool-complete>")
          ) {
            // Extract tool name from <tool-calling>webhook-name</tool-calling>
            const toolCallingMatch = chunk.match(
              /<tool-calling>(.*?)<\/tool-calling>/,
            );
            if (toolCallingMatch) {
              const toolName = toolCallingMatch[1];
              setToolInUse(toolName);
            }

            // Check for tool complete marker
            if (chunk.includes("<tool-complete>")) {
              setToolInUse("none");
            }

            // Remove tool calling markers from the chunk
            chunk = chunk.replace(/<tool-calling>.*?<\/tool-calling>/g, "");
            chunk = chunk.replace(/<tool-complete><\/tool-complete>/g, "");

            // If the chunk becomes empty after removing markers, skip further processing
            if (!chunk.trim()) {
              return;
            }
          }

          //checks if the current chunk contains tool call
          if (chunk.includes("tool_calls")) {
            parts = chunk.split('{"tool_calls":');
            chunk = parts[0];

            // Set tool in use immediately when we detect a tool call is starting
            // This ensures the UI shows "Using..." state right away
            const previewChunk = `{"tool_calls":${parts[1]}`;
            try {
              // Try to extract the tool name early to set the correct tool state
              // Look for the function name in the tool call structure: tool_calls[].function.name
              const functionMatch = previewChunk.match(
                /"function"\s*:\s*{[^}]*"name"\s*:\s*"([^"]+)"/,
              );
              if (functionMatch) {
                const toolName = functionMatch[1];

                // Map tool names to UI display states
                const toolMap = {
                  generateImage: "image",
                  create_pdf: "pdf",
                  crawlWebsite: "crawler",
                  searchWeb: "websearch",
                  format_file: "Format File",
                };

                const toolState = toolMap[toolName];
                if (toolState) {
                  setToolInUse(toolState);
                } else {
                  // For unknown tools, set a generic state
                  setToolInUse("tool");
                }
              }
            } catch {
              // If parsing fails, we'll set the tool state later when we have complete data
            }
          }

          if (!isCollectingFunctionArgs && chunk.trim()) {
            fullText += chunk;

            setChatMessages(prev =>
              prev.map(chatMessage => {
                if (chatMessage.message.id === lastChatMessage.message.id) {
                  return {
                    ...chatMessage,
                    message: {
                      ...chatMessage.message,
                      content: fullText,
                    },
                  };
                }
                return chatMessage;
              }),
            );
          }

          if (parts) {
            isCollectingFunctionArgs = true;
            chunk = `{"tool_calls":${parts[1]}`;
            parts = null;
          }

          //collect tool call chunks
          if (isCollectingFunctionArgs) {
            toolCalls += chunk;
          }
        },
        controller.signal,
      );
    } catch (streamError) {
      // Try to read the response as text if streaming fails
      try {
        const responseText = await response.text();
        fullText = responseText;

        setChatMessages(prev =>
          prev.map(chatMessage => {
            if (chatMessage.message.id === lastChatMessage.message.id) {
              return {
                ...chatMessage,
                message: {
                  ...chatMessage.message,
                  content: fullText,
                },
              };
            }
            return chatMessage;
          }),
        );
      } catch (_textError) {
        fullText = `Error reading response: ${streamError.message}`;
      }
    }

    //if tool call happens
    if (isCollectingFunctionArgs && toolCalls) {
      try {
        const parsedToolCalls = JSON.parse(toolCalls);
        const { name, arguments: args } =
          parsedToolCalls.tool_calls[0].function;
        return { name, args: JSON.parse(args), fullText };
      } catch (_parseError) {
        return { name: null, args: null, fullText };
      }
    }

    //if no tool call return null name and args
    return { name: null, args: null, fullText };
  } else {
    try {
      const responseText = await response.text();
      return { name: null, args: null, fullText: responseText };
    } catch (error) {
      throw new Error(
        `Response body is null and text read failed: ${error.message}`,
      );
    }
  }
};

export const handleCreateChat = async (
  chatSettings: ChatSettings,
  profile: Tables<"profiles">,
  selectedWorkspace: Tables<"workspaces">,
  messageContent: string,
  selectedAssistant: Tables<"assistants">,
  newMessageFiles: ChatFile[],
  setSelectedChat: React.Dispatch<React.SetStateAction<Tables<"chats"> | null>>,
  setChats: React.Dispatch<React.SetStateAction<Tables<"chats">[]>>,
  setChatFiles: React.Dispatch<React.SetStateAction<ChatFile[]>>,
  groupId?: string,
) => {
  const createdChat = await createChat({
    user_id: profile.user_id,
    workspace_id: selectedWorkspace.id,
    assistant_id: selectedAssistant?.id || null,
    context_length: chatSettings.contextLength,
    include_profile_context: chatSettings.includeProfileContext,
    include_workspace_instructions: chatSettings.includeWorkspaceInstructions,
    model: chatSettings.model,
    image_model: chatSettings.imageModel,
    name: messageContent.substring(0, 100),
    prompt: chatSettings.prompt,
    temperature: chatSettings.temperature,
    embeddings_provider: chatSettings.embeddingsProvider,
    group_id: groupId,
    is_temp_chat: chatSettings.is_temp_chat,
  });

  setSelectedChat(createdChat);

  if (!createdChat.is_temp_chat) {
    setChats(chats => [createdChat, ...chats]);
  }

  await createChatFiles(
    newMessageFiles.map(file => ({
      user_id: profile.user_id,
      chat_id: createdChat.id,
      file_id: file.id,
    })),
  );

  setChatFiles(prev => [...prev, ...newMessageFiles]);

  return createdChat;
};

export const handleCreateMessages = async (
  chatMessages: ChatMessage[],
  currentChat: Tables<"chats">,
  profile: Tables<"profiles">,
  modelData: LLM,
  messageContent: string,
  generatedText: GeneratedText,
  newMessageImages: MessageImage[],
  isRegeneration: boolean,
  retrievedFileItems: Tables<"file_items">[],
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChatFileItems: React.Dispatch<
    React.SetStateAction<Tables<"file_items">[]>
  >,
  setChatImages: React.Dispatch<React.SetStateAction<MessageImage[]>>,
  selectedAssistant: Tables<"assistants"> | null,
  userPiiData?: {
    redactedContent: string | null;
    piiEntities: any[] | null;
    tokenMap: any | null;
  } | null,
) => {
  const sessionId = await getCurrentUserSessionId();

  const finalUserMessage: TablesInsert<"messages"> = {
    chat_id: currentChat.id,
    assistant_id: null,
    user_id: profile.user_id,
    content: userPiiData?.redactedContent || messageContent,
    original_content: messageContent,
    pii_entities: userPiiData?.piiEntities
      ? JSON.parse(JSON.stringify(userPiiData.piiEntities))
      : null,
    pii_token_map: userPiiData?.tokenMap
      ? JSON.parse(JSON.stringify(userPiiData.tokenMap))
      : null,
    model: modelData.modelId,
    role: "user",
    sequence_number: chatMessages.length,
    image_paths: [],
    session_id: sessionId ? sessionId : null,
    is_pin: false,
    pin_metadata: "",
  };

  const finalAssistantMessage: TablesInsert<"messages"> = {
    chat_id: currentChat.id,
    assistant_id: selectedAssistant?.id || null,
    user_id: profile.user_id,
    content: generatedText.fullText,
    original_content: null,
    pii_entities: null,
    pii_token_map: null,
    model: modelData.modelId,
    role: "assistant",
    sequence_number: chatMessages.length + 1,
    image_paths: [],
    session_id: null,
    is_pin: false,
    pin_metadata: "",
  };

  let finalChatMessages: ChatMessage[] = [];

  if (isRegeneration) {
    const lastStartingMessage = chatMessages[chatMessages.length - 1].message;

    const updatedMessage = await updateMessage(lastStartingMessage.id, {
      ...lastStartingMessage,
      content: generatedText.fullText,
    });

    chatMessages[chatMessages.length - 1].message = updatedMessage;

    finalChatMessages = [...chatMessages];

    setChatMessages(finalChatMessages);
  } else {
    const createdMessages = await createMessages([
      finalUserMessage,
      finalAssistantMessage,
    ]);

    // Upload each image (stored in newMessageImages) for the user message to message_images bucket
    const uploadPromises = newMessageImages
      .filter(obj => obj.file !== null)
      .map(obj => {
        let filePath = `${profile.user_id}/${currentChat.id}/${
          createdMessages[0].id
        }/${uuidv4()}`;

        return uploadMessageImage(filePath, obj.file as File).catch(error => {
          logger.error(`Failed to upload image at ${filePath}`, {
            error: String(error),
          });
          return null;
        });
      });

    const paths = (await Promise.all(uploadPromises)).filter(
      Boolean,
    ) as string[];

    setChatImages(prevImages => [
      ...prevImages,
      ...newMessageImages.map((obj, index) => ({
        ...obj,
        messageId: createdMessages[0].id,
        path: paths[index],
      })),
    ]);

    const updatedMessage = await updateMessage(createdMessages[0].id, {
      ...createdMessages[0],
      image_paths: paths,
    });

    const _createdMessageFileItems = await createMessageFileItems(
      retrievedFileItems.map(fileItem => {
        return {
          user_id: profile.user_id,
          message_id: createdMessages[1].id,
          file_item_id: fileItem.id,
        };
      }),
    );

    finalChatMessages = [
      ...chatMessages,
      {
        message: updatedMessage,
        fileItems: [],
      },
      {
        message: createdMessages[1],
        fileItems: retrievedFileItems.map(fileItem => fileItem.id),
      },
    ];

    setChatFileItems(prevFileItems => {
      const newFileItems = retrievedFileItems.filter(
        fileItem =>
          !prevFileItems.some(prevItem => prevItem.id === fileItem.id),
      );

      return [...prevFileItems, ...newFileItems];
    });

    setChatMessages(finalChatMessages);
  }
};
