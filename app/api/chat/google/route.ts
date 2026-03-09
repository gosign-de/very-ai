import { ChatSettings, LLMID } from "@/types";
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits";
import {
  VertexAI,
  GenerateContentRequest,
  Tool,
  Content,
  Part,
} from "@google-cloud/vertexai";
import {
  loadWebhooksForEntity,
  convertWebhookToGoogleTool,
  getWebhookByFunctionName,
  WebhookTool,
} from "@/lib/n8n/webhook-loader";
import {
  executeWebhook,
  executeWebhookAsync,
  formatWebhookResponse,
} from "@/lib/n8n/webhook-executor";
import { AIFormattingConfig } from "@/lib/n8n/types";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { createLogger } from "@/lib/logger";
import { getGoogleTools } from "@/lib/chat/tool-definitions";
import {
  buildGoogleFunctionCallResponse,
  GoogleFunctionCallResponse,
} from "@/lib/chat/function-call-handler";

const logger = createLogger({ feature: "api/chat/google" });

// Force Node.js runtime for this route
export const runtime = "nodejs";

// Define a constant for token limits with explicit types
const GEMINI_TOKEN_LIMITS: Record<string, number> = {
  "gemini-1.5-flash-001": 1040384,
  "gemini-1.5-flash-002": 1040384,
  "gemini-2.5-flash": 1048576,
  "gemini-2.5-pro": 1048576,
};

// Define types for message objects to improve type safety
interface MessageContent {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  // Add support for OpenAI-style image_url part
  type?: string;
  image_url?: {
    url: string;
  };
}

interface Message {
  role: string;
  content?: string | MessageContent[];
  parts?: MessageContent[];
}

/**
 * Estimates token count from text using character count as approximation
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokenCount(text: string): number {
  // A more accurate approach would be to use a proper tokenizer
  // This is just a rough approximation at ~4 chars per token
  return Math.ceil(text.length / 4);
}

/**
 * Calculates the token count for a message
 * @param message - The message to calculate tokens for
 * @returns Token count
 */
function calculateMessageTokens(message: Message): number {
  if (!message) return 0;
  let tokenCount = 0;

  if (Array.isArray(message.content)) {
    tokenCount = message.content.reduce((sum, part) => {
      if (part.text) return sum + estimateTokenCount(part.text);
      if (part.inlineData) return sum + 1000; // Estimate for inline data
      return sum;
    }, 0);
  } else if (typeof message.content === "string") {
    tokenCount = estimateTokenCount(message.content);
  } else if (Array.isArray(message.parts)) {
    tokenCount = message.parts.reduce((sum, part) => {
      if (part.text) return sum + estimateTokenCount(part.text);
      if (part.inlineData) return sum + 1000; // Estimate for inline data
      return sum;
    }, 0);
  }

  return tokenCount;
}

/**
 * Tools configuration for Vertex AI - loaded from shared definitions.
 */
const tools: Tool[] = getGoogleTools();

/**
 * API handler for chat completions
 * @param request - The incoming request object
 * @returns Response object with the generated content
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      chatSettings,
      messages,
      assistant_id,
      sequentialProcessing,
      enableSearch,
      enableMaps,
    } = json as {
      chatSettings: ChatSettings;
      messages: Message[];
      assistant_id?: string | null;
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
      enableMaps?: boolean;
    };

    logger.info("Google chat request received", {
      model: chatSettings?.model,
      messageCount: messages?.length,
      assistantId: assistant_id,
      hasSequentialProcessing: !!sequentialProcessing?.enabled,
      enableSearch,
      enableMaps,
    });

    if (sequentialProcessing?.enabled) {
      // Return a response indicating sequential processing is needed
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
          provider: "google",
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

    // Validate essential parameters
    if (!chatSettings?.model) {
      throw new Error("Missing required parameter: model");
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required and must not be empty");
    }
    const totalTokens = messages.reduce(
      (acc, message) => acc + calculateMessageTokens(message),
      0,
    );
    const modelTokenLimit = GEMINI_TOKEN_LIMITS[chatSettings.model] || 1040384;

    if (totalTokens > modelTokenLimit) {
      throw new Error(
        `Input exceeds token limit of ${modelTokenLimit} tokens for model ${chatSettings.model}`,
      );
    }

    // System instructions using user role as required by Gemini
    // In the Google route, modify the system instructions to be more explicit about function calling
    const systemInstructions = {
      role: "user",
      parts: [
        {
          text: `You are a helpful AI assistant capable of answering questions, providing information, writing code, and performing various tasks. You can generate code in any programming language, explain concepts, solve problems, and provide detailed responses.

When processing images, please carefully extract and transcribe all text visible in the images. For images that contain text, analyze the content thoroughly and provide all text found in the image. Maintain original formatting where possible. For tables, preserve the tabular structure. For handwritten text, transcribe it as accurately as possible. For diagrams with text labels, extract all text and describe where the text appears. Always respond in the same language as the user's input.

For specific tasks, use the appropriate function when explicitly requested:
- create_pdf: when user specifically requests to create a PDF document
- generateImage: when user asks to generate, create, or edit images
- crawlWebsite: when user asks to crawl or scrape websites
- searchWeb: when user asks for current information like weather, news, or recent events

For general questions, coding requests, explanations, and most other tasks, provide direct helpful responses without using function calls.`,
        },
      ],
    };

    const messageContents = [
      systemInstructions as Content,
      ...messages.map(msg => {
        // Ensure role is either 'user' or 'assistant'
        const safeRole = msg.role === "system" ? "user" : msg.role;

        // Handle different message content formats
        const parts = Array.isArray(msg.content)
          ? msg.content
          : msg.parts ||
            (typeof msg.content === "string" ? [{ text: msg.content }] : []);

        // Filter out invalid parts and handle correctly
        const safeParts = parts
          .map(part => {
            // Handle OpenAI-style image_url part
            if (
              part &&
              typeof part === "object" &&
              part.type === "image_url" &&
              part.image_url &&
              typeof part.image_url.url === "string"
            ) {
              // Extract base64 and mimeType from data URL
              const match = part.image_url.url.match(
                /^data:(.*?);base64,(.*)$/,
              );
              if (match) {
                const mimeType = match[1] || "image/png";
                const data = match[2];
                return {
                  inlineData: {
                    mimeType,
                    data,
                  },
                } as Part;
              } else {
                return null;
              }
            } else if (part && part.inlineData) {
              if (!part.inlineData.mimeType || !part.inlineData.data) {
                return null;
              }
              return {
                inlineData: {
                  mimeType: part.inlineData.mimeType,
                  data: part.inlineData.data,
                },
              } as Part;
            } else if (part && part.text) {
              return { text: part.text } as Part;
            } else {
              // Fallback for unknown part types
              if (typeof part === "string") {
                return { text: part } as Part;
              }
              return null;
            }
          })
          .filter((part): part is Part => part !== null);

        // Ensure we have at least one valid part
        if (safeParts.length === 0) {
          safeParts.push({
            text: typeof msg.content === "string" ? msg.content : "",
          } as Part);
        }

        return {
          role: safeRole,
          parts: safeParts,
        } as Content;
      }),
    ];

    // Configure generation parameters
    const generationConfig: any = {
      temperature: chatSettings.temperature || 0.7,
    };

    // Only add thinking config for models that support it (Gemini 2.5 Pro and Flash models)
    if (
      chatSettings.model.includes("2.5-pro") ||
      chatSettings.model.includes("2.5-flash")
    ) {
      generationConfig.thinkingConfig = {
        thinkingBudget: -1, // Unlimited thinking budget
        includeThoughts: true, // Enable thinking output in response
      };
    }

    // Only set maxOutputTokens for models other than Gemini 2.5 Pro and 2.5 Flash
    if (
      chatSettings.model !== "gemini-2.5-pro" &&
      chatSettings.model !== "gemini-2.5-flash"
    ) {
      const modelLimits = CHAT_SETTING_LIMITS[chatSettings.model as LLMID];
      const maxOutputTokens = modelLimits?.MAX_TOKEN_OUTPUT_LENGTH || 8192;

      generationConfig.maxOutputTokens = Math.min(
        maxOutputTokens,
        modelTokenLimit - totalTokens,
      );
    }

    // Load n8n webhooks for assistant or model (if any assigned)
    let webhookFunctionDeclarations: any[] = [];
    let loadedWebhooks: WebhookTool[] = [];
    let userId = "";
    let supabase: any = null; // Declare at higher scope for use in streaming loop

    try {
      const profile = await getServerProfile();
      userId = profile.user_id;

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

        // Convert webhooks to Google function declaration format
        webhookFunctionDeclarations = loadedWebhooks
          .map(webhook => convertWebhookToGoogleTool(webhook))
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
    // Filter out searchWeb function based on model and enableSearch:
    // - For Gemini 2.5 Pro: ALWAYS filter out searchWeb (uses native google_search instead)
    // - For other models: Only include searchWeb when enableSearch is true
    const isGemini25Pro = chatSettings.model === "gemini-2.5-pro";
    const isGemini25Flash = chatSettings.model === "gemini-2.5-flash";

    const baseFunctionDeclarations = (
      tools[0] as any
    ).functionDeclarations.filter((fn: any) => {
      // Always exclude searchWeb for Gemini 2.5 Pro (uses native google_search)
      if (isGemini25Pro && fn.name === "searchWeb") {
        return false;
      }
      // For other models, exclude searchWeb when search is not enabled
      if (!enableSearch && fn.name === "searchWeb") {
        return false;
      }
      return true;
    });

    const allTools: Tool[] = [
      {
        functionDeclarations: [
          ...baseFunctionDeclarations,
          ...webhookFunctionDeclarations,
        ],
      } as Tool,
    ];

    // Prepare the request payload
    const requestPayload: GenerateContentRequest = {
      contents: messageContents,
      generationConfig,
      tools: allTools,
    };

    // Add Google Search grounding for Gemini 2.5 Pro
    // Note: When using google_search, we cannot mix it with function declarations
    if (isGemini25Pro && enableSearch) {
      // Use ONLY google_search tool when search is explicitly enabled
      requestPayload.tools = [
        {
          google_search: {},
        } as any,
      ]; // Type assertion needed as google_search is not in the standard Tool type
    } else if ((isGemini25Pro || isGemini25Flash) && enableMaps) {
      // Use ONLY google_maps tool when maps is explicitly enabled
      requestPayload.tools = [
        {
          google_maps: {},
        } as any,
      ];
    }
    // Otherwise, keep the regular function tools
    let serviceAccountCredentials;
    try {
      serviceAccountCredentials = JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || "{}",
      );

      if (!Object.keys(serviceAccountCredentials).length) {
        throw new Error("Service account credentials not found");
      }
    } catch {
      throw new Error("Invalid service account credentials format");
    }

    // Ensure required environment variables are available
    if (
      !process.env.VERTEX_AI_GEMINI_PROJECT_ID ||
      !process.env.VERTEX_AI_GEMINI_LOCATION
    ) {
      throw new Error("Missing required Vertex AI configuration");
    }
    const vertexAI = new VertexAI({
      project: process.env.VERTEX_AI_GEMINI_PROJECT_ID,
      location: process.env.VERTEX_AI_GEMINI_LOCATION,
      googleAuthOptions: {
        credentials: serviceAccountCredentials,
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      },
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: chatSettings.model,
    });

    // Stream the response
    let response;
    try {
      response = await generativeModel.generateContentStream(requestPayload);
    } catch (vertexError: unknown) {
      throw vertexError;
    }

    const encoder = new TextEncoder();

    // First pass: check for function calls and collect thinking
    let hasFunctionCall = false;
    let functionCallData: GoogleFunctionCallResponse | null = null;
    let thinkingContent = "";
    let groundingMetadata: any = null;
    let hasWebhookContent = false;
    let webhookChunks: string[] = [];

    for await (const chunk of response.stream) {
      if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
        const candidateParts = chunk.candidates[0].content.parts;

        for (const part of candidateParts) {
          if (part.text) {
            if ((part as any).thought) {
              thinkingContent += part.text;
            }
          }
          if (part.functionCall) {
            const { name, args } = part.functionCall;

            if (name.startsWith("n8n_")) {
              hasWebhookContent = true;
              const webhook = getWebhookByFunctionName(name, loadedWebhooks);
              if (webhook) {
                try {
                  webhookChunks.push(
                    `<tool-calling>${webhook.name}</tool-calling>`,
                  );

                  if (webhook.thinking_steps_enabled) {
                    // Async execution for thinking steps
                    const { execution_id } = await executeWebhookAsync(
                      supabase,
                      webhook,
                      args,
                      userId,
                      undefined, // chatId
                      process.env.NEXTAUTH_URL ||
                        process.env.NEXT_PUBLIC_APP_URL ||
                        (request.headers.get("host") &&
                        !request.headers.get("host")?.includes("localhost")
                          ? `https://${request.headers.get("host")}`
                          : new URL(request.url).origin),
                    );

                    // Add markers to chunks
                    webhookChunks.push(
                      `<thinking-execution>${execution_id}</thinking-execution>`,
                    );
                    webhookChunks.push(`<tool-complete></tool-complete>`);
                  } else {
                    // Synchronous execution (existing behavior)
                    const result = await executeWebhook(
                      supabase,
                      webhook,
                      args,
                      userId,
                    );
                    const aiConfig: AIFormattingConfig = {
                      provider: "google",
                      google: {
                        projectId: process.env.VERTEX_AI_GEMINI_PROJECT_ID!,
                        location: process.env.VERTEX_AI_GEMINI_LOCATION!,
                        model: chatSettings.model,
                        credentials: serviceAccountCredentials,
                      },
                    };
                    const userMessage = messages.find(m => m.role === "user");
                    const userQuestion =
                      typeof userMessage?.content === "string"
                        ? userMessage.content
                        : (userMessage?.parts?.[0] as any)?.text || "";
                    const formattedResponse = await formatWebhookResponse(
                      webhook,
                      result,
                      userQuestion,
                      aiConfig,
                    );
                    webhookChunks.push(`<tool-complete></tool-complete>`);
                    webhookChunks.push(formattedResponse);
                  }
                } catch (error: unknown) {
                  const err =
                    error instanceof Error ? error : new Error(String(error));
                  webhookChunks.push(`<tool-complete></tool-complete>`);
                  webhookChunks.push(`Error executing webhook: ${err.message}`);
                }
              }
            } else {
              functionCallData = buildGoogleFunctionCallResponse(name, args);
              hasFunctionCall = true;
            }
          }
        }

        if (chunk.candidates[0].groundingMetadata) {
          groundingMetadata = chunk.candidates[0].groundingMetadata;
        }
      }
    }

    // Handle function calls - return immediately without streaming
    if (hasFunctionCall && functionCallData) {
      return new Response(
        JSON.stringify({
          tool_calls: [
            {
              function: {
                name:
                  functionCallData.originalFunctionName ||
                  functionCallData.action ||
                  "generateImage",
                arguments: JSON.stringify(functionCallData),
              },
            },
          ],
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Function-Call": "true",
          },
        },
      );
    }

    // For regular responses (no function call), stream properly
    const response2 =
      await generativeModel.generateContentStream(requestPayload);

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let thinkingSent = false;

          // Send thinking first if available
          if (thinkingContent && !thinkingSent) {
            controller.enqueue(
              encoder.encode(`<think>${thinkingContent}</think>`),
            );
            thinkingSent = true;
          }

          // Send webhook content if any
          if (hasWebhookContent) {
            webhookChunks.forEach(chunk => {
              controller.enqueue(encoder.encode(chunk));
            });
          }

          // Stream regular content in real-time
          for await (const chunk of response2.stream) {
            if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
              const candidateParts = chunk.candidates[0].content.parts;

              for (const part of candidateParts) {
                if (part.text && !(part as any).thought) {
                  controller.enqueue(encoder.encode(part.text));
                }
              }
            }

            // Also collect grounding metadata from the second pass
            if (chunk.candidates && chunk.candidates[0]?.groundingMetadata) {
              groundingMetadata = {
                ...groundingMetadata,
                ...chunk.candidates[0].groundingMetadata,
              };
            }
          }

          // Add grounding information if available
          if (
            groundingMetadata &&
            (groundingMetadata.searchEntryPoint ||
              groundingMetadata.groundingChunks ||
              groundingMetadata.retrievalMetadata)
          ) {
            const groundingInfo = `\n\n<grounding>\n${JSON.stringify(groundingMetadata, null, 2)}\n</grounding>`;
            controller.enqueue(encoder.encode(groundingInfo));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    // Log full error for debugging
    const errorCode =
      (error as any)?.status || (error as any)?.statusCode || 500;
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";

    logger.error("Google chat route error", {
      error: {
        name: err.name,
        message: errorMessage,
        statusCode: (error as any)?.statusCode,
        errorCode: (error as any)?.errorCode,
        errorDetails: (error as any)?.errorDetails,
        stack: err.stack,
      },
      feature: "api/chat/google",
    });

    // Provide meaningful error messages

    // Handle known error cases
    if (
      errorMessage
        .toLowerCase()
        .includes("service account credentials not found")
    ) {
      errorMessage =
        "Google service account credentials not found. Please set them in your profile settings.";
    } else if (errorMessage.toLowerCase().includes("invalid credentials")) {
      errorMessage =
        "Google service account credentials are invalid. Please check them in your profile settings.";
    } else if (errorMessage.toLowerCase().includes("quota")) {
      errorMessage =
        "API quota exceeded. Please try again later or check your Vertex AI quotas.";
    } else if (errorMessage.includes("exception posting request")) {
      errorMessage =
        "Failed to connect to Vertex AI. This could be due to: " +
        "1) Invalid service account credentials, " +
        "2) Incorrect project ID or location, " +
        "3) API not enabled in your GCP project, " +
        "4) Network/firewall issues. " +
        "Please check your Vertex AI configuration.";
    } else if (
      errorMessage.includes("403") ||
      errorMessage.includes("Permission denied")
    ) {
      errorMessage =
        "Permission denied. Please ensure your service account has the 'Vertex AI User' role in your GCP project.";
    }

    const detailedError = {
      message: errorMessage,
      code:
        (error as any)?.code || (error as any)?.errorCode || "INTERNAL_ERROR",
      status: errorCode,
      details: (error as any)?.errorDetails || err.stack,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(detailedError), {
      status: errorCode,
      headers: { "Content-Type": "application/json" },
    });
  }
}
