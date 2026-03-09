import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatAPIPayload } from "@/types";
import { getDeepseekOAuthToken } from "./fetch-oauth-token";
import { getMaxTokenOutputLength } from "@/lib/chat-setting-limits";
import {
  loadWebhooksForEntity,
  convertWebhookToOpenAITool,
  getWebhookByFunctionName,
  WebhookTool,
} from "@/lib/n8n/webhook-loader";
import {
  executeWebhook,
  executeWebhookAsync,
  formatWebhookResponse,
} from "@/lib/n8n/webhook-executor";
import { AIFormattingConfig } from "@/lib/n8n/types";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { createLogger } from "@/lib/logger";
import { getOpenAITools } from "@/lib/chat/tool-definitions";
import { buildFunctionCallResponse } from "@/lib/chat/function-call-handler";

const logger = createLogger({ feature: "api/chat/deepseek" });

// Token Limits for Deepseek R1
const MODEL_TOKEN_LIMITS = {
  "deepseek-ai/deepseek-r1-0528-maas": 163840,
  default: 163840,
};

// Helper function to estimate the token limit for a given model
function estimateTokenLimit(content: any) {
  if (typeof content === "string") {
    // Rough estimation: 1 token ~= 4 characters
    return Math.ceil(content.length / 4);
  }

  if (Array.isArray(content)) {
    return content.reduce((acc, part) => {
      if (part.type === "text" || typeof part === "string") {
        return acc + Math.ceil((part.text || part).length / 4);
      }
      return acc;
    }, 0);
  }

  return 0;
}

// Function to process messages and filter out image content for Deepseek
function processMessagesForDeepseek(messages: any[]) {
  return messages.map(msg => {
    // If content is a string, return as is
    if (typeof msg.content === "string") {
      return msg;
    }

    // If content is an array, filter out image parts
    if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(part => {
        // Keep text parts
        if (part.type === "text" || typeof part === "string") {
          return true;
        }
        // Filter out image parts
        if (part.type === "image_url" || part.inlineData) {
          return false;
        }
        // Keep other parts (fallback)
        return true;
      });

      // If we have text parts, return them
      if (textParts.length > 0) {
        return {
          ...msg,
          content: textParts,
        };
      }

      // If no text parts remain, add a placeholder
      return {
        ...msg,
        content:
          "[Image content removed - Deepseek R1 doesn't support image input or image analysis]",
      };
    }

    // If content has parts property, filter out image parts
    if (msg.parts && Array.isArray(msg.parts)) {
      const textParts = msg.parts.filter(part => {
        // Keep text parts
        if (part.type === "text" || typeof part === "string") {
          return true;
        }
        // Filter out image parts
        if (part.type === "image_url" || part.inlineData) {
          return false;
        }
        // Keep other parts (fallback)
        return true;
      });

      // If we have text parts, return them
      if (textParts.length > 0) {
        return {
          ...msg,
          parts: textParts,
        };
      }

      // If no text parts remain, add a placeholder
      return {
        ...msg,
        content:
          "[Image content removed - Deepseek R1 doesn't support image input or image analysis]",
      };
    }

    // Fallback: return message as is
    return msg;
  });
}

const handleFunctionCall = async (
  functionName: string,
  functionArguments: any,
  webhooks: WebhookTool[],
  userId: string,
  supabase: any,
  userQuestion?: string,
  deepseekApiKey?: string,
  requestOrigin?: string,
) => {
  // Check if this is a webhook call (starts with 'n8n_')
  if (functionName.startsWith("n8n_")) {
    try {
      logger.info("[n8n] Detected webhook function call", { functionName });

      // Find the webhook by function name
      const webhook = getWebhookByFunctionName(functionName, webhooks);

      if (!webhook) {
        logger.error("[n8n] Webhook not found for function", { functionName });
        return new Response(
          JSON.stringify({
            action: "webhook_error",
            error: "Webhook configuration not found",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Function-Call": "true",
            },
          },
        );
      }

      // Stream the webhook result with tool calling markers
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send tool calling marker
            controller.enqueue(
              new TextEncoder().encode(
                `<tool-calling>${webhook.name}</tool-calling>`,
              ),
            );

            if (webhook.thinking_steps_enabled) {
              // Async execution for thinking steps
              const { execution_id } = await executeWebhookAsync(
                supabase,
                webhook,
                functionArguments,
                userId,
                undefined,
                process.env.NEXTAUTH_URL ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  requestOrigin ||
                  "http://localhost:3000",
              );

              // Stream the execution ID marker
              controller.enqueue(
                new TextEncoder().encode(
                  `<thinking-execution>${execution_id}</thinking-execution>`,
                ),
              );

              // We don't wait for result here, just finish the tool call
              controller.enqueue(
                new TextEncoder().encode(`<tool-complete></tool-complete>`),
              );
              // don't close controller here, deepseek route continues streaming text?
              // Looking at original code:
              // controller.enqueue(new TextEncoder().encode(formattedResponse));
              // controller.close();
              // So we should close it here too since we're done with tool output
              controller.close();
            } else {
              // Synchronous execution (existing behavior)
              const result = await executeWebhook(
                supabase,
                webhook,
                functionArguments,
                userId,
              );

              const aiConfig: AIFormattingConfig = {
                provider: "deepseek",
                deepseek: {
                  apiKey: deepseekApiKey!,
                },
              };

              // Format the response for the AI
              const formattedResponse = await formatWebhookResponse(
                webhook,
                result,
                userQuestion,
                aiConfig,
              );

              // Send tool complete marker
              controller.enqueue(
                new TextEncoder().encode(`<tool-complete></tool-complete>`),
              );

              // Send the actual response
              controller.enqueue(new TextEncoder().encode(formattedResponse));

              controller.close();
            }
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error: unknown) {
      logger.error("[n8n] Webhook execution error", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });

      // Stream error message as plain text
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = `Error executing webhook: ${err.message || "Unknown error"}`;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(errorMessage));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    }
  }

  // Handle Deepseek-specific function calls first
  if (functionName === "format_file") {
    const responseBody = {
      action: "format_file",
      file_ids: functionArguments?.file_ids || [],
      prompt: functionArguments?.prompt,
    };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Function-Call": "true",
      },
    });
  }

  // Handle shared function calls with Deepseek-specific overrides
  const providerOverrides: Record<string, Record<string, unknown>> = {
    generateImage: { provider: "google" },
    searchWeb: { provider: "deepseek" },
  };

  const responseBody = buildFunctionCallResponse(
    functionName,
    functionArguments,
    providerOverrides[functionName],
  );

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Function-Call": "true",
    },
  });
};

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      chatSettings,
      messages,
      file_ids: _file_ids,
      actualModel: _actualModel,
      assistant_id,
      sequentialProcessing,
      enableSearch,
    } = json as ChatAPIPayload & {
      sequentialProcessing?: {
        enabled: boolean;
        fileId: string;
        totalChunks: number;
        totalTokens: number;
        chunksPerBatch: number;
        currentBatchStart: number;
        userQuery: string;
        queryType: string;
        maxBatchTokens?: number;
      };
      enableSearch?: boolean;
    };

    // Check for sequential processing
    if (sequentialProcessing?.enabled) {
      return new Response(
        JSON.stringify({
          type: "sequential_processing",
          fileId: sequentialProcessing.fileId,
          totalChunks: sequentialProcessing.totalChunks,
          chunksPerBatch: sequentialProcessing.chunksPerBatch,
          totalBatches: Math.ceil(
            sequentialProcessing.totalChunks /
              sequentialProcessing.chunksPerBatch,
          ),
          model: chatSettings.model,
          provider: "deepseek",
          userQuery: sequentialProcessing.userQuery,
          queryType: sequentialProcessing.queryType,
          message:
            "File exceeds model token limit. Sequential processing required.",
          maxBatchTokens: sequentialProcessing.maxBatchTokens,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Process messages to filter out image content for Deepseek
    const processedMessages = processMessagesForDeepseek(messages);

    // Use the accurate token count from build-prompt if available, otherwise estimate
    const totalTokens =
      (json as any).tokenCount ||
      processedMessages.reduce((acc, message) => {
        return acc + estimateTokenLimit(message.content);
      }, 0);

    const modelTokenLimit =
      MODEL_TOKEN_LIMITS[chatSettings.model] || MODEL_TOKEN_LIMITS.default;

    if (totalTokens > modelTokenLimit) {
      return new Response(
        JSON.stringify({
          message: `Input exceeds token limit of ${modelTokenLimit} tokens for model ${chatSettings.model}`,
        }),
        { status: 400 },
      );
    }

    // Deepseek-specific tool: format_file (not shared with other providers)
    const formatFileTool = {
      type: "function" as const,
      function: {
        name: "format_file",
        description: "Format or correct the content of a text file.",
        parameters: {
          type: "object",
          properties: {
            file_ids: {
              type: "array",
              items: { type: "string" },
              description: "The unique identifier(s) of the file(s) to format.",
            },
            action: {
              type: "string",
              enum: ["format", "correction"],
              description:
                "The type of operation to perform: format or correction.",
            },
            prompt: {
              type: "string",
              description: "The user query or request for formatting.",
            },
          },
          required: ["file_ids", "action", "prompt"],
          additionalProperties: false,
        },
      },
    };

    const tools = [formatFileTool, ...getOpenAITools()];

    const profile = await getServerProfile();
    logger.info("Deepseek chat request received", {
      model: chatSettings?.model,
      messageCount: messages?.length,
      assistantId: assistant_id,
      hasSequentialProcessing: !!sequentialProcessing?.enabled,
    });

    // Check if user has deepseek_api_service_account, otherwise use environment variable
    const deepseekApiKey =
      profile.deepseek_api_service_account ||
      process.env.DEEPSEEK_API_SERVICE_ACCOUNT;
    checkApiKey(deepseekApiKey, "Deepseek");

    // Load n8n webhooks for assistant or model (if any assigned)
    let webhookTools: any[] = [];
    let loadedWebhooks: WebhookTool[] = [];
    const userId = profile.user_id;
    let supabase: any = null; // Declare at higher scope for use in handleFunctionCall

    try {
      if (userId) {
        // Create Supabase client
        const cookieStore = await cookies();
        supabase = createClient(cookieStore);

        // Priority 1: Load webhooks for assistant (if assistant is used)
        if (assistant_id) {
          // Get assistant to find owner's user_id (for shared assistants)
          const { data: assistant } = await supabase
            .from("assistants")
            .select("user_id")
            .eq("id", assistant_id)
            .single();

          loadedWebhooks = await loadWebhooksForEntity(
            supabase,
            "assistant",
            assistant_id,
            userId,
            assistant?.user_id, // Pass owner's ID for shared assistants
          );

          if (loadedWebhooks.length > 0) {
            logger.info("[n8n] Loaded webhooks for assistant", {
              assistantId: assistant_id,
              count: loadedWebhooks.length,
            });
          }
        }

        // Priority 2: If no assistant webhooks, fall back to model webhooks
        if (loadedWebhooks.length === 0 && chatSettings.model) {
          loadedWebhooks = await loadWebhooksForEntity(
            supabase,
            "model",
            chatSettings.model,
            userId,
          );

          if (loadedWebhooks.length > 0) {
            logger.info("[n8n] Loaded webhooks for model", {
              model: chatSettings.model,
              count: loadedWebhooks.length,
            });
          }
        }

        // Convert webhooks to OpenAI tool format (Deepseek uses same format)
        webhookTools = loadedWebhooks
          .map(webhook => convertWebhookToOpenAITool(webhook))
          .filter(tool => tool !== null);
      }
    } catch (webhookError) {
      logger.error("[n8n] Error loading webhooks", {
        error:
          webhookError instanceof Error
            ? { message: webhookError.message, stack: webhookError.stack }
            : String(webhookError),
      });
      // Continue without webhooks - don't break the chat
    }

    // Merge webhook tools with existing tools
    // Filter out searchWeb tool if enableSearch is not explicitly true
    const filteredTools = enableSearch
      ? tools
      : tools.filter(
          tool =>
            tool.type === "function" && tool.function.name !== "searchWeb",
        );

    const allTools = [...filteredTools, ...webhookTools];

    // Get access token using Google Auth
    const accessToken = await getDeepseekOAuthToken(deepseekApiKey!);

    const ENDPOINT = process.env.DEEPSEEK_API_ENDPOINT;

    // Add system message to instruct function calling
    const systemMessage = {
      role: "system",
      content: `You are a helpful AI assistant capable of answering questions, providing information, writing code, and performing various tasks. You can generate code in any programming language, explain concepts, solve problems, and provide detailed responses.

For specific tasks, use the appropriate function when explicitly requested:
- format_file: when user explicitly asks to format, clean up, fix, or correct uploaded text files
- create_pdf: when user specifically requests to create a PDF document
- generateImage: when user asks to generate, create, or edit images
- crawlWebsite: when user asks to crawl or scrape websites
- searchWeb: when user asks for current information like weather, news, or recent events

For general questions, coding requests, explanations, and most other tasks, provide direct helpful responses without using function calls.

LIMITATIONS: You cannot analyze provided images because you are text-based reasoning model.
IMPORTANT: When a user explicitly requests file formatting, crawling, PDF creation, image generation, or web search, you MUST use the appropriate function call. Do not try to handle these tasks with text responses.`,
    };

    const messagesWithSystem = [systemMessage, ...processedMessages];

    // Try non-streaming first to handle function calls properly
    const maxTokens = getMaxTokenOutputLength(chatSettings.model);

    // Calculate available tokens with buffer for thinking/reasoning
    const thinkingBuffer = Math.min(2000, Math.floor(maxTokens * 0.2)); // Reserve 20% for thinking
    const responseTokens = maxTokens - thinkingBuffer;
    const availableTokens = Math.min(
      responseTokens,
      modelTokenLimit - totalTokens,
    );

    const nonStreamingResponse = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chatSettings.model,
        messages: messagesWithSystem,
        tools: allTools,
        max_tokens: availableTokens,
        temperature: chatSettings.temperature,
        stream: false,
        thinking: true,
        reasoning: true,
      }),
    });
    if (!nonStreamingResponse.ok) {
      const errorText = await nonStreamingResponse.text();
      throw new Error(
        `Deepseek API error: ${nonStreamingResponse.status} ${errorText}`,
      );
    }

    const nonStreamingData = await nonStreamingResponse.json();

    // Log the actual response for debugging

    const finishReason = nonStreamingData?.choices?.[0]?.finish_reason;
    const toolCalls = nonStreamingData?.choices?.[0]?.message?.tool_calls;

    // Check if response was truncated
    if (finishReason === "length") {
      logger.warn("Response was truncated due to token limit");
    }

    if (finishReason === "tool_calls" && toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const functionName = toolCall.function?.name;
      const functionArguments = toolCall.function?.arguments;

      if (functionName && functionArguments) {
        try {
          const args = JSON.parse(functionArguments);
          return handleFunctionCall(
            functionName,
            args,
            loadedWebhooks,
            userId,
            supabase,
            undefined,
            undefined,
            request.headers.get("host") &&
              !request.headers.get("host")?.includes("localhost")
              ? `https://${request.headers.get("host")}`
              : new URL(request.url).origin,
          );
        } catch (parseError) {
          logger.error("Error parsing function arguments", {
            error:
              parseError instanceof Error
                ? { message: parseError.message, name: parseError.name }
                : parseError,
          });
          throw new Error("Invalid function arguments format");
        }
      }
    } else {
      logger.debug("No function call detected", { finishReason, toolCalls });

      // No fallback keyword-based function calls - rely on Deepseek's native function calling
    }

    // If no function call, return the text response as streaming with artificial thinking content
    const textContent = nonStreamingData?.choices?.[0]?.message?.content || "";

    // Add continuation message if response was truncated
    const isTruncated = finishReason === "length";
    const continuationMessage = isTruncated
      ? "\n\n[Response was truncated due to token limit exceeded. Please ask for more specific information or break your request into smaller parts.]"
      : "";

    const stream = new ReadableStream({
      start(controller) {
        // Add a small delay to simulate thinking
        setTimeout(() => {
          // Stream the actual content character by character for natural effect
          let index = 0;
          const streamContent = () => {
            if (index < textContent.length) {
              const chunk = textContent.slice(
                index,
                Math.min(index + 10, textContent.length),
              );
              controller.enqueue(new TextEncoder().encode(chunk));
              index += 10;
              setTimeout(streamContent, 5); // 20ms delay between chunks
            } else {
              // Add continuation message if truncated
              if (continuationMessage) {
                controller.enqueue(
                  new TextEncoder().encode(continuationMessage),
                );
              }
              controller.close();
            }
          };
          streamContent();
        }, 100); // 500ms delay after thinking content
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    logger.error("Deepseek chat route error", {
      error: {
        message: errorMessage,
        name: err.name,
        stack: err.stack,
        statusCode: errorCode,
      },
    });
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
