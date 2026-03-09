import { Tables } from "@/supabase/types";
import { ChatPayload, MessageImage } from "@/types";
import { encode } from "gpt-tokenizer";
import { getBase64FromDataURL } from "@/lib/utils";
import { toast } from "sonner";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/build-prompt" });

const buildBasePrompt = (
  prompt: string,
  profileContext: string,
  workspaceInstructions: string,
  assistant: Tables<"assistants"> | null,
  _hasFiles: boolean = false,
) => {
  let fullPrompt = "";

  if (assistant) {
    fullPrompt += `<INJECT ROLE>\nYou are not an AI. You are ${assistant.name}.\n</INJECT ROLE>\n\n`;
  }

  fullPrompt += `Today is ${new Date().toLocaleDateString()}.\n\n`;

  if (profileContext) {
    fullPrompt += `User Info:\n${profileContext}\n\n`;
  }

  if (workspaceInstructions) {
    fullPrompt += `System Instructions:\n${workspaceInstructions}\n\n`;
  }

  fullPrompt += `User Instructions:\n${prompt}`;

  return fullPrompt;
};

export async function buildFinalMessages(
  payload: ChatPayload,
  profile: Tables<"profiles">,
  _chatImages: MessageImage[],
) {
  const {
    chatSettings,
    workspaceInstructions,
    chatMessages,
    assistant,
    messageFileItems,
    chatFileItems,
  } = payload;

  const BUILT_PROMPT = buildBasePrompt(
    chatSettings.prompt,
    chatSettings.includeProfileContext ? profile.profile_context || "" : "",
    chatSettings.includeWorkspaceInstructions ? workspaceInstructions : "",
    assistant,
    messageFileItems.length > 0,
  );

  const MODEL_LIMIT = chatSettings.contextLength;
  const PROMPT_TOKENS = encode(chatSettings.prompt).length;

  let remainingTokens = MODEL_LIMIT - PROMPT_TOKENS;

  let _usedTokens = 0;
  _usedTokens += PROMPT_TOKENS;

  const processedChatMessages = chatMessages.map((chatMessage, index) => {
    const nextChatMessage = chatMessages[index + 1];

    if (nextChatMessage === undefined) {
      return chatMessage;
    }

    const nextChatMessageFileItems = nextChatMessage.fileItems;

    if (nextChatMessageFileItems.length > 0) {
      const findFileItems = nextChatMessageFileItems
        .map(fileItemId =>
          chatFileItems.find(chatFileItem => chatFileItem.id === fileItemId),
        )
        .filter(item => item !== undefined) as Tables<"file_items">[];

      const retrievalText = buildRetrievalText(findFileItems);

      return {
        message: {
          ...chatMessage.message,
          content:
            `${chatMessage.message.content}\n\n${retrievalText}` as string,
        },
        fileItems: [],
      };
    }

    return chatMessage;
  });

  let finalMessages = [];

  for (let i = processedChatMessages.length - 1; i >= 0; i--) {
    const message = processedChatMessages[i].message;
    const messageTokens = encode(message.content).length;

    if (messageTokens <= remainingTokens) {
      remainingTokens -= messageTokens;
      _usedTokens += messageTokens;
      finalMessages.unshift(message);
    } else {
      break;
    }
  }

  let tempSystemMessage: Tables<"messages"> = {
    chat_id: "",
    assistant_id: null,
    content: BUILT_PROMPT,
    created_at: "",
    id: processedChatMessages.length + "",
    image_paths: [],
    model: payload.chatSettings.model,
    role: "system",
    sequence_number: processedChatMessages.length,
    updated_at: "",
    user_id: "",
    session_id: "",
    is_pin: false,
    pin_metadata: "",
    original_content: null,
    pii_entities: null,
    pii_token_map: null,
  };

  finalMessages.unshift(tempSystemMessage);

  finalMessages = finalMessages.map(message => {
    let content;

    const hasSvg = message.image_paths.some(path =>
      /^data:image\/svg\+xml;base64,/.test(path),
    );
    if (hasSvg) {
      toast.error(
        "SVG format is not supported. Only PNG, JPEG, and JPG are allowed.",
      );
      return;
    }

    if (
      message.image_paths.length > 0 &&
      message.image_paths.every(path =>
        /^data:image\/(png|jpeg|jpg);base64,/.test(path),
      )
    ) {
      content = [
        {
          type: "text",
          text:
            "Describe this image precise and descriptive. " + message.content,
        },
        ...message.image_paths.map(path => ({
          type: "image_url",
          image_url: {
            url: path,
          },
        })),
      ];
      return {
        role: "user",
        content,
      };
    } else {
      content = message.content;
    }

    return {
      role: message.role,
      content,
    };
  });

  if (messageFileItems.length > 0) {
    const lastUserMessage =
      finalMessages[finalMessages.length - 1]?.content || "";

    // Step 1: Calculate total tokens from incoming chunks
    let fileTotalTokens = 0;
    messageFileItems.forEach(item => {
      const chunkTokens = item.tokens || encode(item.content).length;
      fileTotalTokens += chunkTokens;
    });

    // Step 2: Calculate available tokens for retrieval chunks
    const currentMessageTokens = finalMessages.reduce((sum, msg) => {
      if (typeof msg.content === "string") {
        return sum + encode(msg.content).length;
      } else if (Array.isArray(msg.content)) {
        // For array content (with images), count tokens from text parts
        const textContent = msg.content
          .filter(part => part.type === "text")
          .map(part => part.text || "")
          .join(" ");
        return sum + encode(textContent).length;
      }
      return sum;
    }, 0);

    // Model output limits (matches Azure route configuration)
    const MODEL_OUTPUT_LIMITS: Record<string, number> = {
      "gpt-4-turbo-preview": 16384,
      "gpt-4-vision-preview": 16384,
      "gpt-4o": 16384,
      "gpt-5": 128000,
      "gpt-5.1": 128000,
      "o1-preview": 128000,
      "o3-mini": 100000,
      default: 16384,
    };

    const reservedOutputTokens =
      MODEL_OUTPUT_LIMITS[chatSettings.model] || MODEL_OUTPUT_LIMITS.default;

    const availableTokensForRetrieval = Math.max(
      0,
      MODEL_LIMIT - currentMessageTokens - reservedOutputTokens - 500,
    );

    let selectedChunks = [];
    let usedRetrievalTokens = 0;

    // Separate summary and regular chunks
    const summaryChunks = messageFileItems.filter(item =>
      item.content.includes("SUMMARY CHUNK - STATISTICS & ANALYTICS"),
    );
    const regularChunks = messageFileItems.filter(
      item => !item.content.includes("SUMMARY CHUNK - STATISTICS & ANALYTICS"),
    );

    // Step 3: Check if chunks fit within model context
    if (fileTotalTokens <= availableTokensForRetrieval) {
      // All chunks fit - select them directly
      selectedChunks = [...messageFileItems];
      usedRetrievalTokens = fileTotalTokens;
    } else {
      // Chunks exceed model context - call analyze-intent API

      try {
        const intentResponse = await fetch("/api/chat/analyze-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userQuery: lastUserMessage,
            fileType: summaryChunks.length > 0 ? "spreadsheet" : "document",
            hasLargeFile: true,
            summaryContent: summaryChunks[0]?.content || "",
          }),
        });

        if (intentResponse.ok) {
          const { analysis } = await intentResponse.json();

          // Handle three possible outcomes from intent analysis
          if (
            analysis.suggestedApproach === "summary_only" &&
            summaryChunks.length > 0
          ) {
            // 📋 Case 1: Summary chunk only (for statistical queries on spreadsheets)
            selectedChunks = summaryChunks;
            usedRetrievalTokens = summaryChunks.reduce(
              (sum, chunk) =>
                sum + (chunk.tokens || encode(chunk.content).length),
              0,
            );

            // Add metadata to indicate summary-only processing
            (payload as any).summaryOnlyProcessing = true;
            (payload as any).queryIntentAnalysis = analysis;
          } else if (analysis.suggestedApproach === "batch_processing") {
            // 🔄 Case 2: Sequential processing (full file needed)

            const fileId = messageFileItems[0]?.file_id;

            let actualTotalChunks = messageFileItems.length;
            let actualTotalTokens = fileTotalTokens;
            try {
              const response = await fetch("/api/retrieval/get-file-tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId }),
              });

              if (response.ok) {
                const stats = await response.json();
                actualTotalChunks =
                  stats.totalChunks || messageFileItems.length;
                actualTotalTokens = stats.totalTokens || fileTotalTokens;
              }
            } catch (error) {
              logger.error(
                "Sequential processing failed to fetch file stats, using retrieved chunk count",
                {
                  error:
                    error instanceof Error
                      ? { message: error.message, name: error.name }
                      : error,
                },
              );
            }

            const _modelLimit = chatSettings.contextLength;
            const isGeminiModel = chatSettings.model.includes("gemini");
            const _capacityPercentage = isGeminiModel ? 0.5 : 0.8;

            const usableCapacity = isGeminiModel ? 500000 : 80000;

            const reservedTokens = PROMPT_TOKENS + 20000;
            const maxTokensPerBatch = usableCapacity - reservedTokens;

            // Calculate chunks per batch based on ACTUAL total chunks
            // Use average tokens per chunk from retrieved chunks to estimate
            const avgTokensPerChunk =
              messageFileItems.length > 0
                ? fileTotalTokens / messageFileItems.length
                : 1000;

            const estimatedChunksPerBatch = Math.floor(
              maxTokensPerBatch / avgTokensPerChunk,
            );
            const chunksPerBatch = Math.max(1, estimatedChunksPerBatch);
            logger.info("Calculated chunks per batch", { chunksPerBatch });
            // Add sequential processing metadata
            (payload as any).sequentialProcessing = {
              enabled: true,
              fileId: fileId,
              totalChunks: actualTotalChunks,
              totalTokens: actualTotalTokens,
              chunksPerBatch: chunksPerBatch,
              currentBatchStart: 0,
              userQuery: lastUserMessage,
              queryType: analysis.queryType,
              maxBatchTokens: maxTokensPerBatch,
            };

            // For sequential processing, don't include chunks in the initial request
            selectedChunks = [];
            usedRetrievalTokens = 0;

            // Add metadata to help routes make better decisions
            (payload as any).hybridModeActive = true;
            (payload as any).totalChunkTokens = fileTotalTokens;
            (payload as any).chunkLimitExceeded = true;
          } else {
            // 📦 Case 3: Partial processing (hybrid) - fill up to model limit with highest similarity chunks
            // Start with summary chunks if they exist
            selectedChunks = [];
            usedRetrievalTokens = 0;

            // Add summary chunks first (they provide important context)
            if (summaryChunks.length > 0) {
              for (const chunk of summaryChunks) {
                const chunkTokens =
                  chunk.tokens || encode(chunk.content).length;
                if (
                  usedRetrievalTokens + chunkTokens <=
                  availableTokensForRetrieval
                ) {
                  selectedChunks.push(chunk);
                  usedRetrievalTokens += chunkTokens;
                }
              }
            }

            // Sort regular chunks by similarity score (descending)
            const sortedChunks = [...regularChunks].sort((a, b) => {
              const scoreA = (a as any).similarity_score || 0;
              const scoreB = (b as any).similarity_score || 0;
              return scoreB - scoreA;
            });

            // Add regular chunks until we hit the token limit
            for (const chunk of sortedChunks) {
              const chunkTokens = chunk.tokens || encode(chunk.content).length;
              if (
                usedRetrievalTokens + chunkTokens <=
                availableTokensForRetrieval
              ) {
                selectedChunks.push(chunk);
                usedRetrievalTokens += chunkTokens;
              }
            }
          }
        } else {
          // Fallback: use partial processing if Intent Analysis fails
          selectedChunks = [];
          usedRetrievalTokens = 0;

          // Add summary chunks first
          if (summaryChunks.length > 0) {
            for (const chunk of summaryChunks) {
              const chunkTokens = chunk.tokens || encode(chunk.content).length;
              if (
                usedRetrievalTokens + chunkTokens <=
                availableTokensForRetrieval
              ) {
                selectedChunks.push(chunk);
                usedRetrievalTokens += chunkTokens;
              }
            }
          }

          // Sort regular chunks by similarity
          const sortedChunks = [...regularChunks].sort((a, b) => {
            const scoreA = (a as any).similarity_score || 0;
            const scoreB = (b as any).similarity_score || 0;
            return scoreB - scoreA;
          });

          for (const chunk of sortedChunks) {
            const chunkTokens = chunk.tokens || encode(chunk.content).length;
            if (
              usedRetrievalTokens + chunkTokens <=
              availableTokensForRetrieval
            ) {
              selectedChunks.push(chunk);
              usedRetrievalTokens += chunkTokens;
            }
          }
        }
      } catch (error) {
        logger.error("Error analyzing query intent", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });

        // Fallback: use partial processing
        selectedChunks = [];
        usedRetrievalTokens = 0;

        // Add summary chunks first
        if (summaryChunks.length > 0) {
          for (const chunk of summaryChunks) {
            const chunkTokens = chunk.tokens || encode(chunk.content).length;
            if (
              usedRetrievalTokens + chunkTokens <=
              availableTokensForRetrieval
            ) {
              selectedChunks.push(chunk);
              usedRetrievalTokens += chunkTokens;
            }
          }
        }

        // Sort regular chunks by similarity
        const sortedChunks = [...regularChunks].sort((a, b) => {
          const scoreA = (a as any).similarity_score || 0;
          const scoreB = (b as any).similarity_score || 0;
          return scoreB - scoreA;
        });

        for (const chunk of sortedChunks) {
          const chunkTokens = chunk.tokens || encode(chunk.content).length;
          if (
            usedRetrievalTokens + chunkTokens <=
            availableTokensForRetrieval
          ) {
            selectedChunks.push(chunk);
            usedRetrievalTokens += chunkTokens;
          }
        }
      }
    }

    // Step 4: Add selected chunks to final messages
    if (selectedChunks.length > 0) {
      const retrievalText = buildRetrievalText(selectedChunks);

      finalMessages[finalMessages.length - 1] = {
        ...finalMessages[finalMessages.length - 1],
        content: `${
          finalMessages[finalMessages.length - 1].content
        }\n\n${retrievalText}`,
      };
    }
  }

  const totalMessageTokens = finalMessages.reduce((sum, msg) => {
    if (typeof msg.content === "string") {
      return sum + encode(msg.content).length;
    } else if (Array.isArray(msg.content)) {
      // For array content (with images), count tokens from text parts
      const textContent = msg.content
        .filter(part => part.type === "text")
        .map(part => part.text || "")
        .join(" ");
      return sum + encode(textContent).length;
    }
    return sum;
  }, 0);

  // Add token count to payload for fallback logic
  (payload as any).tokenCount = totalMessageTokens;

  return finalMessages;
}

function buildRetrievalText(fileItems: Tables<"file_items">[]) {
  // Minimal formatting to save tokens - just concatenate the content
  const retrievalText = fileItems.map(item => item.content).join("\n\n");

  const fileIds = [...new Set(fileItems.map(item => item.file_id))];

  return `File Data:\n${retrievalText}\n\nFile IDs: [${fileIds.join(", ")}]`;
}

function extractUrl(str: string) {
  const regex = /<<imageUrlStart>>(.*?)<<imageUrlEnd>>/;
  const match = str.match(regex);

  if (match && match[1]) {
    return match[1];
  }

  return null;
}

async function adaptSingleMessageForGoogleGemini(message: any, action: string) {
  let adaptedParts = [];

  let rawParts = [];
  if (!Array.isArray(message.content)) {
    rawParts.push({ type: "text", text: message.content });
  } else {
    rawParts = message.content;
  }

  for (let i = 0; i < rawParts.length; i++) {
    let rawPart = rawParts[i];

    if (rawPart.type === "text") {
      if (rawPart.text.trim().startsWith("![Alt text](<<imageUrlStart>>")) {
        const url = extractUrl(rawPart.text);
        const base64Image = await getBase64FromDataURL(url);

        adaptedParts.push({
          inlineData: {
            data: base64Image,
            mimeType: "image/jpeg",
          },
        });
      } else {
        adaptedParts.push({ text: rawPart.text });
      }
    } else if (rawPart.type === "image_url") {
      adaptedParts.push({
        inlineData: {
          data: await getBase64FromDataURL(rawPart.image_url.url),
          mimeType: "image/jpeg",
        },
      });
    }
  }

  let role = "user";
  if (["user", "system"].includes(message.role)) {
    role = "user";
  } else if (message.role === "assistant") {
    role = "model";
  }

  if (action === "websearch") {
    const contentText = adaptedParts.map(part => part.text).join(" ");
    return {
      role: role,
      content: contentText,
    };
  } else {
    return {
      role: role,
      parts: adaptedParts,
    };
  }
}

function adaptMessagesForGeminiVision(messages: any[], action: string) {
  // Gemini Pro Vision cannot process multiple messages
  // Reformat by combining texts and adding the final visual content in "parts" format

  const baseRole = messages[0].role;
  const basePrompt =
    action === "websearch" ? messages[0].content : messages[0].parts[0].text;
  const lastMessage = messages[messages.length - 1];
  const visualMessageParts =
    action === "websearch"
      ? [{ text: lastMessage.content }]
      : lastMessage.parts;

  const visualQueryMessages = [
    {
      role: baseRole,
      parts: [
        {
          text: `${baseRole}:\n${basePrompt}\n\nuser:\n${visualMessageParts[0].text}\n\n`,
        },
        ...visualMessageParts.slice(1),
      ],
    },
  ];

  return visualQueryMessages;
}

export async function adaptMessagesForGoogleGemini(
  payload: ChatPayload,
  messages: any[],
  action: string,
) {
  let geminiMessages: any[];
  // if (action === "websearch") {
  //   geminiMessages = messages.map((message) => ({
  //     role: message.role,
  //     content: message.content
  //   }));
  // } else {
  const messagePromises = messages.map(message =>
    adaptSingleMessageForGoogleGemini(message, action),
  );

  geminiMessages = await Promise.all(messagePromises);
  if (payload.chatSettings.model === "gemini-pro-vision") {
    geminiMessages = adaptMessagesForGeminiVision(geminiMessages, action);
  }
  // }

  return geminiMessages;
}
