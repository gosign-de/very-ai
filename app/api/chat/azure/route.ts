import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatAPIPayload } from "@/types";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
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
import { createStreamingResponse } from "@/lib/server/server-utils";
import { getOpenAITools } from "@/lib/chat/tool-definitions";
import { buildFunctionCallResponse } from "@/lib/chat/function-call-handler";

const logger = createLogger({ feature: "api/chat/azure" });

// Input Token Limits for Azure OpenAI Models (based on official specs)
const MODEL_TOKEN_LIMITS = {
  "gpt-4-turbo-preview": 128000,
  "gpt-4-vision-preview": 128000,
  "gpt-4o": 128000,
  "gpt-5": 272000, // Input: 272,000 tokens
  "gpt-5.1": 272000, // Input: 111,616 tokens (gpt-5.1-chat)
  "o1-preview": 128000,
  "o3-mini": 100000,
  default: 128000,
};

// Output Token Limits for Azure OpenAI Models (based on official specs)
const MODEL_OUTPUT_LIMITS = {
  "gpt-4-turbo-preview": 16384,
  "gpt-4-vision-preview": 16384,
  "gpt-4o": 16384,
  "gpt-5": 128000,
  "gpt-5.1": 128000,
  "o1-preview": 128000,
  "o3-mini": 100000,
  default: 16384,
};

// Helper function to estimate the token limit for a given model
function estimateTokenLimit(text: string) {
  // Rough estimation: 1 token ~= 4 characters
  return Math.ceil(text.length / 4);
}

const handleFunctionCall = async (
  functionName: string,
  functionArguments: any,
  webhooks: WebhookTool[],
  userId: string,
  supabase: any,
  userQuestion?: string,
  azureConfig?: { endpoint: string; apiKey: string; deploymentId: string },
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

              // We don't stream formatted response here because the frontend will poll for updates
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
                provider: "azure",
                azure: azureConfig,
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

      return new Response(stream);
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

      return new Response(stream);
    }
  }

  // Handle existing function calls (non-webhooks)
  const responseBody = buildFunctionCallResponse(
    functionName,
    functionArguments,
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
      actualModel,
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
          provider: "azure",
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

    // Use the accurate token count from build-prompt if available, otherwise estimate
    const totalTokens =
      (json as any).tokenCount ||
      messages.reduce((acc, message) => {
        return (
          acc + (message.content ? estimateTokenLimit(message.content) : 0)
        );
      }, 0);

    // Continue with original Azure OpenAI logic
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

    const tools: ChatCompletionCreateParamsBase["tools"] = getOpenAITools();

    const profile = await getServerProfile();
    checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");

    logger.info("Azure chat request received", {
      model: chatSettings?.model,
      messageCount: messages?.length,
      assistantId: assistant_id,
      hasSequentialProcessing: !!sequentialProcessing?.enabled,
    });

    // Load n8n webhooks for assistant or model (if any assigned)
    let webhookTools: any[] = [];
    let loadedWebhooks: WebhookTool[] = [];
    const userId = profile.user_id;

    try {
      if (userId) {
        // Create Supabase client
        const cookieStore = await cookies();
        const supabase = createClient(cookieStore);

        // Priority 1: Load webhooks for assistant (if assistant is used)
        if (assistant_id) {
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

        // Convert webhooks to OpenAI tool format
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

    const ENDPOINT = profile.azure_openai_endpoint;
    const KEY = profile.azure_openai_api_key;

    let DEPLOYMENT_ID = "";
    switch (chatSettings.model) {
      case "gpt-3.5-turbo":
        DEPLOYMENT_ID = profile.azure_openai_35_turbo_id || "";
        break;
      case "gpt-4-turbo-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_turbo_id || "";
        break;
      case "gpt-4-vision-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
        break;
      case "gpt-4o":
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
        break;
      case "gpt-5":
        DEPLOYMENT_ID = profile.azure_openai_gpt5_id || "gpt-5";
        break;
      case "gpt-5.1":
        DEPLOYMENT_ID = process.env.AZURE_GPT_5_1_NAME || "gpt-5.1";
        break;
      case "o3-mini":
        DEPLOYMENT_ID = (profile as any).azure_openai_o3_mini_id || "o3-mini";
        break;
      default:
        return new Response(JSON.stringify({ message: "Model not found" }), {
          status: 400,
        });
    }
    let apiVersion = "2023-12-01-preview";
    if (chatSettings.model === "o3-mini") {
      apiVersion = "2024-12-01-preview"; // Use the correct API version for o3-mini
    } else {
      apiVersion = "2023-12-01-preview";
    }
    if (!ENDPOINT || !KEY || !DEPLOYMENT_ID) {
      return new Response(
        JSON.stringify({ message: "Azure resources not found" }),
        {
          status: 400,
        },
      );
    }
    const isO3Mini = DEPLOYMENT_ID === "o3-mini";
    const isGpt5 = DEPLOYMENT_ID === "gpt-5" || chatSettings.model === "gpt-5";
    const isGpt5_1 =
      DEPLOYMENT_ID === "gpt-5.1" || chatSettings.model === "gpt-5.1";
    const azureOpenai = new OpenAI({
      apiKey: KEY,
      baseURL: `${ENDPOINT}/openai/deployments/${DEPLOYMENT_ID}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": KEY },
    });
    // Merge webhook tools with existing tools
    // Filter out searchWeb tool if enableSearch is not explicitly true
    const filteredTools = enableSearch
      ? tools
      : tools.filter(
          tool =>
            tool.type === "function" && tool.function.name !== "searchWeb",
        );

    const allTools = [...filteredTools, ...webhookTools];
    // Get the output token limit for this model
    const maxOutputTokens =
      MODEL_OUTPUT_LIMITS[chatSettings.model] || MODEL_OUTPUT_LIMITS.default;

    const response = await azureOpenai.chat.completions.create({
      model: DEPLOYMENT_ID as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      ...(isO3Mini
        ? {
            max_completion_tokens: maxOutputTokens,
            reasoning_effort: "medium",
          }
        : isGpt5_1
          ? {
              max_completion_tokens: maxOutputTokens,
              ...(chatSettings.thinkingProcess &&
              chatSettings.thinkingProcess !== "none"
                ? { reasoning_effort: chatSettings.thinkingProcess as any }
                : {}),
            }
          : isGpt5
            ? {
                max_completion_tokens: maxOutputTokens,
                parallel_tool_calls: false,
              }
            : {
                max_tokens: maxOutputTokens,
                temperature: chatSettings.temperature,
                parallel_tool_calls: false,
              }),
      tools: allTools,
      stream: true,
    });

    const [stream1, stream2] = response.tee();

    let functionArguments = "";
    let functionName = "";
    let isCollectingFunctionArgs = false;
    for await (const part of stream1) {
      const delta = part?.choices[0]?.delta;
      const finishReason = part?.choices[0]?.finish_reason;

      //When openai endpoint returns text response
      if (delta?.content) {
        //If the selected model in chat is gpt-4o, gpt-5, or o3-mini return the streaming response
        if (
          actualModel == "gpt-4o" ||
          actualModel === "o3-mini" ||
          actualModel === "gpt-5" ||
          actualModel === "gpt-5.1"
        ) {
          return await createStreamingResponse(stream2);
        } else if (actualModel == "o1-preview") {
          //Special case for o1Preview in case its selected as current model.
          //This else if condition can be removed by adding o1preview model under different provider than azure/openai
          const responseBody = {
            action: "o1Preview",
          };

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Function-Call": "true",
            },
          });
        } else {
          return new Response(JSON.stringify({ action: false }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Text-Response": "true",
            },
          });
        }
      }

      //Collect function call name and arguments to call the right endpoint
      if (delta?.tool_calls) {
        isCollectingFunctionArgs = true;
        const toolCall = delta.tool_calls[0];

        if (toolCall.function?.name) {
          functionName = toolCall.function.name;
        }

        if (toolCall.function?.arguments) {
          functionArguments += toolCall.function.arguments;
        }
      }

      if (finishReason === "tool_calls" && isCollectingFunctionArgs) {
        const args = JSON.parse(functionArguments);
        const cookieStore = await cookies();
        const supabase = createClient(cookieStore);

        // Get user question
        const userQuestion =
          messages.find(m => m.role === "user")?.content || "";

        // Pass Azure config
        const azureConfig = {
          endpoint: ENDPOINT,
          apiKey: KEY,
          deploymentId: DEPLOYMENT_ID,
        };

        return handleFunctionCall(
          functionName,
          args,
          loadedWebhooks,
          userId,
          supabase,
          userQuestion,
          azureConfig,
          request.headers.get("host") &&
            !request.headers.get("host")?.includes("localhost")
            ? `https://${request.headers.get("host")}`
            : new URL(request.url).origin,
        );
      }
    }

    // If we reach here, it means we collected the stream but didn't return yet
    // This can happen with o3-mini when it streams content in a different pattern
    // Return the stream response for o3-mini
    if (actualModel === "o3-mini") {
      return await createStreamingResponse(stream2);
    }

    // Fallback: return empty response if no content was processed
    return new Response(
      JSON.stringify({ message: "No content received from model" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: unknown) {
    const errorMessage =
      (error as any)?.error?.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    logger.error("Azure chat route error", {
      error: {
        message: errorMessage,
        name: (error as any)?.name,
        stack: (error as any)?.stack,
        statusCode: errorCode,
      },
    });
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
