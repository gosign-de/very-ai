import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/n8n/webhook-loader" });

export type WebhookTool = {
  id: string;
  name: string;
  webhook_url: string;
  http_method: string;
  schema: any;
  custom_headers: any;
  thinking_steps_enabled: boolean;
  timeout_minutes: number;
};

/**
 * Load webhooks assigned to a specific model or assistant for the current user
 * Also loads webhooks from the entity owner if it's a shared assistant/model
 * @param supabase - Supabase client instance
 * @param entityType - "model" or "assistant"
 * @param entityId - The model ID or assistant ID
 * @param userId - The current user's ID
 * @param ownerUserId - Optional: The owner's user ID (for shared assistants)
 * @returns Array of webhook tools
 */
export async function loadWebhooksForEntity(
  supabase: SupabaseClient,
  entityType: "model" | "assistant",
  entityId: string,
  userId: string,
  ownerUserId?: string,
): Promise<WebhookTool[]> {
  try {
    const userIdsToCheck = [userId];
    if (ownerUserId && ownerUserId !== userId) {
      userIdsToCheck.push(ownerUserId);
    }
    const { data, error } = await supabase
      .from("n8n_webhook_assignments")
      .select(
        `
        webhook_id,
        n8n_webhooks (
          id,
          name,
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
      .in("user_id", userIdsToCheck)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    if (error) {
      logger.error("Error loading webhooks", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Filter out inactive webhooks and format the response
    const webhooks = data
      .filter((assignment: any) => assignment.n8n_webhooks?.status === "active")
      .map((assignment: any) => ({
        id: assignment.n8n_webhooks.id,
        name: assignment.n8n_webhooks.name,
        webhook_url: assignment.n8n_webhooks.webhook_url,
        http_method: assignment.n8n_webhooks.http_method,
        schema: assignment.n8n_webhooks.schema,
        custom_headers: assignment.n8n_webhooks.custom_headers,
        thinking_steps_enabled:
          assignment.n8n_webhooks.thinking_steps_enabled ?? false,
        timeout_minutes: assignment.n8n_webhooks.timeout_minutes ?? 15,
      }));

    return webhooks;
  } catch (error) {
    logger.error("Error in loadWebhooksForEntity", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
}

/**
 * Convert webhook schema to OpenAI function calling format
 * @param webhook - The webhook tool
 * @returns OpenAI function tool definition
 */
export function convertWebhookToOpenAITool(webhook: WebhookTool) {
  try {
    // Parse schema if it's a string
    const schema =
      typeof webhook.schema === "string"
        ? JSON.parse(webhook.schema)
        : webhook.schema;

    // Extract parameters from OpenAPI 3.0 schema structure
    let parameters = schema.parameters;
    let description =
      schema.description ||
      schema.info?.description ||
      `Call ${webhook.name} webhook`;

    // If no parameters field, try to extract from OpenAPI 3.0 structure
    if (!parameters && schema.paths) {
      // Navigate: paths -> [path] -> [method] -> requestBody -> content -> [contentType] -> schema
      for (const [_pathName, pathObj] of Object.entries(schema.paths)) {
        for (const [_method, methodObj] of Object.entries(pathObj as any)) {
          const requestBodyContent = (methodObj as any)?.requestBody?.content;

          if (requestBodyContent) {
            // Prefer JSON content type for AI function calling
            const contentTypes = Object.keys(requestBodyContent);
            const preferredType = contentTypes.includes("application/json")
              ? "application/json"
              : contentTypes[0];

            const contentSchema = requestBodyContent[preferredType]?.schema;

            if (contentSchema) {
              parameters = {
                type: contentSchema.type || "object",
                properties: contentSchema.properties || {},
                required: contentSchema.required || [],
              };

              // Use operation description if available
              if ((methodObj as any).description) {
                description = (methodObj as any).description;
              } else if ((methodObj as any).summary) {
                description = (methodObj as any).summary;
              }

              logger.info("Extracted parameters from OpenAPI schema", {
                parameterCount: Object.keys(parameters.properties).length,
                webhookName: webhook.name,
              });
              break;
            }
          }
        }
        if (parameters) break;
      }
    }

    // Fallback to empty parameters if nothing found
    if (!parameters) {
      logger.warn("No parameters found in schema, using empty object", {
        webhookName: webhook.name,
      });
      parameters = {
        type: "object",
        properties: {},
      };
    }

    return {
      type: "function" as const,
      function: {
        name: generateFunctionName(webhook.name, webhook.id),
        description: description,
        parameters: parameters,
      },
    };
  } catch (error) {
    logger.error("Error converting webhook to OpenAI tool", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Convert webhook schema to Anthropic tool format
 * @param webhook - The webhook tool
 * @returns Anthropic tool definition
 */
export function convertWebhookToAnthropicTool(webhook: WebhookTool) {
  try {
    const schema =
      typeof webhook.schema === "string"
        ? JSON.parse(webhook.schema)
        : webhook.schema;

    // Extract parameters from OpenAPI 3.0 schema structure (same as OpenAI)
    let parameters = schema.parameters;
    let description =
      schema.description ||
      schema.info?.description ||
      `Call ${webhook.name} webhook`;

    if (!parameters && schema.paths) {
      for (const [_pathName, pathObj] of Object.entries(schema.paths)) {
        for (const [_method, methodObj] of Object.entries(pathObj as any)) {
          const requestBodyContent = (methodObj as any)?.requestBody?.content;

          if (requestBodyContent) {
            const contentTypes = Object.keys(requestBodyContent);
            const preferredType = contentTypes.includes("application/json")
              ? "application/json"
              : contentTypes[0];

            const contentSchema = requestBodyContent[preferredType]?.schema;

            if (contentSchema) {
              parameters = {
                type: contentSchema.type || "object",
                properties: contentSchema.properties || {},
                required: contentSchema.required || [],
              };

              if ((methodObj as any).description) {
                description = (methodObj as any).description;
              } else if ((methodObj as any).summary) {
                description = (methodObj as any).summary;
              }

              break;
            }
          }
        }
        if (parameters) break;
      }
    }

    if (!parameters) {
      parameters = {
        type: "object",
        properties: {},
      };
    }

    return {
      name: generateFunctionName(webhook.name, webhook.id),
      description: description,
      input_schema: parameters,
    };
  } catch (error) {
    logger.error("Error converting webhook to Anthropic tool", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Convert webhook schema to Google Gemini function declaration format
 * @param webhook - The webhook tool
 * @returns Google function declaration
 */
export function convertWebhookToGoogleTool(webhook: WebhookTool) {
  try {
    const schema =
      typeof webhook.schema === "string"
        ? JSON.parse(webhook.schema)
        : webhook.schema;

    // Extract parameters from OpenAPI 3.0 schema structure (same as OpenAI)
    let parameters = schema.parameters;
    let description =
      schema.description ||
      schema.info?.description ||
      `Call ${webhook.name} webhook`;

    if (!parameters && schema.paths) {
      for (const [_pathName, pathObj] of Object.entries(schema.paths)) {
        for (const [_method, methodObj] of Object.entries(pathObj as any)) {
          const requestBodyContent = (methodObj as any)?.requestBody?.content;

          if (requestBodyContent) {
            const contentTypes = Object.keys(requestBodyContent);
            const preferredType = contentTypes.includes("application/json")
              ? "application/json"
              : contentTypes[0];

            const contentSchema = requestBodyContent[preferredType]?.schema;

            if (contentSchema) {
              parameters = {
                type: contentSchema.type || "object",
                properties: contentSchema.properties || {},
                required: contentSchema.required || [],
              };

              if ((methodObj as any).description) {
                description = (methodObj as any).description;
              } else if ((methodObj as any).summary) {
                description = (methodObj as any).summary;
              }

              break;
            }
          }
        }
        if (parameters) break;
      }
    }

    if (!parameters) {
      parameters = {
        type: "object",
        properties: {},
      };
    }

    return {
      name: generateFunctionName(webhook.name, webhook.id),
      description: description,
      parameters: parameters,
    };
  } catch (error) {
    logger.error("Error converting webhook to Google tool", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
}

/**
 * Generate a safe function name from webhook name and ID
 * Function names must be alphanumeric with underscores
 */
function generateFunctionName(name: string, id: string): string {
  // Remove special characters and replace spaces with underscores
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50); // Limit length

  // Add first 8 chars of ID to ensure uniqueness
  const shortId = id.replace(/-/g, "").substring(0, 8);

  return `n8n_${safeName}_${shortId}`;
}

/**
 * Get webhook by function name (reverse lookup)
 * @param functionName - The generated function name
 * @param webhooks - Array of webhook tools
 * @returns The matching webhook or null
 */
export function getWebhookByFunctionName(
  functionName: string,
  webhooks: WebhookTool[],
): WebhookTool | null {
  for (const webhook of webhooks) {
    if (generateFunctionName(webhook.name, webhook.id) === functionName) {
      return webhook;
    }
  }
  return null;
}
