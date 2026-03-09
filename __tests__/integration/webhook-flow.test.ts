/** @jest-environment node */

/**
 * Integration tests for the n8n webhook loading -> tool conversion -> execution flow.
 *
 * Strategy: use REAL implementations of the conversion and lookup functions.
 * Mock only the external boundaries — Supabase (database) and the logger.
 */

// ---------------------------------------------------------------------------
// Mocks — external boundaries only
// ---------------------------------------------------------------------------

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  loadWebhooksForEntity,
  convertWebhookToOpenAITool,
  convertWebhookToAnthropicTool,
  convertWebhookToGoogleTool,
  getWebhookByFunctionName,
  WebhookTool,
} from "@/lib/n8n/webhook-loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhook(overrides: Partial<WebhookTool> = {}): WebhookTool {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "Send Notification",
    webhook_url: "https://n8n.example.com/webhook/abc123",
    http_method: "POST",
    schema: {
      description: "Send a notification to a user",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The notification message" },
          recipient: { type: "string", description: "The recipient email" },
        },
        required: ["message"],
      },
    },
    custom_headers: {},
    thinking_steps_enabled: false,
    timeout_minutes: 15,
    ...overrides,
  };
}

function makeOpenApiWebhook(overrides: Partial<WebhookTool> = {}): WebhookTool {
  return {
    id: "f1e2d3c4-b5a6-9087-fedc-ba0987654321",
    name: "Process Document",
    webhook_url: "https://n8n.example.com/webhook/doc123",
    http_method: "POST",
    schema: {
      openapi: "3.0.0",
      info: { title: "Document Processor", description: "Processes documents" },
      paths: {
        "/process": {
          post: {
            description: "Process a document for analysis",
            summary: "Process document",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      document_url: {
                        type: "string",
                        description: "URL of the document",
                      },
                      format: {
                        type: "string",
                        description: "Output format",
                      },
                    },
                    required: ["document_url"],
                  },
                },
              },
            },
          },
        },
      },
    },
    custom_headers: {},
    thinking_steps_enabled: false,
    timeout_minutes: 15,
    ...overrides,
  };
}

/**
 * Create a minimal Supabase mock that chains .from().select().in().eq().eq()
 */
function createSupabaseMock(responseData: any[] | null, error: any = null) {
  const terminalResponse = { data: responseData, error };

  const chainable = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockImplementation(() => {
      // The last .eq() call returns the final response
      // We track call count to return data on the second .eq()
      chainable._eqCount++;
      if (chainable._eqCount >= 2) {
        return terminalResponse;
      }
      return chainable;
    }),
    _eqCount: 0,
  };

  return chainable as any;
}

function createSupabaseWithAssignments(
  assignments: Array<{
    webhook_id: string;
    n8n_webhooks: {
      id: string;
      name: string;
      webhook_url: string;
      http_method: string;
      schema: any;
      custom_headers: any;
      status: string;
      thinking_steps_enabled: boolean;
      timeout_minutes: number;
    };
  }>,
) {
  return createSupabaseMock(assignments);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Webhook Flow Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Load -> Convert -> Lookup pipeline
  // =========================================================================

  describe("Load -> Convert -> Lookup pipeline", () => {
    it("loads webhooks, converts to OpenAI tools, and reverse-looks up by function name", async () => {
      const webhook = makeWebhook();
      const supabase = createSupabaseWithAssignments([
        {
          webhook_id: webhook.id,
          n8n_webhooks: {
            id: webhook.id,
            name: webhook.name,
            webhook_url: webhook.webhook_url,
            http_method: webhook.http_method,
            schema: webhook.schema,
            custom_headers: webhook.custom_headers,
            status: "active",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );
      expect(webhooks).toHaveLength(1);

      const tool = convertWebhookToOpenAITool(webhooks[0]);
      expect(tool).not.toBeNull();
      expect(tool!.type).toBe("function");
      expect(tool!.function.name).toMatch(/^n8n_send_notification_/);

      // Reverse lookup should find the same webhook
      const found = getWebhookByFunctionName(tool!.function.name, webhooks);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(webhook.id);
    });

    it("loads webhooks and converts to Anthropic tool format", async () => {
      const webhook = makeWebhook();
      const supabase = createSupabaseWithAssignments([
        {
          webhook_id: webhook.id,
          n8n_webhooks: {
            id: webhook.id,
            name: webhook.name,
            webhook_url: webhook.webhook_url,
            http_method: webhook.http_method,
            schema: webhook.schema,
            custom_headers: webhook.custom_headers,
            status: "active",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "model",
        "model-1",
        "user-1",
      );
      const tool = convertWebhookToAnthropicTool(webhooks[0]);

      expect(tool).not.toBeNull();
      expect(tool!.name).toMatch(/^n8n_send_notification_/);
      expect(tool!.input_schema).toBeDefined();
      expect(tool!.input_schema.type).toBe("object");
      expect(tool!.description).toBe("Send a notification to a user");
    });

    it("loads webhooks and converts to Google tool format", async () => {
      const webhook = makeWebhook();
      const supabase = createSupabaseWithAssignments([
        {
          webhook_id: webhook.id,
          n8n_webhooks: {
            id: webhook.id,
            name: webhook.name,
            webhook_url: webhook.webhook_url,
            http_method: webhook.http_method,
            schema: webhook.schema,
            custom_headers: webhook.custom_headers,
            status: "active",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );
      const tool = convertWebhookToGoogleTool(webhooks[0]);

      expect(tool).not.toBeNull();
      expect(tool!.name).toMatch(/^n8n_send_notification_/);
      expect(tool!.parameters).toBeDefined();
      expect(tool!.parameters.type).toBe("object");
      expect(tool!.description).toBe("Send a notification to a user");
    });

    it("OpenAPI 3.0 schema extraction works across all provider converters", () => {
      const webhook = makeOpenApiWebhook();

      const openai = convertWebhookToOpenAITool(webhook);
      const anthropic = convertWebhookToAnthropicTool(webhook);
      const google = convertWebhookToGoogleTool(webhook);

      // All should extract the same parameters from OpenAPI schema
      expect(openai!.function.parameters.properties).toHaveProperty(
        "document_url",
      );
      expect(openai!.function.parameters.properties).toHaveProperty("format");
      expect(openai!.function.parameters.required).toEqual(["document_url"]);

      expect(anthropic!.input_schema.properties).toHaveProperty("document_url");
      expect(anthropic!.input_schema.properties).toHaveProperty("format");
      expect(anthropic!.input_schema.required).toEqual(["document_url"]);

      expect(google!.parameters.properties).toHaveProperty("document_url");
      expect(google!.parameters.properties).toHaveProperty("format");
      expect(google!.parameters.required).toEqual(["document_url"]);
    });
  });

  // =========================================================================
  // Webhook filtering
  // =========================================================================

  describe("Webhook filtering", () => {
    it("inactive webhooks are filtered out during load", async () => {
      const supabase = createSupabaseWithAssignments([
        {
          webhook_id: "wh-1",
          n8n_webhooks: {
            id: "wh-1",
            name: "Active Webhook",
            webhook_url: "https://n8n.example.com/webhook/1",
            http_method: "POST",
            schema: {
              description: "test",
              parameters: { type: "object", properties: {} },
            },
            custom_headers: {},
            status: "active",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
        {
          webhook_id: "wh-2",
          n8n_webhooks: {
            id: "wh-2",
            name: "Inactive Webhook",
            webhook_url: "https://n8n.example.com/webhook/2",
            http_method: "POST",
            schema: {
              description: "test2",
              parameters: { type: "object", properties: {} },
            },
            custom_headers: {},
            status: "inactive",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );

      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].name).toBe("Active Webhook");
    });

    it("includes owner webhooks when ownerUserId is provided", async () => {
      const supabase = createSupabaseWithAssignments([
        {
          webhook_id: "wh-owner",
          n8n_webhooks: {
            id: "wh-owner",
            name: "Owner Webhook",
            webhook_url: "https://n8n.example.com/webhook/owner",
            http_method: "POST",
            schema: {
              description: "owner hook",
              parameters: { type: "object", properties: {} },
            },
            custom_headers: {},
            status: "active",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
        "owner-user-id",
      );

      // Verify that the .in() call included both user IDs
      expect(supabase.in).toHaveBeenCalledWith("user_id", [
        "user-1",
        "owner-user-id",
      ]);
      expect(webhooks).toHaveLength(1);
    });

    it("returns empty array when no webhooks are assigned", async () => {
      const supabase = createSupabaseMock([]);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );

      expect(webhooks).toEqual([]);
    });

    it("returns empty array when supabase returns null data", async () => {
      const supabase = createSupabaseMock(null);

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );

      expect(webhooks).toEqual([]);
    });

    it("returns empty array on supabase error", async () => {
      const supabase = createSupabaseMock(null, {
        message: "Database unavailable",
        code: "PGRST500",
      });

      const webhooks = await loadWebhooksForEntity(
        supabase,
        "assistant",
        "assistant-1",
        "user-1",
      );

      expect(webhooks).toEqual([]);
    });
  });

  // =========================================================================
  // Schema extraction and conversion
  // =========================================================================

  describe("Schema extraction and conversion", () => {
    it("extracts parameters directly when present at top level", () => {
      const webhook = makeWebhook();
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool!.function.parameters.properties).toHaveProperty("message");
      expect(tool!.function.parameters.properties).toHaveProperty("recipient");
      expect(tool!.function.parameters.required).toEqual(["message"]);
    });

    it("extracts parameters from OpenAPI paths requestBody", () => {
      const webhook = makeOpenApiWebhook();
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool!.function.parameters.properties).toHaveProperty(
        "document_url",
      );
      expect(tool!.function.parameters.properties.document_url.type).toBe(
        "string",
      );
      expect(
        tool!.function.parameters.properties.document_url.description,
      ).toBe("URL of the document");
    });

    it("uses operation description from OpenAPI path when available", () => {
      const webhook = makeOpenApiWebhook();
      const tool = convertWebhookToOpenAITool(webhook);

      // The OpenAPI schema has description "Process a document for analysis" on the method
      expect(tool!.function.description).toBe(
        "Process a document for analysis",
      );
    });

    it("returns null for invalid/unparseable schema without crashing", () => {
      const webhook = makeWebhook({ schema: "{ this is not valid JSON" });
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool).toBeNull();
    });

    it("falls back to empty parameters when schema has no parameters and no paths", () => {
      const webhook = makeWebhook({
        schema: { description: "Minimal webhook" },
      });
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool).not.toBeNull();
      expect(tool!.function.parameters).toEqual({
        type: "object",
        properties: {},
      });
    });

    it("parses string schema correctly", () => {
      const webhook = makeWebhook({
        schema: JSON.stringify({
          description: "String schema test",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
          },
        }),
      });

      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool).not.toBeNull();
      expect(tool!.function.parameters.properties).toHaveProperty("query");
    });
  });

  // =========================================================================
  // Function name generation and reverse lookup
  // =========================================================================

  describe("Function name generation and lookup", () => {
    it("generates consistent function names (same input -> same name)", () => {
      const webhook = makeWebhook();
      const tool1 = convertWebhookToOpenAITool(webhook);
      const tool2 = convertWebhookToOpenAITool(webhook);

      expect(tool1!.function.name).toBe(tool2!.function.name);
    });

    it("generates names prefixed with n8n_", () => {
      const webhook = makeWebhook();
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool!.function.name).toMatch(/^n8n_/);
    });

    it("function names are alphanumeric with underscores only", () => {
      const webhook = makeWebhook({
        name: "Special Ch@r$! Webhook (v2)",
      });
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool!.function.name).toMatch(/^[a-z0-9_]+$/);
    });

    it("getWebhookByFunctionName finds the correct webhook after conversion", () => {
      const webhook1 = makeWebhook({
        id: "11111111-1111-1111-1111-111111111111",
        name: "First Webhook",
      });
      const webhook2 = makeWebhook({
        id: "22222222-2222-2222-2222-222222222222",
        name: "Second Webhook",
      });

      const tool1 = convertWebhookToOpenAITool(webhook1);
      const tool2 = convertWebhookToOpenAITool(webhook2);

      const found1 = getWebhookByFunctionName(tool1!.function.name, [
        webhook1,
        webhook2,
      ]);
      const found2 = getWebhookByFunctionName(tool2!.function.name, [
        webhook1,
        webhook2,
      ]);

      expect(found1).not.toBeNull();
      expect(found1!.id).toBe(webhook1.id);
      expect(found2).not.toBeNull();
      expect(found2!.id).toBe(webhook2.id);
    });

    it("getWebhookByFunctionName returns null for unknown function name", () => {
      const webhook = makeWebhook();
      const found = getWebhookByFunctionName("n8n_nonexistent_00000000", [
        webhook,
      ]);

      expect(found).toBeNull();
    });

    it("function name includes part of the webhook ID for uniqueness", () => {
      const webhook = makeWebhook({
        id: "abcdef12-3456-7890-abcd-ef1234567890",
      });
      const tool = convertWebhookToOpenAITool(webhook);

      // Should contain first 8 chars of ID (hyphens removed)
      expect(tool!.function.name).toContain("abcdef12");
    });
  });

  // =========================================================================
  // Cross-provider format consistency
  // =========================================================================

  describe("Cross-provider format consistency", () => {
    it("all providers use the same function name for the same webhook", () => {
      const webhook = makeWebhook();

      const openai = convertWebhookToOpenAITool(webhook);
      const anthropic = convertWebhookToAnthropicTool(webhook);
      const google = convertWebhookToGoogleTool(webhook);

      expect(openai!.function.name).toBe(anthropic!.name);
      expect(openai!.function.name).toBe(google!.name);
    });

    it("all providers extract the same description", () => {
      const webhook = makeWebhook();

      const openai = convertWebhookToOpenAITool(webhook);
      const anthropic = convertWebhookToAnthropicTool(webhook);
      const google = convertWebhookToGoogleTool(webhook);

      expect(openai!.function.description).toBe(anthropic!.description);
      expect(openai!.function.description).toBe(google!.description);
    });

    it("all providers extract equivalent parameter schemas", () => {
      const webhook = makeWebhook();

      const openai = convertWebhookToOpenAITool(webhook);
      const anthropic = convertWebhookToAnthropicTool(webhook);
      const google = convertWebhookToGoogleTool(webhook);

      // OpenAI uses function.parameters, Anthropic uses input_schema, Google uses parameters
      expect(openai!.function.parameters).toEqual(anthropic!.input_schema);
      expect(openai!.function.parameters).toEqual(google!.parameters);
    });

    it("OpenAI tool has correct top-level shape", () => {
      const webhook = makeWebhook();
      const tool = convertWebhookToOpenAITool(webhook);

      expect(tool).toHaveProperty("type", "function");
      expect(tool).toHaveProperty("function");
      expect(tool!.function).toHaveProperty("name");
      expect(tool!.function).toHaveProperty("description");
      expect(tool!.function).toHaveProperty("parameters");
    });

    it("Anthropic tool has correct top-level shape", () => {
      const webhook = makeWebhook();
      const tool = convertWebhookToAnthropicTool(webhook);

      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("input_schema");
      expect(tool).not.toHaveProperty("type");
    });

    it("Google tool has correct top-level shape", () => {
      const webhook = makeWebhook();
      const tool = convertWebhookToGoogleTool(webhook);

      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(tool).not.toHaveProperty("type");
      expect(tool).not.toHaveProperty("input_schema");
    });
  });
});
