import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { executeWebhookAsync } from "@/lib/n8n/webhook-executor";
import { convertWebhookToOpenAITool } from "@/lib/n8n/webhook-loader";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import logger from "@/app/utils/logger";
import OpenAI from "openai";

/**
 * Direct Execute API Endpoint
 *
 * This endpoint handles direct webhook execution with AI data extraction.
 * Used when a webhook has thinking_steps_enabled (Direct Mode).
 *
 * Key Features:
 * - AI extracts structured data using function calling (reuses existing logic)
 * - Files stay in memory (never stored in DB/storage)
 * - Schema validation after extraction to educate users
 * - Direct n8n webhook execution with thinking steps
 */

/**
 * Extract request schema from OpenAPI 3.0 schema
 */
function extractRequestSchemaFromOpenAPI(schema: any): any {
  // Try paths first (standard OpenAPI 3.0 format)
  if (schema.paths) {
    for (const [_pathName, pathObj] of Object.entries(schema.paths)) {
      for (const [_method, methodObj] of Object.entries(pathObj as any)) {
        const requestBody = (methodObj as any)?.requestBody?.content;
        if (requestBody) {
          const contentType =
            requestBody["multipart/form-data"]?.schema ||
            requestBody["application/json"]?.schema ||
            (Object.values(requestBody)[0] as any)?.schema;

          return contentType;
        }
      }
    }
  }

  // Fallback to direct requestBody
  if (schema.requestBody?.content) {
    const content = schema.requestBody.content;
    return (
      content["multipart/form-data"]?.schema ||
      content["application/json"]?.schema ||
      (Object.values(content)[0] as any)?.schema
    );
  }

  // Fallback to direct properties
  if (schema.properties) {
    return schema;
  }

  return null;
}

/**
 * Validate webhookData structure against schema
 */
function validateWebhookData(
  data: Record<string, any>,
  schema: any,
  _hasFiles: boolean,
): {
  valid: boolean;
  error?: string;
  guidance?: string;
  expectedTypes?: string[];
  requiredFields?: string[];
  maxFileSize?: number;
} {
  const parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;
  const requestSchema = extractRequestSchemaFromOpenAPI(parsedSchema);

  if (!requestSchema || !requestSchema.properties) {
    return { valid: true }; // Can't validate without schema
  }

  const required = requestSchema.required || [];
  const properties = requestSchema.properties;

  // Check required fields
  for (const requiredField of required) {
    if (
      !(requiredField in data) ||
      data[requiredField] === null ||
      data[requiredField] === undefined
    ) {
      // Check if it's a file field
      const prop = properties[requiredField];
      const isFileField =
        (prop?.type === "string" &&
          (prop?.format === "binary" || prop?.format === "base64")) ||
        prop?.type === "file";

      if (isFileField) {
        return {
          valid: false,
          error: "File required",
          guidance: `This workflow requires a file in the '${requiredField}' field. Please upload a file.`,
          requiredFields: required,
        };
      } else {
        return {
          valid: false,
          error: `Missing required field: ${requiredField}`,
          guidance: `This workflow requires the field '${requiredField}'. ${prop?.description || "Please provide this information."}`,
          requiredFields: required,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Extract structured data from user message using AI function calling
 * This reuses the exact same logic as normal chat flow
 */
async function extractStructuredDataWithAI(
  userMessage: string,
  webhook: any,
  profile: any,
  files?: File[],
): Promise<Record<string, any> | null> {
  try {
    // Convert webhook to OpenAI tool format (reuse existing method)
    const tool = convertWebhookToOpenAITool(webhook);

    if (!tool) {
      logger.error("[AI Extract] Failed to convert webhook to tool");
      return null;
    }

    logger.info("[AI Extract] Using AI function calling for data extraction", {
      webhookName: webhook.name,
      toolName: tool.function.name,
      hasFiles: !!(files && files.length > 0),
      fileCount: files?.length || 0,
    });

    // Build user message with file information
    let fullMessage = userMessage;
    if (files && files.length > 0) {
      const fileInfo = files
        .map(f => `${f.name} (${f.type}, ${(f.size / 1024).toFixed(2)}KB)`)
        .join(", ");
      fullMessage = `${userMessage}\n\n[User has uploaded ${files.length} file(s): ${fileInfo}]`;
    }

    // Get Azure OpenAI configuration with fallbacks
    const apiKey =
      profile?.azure_openai_api_key || process.env.AZURE_OPENAI_API_KEY;
    const endpoint =
      profile?.azure_openai_endpoint || process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentId =
      profile?.azure_openai_45_vision_id ||
      process.env.AZURE_GPT_4O_DEPLOYMENT_ID;

    if (!apiKey || !endpoint || !deploymentId) {
      logger.error("[AI Extract] Missing Azure OpenAI configuration");
      return null;
    }

    // Call Azure OpenAI with function calling
    const azureOpenai = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${deploymentId}`,
      defaultQuery: { "api-version": "2024-08-01-preview" },
      defaultHeaders: { "api-key": apiKey },
    });

    const response = await azureOpenai.chat.completions.create({
      model: deploymentId,
      messages: [
        {
          role: "user",
          content: fullMessage,
        },
      ],
      tools: [tool],
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 1000,
    });

    const toolCalls = response.choices?.[0]?.message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      logger.warn("[AI Extract] No tool calls in AI response");
      return null;
    }

    // Extract function arguments (check that it's a function tool call)
    const toolCall = toolCalls[0];
    if (toolCall.type !== "function" || !("function" in toolCall)) {
      logger.warn("[AI Extract] Tool call is not a function type");
      return null;
    }

    const functionCall = toolCall.function;
    const extractedData = JSON.parse(functionCall.arguments);

    logger.success(
      "[AI Extract] Data extracted successfully via function calling",
      {
        webhookName: webhook.name,
        functionName: functionCall.name,
        extractedFields: Object.keys(extractedData),
      },
    );

    return extractedData;
  } catch (error) {
    logger.error("[AI Extract] Error extracting data with AI", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // ============================================================================
    // Step 1: Authentication
    // ============================================================================

    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    const userEmail = sessionData?.session?.user?.email;
    const userName =
      sessionData?.session?.user?.user_metadata?.full_name ||
      sessionData?.session?.user?.user_metadata?.name ||
      sessionData?.session?.user?.email?.split("@")[0];

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    // ============================================================================
    // Step 2: Parse Request Data
    // ============================================================================

    const contentType = request.headers.get("content-type") || "";
    let assistantId: string;
    let chatId: string | undefined;
    let message: string | undefined;
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Handle multipart/form-data (with files)
      const formData = await request.formData();

      assistantId = formData.get("assistant_id") as string;
      chatId = formData.get("chat_id") as string | undefined;
      message = formData.get("message") as string | undefined;

      // Extract files from FormData
      const fileEntries = formData.getAll("files");
      files = fileEntries.filter(
        (entry): entry is File => entry instanceof File,
      );

      // CRITICAL: Validate files are File objects, not IDs
      for (const file of files) {
        if (typeof file === "string") {
          logger.error(
            "[Direct Execute] CRITICAL: File ID detected instead of File object!",
            {
              fileId: file,
              assistantId,
            },
          );
          return NextResponse.json(
            {
              error: "Internal error: Invalid file format",
              details: "Files must be uploaded directly, not as IDs",
            },
            { status: 500 },
          );
        }
      }
    } else {
      // Handle application/json (text only)
      const body = await request.json();
      assistantId = body.assistant_id;
      chatId = body.chat_id;
      message = body.message;
    }

    // Validate required fields
    if (!assistantId) {
      return NextResponse.json(
        { error: "Missing required field: assistant_id" },
        { status: 400 },
      );
    }

    logger.info("[Direct Execute] Request received", {
      assistantId,
      chatId,
      hasMessage: !!message,
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      fileSizes: files.map(f => `${(f.size / 1024).toFixed(2)}KB`),
      userId,
    });

    // ============================================================================
    // Step 3: Load and Validate Webhook
    // ============================================================================

    // Load webhooks ONLY for this specific assistant
    const { data: assignments, error: assignmentsError } = await supabase
      .from("n8n_webhook_assignments")
      .select(
        `
        *,
        n8n_webhooks (
          id,
          name,
          description,
          webhook_url,
          http_method,
          schema,
          custom_headers,
          status,
          thinking_steps_enabled,
          timeout_minutes
        )
      `,
      )
      .eq("entity_type", "assistant")
      .eq("entity_id", assistantId);

    if (assignmentsError) {
      logger.error("[Direct Execute] Error loading webhooks", {
        error: assignmentsError,
        assistantId,
      });
      return NextResponse.json(
        { error: "Failed to load webhook configuration" },
        { status: 500 },
      );
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json(
        {
          error: "No webhook configured",
          guidance:
            "This assistant does not have a webhook configured for direct execution.",
        },
        { status: 404 },
      );
    }

    // Check if this is a signature assistant
    const { data: assistantRoleRecord } = await supabase
      .from("assistants")
      .select("role")
      .eq("id", assistantId)
      .single();

    const isSignatureAssistantRole =
      assistantRoleRecord?.role === "signature-assistant";

    // Signature assistants: any active webhook qualifies
    // Other assistants: only thinking_steps_enabled webhooks qualify
    const directModeWebhooks = assignments.filter((a: any) => {
      const webhook = a.n8n_webhooks;
      if (!webhook || webhook.status !== "active") return false;
      if (isSignatureAssistantRole) return true;
      return webhook.thinking_steps_enabled === true;
    });

    // Validate exactly one direct mode webhook
    if (directModeWebhooks.length === 0) {
      return NextResponse.json(
        {
          error: "No direct mode webhook configured",
          guidance: isSignatureAssistantRole
            ? "This signature assistant does not have an active webhook configured."
            : "This assistant does not have a webhook with thinking steps enabled.",
        },
        { status: 404 },
      );
    }

    if (directModeWebhooks.length > 1) {
      logger.error("[Direct Execute] Multiple direct mode webhooks found", {
        assistantId,
        count: directModeWebhooks.length,
        webhooks: directModeWebhooks.map((w: any) => w.n8n_webhooks?.name),
      });
      return NextResponse.json(
        {
          error: "Configuration error",
          guidance:
            "Multiple direct mode webhooks found for this assistant. " +
            "Only one webhook with thinking steps is allowed per assistant.",
        },
        { status: 500 },
      );
    }

    const webhook = directModeWebhooks[0].n8n_webhooks;

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook data not found" },
        { status: 500 },
      );
    }

    logger.info("[Direct Execute] Webhook loaded", {
      webhookId: webhook.id,
      webhookName: webhook.name,
      assistantId,
      isSignatureAssistant: isSignatureAssistantRole,
    });

    // ============================================================================
    // Step 4: AI Data Extraction & Build Webhook Data
    // ============================================================================

    try {
      // Step 4a: Extract structured data from message using AI
      let webhookData: Record<string, any> = {};

      // Get user profile with environment variables merged (same as normal chat flow)
      const profileData = await getServerProfile();

      if (message) {
        // Use AI function calling to extract structured data (inform AI about files)
        const extractedData = await extractStructuredDataWithAI(
          message,
          webhook,
          profileData,
          files.length > 0 ? files : undefined,
        );

        if (extractedData) {
          // Use AI-extracted structured data
          webhookData = { ...extractedData };
        } else {
          logger.warn("[Direct Execute] AI extraction returned null", {
            webhookId: webhook.id,
          });
        }
      }

      // Step 4b: Map files to extracted schema fields
      if (files.length > 0) {
        const parsedSchema =
          typeof webhook.schema === "string"
            ? JSON.parse(webhook.schema)
            : webhook.schema;
        const requestSchema = extractRequestSchemaFromOpenAPI(parsedSchema);

        if (requestSchema?.properties) {
          const fileFieldNames: string[] = [];

          // Find all file-type fields in schema
          for (const [propName, propSchema] of Object.entries(
            requestSchema.properties,
          )) {
            const prop = propSchema as any;
            const isFileField =
              (prop.type === "string" &&
                (prop.format === "binary" || prop.format === "base64")) ||
              prop.type === "file" ||
              (prop.type === "array" &&
                prop.items &&
                (prop.items.type === "file" ||
                  (prop.items.type === "string" &&
                    (prop.items.format === "binary" ||
                      prop.items.format === "base64"))));

            if (isFileField) {
              fileFieldNames.push(propName);
            }
          }

          // Assign files to the schema fields
          if (fileFieldNames.length > 0) {
            const primaryFileField = fileFieldNames[0];

            if (files.length === 1) {
              webhookData[primaryFileField] = files[0];
            } else {
              webhookData[primaryFileField] = files;
            }
          } else {
            logger.warn("[Direct Execute] No file fields found in schema", {
              webhookId: webhook.id,
            });
          }
        }
      }

      // Enrich with signature assistant data (person_name, company_name, reference_image)
      if (isSignatureAssistantRole) {
        logger.info(
          "[Direct Execute] Signature assistant detected, enriching webhook data",
          {
            assistantId,
          },
        );

        try {
          // Load assistant files to find reference signature image
          const { data: assistantFileLinks } = await supabase
            .from("assistant_files")
            .select("file_id")
            .eq("assistant_id", assistantId);

          if (assistantFileLinks && assistantFileLinks.length > 0) {
            const fileIds = assistantFileLinks.map((af: any) => af.file_id);
            const { data: assistantFiles } = await supabase
              .from("files")
              .select("*")
              .in("id", fileIds);

            if (assistantFiles) {
              const referenceSignatureFile = assistantFiles.find(
                (f: any) =>
                  f.type?.includes("image") ||
                  f.name?.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp)$/),
              );

              if (referenceSignatureFile?.description) {
                try {
                  const metadata = JSON.parse(
                    referenceSignatureFile.description,
                  );
                  if (metadata.type === "signature_reference") {
                    if (!webhookData.person_name) {
                      webhookData.person_name = metadata.personName || "";
                    }
                    if (!webhookData.company_name) {
                      webhookData.company_name = metadata.companyName || "";
                    }
                    logger.info(
                      "[Direct Execute] Signature metadata extracted",
                      {
                        personName: metadata.personName,
                        companyName: metadata.companyName,
                      },
                    );
                  }
                } catch {
                  logger.warn(
                    "[Direct Execute] Failed to parse signature reference metadata",
                  );
                }
              }

              // Attach reference image to the correct schema field
              if (referenceSignatureFile) {
                const filePath =
                  referenceSignatureFile.original_file_path ||
                  referenceSignatureFile.file_path;

                if (filePath) {
                  try {
                    const { data: fileData, error: downloadError } =
                      await supabase.storage.from("files").download(filePath);

                    if (!downloadError && fileData) {
                      const refFileName =
                        referenceSignatureFile.name || "reference.png";
                      const refFile = new File([fileData], refFileName, {
                        type: fileData.type || "image/png",
                      });

                      let refFieldName = "data1"; // default
                      const parsedSchema =
                        typeof webhook.schema === "string"
                          ? JSON.parse(webhook.schema)
                          : webhook.schema;
                      const reqSchema =
                        extractRequestSchemaFromOpenAPI(parsedSchema);

                      if (reqSchema?.properties) {
                        const fileFieldNames: string[] = [];
                        for (const [propName, propSchema] of Object.entries(
                          reqSchema.properties,
                        )) {
                          const prop = propSchema as any;
                          const isFileField =
                            (prop.type === "string" &&
                              (prop.format === "binary" ||
                                prop.format === "base64")) ||
                            prop.type === "file";
                          if (isFileField) {
                            fileFieldNames.push(propName);
                          }
                        }

                        if (fileFieldNames.length >= 2) {
                          refFieldName = fileFieldNames[1];
                        }
                      }

                      webhookData[refFieldName] = refFile;
                      logger.info(
                        "[Direct Execute] Reference signature image attached",
                        {
                          fileName: refFileName,
                          fileSize: refFile.size,
                          fieldName: refFieldName,
                        },
                      );
                    }
                  } catch (downloadErr) {
                    logger.warn(
                      "[Direct Execute] Failed to download reference image",
                      {
                        error:
                          downloadErr instanceof Error
                            ? downloadErr.message
                            : String(downloadErr),
                      },
                    );
                  }
                }
              }
            }
          }
        } catch (enrichError) {
          logger.warn("[Direct Execute] Error enriching signature data", {
            error:
              enrichError instanceof Error
                ? enrichError.message
                : String(enrichError),
          });
        }
      }

      webhookData.user_id = userId;
      webhookData.user_email = userEmail;
      webhookData.user_name = userName;
      webhookData.direct_mode = true;

      // Skip schema validation for signature assistants
      const validation = isSignatureAssistantRole
        ? { valid: true as const }
        : validateWebhookData(webhookData, webhook.schema, files.length > 0);

      if (!validation.valid) {
        logger.info("[Direct Execute] Schema validation failed", {
          error: validation.error,
          guidance: validation.guidance,
          webhookId: webhook.id,
          assistantId,
          webhookDataFields: Object.keys(webhookData),
        });

        return NextResponse.json(
          {
            error: validation.error,
            guidance: validation.guidance,
            expectedTypes: validation.expectedTypes,
            requiredFields: validation.requiredFields,
            maxFileSize: validation.maxFileSize,
            showToast: true, // Flag to show toast for educational purposes
          },
          { status: 400 },
        );
      }

      logger.info("[Direct Execute] Schema validation passed", {
        webhookId: webhook.id,
        webhookDataFields: Object.keys(webhookData),
      });

      logger.info("[Direct Execute] Starting execution", {
        webhookId: webhook.id,
        hasMessage: !!message,
        fileCount: files.length,
        dataFields: Object.keys(webhookData).filter(k => k !== "direct_mode"),
        assistantId,
      });

      // ============================================================================
      // Step 5: Execute Webhook - Handle multiple files sequentially on server
      // ============================================================================

      // Use NEXTAUTH_URL for callback URL (required for production environments) and N8N_CALLBACK_URL for local development
      const baseUrl =
        process.env.N8N_CALLBACK_URL ||
        process.env.NEXTAUTH_URL ||
        request.url.split("/api")[0];

      // If multiple files, process each one sequentially
      if (files.length > 1) {
        const results: Array<{
          fileName: string;
          success: boolean;
          execution_id?: string;
          error?: string;
        }> = [];

        // Get schema info for file field mapping
        const parsedSchema =
          typeof webhook.schema === "string"
            ? JSON.parse(webhook.schema)
            : webhook.schema;
        const requestSchema = extractRequestSchemaFromOpenAPI(parsedSchema);
        let primaryFileField = "file"; // default

        if (requestSchema?.properties) {
          for (const [propName, propSchema] of Object.entries(
            requestSchema.properties,
          )) {
            const prop = propSchema as any;
            const isFileField =
              (prop.type === "string" &&
                (prop.format === "binary" || prop.format === "base64")) ||
              prop.type === "file" ||
              (prop.type === "array" &&
                prop.items &&
                (prop.items.type === "file" ||
                  (prop.items.type === "string" &&
                    (prop.items.format === "binary" ||
                      prop.items.format === "base64"))));

            if (isFileField) {
              primaryFileField = propName;
              break;
            }
          }
        }

        // Process each file sequentially
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          logger.info("[Direct Execute] Processing file", {
            fileIndex: i + 1,
            totalFiles: files.length,
            fileName: file.name,
            fileSize: file.size,
          });

          try {
            // Create webhookData for this specific file
            const fileWebhookData: Record<string, any> = { ...webhookData };
            // Remove all files, add just this one
            delete fileWebhookData[primaryFileField];
            fileWebhookData[primaryFileField] = file;

            const executionResult = await executeWebhookAsync(
              supabase,
              webhook,
              fileWebhookData,
              userId,
              chatId,
              baseUrl,
            );

            if (executionResult.execution_id) {
              results.push({
                fileName: file.name,
                success: true,
                execution_id: executionResult.execution_id,
              });

              logger.info("[Direct Execute] File processed successfully", {
                fileName: file.name,
                executionId: executionResult.execution_id,
              });
            } else {
              results.push({
                fileName: file.name,
                success: false,
                error: "No execution ID returned",
              });
            }
          } catch (fileError: unknown) {
            const fileErr =
              fileError instanceof Error
                ? fileError
                : new Error(String(fileError));
            results.push({
              fileName: file.name,
              success: false,
              error: fileErr.message || "Unknown error",
            });

            logger.error("[Direct Execute] File processing error", {
              fileName: file.name,
              error: fileErr.message,
            });
            // Continue to next file
          }
        }

        const successCount = results.filter(r => r.success).length;
        const successfulResults = results.filter(r => r.success);

        logger.info("[Direct Execute] Multi-file processing complete", {
          totalFiles: files.length,
          successCount,
          failedCount: files.length - successCount,
        });

        return NextResponse.json({
          success: successCount > 0,
          multi_file: true,
          webhook_name: webhook.name,
          total_files: files.length,
          processed: successCount,
          executions: successfulResults.map(r => ({
            file_name: r.fileName,
            execution_id: r.execution_id,
          })),
          system_message:
            successCount === files.length
              ? `All ${files.length} file(s) sent to ${webhook.name}`
              : `${successCount} of ${files.length} file(s) sent to ${webhook.name}`,
        });
      }

      // Single file or no files - original logic
      const executionResult = await executeWebhookAsync(
        supabase,
        webhook,
        webhookData,
        userId,
        chatId,
        baseUrl,
      );

      if (!executionResult.execution_id) {
        return NextResponse.json(
          { error: "Webhook execution failed" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        execution_id: executionResult.execution_id,
        webhook_name: webhook.name,
        system_message:
          files.length > 0
            ? `File sent to ${webhook.name}`
            : `Message sent to ${webhook.name}`,
      });
    } catch (executionError: unknown) {
      const execErr =
        executionError instanceof Error
          ? executionError
          : new Error(String(executionError));
      logger.error("[Direct Execute] Unexpected error during execution", {
        error: execErr.message,
        stack: execErr.stack,
        webhookId: webhook.id,
        assistantId,
      });

      return NextResponse.json(
        {
          error: "Unexpected error during webhook execution",
          details: execErr.message,
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[Direct Execute] Unexpected error in endpoint", {
      error: err.message,
      stack: err.stack,
    });

    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
