import { SupabaseClient } from "@supabase/supabase-js";
import { WebhookTool } from "./webhook-loader";
import { AIFormattingConfig } from "./types";
import {
  extractFailedNodeLog,
  pollExecutionUntilComplete,
  fetchN8nExecutionDetails,
} from "./n8n-api-utils";
import mime from "mime-types";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/n8n/webhook-executor" });

/**
 * Execute a webhook with the provided arguments
 * @param supabase - Supabase client instance
 * @param webhook - The webhook configuration
 * @param args - Arguments to send to the webhook
 * @param userId - User ID for logging
 * @returns Response from the webhook
 */
export async function executeWebhook(
  supabase: SupabaseClient,
  webhook: WebhookTool,
  args: any,
  userId: string,
): Promise<any> {
  const startTime = Date.now();

  try {
    const customHeaders =
      typeof webhook.custom_headers === "string"
        ? JSON.parse(webhook.custom_headers)
        : webhook.custom_headers || {};

    let headers: HeadersInit = {
      "Content-Type": "application/json",
      ...customHeaders,
    };
    let body: any = undefined;

    let usedDynamicApproach = false;
    if (webhook.schema) {
      try {
        const schemaInfo = analyzeSchema(webhook.schema);

        if (schemaInfo) {
          const classifiedData = await classifyData(args);
          const selectedContentType = selectContentType(
            schemaInfo,
            classifiedData,
          );
          const requestData = await buildRequestBody(
            selectedContentType,
            args,
            classifiedData,
            supabase,
            args.direct_mode || false, // Pass direct mode flag
          );

          headers = {
            ...customHeaders,
            ...requestData.headers,
          };
          body = requestData.body;
          usedDynamicApproach = true;
        }
      } catch (schemaError) {
        logger.warn(
          "Schema-driven approach failed, falling back to simple JSON",
          {
            error:
              schemaError instanceof Error
                ? { message: schemaError.message, name: schemaError.name }
                : schemaError,
          },
        );
      }
    }

    if (!usedDynamicApproach) {
      if (
        ["POST", "PUT", "PATCH"].includes(webhook.http_method.toUpperCase())
      ) {
        body = JSON.stringify(args);
      }
    }

    const options: RequestInit = {
      method: webhook.http_method,
      headers,
      body,
      signal: AbortSignal.timeout(60000),
    };

    const response = await fetch(webhook.webhook_url, options);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Webhook failed", { status: response.status, errorText });

      await logWebhookExecution(
        supabase,
        webhook.id,
        userId,
        false,
        responseTime,
        `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
        response.status,
      );

      throw new Error(
        `Webhook returned status ${response.status}: ${errorText}`,
      );
    }

    const contentType = response.headers.get("content-type");
    let data;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    await logWebhookExecution(
      supabase,
      webhook.id,
      userId,
      true,
      responseTime,
      undefined,
      response.status,
    );

    return data;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const responseTime = Date.now() - startTime;
    const errorMessage = err.message || "Unknown error";

    logger.error("Webhook execution error", {
      error: { message: err.message, name: err.name },
    });

    await logWebhookExecution(
      supabase,
      webhook.id,
      userId,
      false,
      responseTime,
      errorMessage.substring(0, 500),
      undefined,
    );

    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error(
        `Webhook timeout after 30 seconds. The n8n workflow might be taking too long.`,
      );
    }

    throw new Error(`Webhook execution failed: ${errorMessage}`);
  }
}

/**
 * Execute a webhook asynchronously for thinking steps mode.
 * This triggers the webhook immediately with callback URL and returns execution_id.
 * The frontend then polls for step updates.
 *
 * @param supabase - Supabase client instance
 * @param webhook - The webhook configuration
 * @param args - Arguments to send to the webhook
 * @param userId - User ID for logging
 * @param chatId - Optional chat ID for context
 * @param callbackBaseUrl - Base URL for the callback endpoint (e.g. https://yourdomain.com)
 * @returns Object with execution_id for polling
 */
export async function executeWebhookAsync(
  supabase: SupabaseClient,
  webhook: WebhookTool,
  args: any,
  userId: string,
  chatId?: string,
  callbackBaseUrl?: string,
): Promise<{ execution_id: string; started: boolean }> {
  try {
    // Validate callback secret is configured
    const callbackSecret = process.env.N8N_CALLBACK_SECRET;
    if (!callbackSecret) {
      throw new Error(
        "N8N_CALLBACK_SECRET is not configured. Please set this environment variable to enable thinking steps. " +
          "This secret is required for secure callback authentication between n8n and the application.",
      );
    }

    // Create execution record in database
    const { data: executionData, error: rpcError } = await supabase.rpc(
      "create_workflow_execution",
      {
        p_webhook_id: webhook.id,
        p_user_id: userId,
        p_chat_id: chatId || null,
        p_request_data: args,
        p_timeout_minutes: webhook.timeout_minutes || 15,
      },
    );

    if (rpcError || !executionData) {
      logger.error("Failed to create execution record", { error: rpcError });
      throw new Error("Failed to create execution record");
    }

    const executionId = executionData;
    const callbackUrl = `${callbackBaseUrl || ""}/api/n8n/callback/${executionId}`;

    logger.info("Created async execution", { executionId });

    // Prepare webhook request with execution context
    const customHeaders =
      typeof webhook.custom_headers === "string"
        ? JSON.parse(webhook.custom_headers)
        : webhook.custom_headers || {};

    // CRITICAL: Extract direct_mode flag before building payload
    // This flag is for internal use only and should NOT be sent to n8n
    const directMode = args.direct_mode || false;

    // Remove internal flags from payload - these should never be sent to n8n
    const { direct_mode: _direct_mode, ...cleanArgs } = args;

    const webhookPayload = {
      ...cleanArgs,
      _execution_id: executionId,
      _callback_url: callbackUrl,
    };

    // Use schema-aware content type selection (same as sync webhook)
    let headers: HeadersInit = {
      "Content-Type": "application/json",
      ...customHeaders,
    };
    let body: any = JSON.stringify(webhookPayload);

    // Try to use the schema-based approach for proper file handling
    if (webhook.schema) {
      try {
        const schemaInfo = analyzeSchema(webhook.schema);

        if (schemaInfo) {
          const classifiedData = await classifyData(webhookPayload);
          const selectedContentType = selectContentType(
            schemaInfo,
            classifiedData,
          );
          const requestData = await buildRequestBody(
            selectedContentType,
            webhookPayload,
            classifiedData,
            supabase,
            directMode, // Use the extracted flag
          );

          headers = {
            ...customHeaders,
            ...requestData.headers,
          };
          body = requestData.body;
          logger.info("Using content type for async webhook", {
            contentType: selectedContentType,
          });
        }
      } catch (schemaError) {
        logger.warn(
          "Schema-driven approach failed for async webhook, falling back to JSON",
          {
            error:
              schemaError instanceof Error
                ? { message: schemaError.message, name: schemaError.name }
                : schemaError,
          },
        );
      }
    }

    // Trigger webhook (fire and forget - don't wait for response)
    // n8n is configured to respond immediately with executionId
    fetch(webhook.webhook_url, {
      method: webhook.http_method,
      headers,
      body,
      signal: AbortSignal.timeout(60000), // 60s timeout for file uploads
    })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          logger.error("Async webhook trigger failed", {
            status: response.status,
            errorText,
          });
          // Log failure to statistics and update execution
          await supabase.rpc("log_async_execution_completion", {
            p_execution_id: executionId,
            p_status: "error",
            p_error_message: `Webhook trigger failed: HTTP ${response.status}`,
            p_response_data: null,
          });
          return;
        }

        logger.info("Async webhook triggered successfully");

        // Try to parse the response to get n8n's execution ID
        let n8nExecutionId: string | null = null;
        try {
          const responseData = await response.json();
          n8nExecutionId = responseData.executionId || responseData.id || null;

          if (n8nExecutionId) {
            logger.info("Received n8n execution ID", { n8nExecutionId });
            // Store n8n execution ID
            await supabase.rpc("update_execution_from_callback", {
              p_execution_id: executionId,
              p_status: "running",
              p_n8n_execution_id: n8nExecutionId,
            });
          } else {
            // Update to running without n8n execution ID
            await supabase.rpc("update_execution_from_callback", {
              p_execution_id: executionId,
              p_status: "running",
            });
          }
        } catch (parseError) {
          logger.warn("Could not parse trigger response", {
            error:
              parseError instanceof Error
                ? { message: parseError.message, name: parseError.name }
                : parseError,
          });

          // Get n8n_execution_id from database (it was stored when execution was created)
          const { data: executionRecord } = await supabase
            .from("n8n_workflow_executions")
            .select("n8n_execution_id")
            .eq("id", executionId)
            .single();

          const storedN8nExecutionId = executionRecord?.n8n_execution_id;

          if (storedN8nExecutionId) {
            // Get user's n8n settings for API access
            const { data: profile } = await supabase
              .from("profiles")
              .select("n8n_url, n8n_api_key")
              .eq("user_id", userId)
              .single();

            if (profile?.n8n_api_key && profile?.n8n_url) {
              // Check n8n execution status
              const executionDetails = await fetchN8nExecutionDetails(
                storedN8nExecutionId,
                profile.n8n_api_key,
                profile.n8n_url,
              );

              if (executionDetails && executionDetails.status === "error") {
                // Workflow failed - extract error and log it
                const failedNodeInfo = extractFailedNodeLog(executionDetails);
                const errorMessage = failedNodeInfo
                  ? `[${failedNodeInfo.nodeName}] ${failedNodeInfo.errorMessage}`
                  : "Workflow execution failed";
                const responseData = failedNodeInfo?.fullNodeLog || null;

                logger.error("Workflow failed", { errorMessage });

                await supabase.rpc("log_async_execution_completion", {
                  p_execution_id: executionId,
                  p_status: "error",
                  p_error_message: errorMessage,
                  p_response_data: responseData,
                });
                return;
              }
            }
          }

          // If we couldn't check status or it's not an error, set to running
          await supabase.rpc("update_execution_from_callback", {
            p_execution_id: executionId,
            p_status: "running",
          });
        }

        // Start background polling if we have an n8n execution ID
        if (n8nExecutionId) {
          // Get user's n8n settings for API access
          const { data: profile } = await supabase
            .from("profiles")
            .select("n8n_url, n8n_api_key")
            .eq("user_id", userId)
            .single();

          if (profile?.n8n_api_key && profile?.n8n_url) {
            // Start background polling (don't await - let it run in background)
            pollAndLogExecution(
              supabase,
              executionId,
              n8nExecutionId,
              profile.n8n_api_key,
              profile.n8n_url,
              (webhook.timeout_minutes || 15) * 60 * 1000,
            ).catch(err => {
              logger.error("Background polling failed", {
                error:
                  err instanceof Error
                    ? { message: err.message, name: err.name }
                    : err,
              });
            });
          } else {
            logger.warn("No n8n API credentials found for polling");
          }
        }
      })
      .catch(async error => {
        logger.error("Async webhook trigger error", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
        // Log failure to statistics and update execution
        await supabase.rpc("log_async_execution_completion", {
          p_execution_id: executionId,
          p_status: "error",
          p_error_message: error.message || "Failed to trigger webhook",
          p_response_data: null,
        });
      });

    // Return immediately with execution_id
    return {
      execution_id: executionId,
      started: true,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("executeWebhookAsync error", {
      error: { message: err.message, name: err.name },
    });
    throw new Error(`Failed to start async webhook: ${err.message}`);
  }
}

/**
 * Background function to poll n8n execution status and log completion
 * @param supabase - Supabase client
 * @param executionId - Our internal execution ID
 * @param n8nExecutionId - n8n's execution ID
 * @param apiKey - n8n API key
 * @param baseUrl - n8n base URL
 * @param maxWaitMs - Maximum polling time in ms
 */
async function pollAndLogExecution(
  supabase: SupabaseClient,
  executionId: string,
  n8nExecutionId: string,
  apiKey: string,
  baseUrl: string,
  maxWaitMs: number,
): Promise<void> {
  logger.info("Starting background poll for execution", { n8nExecutionId });

  try {
    const execution = await pollExecutionUntilComplete(
      n8nExecutionId,
      apiKey,
      baseUrl,
      maxWaitMs,
    );

    if (!execution) {
      // Polling timed out or execution not found
      logger.warn("Polling timeout", { n8nExecutionId });
      const { data, error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "timeout",
          p_error_message: "Execution monitoring timed out",
          p_response_data: null,
        },
      );
      if (error) {
        logger.error("RPC error (timeout case)", { error });
      } else {
        logger.info("Successfully logged timeout", { logId: data });
      }
      return;
    }

    if (execution.status === "error") {
      // Extract deep error information
      const failedNodeInfo = extractFailedNodeLog(execution);

      const errorMessage = failedNodeInfo
        ? `[${failedNodeInfo.nodeName}] ${failedNodeInfo.errorMessage}`
        : "Workflow execution failed";

      const responseData = failedNodeInfo?.fullNodeLog || null;

      logger.info("Execution failed", { n8nExecutionId, errorMessage });
      logger.info("Calling RPC with cancelled status", { executionId });

      const { data, error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "cancelled",
          p_error_message: errorMessage,
          p_response_data: responseData,
        },
      );

      if (error) {
        logger.error("RPC error (cancelled case)", { error });
      } else {
        logger.info("Successfully logged failure", { logId: data });
      }
    } else if (execution.status === "success") {
      logger.info("Execution completed successfully", { n8nExecutionId });

      const { data, error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "success",
          p_error_message: null,
          p_response_data: null,
        },
      );

      if (error) {
        logger.error("RPC error (success case)", { error });
      } else {
        logger.info("Successfully logged success", { logId: data });
      }
    } else if (execution.status === "waiting") {
      const { data: _data, error: _error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "timeout",
          p_error_message:
            "Execution timed out while waiting (workflow has a Wait node that exceeded the configured timeout)",
          p_response_data: null,
        },
      );
    } else if (execution.status === "canceled") {
      logger.info("Execution was canceled in n8n", { n8nExecutionId });
      const { data, error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "cancelled",
          p_error_message: "Workflow was canceled in n8n",
          p_response_data: null,
        },
      );
      if (error) {
        logger.error("RPC error (canceled case)", { error });
      } else {
        logger.info("Successfully logged canceled", { logId: data });
      }
    } else {
      // Unknown status
      logger.warn("Execution ended with unknown status", {
        n8nExecutionId,
        status: execution.status,
      });
      const { data, error } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "error",
          p_error_message: `Unexpected execution status: ${execution.status}`,
          p_response_data: null,
        },
      );
      if (error) {
        logger.error("RPC error (unknown status case)", { error });
      } else {
        logger.info("Successfully logged unknown status", { logId: data });
      }
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Polling error", {
      n8nExecutionId,
      error: { message: err.message, name: err.name },
    });
    try {
      const { error: rpcError } = await supabase.rpc(
        "log_async_execution_completion",
        {
          p_execution_id: executionId,
          p_status: "error",
          p_error_message: `Polling failed: ${err.message}`,
          p_response_data: null,
        },
      );
      if (rpcError) {
        logger.error("RPC error in catch block", { error: rpcError });
      }
    } catch (rpcCatchError) {
      logger.error("Failed to log polling error", {
        error:
          rpcCatchError instanceof Error
            ? { message: rpcCatchError.message, name: rpcCatchError.name }
            : rpcCatchError,
      });
    }
  }
}

async function logWebhookExecution(
  supabase: SupabaseClient,
  webhookId: string,
  userId: string,
  success: boolean,
  responseTime: number,
  errorMessage?: string,
  httpStatusCode?: number,
  modelId?: string,
): Promise<void> {
  try {
    const status = success
      ? "success"
      : errorMessage?.toLowerCase().includes("timeout")
        ? "timeout"
        : "error";

    await supabase.from("n8n_webhook_logs").insert({
      webhook_id: webhookId,
      user_id: userId,
      status: status,
      execution_time_ms: responseTime,
      error_message: errorMessage || null,
      http_status_code: httpStatusCode || null,
      model_id: modelId || null,
      request_data: null,
      response_data: null,
      assistant_id: null,
      chat_id: null,
    });
  } catch (error) {
    logger.error("Error logging webhook execution", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
}

export async function formatWebhookResponse(
  webhook: WebhookTool,
  data: any,
  userQuestion?: string,
  aiConfig?: AIFormattingConfig,
): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  try {
    const schema =
      typeof webhook.schema === "string"
        ? JSON.parse(webhook.schema)
        : webhook.schema;

    const responseSchema =
      schema?.responses?.["200"]?.content?.["application/json"]?.schema;

    if (responseSchema?.properties) {
      const propertyNames = Object.keys(responseSchema.properties);

      if (
        propertyNames.length > 0 &&
        typeof data === "object" &&
        data !== null
      ) {
        const firstProperty = propertyNames[0];

        if (data[firstProperty] !== undefined) {
          const value = data[firstProperty];
          return typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2);
        }
      }
    }
  } catch (schemaError) {
    logger.warn("Could not parse response schema", {
      error:
        schemaError instanceof Error
          ? { message: schemaError.message, name: schemaError.name }
          : schemaError,
    });
  }

  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return "No results found.";
      }
      if (userQuestion && aiConfig) {
        try {
          const aiFormatted = await formatWithAI(data, userQuestion, aiConfig);
          if (aiFormatted) return aiFormatted;
        } catch (aiError) {
          logger.warn("AI formatting failed, falling back to JSON", {
            error:
              aiError instanceof Error
                ? { message: aiError.message, name: aiError.name }
                : aiError,
          });
        }
      }
      return JSON.stringify(data, null, 2);
    }

    if (data.result !== undefined) {
      return typeof data.result === "string"
        ? data.result
        : JSON.stringify(data.result, null, 2);
    }

    if (data.message !== undefined) {
      return typeof data.message === "string"
        ? data.message
        : JSON.stringify(data.message, null, 2);
    }

    if (data.output !== undefined) {
      return typeof data.output === "string"
        ? data.output
        : JSON.stringify(data.output, null, 2);
    }

    // Try AI formatting before JSON.stringify
    if (userQuestion && aiConfig) {
      try {
        const aiFormatted = await formatWithAI(data, userQuestion, aiConfig);
        if (aiFormatted) return aiFormatted;
      } catch (aiError) {
        logger.warn("AI formatting failed, falling back to JSON", {
          error:
            aiError instanceof Error
              ? { message: aiError.message, name: aiError.name }
              : aiError,
        });
      }
    }

    return JSON.stringify(data, null, 2);
  }

  return String(data);
}

/**
 * Provider-agnostic AI formatting
 */
async function formatWithAI(
  data: any,
  userQuestion: string,
  aiConfig: AIFormattingConfig,
): Promise<string | null> {
  try {
    const jsonString = JSON.stringify(data, null, 2);

    const systemPrompt =
      "You are a helpful assistant that converts structured JSON data into natural, human-readable text responses.";

    const userPrompt = `User Question: "${userQuestion}"

JSON Data:
${jsonString}

Task: Extract the relevant information from the JSON data and provide a natural, conversational response that directly answers the user's question. Format the response clearly and concisely. Do not include JSON syntax in your response.`;

    switch (aiConfig.provider) {
      case "azure":
        return await formatWithAzure(systemPrompt, userPrompt, aiConfig.azure!);

      case "google":
        return await formatWithGoogle(
          systemPrompt,
          userPrompt,
          aiConfig.google!,
        );

      case "deepseek":
        return await formatWithDeepSeek(
          systemPrompt,
          userPrompt,
          aiConfig.deepseek!,
        );

      default:
        logger.warn("Unknown AI provider", { provider: aiConfig.provider });
        return null;
    }
  } catch (error) {
    logger.error("Error in AI formatting", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Format using Azure OpenAI
 */
async function formatWithAzure(
  systemPrompt: string,
  userPrompt: string,
  config: { endpoint: string; apiKey: string; deploymentId: string },
): Promise<string | null> {
  try {
    const OpenAI = (await import("openai")).default;

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: `${config.endpoint}/openai/deployments/${config.deploymentId}`,
      defaultQuery: { "api-version": "2023-12-01-preview" },
      defaultHeaders: { "api-key": config.apiKey },
    });

    const response = await client.chat.completions.create({
      model: config.deploymentId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const formattedText = response.choices[0]?.message?.content?.trim();

    if (formattedText && formattedText.length > 0) {
      logger.info("Successfully formatted with Azure OpenAI");
      return formattedText;
    }

    return null;
  } catch (error) {
    logger.error("Azure formatting error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Format using Google Vertex AI
 */
async function formatWithGoogle(
  systemPrompt: string,
  userPrompt: string,
  config: {
    projectId: string;
    location: string;
    model: string;
    credentials: any;
  },
): Promise<string | null> {
  try {
    const { VertexAI } = await import("@google-cloud/vertexai");

    const vertexAI = new VertexAI({
      project: config.projectId,
      location: config.location,
      googleAuthOptions: {
        credentials: config.credentials,
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      },
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: config.model,
    });

    const result = await generativeModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
    });

    const response = result.response;
    const formattedText =
      response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (formattedText && formattedText.length > 0) {
      logger.info("Successfully formatted with Google Vertex AI");
      return formattedText;
    }

    return null;
  } catch (error) {
    logger.error("Google formatting error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Format using DeepSeek (OpenAI-compatible)
 */
async function formatWithDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  config: { apiKey: string; baseURL?: string },
): Promise<string | null> {
  try {
    const OpenAI = (await import("openai")).default;

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || "https://api.deepseek.com",
    });

    const response = await client.chat.completions.create({
      model: "deepseek-chat", // Use the chat model for formatting
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const formattedText = response.choices[0]?.message?.content?.trim();

    if (formattedText && formattedText.length > 0) {
      logger.info("Successfully formatted with DeepSeek");
      return formattedText;
    }

    return null;
  } catch (error) {
    logger.error("DeepSeek formatting error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

interface SchemaInfo {
  supportedContentTypes: string[];
  contentTypeSchemas: Map<
    string,
    {
      properties: any;
      required: string[];
      additionalProperties?: boolean;
    }
  >;
}

interface ClassifiedData {
  textFields: Record<string, any>;
  fileFields: Record<
    string,
    { type: "fileId" | "url" | "path"; value: string }
  >;
  binaryData: Record<string, Blob | File | (Blob | File)[]>;
}

function analyzeSchema(schema: any): SchemaInfo | null {
  try {
    const parsed = typeof schema === "string" ? JSON.parse(schema) : schema;
    let requestBodyContent: any = null;

    if (parsed?.paths) {
      for (const [_pathName, pathObj] of Object.entries(parsed.paths)) {
        for (const [_method, methodObj] of Object.entries(pathObj as any)) {
          if (
            methodObj &&
            typeof methodObj === "object" &&
            (methodObj as any).requestBody
          ) {
            requestBodyContent = (methodObj as any).requestBody?.content;
            break;
          }
        }

        if (requestBodyContent) break;
      }
    }

    if (!requestBodyContent && parsed?.requestBody?.content) {
      requestBodyContent = parsed.requestBody.content;
    }

    // If schema is just a plain object with properties, wrap it in an OpenAPI structure
    if (
      !requestBodyContent &&
      parsed?.type === "object" &&
      parsed?.properties
    ) {
      // Check if schema has binary fields
      const hasBinaryFields = Object.values(parsed.properties).some(
        (prop: any) => prop.format === "binary" || prop.format === "base64",
      );

      // Create content types based on what the schema needs
      requestBodyContent = {
        "application/json": {
          schema: parsed,
        },
      };

      // Add multipart/form-data if there are binary fields
      if (hasBinaryFields) {
        requestBodyContent["multipart/form-data"] = {
          schema: parsed,
        };
      }
    }

    if (!requestBodyContent) {
      return null;
    }

    const supportedContentTypes = Object.keys(requestBodyContent);

    if (supportedContentTypes.length === 0) {
      return null;
    }

    const contentTypeSchemas = new Map();
    for (const [contentType, spec] of Object.entries(requestBodyContent)) {
      const schemaObj = (spec as any).schema || {};
      const properties = schemaObj.properties || {};
      const required = schemaObj.required || [];

      contentTypeSchemas.set(contentType, {
        properties,
        required,
        additionalProperties: schemaObj.additionalProperties,
      });
    }

    return {
      supportedContentTypes,
      contentTypeSchemas,
    };
  } catch (error) {
    logger.warn("Failed to analyze schema", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

async function classifyData(args: any): Promise<ClassifiedData> {
  const textFields: Record<string, any> = {};
  const fileFields: Record<
    string,
    { type: "fileId" | "url" | "path"; value: string }
  > = {};
  const binaryData: Record<string, Blob | File | (Blob | File)[]> = {};

  // Helper to check if something is File-like
  const isFileLike = (value: any): boolean => {
    if (!value || typeof value !== "object") return false;

    // Check instanceof first (for browser Files)
    if (value instanceof Blob || value instanceof File) return true;

    const hasFileProperties =
      typeof value.name === "string" &&
      typeof value.size === "number" &&
      typeof value.type === "string" &&
      (typeof value.arrayBuffer === "function" ||
        typeof value.stream === "function");

    return hasFileProperties;
  };

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      if (
        value.match(
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
        )
      ) {
        fileFields[key] = { type: "fileId", value };
      } else if (value.startsWith("http://") || value.startsWith("https://")) {
        fileFields[key] = { type: "url", value };
      } else if (
        (value.includes("/") || value.includes("\\")) &&
        !value.includes(" ")
      ) {
        fileFields[key] = { type: "path", value };
      } else {
        textFields[key] = value;
      }
    } else if (isFileLike(value)) {
      binaryData[key] = value as Blob | File;
    } else if (Array.isArray(value)) {
      // Check if array contains Files
      const hasFiles = value.some(item => isFileLike(item));
      if (hasFiles) {
        // Store array as-is - buildRequestBody will handle it
        binaryData[key] = value as (Blob | File)[];
      } else {
        textFields[key] = value;
      }
    } else {
      textFields[key] = value;
    }
  }

  return { textFields, fileFields, binaryData };
}

function selectContentType(
  schemaInfo: SchemaInfo,
  classifiedData: ClassifiedData,
): string {
  const { supportedContentTypes } = schemaInfo;
  const hasBinaryData =
    Object.keys(classifiedData.binaryData).length > 0 ||
    Object.keys(classifiedData.fileFields).length > 0;

  if (hasBinaryData && supportedContentTypes.includes("multipart/form-data")) {
    return "multipart/form-data";
  }

  if (supportedContentTypes.includes("application/json")) {
    return "application/json";
  }

  if (supportedContentTypes.includes("application/x-www-form-urlencoded")) {
    return "application/x-www-form-urlencoded";
  }

  return supportedContentTypes[0] || "application/json";
}

async function fetchFileFromSupabase(
  supabase: SupabaseClient,
  fileId: string,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const { data: fileData, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !fileData) {
    throw new Error(`File not found: ${fileId}`);
  }

  const filePath = fileData.original_file_path || fileData.file_path;

  const originalMimeType = fileData.original_type || fileData.type;

  const { data: blob, error: downloadError } = await supabase.storage
    .from("files")
    .download(filePath);

  if (downloadError || !blob) {
    throw new Error(`Failed to download file: ${downloadError?.message}`);
  }

  const filename = fileData.name || `file-${fileId}`;
  const mimeType = originalMimeType || blob.type || "application/octet-stream";

  let correctedFilename = filename;
  if (fileData.original_file_path && originalMimeType) {
    const expectedExtension = mime.extension(originalMimeType);
    if (expectedExtension) {
      const currentExtension = filename.split(".").pop()?.toLowerCase();
      if (currentExtension !== expectedExtension) {
        // Replace extension or append it
        if (filename.includes(".")) {
          correctedFilename =
            filename.substring(0, filename.lastIndexOf(".")) +
            "." +
            expectedExtension;
        } else {
          correctedFilename = filename + "." + expectedExtension;
        }
      }
    }
  }

  return { blob, filename: correctedFilename, mimeType };
}

async function buildRequestBody(
  contentType: string,
  mappedData: any,
  classifiedData: ClassifiedData,
  supabase: SupabaseClient,
  directMode: boolean = false, // NEW: Direct mode flag
): Promise<{ headers: HeadersInit; body: any }> {
  if (contentType === "multipart/form-data") {
    const formData = new FormData();

    for (const [key, value] of Object.entries(mappedData)) {
      // NEW: Direct mode - handle File/Blob objects directly
      if (directMode) {
        // CRITICAL: In direct mode, we expect File objects, not IDs
        if (value instanceof File || value instanceof Blob) {
          formData.append(
            key,
            value,
            value instanceof File ? value.name : "blob",
          );
          continue;
        }

        // Handle array of Files
        if (Array.isArray(value)) {
          const allFiles = value.every(
            item => item instanceof File || item instanceof Blob,
          );

          if (allFiles) {
            // Append each File object
            for (const file of value) {
              formData.append(
                key,
                file,
                file instanceof File ? file.name : "blob",
              );
            }
            continue;
          }

          // CRITICAL: Check for file IDs (UUID pattern) in file fields - should NEVER happen in direct mode
          // Skip metadata fields
          const isMetadataField = [
            "assistant_id",
            "chat_id",
            "user_id",
            "workspace_id",
            "direct_mode",
            "_execution_id",
            "_callback_url",
          ].includes(key);

          if (!isMetadataField) {
            const hasFileIds = value.some(
              item =>
                typeof item === "string" &&
                item.match(
                  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
                ),
            );

            // Check if this field should contain files (from classifiedData)
            const shouldBeFile = key in classifiedData.binaryData;

            if (hasFileIds && shouldBeFile) {
              throw new Error(
                "[Direct Mode] CRITICAL: File ID detected in file field array in direct mode! " +
                  "Files must be uploaded directly as File objects, not stored in database. " +
                  `Field: ${key}`,
              );
            }
          }

          // Non-file array, append as JSON
          formData.append(key, JSON.stringify(value));
          continue;
        }

        // CRITICAL: Check for single file ID in file fields - should NEVER happen in direct mode
        // Skip metadata fields (assistant_id, chat_id, user_id, _execution_id, etc.)
        const isMetadataField = [
          "assistant_id",
          "chat_id",
          "user_id",
          "workspace_id",
          "direct_mode",
          "_execution_id",
          "_callback_url",
        ].includes(key);

        if (!isMetadataField && typeof value === "string") {
          const isFileId = value.match(
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
          );

          // Check if this field should contain a file (from classifiedData)
          const shouldBeFile = key in classifiedData.binaryData;

          if (isFileId && shouldBeFile) {
            throw new Error(
              "[Direct Mode] CRITICAL: File ID detected in file field in direct mode! " +
                "Files must be uploaded directly as File objects, not stored in database. " +
                `Field: ${key}, Value: ${value}`,
            );
          }
        }

        // Regular field
        formData.append(key, String(value));
        continue;
      }

      // ORIGINAL LOGIC: Normal mode - fetch files from Supabase
      // Handle array of file IDs (multiple files)
      if (Array.isArray(value)) {
        const allUuids = value.every(
          item =>
            typeof item === "string" &&
            item.match(
              /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
            ),
        );

        if (allUuids && value.length > 0) {
          // Fetch and append each file
          for (const fileId of value) {
            try {
              const { blob, filename, mimeType } = await fetchFileFromSupabase(
                supabase,
                fileId,
              );
              const typedBlob = new Blob([blob], { type: mimeType });
              formData.append(key, typedBlob, filename);
            } catch (error) {
              logger.error("Failed to fetch file", {
                fileId,
                error:
                  error instanceof Error
                    ? { message: error.message, name: error.name }
                    : error,
              });
            }
          }
        } else {
          // Non-UUID array, append as JSON string
          formData.append(key, JSON.stringify(value));
        }
        continue;
      }

      // Handle single file ID
      const isFileId =
        typeof value === "string" &&
        value.match(
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
        );

      if (isFileId) {
        try {
          const { blob, filename, mimeType } = await fetchFileFromSupabase(
            supabase,
            value,
          );
          const typedBlob = new Blob([blob], { type: mimeType });
          formData.append(key, typedBlob, filename);
        } catch (error) {
          logger.error("Failed to fetch file", {
            fileId: value,
            error:
              error instanceof Error
                ? { message: error.message, name: error.name }
                : error,
          });
          formData.append(key, value);
        }
      } else {
        formData.append(key, String(value));
      }
    }

    return {
      headers: {},
      body: formData,
    };
  } else if (contentType === "application/json") {
    // NEW: Validate no File objects in JSON mode
    if (directMode) {
      for (const [key, value] of Object.entries(mappedData)) {
        if (value instanceof File || value instanceof Blob) {
          throw new Error(
            "[Direct Mode] Cannot send File objects in application/json mode. " +
              "Use multipart/form-data content type or ensure schema accepts JSON. " +
              `Field: ${key}`,
          );
        }
      }
    }

    const jsonData: any = {};

    for (const [key, value] of Object.entries(mappedData)) {
      const fileField = Object.keys(classifiedData.fileFields).find(
        originalKey =>
          mappedData[key] === classifiedData.fileFields[originalKey].value,
      );

      if (fileField) {
        const fileInfo = classifiedData.fileFields[fileField];
        jsonData[key] = fileInfo.value;
      } else {
        jsonData[key] = value;
      }
    }

    return {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonData),
    };
  } else if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(mappedData)) {
      params.append(key, String(value));
    }

    return {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    };
  } else {
    return {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mappedData),
    };
  }
}
