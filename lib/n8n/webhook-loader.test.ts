/** @jest-environment node */

import {
  WebhookTool,
  loadWebhooksForEntity,
  convertWebhookToOpenAITool,
  convertWebhookToAnthropicTool,
  convertWebhookToGoogleTool,
  getWebhookByFunctionName,
} from "@/lib/n8n/webhook-loader";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Factories & helpers
// ---------------------------------------------------------------------------

function createWebhook(overrides?: Partial<WebhookTool>): WebhookTool {
  return {
    id: "abc12345-6789-0def-ghij-klmnopqrstuv",
    name: "Test Webhook",
    webhook_url: "https://n8n.example.com/webhook/test",
    http_method: "POST",
    schema: {
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      description: "Test webhook",
    },
    custom_headers: {},
    thinking_steps_enabled: false,
    timeout_minutes: 15,
    ...overrides,
  };
}

function createOpenAPISchema(opts?: {
  contentType?: string;
  extraContentType?: string;
  description?: string;
  summary?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  type?: string;
  topDescription?: string;
}) {
  const contentType = opts?.contentType ?? "application/json";
  const content: Record<string, unknown> = {
    [contentType]: {
      schema: {
        type: opts?.type ?? "object",
        properties: opts?.properties ?? { foo: { type: "string" } },
        required: opts?.required ?? ["foo"],
      },
    },
  };

  if (opts?.extraContentType) {
    content[opts.extraContentType] = {
      schema: {
        type: "object",
        properties: { alt: { type: "number" } },
      },
    };
  }

  const methodObj: Record<string, unknown> = {
    requestBody: { content },
  };
  if (opts?.description) methodObj.description = opts.description;
  if (opts?.summary) methodObj.summary = opts.summary;

  const schema: Record<string, unknown> = {
    paths: {
      "/webhook/test": {
        post: methodObj,
      },
    },
  };
  if (opts?.topDescription) schema.description = opts.topDescription;

  return schema;
}

/** Build a minimal Supabase mock with chainable query builder */
function createSupabaseMock(
  response: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const chain: Record<string, jest.Mock> = {};

  chain.from = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  let eqCount = 0;
  chain.eq = jest.fn().mockImplementation(() => {
    eqCount++;
    if (eqCount >= 2) {
      return Promise.resolve(response);
    }
    return chain;
  });

  // Helper to reset between tests
  chain._reset = jest.fn(() => {
    eqCount = 0;
  });

  return chain as unknown as {
    from: jest.Mock;
    select: jest.Mock;
    in: jest.Mock;
    eq: jest.Mock;
    _reset: jest.Mock;
  };
}

function activeAssignment(webhookOverrides?: Record<string, unknown>) {
  return {
    webhook_id: "wh-1",
    n8n_webhooks: {
      id: "abc12345-6789-0def-ghij-klmnopqrstuv",
      name: "Test Webhook",
      webhook_url: "https://n8n.example.com/webhook/test",
      http_method: "POST",
      schema: { parameters: { type: "object", properties: {} } },
      custom_headers: {},
      status: "active",
      thinking_steps_enabled: false,
      timeout_minutes: 15,
      ...webhookOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webhook-loader", () => {
  // =========================================================================
  // loadWebhooksForEntity
  // =========================================================================
  describe("loadWebhooksForEntity", () => {
    it("queries n8n_webhook_assignments with the correct join select", async () => {
      const sb = createSupabaseMock({ data: [], error: null });

      await loadWebhooksForEntity(sb as any, "assistant", "entity-1", "user-1");

      expect(sb.from).toHaveBeenCalledWith("n8n_webhook_assignments");
      expect(sb.select).toHaveBeenCalledWith(
        expect.stringContaining("n8n_webhooks"),
      );
    });

    it("filters by userId, entityType, and entityId", async () => {
      const sb = createSupabaseMock({ data: [], error: null });

      await loadWebhooksForEntity(sb as any, "model", "m-1", "user-1");

      expect(sb.in).toHaveBeenCalledWith("user_id", ["user-1"]);
      expect(sb.eq).toHaveBeenCalledWith("entity_type", "model");
      expect(sb.eq).toHaveBeenCalledWith("entity_id", "m-1");
    });

    it("includes ownerUserId in the user_id filter when provided", async () => {
      const sb = createSupabaseMock({ data: [], error: null });

      await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
        "owner-1",
      );

      expect(sb.in).toHaveBeenCalledWith("user_id", ["user-1", "owner-1"]);
    });

    it("does not duplicate userId when ownerUserId equals userId", async () => {
      const sb = createSupabaseMock({ data: [], error: null });

      await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
        "user-1",
      );

      expect(sb.in).toHaveBeenCalledWith("user_id", ["user-1"]);
    });

    it("filters out inactive webhooks", async () => {
      const data = [
        activeAssignment(),
        {
          webhook_id: "wh-2",
          n8n_webhooks: {
            id: "inactive-id-0000",
            name: "Inactive",
            webhook_url: "https://example.com",
            http_method: "POST",
            schema: {},
            custom_headers: {},
            status: "inactive",
            thinking_steps_enabled: false,
            timeout_minutes: 15,
          },
        },
      ];
      const sb = createSupabaseMock({ data, error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("abc12345-6789-0def-ghij-klmnopqrstuv");
    });

    it("maps assignment data to WebhookTool format", async () => {
      const data = [activeAssignment()];
      const sb = createSupabaseMock({ data, error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "model",
        "m-1",
        "user-1",
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: "abc12345-6789-0def-ghij-klmnopqrstuv",
          name: "Test Webhook",
          webhook_url: "https://n8n.example.com/webhook/test",
          http_method: "POST",
          thinking_steps_enabled: false,
          timeout_minutes: 15,
        }),
      );
    });

    it("returns empty array on query error", async () => {
      const sb = createSupabaseMock({
        data: null,
        error: { message: "DB connection failed", name: "PostgrestError" },
      });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result).toEqual([]);
    });

    it("returns empty array when no assignments found", async () => {
      const sb = createSupabaseMock({ data: [], error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result).toEqual([]);
    });

    it("returns empty array when data is null", async () => {
      const sb = createSupabaseMock({ data: null, error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result).toEqual([]);
    });

    it("defaults thinking_steps_enabled to false when null", async () => {
      const data = [activeAssignment({ thinking_steps_enabled: null })];
      const sb = createSupabaseMock({ data, error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result[0].thinking_steps_enabled).toBe(false);
    });

    it("defaults timeout_minutes to 15 when null", async () => {
      const data = [activeAssignment({ timeout_minutes: null })];
      const sb = createSupabaseMock({ data, error: null });

      const result = await loadWebhooksForEntity(
        sb as any,
        "assistant",
        "a-1",
        "user-1",
      );

      expect(result[0].timeout_minutes).toBe(15);
    });
  });

  // =========================================================================
  // convertWebhookToOpenAITool
  // =========================================================================
  describe("convertWebhookToOpenAITool", () => {
    it('returns a function tool with type="function"', () => {
      const webhook = createWebhook();
      const result = convertWebhookToOpenAITool(webhook);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("function");
    });

    it("generates the correct function name", () => {
      const webhook = createWebhook();
      const result = convertWebhookToOpenAITool(webhook)!;

      // "Test Webhook" -> "test_webhook", id starts "abc12345-..." -> shortId "abc12345"
      expect(result.function.name).toBe("n8n_test_webhook_abc12345");
    });

    it("extracts parameters from schema.parameters", () => {
      const webhook = createWebhook({
        schema: {
          parameters: {
            type: "object",
            properties: { age: { type: "number" } },
            required: ["age"],
          },
          description: "Age webhook",
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters).toEqual({
        type: "object",
        properties: { age: { type: "number" } },
        required: ["age"],
      });
    });

    it("extracts parameters from OpenAPI 3.0 paths structure", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          properties: { email: { type: "string" } },
          required: ["email"],
        }),
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters.properties).toHaveProperty("email");
      expect(result.function.parameters.required).toContain("email");
    });

    it("prefers application/json content type", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          contentType: "application/json",
          extraContentType: "text/plain",
          properties: { jsonProp: { type: "string" } },
        }),
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters.properties).toHaveProperty("jsonProp");
      expect(result.function.parameters.properties).not.toHaveProperty("alt");
    });

    it("falls back to first content type when no JSON", () => {
      const webhook = createWebhook({
        schema: {
          paths: {
            "/webhook/test": {
              post: {
                requestBody: {
                  content: {
                    "text/xml": {
                      schema: {
                        type: "object",
                        properties: { xmlField: { type: "string" } },
                        required: [],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters.properties).toHaveProperty("xmlField");
    });

    it("uses schema.description when available", () => {
      const webhook = createWebhook({
        schema: {
          parameters: { type: "object", properties: {} },
          description: "Primary description",
          info: { description: "Info description" },
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.description).toBe("Primary description");
    });

    it("falls back to info.description when schema.description is absent", () => {
      const webhook = createWebhook({
        schema: {
          parameters: { type: "object", properties: {} },
          info: { description: "Info level description" },
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.description).toBe("Info level description");
    });

    it('falls back to default "Call {name} webhook" description', () => {
      const webhook = createWebhook({
        name: "My Tool",
        schema: {
          parameters: { type: "object", properties: {} },
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.description).toBe("Call My Tool webhook");
    });

    it("uses operation description from OpenAPI paths", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          description: "Operation-level description",
        }),
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.description).toBe("Operation-level description");
    });

    it("uses operation summary when description is absent in OpenAPI paths", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          summary: "Operation summary",
        }),
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.description).toBe("Operation summary");
    });

    it("returns empty parameters when none found", () => {
      const webhook = createWebhook({
        schema: { someUnknownField: true },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters).toEqual({
        type: "object",
        properties: {},
      });
    });

    it("handles string schema (JSON.parse)", () => {
      const schemaObj = {
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        description: "Parsed from string",
      };
      const webhook = createWebhook({
        schema: JSON.stringify(schemaObj),
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters.properties).toHaveProperty("city");
      expect(result.function.description).toBe("Parsed from string");
    });

    it("returns null on error (invalid JSON string schema)", () => {
      const webhook = createWebhook({
        schema: "{invalid json!!!",
      });

      const result = convertWebhookToOpenAITool(webhook);

      expect(result).toBeNull();
    });

    it("defaults contentSchema.type to 'object' when missing", () => {
      const webhook = createWebhook({
        schema: {
          paths: {
            "/test": {
              post: {
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        properties: { x: { type: "number" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.parameters.type).toBe("object");
    });
  });

  // =========================================================================
  // convertWebhookToAnthropicTool
  // =========================================================================
  describe("convertWebhookToAnthropicTool", () => {
    it("returns Anthropic format with name, description, input_schema", () => {
      const webhook = createWebhook();
      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("input_schema");
      expect(result).not.toHaveProperty("type");
    });

    it("generates the correct function name", () => {
      const webhook = createWebhook();
      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.name).toBe("n8n_test_webhook_abc12345");
    });

    it("extracts parameters from schema.parameters into input_schema", () => {
      const webhook = createWebhook({
        schema: {
          parameters: {
            type: "object",
            properties: { count: { type: "integer" } },
            required: ["count"],
          },
          description: "Counter",
        },
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.input_schema).toEqual({
        type: "object",
        properties: { count: { type: "integer" } },
        required: ["count"],
      });
    });

    it("extracts parameters from OpenAPI paths structure", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          properties: { token: { type: "string" } },
          required: ["token"],
        }),
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.input_schema.properties).toHaveProperty("token");
    });

    it("uses schema.description for description", () => {
      const webhook = createWebhook({
        schema: {
          parameters: { type: "object", properties: {} },
          description: "Anthropic desc",
        },
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.description).toBe("Anthropic desc");
    });

    it("falls back to info.description", () => {
      const webhook = createWebhook({
        schema: {
          parameters: { type: "object", properties: {} },
          info: { description: "From info" },
        },
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.description).toBe("From info");
    });

    it('falls back to default "Call {name} webhook" description', () => {
      const webhook = createWebhook({
        name: "Slack Notifier",
        schema: { parameters: { type: "object", properties: {} } },
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.description).toBe("Call Slack Notifier webhook");
    });

    it("returns empty parameters when none found", () => {
      const webhook = createWebhook({ schema: {} });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.input_schema).toEqual({
        type: "object",
        properties: {},
      });
    });

    it("handles string schema (JSON.parse)", () => {
      const webhook = createWebhook({
        schema: JSON.stringify({
          parameters: {
            type: "object",
            properties: { msg: { type: "string" } },
          },
          description: "Stringified",
        }),
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.input_schema.properties).toHaveProperty("msg");
      expect(result.description).toBe("Stringified");
    });

    it("returns null on error (invalid JSON string schema)", () => {
      const webhook = createWebhook({ schema: "not-valid-json{{{" });

      const result = convertWebhookToAnthropicTool(webhook);

      expect(result).toBeNull();
    });

    it("uses operation description from OpenAPI paths", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          description: "Operation desc for Anthropic",
        }),
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.description).toBe("Operation desc for Anthropic");
    });

    it("uses operation summary when description is absent in OpenAPI paths", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          summary: "Summary for Anthropic",
        }),
      });

      const result = convertWebhookToAnthropicTool(webhook)!;

      expect(result.description).toBe("Summary for Anthropic");
    });
  });

  // =========================================================================
  // convertWebhookToGoogleTool
  // =========================================================================
  describe("convertWebhookToGoogleTool", () => {
    it("returns Google format with name, description, parameters", () => {
      const webhook = createWebhook();
      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("parameters");
      expect(result).not.toHaveProperty("input_schema");
      expect(result).not.toHaveProperty("type");
    });

    it("generates the correct function name", () => {
      const webhook = createWebhook();
      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.name).toBe("n8n_test_webhook_abc12345");
    });

    it("extracts parameters from schema.parameters", () => {
      const webhook = createWebhook({
        schema: {
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
          description: "Search",
        },
      });

      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.parameters).toEqual({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      });
    });

    it("extracts parameters from OpenAPI paths structure", () => {
      const webhook = createWebhook({
        schema: createOpenAPISchema({
          properties: { location: { type: "string" } },
          required: ["location"],
        }),
      });

      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.parameters.properties).toHaveProperty("location");
    });

    it("uses schema.description for description", () => {
      const webhook = createWebhook({
        schema: {
          parameters: { type: "object", properties: {} },
          description: "Google desc",
        },
      });

      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.description).toBe("Google desc");
    });

    it("returns empty parameters when none found", () => {
      const webhook = createWebhook({ schema: { randomKey: true } });

      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.parameters).toEqual({
        type: "object",
        properties: {},
      });
    });

    it("handles string schema (JSON.parse)", () => {
      const webhook = createWebhook({
        schema: JSON.stringify({
          parameters: {
            type: "object",
            properties: { lat: { type: "number" } },
          },
          description: "Geo",
        }),
      });

      const result = convertWebhookToGoogleTool(webhook)!;

      expect(result.parameters.properties).toHaveProperty("lat");
    });

    it("returns null on error (invalid JSON string schema)", () => {
      const webhook = createWebhook({ schema: "{{bad json}}" });

      const result = convertWebhookToGoogleTool(webhook);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // getWebhookByFunctionName
  // =========================================================================
  describe("getWebhookByFunctionName", () => {
    it("finds webhook by generated function name", () => {
      const webhook = createWebhook();
      const webhooks = [webhook];

      const result = getWebhookByFunctionName(
        "n8n_test_webhook_abc12345",
        webhooks,
      );

      expect(result).toBe(webhook);
    });

    it("returns null when no match found", () => {
      const webhook = createWebhook();

      const result = getWebhookByFunctionName("n8n_nonexistent_00000000", [
        webhook,
      ]);

      expect(result).toBeNull();
    });

    it("returns null for empty webhooks array", () => {
      const result = getWebhookByFunctionName("n8n_something_12345678", []);

      expect(result).toBeNull();
    });

    it("handles multiple webhooks and finds the correct one", () => {
      const webhook1 = createWebhook({
        id: "11111111-2222-3333-4444-555555555555",
        name: "First Hook",
      });
      const webhook2 = createWebhook({
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "Second Hook",
      });
      const webhook3 = createWebhook({
        id: "99999999-0000-1111-2222-333333333333",
        name: "Third Hook",
      });

      // "Second Hook" -> "second_hook", id "aaaaaaaa-bbbb-..." -> shortId "aaaaaaaa"
      const result = getWebhookByFunctionName("n8n_second_hook_aaaaaaaa", [
        webhook1,
        webhook2,
        webhook3,
      ]);

      expect(result).toBe(webhook2);
    });
  });

  // =========================================================================
  // generateFunctionName (tested indirectly through public API)
  // =========================================================================
  describe("generateFunctionName (indirect)", () => {
    it("lowercases the name", () => {
      const webhook = createWebhook({ name: "UPPER CASE" });
      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.name).toMatch(/^n8n_upper_case_/);
    });

    it("replaces spaces with underscores", () => {
      const webhook = createWebhook({ name: "multi word name here" });
      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.name).toContain("multi_word_name_here");
      expect(result.function.name).not.toContain(" ");
    });

    it("removes special characters", () => {
      const webhook = createWebhook({ name: "he!!o@wor#ld$" });
      const result = convertWebhookToOpenAITool(webhook)!;

      // After lowering: "he!!o@wor#ld$" -> remove non-[a-z0-9_\s] -> "heoworld"
      expect(result.function.name).toMatch(/^n8n_heoworld_/);
    });

    it("keeps underscores in the name", () => {
      const webhook = createWebhook({ name: "my_webhook_name" });
      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.name).toMatch(/^n8n_my_webhook_name_/);
    });

    it("truncates name portion to 50 characters", () => {
      const longName = "a".repeat(60);
      const webhook = createWebhook({ name: longName });
      const result = convertWebhookToOpenAITool(webhook)!;

      // "n8n_" + truncated(50) + "_" + shortId(8) = n8n_aaa...aaa_abc12345
      const parts = result.function.name.split("_");
      // parts: ["n8n", "aaa...aaa", "abc12345"]
      // The middle part is the truncated name
      const namePart = parts.slice(1, -1).join("_");
      expect(namePart.length).toBeLessThanOrEqual(50);
    });

    it("adds first 8 chars of ID with dashes removed", () => {
      const webhook = createWebhook({
        id: "abcd-ef12-3456-7890-xxxx",
      });
      const result = convertWebhookToOpenAITool(webhook)!;

      // id "abcd-ef12-3456-7890-xxxx" -> remove dashes -> "abcdef1234567890xxxx" -> first 8 -> "abcdef12"
      expect(result.function.name).toMatch(/_abcdef12$/);
    });

    it('prefixes with "n8n_"', () => {
      const webhook = createWebhook();
      const result = convertWebhookToOpenAITool(webhook)!;

      expect(result.function.name).toMatch(/^n8n_/);
    });

    it("handles names with multiple consecutive spaces", () => {
      const webhook = createWebhook({ name: "lots   of   spaces" });
      const result = convertWebhookToOpenAITool(webhook)!;

      // \s+ -> single "_"
      expect(result.function.name).toContain("lots_of_spaces");
    });

    it("handles empty name gracefully", () => {
      const webhook = createWebhook({ name: "" });
      const result = convertWebhookToOpenAITool(webhook)!;

      // empty name => safeName is "", result is "n8n__abc12345"
      expect(result.function.name).toMatch(/^n8n__[a-z0-9]+$/);
    });

    it("handles name with only special characters", () => {
      const webhook = createWebhook({ name: "!@#$%^&*()" });
      const result = convertWebhookToOpenAITool(webhook)!;

      // All removed, safeName = ""
      expect(result.function.name).toMatch(/^n8n__[a-z0-9]+$/);
    });
  });
});
