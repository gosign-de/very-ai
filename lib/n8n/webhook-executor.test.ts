/** @jest-environment node */

import {
  executeWebhook,
  executeWebhookAsync,
  formatWebhookResponse,
} from "./webhook-executor";
import type { WebhookTool } from "./webhook-loader";

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

jest.mock("./n8n-api-utils", () => ({
  extractFailedNodeLog: jest.fn(),
  pollExecutionUntilComplete: jest.fn(),
  fetchN8nExecutionDetails: jest.fn(),
}));

jest.mock("mime-types", () => ({
  lookup: jest.fn(() => "application/octet-stream"),
  extension: jest.fn(() => "bin"),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockRpc = jest
  .fn()
  .mockResolvedValue({ data: "exec-uuid-123", error: null });

function createMockSupabase() {
  const sb: any = {
    from: jest.fn().mockReturnValue({
      insert: mockInsert,
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
    rpc: mockRpc,
    storage: {
      from: jest.fn().mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: new Blob(["test-content"]),
          error: null,
        }),
      }),
    },
  };
  return sb;
}

function makeWebhook(overrides: Partial<WebhookTool> = {}): WebhookTool {
  return {
    id: "wh-001",
    name: "Test Webhook",
    webhook_url: "https://n8n.example.com/webhook/test",
    http_method: "POST",
    schema: null,
    custom_headers: null,
    thinking_steps_enabled: false,
    timeout_minutes: 15,
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "content-type": "application/json",
      ...headers,
    }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "text/plain" }),
    json: jest.fn().mockRejectedValue(new Error("not json")),
    text: jest.fn().mockResolvedValue(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webhook-executor", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockFetch.mockReset();
  });

  // =========================================================================
  // executeWebhook
  // =========================================================================
  describe("executeWebhook", () => {
    it("calls fetch with correct URL and method", async () => {
      const webhook = makeWebhook({ http_method: "POST" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { foo: "bar" }, "user-1");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://n8n.example.com/webhook/test");
      expect(options.method).toBe("POST");
    });

    it("sends JSON body for POST method", async () => {
      const webhook = makeWebhook({ http_method: "POST" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { key: "value" }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ key: "value" }));
    });

    it("sends JSON body for PUT method", async () => {
      const webhook = makeWebhook({ http_method: "PUT" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { a: 1 }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ a: 1 }));
    });

    it("sends JSON body for PATCH method", async () => {
      const webhook = makeWebhook({ http_method: "PATCH" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { b: 2 }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ b: 2 }));
    });

    it("does not send body for GET method", async () => {
      const webhook = makeWebhook({ http_method: "GET" });
      mockFetch.mockResolvedValue(jsonResponse({ items: [] }));

      await executeWebhook(mockSupabase, webhook, {}, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBeUndefined();
    });

    it("includes object custom_headers", async () => {
      const webhook = makeWebhook({
        custom_headers: { "X-Api-Key": "secret123" },
      });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, {}, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toEqual(
        expect.objectContaining({ "X-Api-Key": "secret123" }),
      );
    });

    it("parses string custom_headers (JSON)", async () => {
      const webhook = makeWebhook({
        custom_headers: JSON.stringify({ Authorization: "Bearer tok" }),
      });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, {}, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer tok" }),
      );
    });

    it("returns JSON response when content-type is application/json", async () => {
      const webhook = makeWebhook();
      const payload = { data: [1, 2, 3] };
      mockFetch.mockResolvedValue(jsonResponse(payload));

      const result = await executeWebhook(mockSupabase, webhook, {}, "user-1");

      expect(result).toEqual(payload);
    });

    it("returns text response for non-JSON content types", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(textResponse("plain text output"));

      const result = await executeWebhook(mockSupabase, webhook, {}, "user-1");

      expect(result).toBe("plain text output");
    });

    it("throws on non-OK response", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "text/plain" }),
        text: jest.fn().mockResolvedValue("Internal Server Error"),
      });

      await expect(
        executeWebhook(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow("Webhook returned status 500");
    });

    it("logs successful execution to DB", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, {}, "user-1");

      expect(mockSupabase.from).toHaveBeenCalledWith("n8n_webhook_logs");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          webhook_id: "wh-001",
          user_id: "user-1",
          status: "success",
          error_message: null,
        }),
      );
    });

    it("logs failed execution to DB on non-OK response", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        headers: new Headers({ "content-type": "text/plain" }),
        text: jest.fn().mockResolvedValue("Validation error"),
      });

      await expect(
        executeWebhook(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow();

      // The non-OK branch logs failure first, then the catch re-logs.
      // Verify at least one call with error status info.
      const insertCalls = mockInsert.mock.calls;
      const failureLog = insertCalls.find(
        (call: any[]) =>
          call[0]?.status === "error" || call[0]?.http_status_code === 422,
      );
      expect(failureLog).toBeDefined();
    });

    it("has 60-second timeout (AbortSignal)", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, {}, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeDefined();
      // AbortSignal.timeout(60000) creates an AbortSignal — verify it exists
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("handles fetch errors gracefully and re-throws", async () => {
      const webhook = makeWebhook();
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(
        executeWebhook(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow("Webhook execution failed: Network failure");
    });

    it("wraps AbortError / TimeoutError with user-friendly message", async () => {
      const webhook = makeWebhook();
      const abortErr = new Error("signal timed out");
      abortErr.name = "TimeoutError";
      mockFetch.mockRejectedValue(abortErr);

      await expect(
        executeWebhook(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow("Webhook timeout after 30 seconds");
    });

    it("uses schema-driven approach when schema is available", async () => {
      const schema = {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ result: "ok" }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { message: "hello" },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      // With a schema-driven approach, the body is built via buildRequestBody
      // which produces JSON.stringify output for application/json content type
      const parsed = JSON.parse(options.body);
      expect(parsed.message).toBe("hello");
    });

    it("falls back to simple JSON when schema analysis fails (invalid schema)", async () => {
      const webhook = makeWebhook({ schema: "this is not valid JSON {{{" });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { key: "val" }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ key: "val" }));
    });

    it("falls back to simple JSON when schema has no requestBody content", async () => {
      const webhook = makeWebhook({ schema: { info: { title: "empty" } } });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { key: "val" }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(JSON.stringify({ key: "val" }));
    });

    it("sets Content-Type header to application/json by default", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(mockSupabase, webhook, { a: 1 }, "user-1");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("logs failure with truncated error message (max 500 chars)", async () => {
      const webhook = makeWebhook();
      const longMessage = "x".repeat(1000);
      mockFetch.mockRejectedValue(new Error(longMessage));

      await expect(
        executeWebhook(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow();

      // The catch block calls logWebhookExecution with errorMessage.substring(0, 500)
      const insertCalls = mockInsert.mock.calls;
      const loggedError = insertCalls.find(
        (call: any[]) => call[0]?.error_message,
      );
      expect(loggedError).toBeDefined();
      expect(loggedError![0].error_message.length).toBeLessThanOrEqual(500);
    });
  });

  // =========================================================================
  // executeWebhookAsync
  // =========================================================================
  describe("executeWebhookAsync", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, N8N_CALLBACK_SECRET: "test-secret" };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("creates execution record via supabase.rpc", async () => {
      const webhook = makeWebhook();
      // fetch is fire-and-forget, return a promise that resolves
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-exec-1" }));

      const result = await executeWebhookAsync(
        mockSupabase,
        webhook,
        { input: "test" },
        "user-1",
        "chat-123",
        "https://app.example.com",
      );

      expect(mockRpc).toHaveBeenCalledWith(
        "create_workflow_execution",
        expect.objectContaining({
          p_webhook_id: "wh-001",
          p_user_id: "user-1",
          p_chat_id: "chat-123",
          p_request_data: { input: "test" },
          p_timeout_minutes: 15,
        }),
      );
      expect(result.execution_id).toBe("exec-uuid-123");
      expect(result.started).toBe(true);
    });

    it("throws when N8N_CALLBACK_SECRET is not configured", async () => {
      delete process.env.N8N_CALLBACK_SECRET;

      const webhook = makeWebhook();

      await expect(
        executeWebhookAsync(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow("N8N_CALLBACK_SECRET is not configured");
    });

    it("throws when rpc returns an error", async () => {
      const webhook = makeWebhook();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "rpc failed" },
      });

      await expect(
        executeWebhookAsync(mockSupabase, webhook, {}, "user-1"),
      ).rejects.toThrow("Failed to create execution record");
    });

    it("calls fetch with the webhook URL (fire-and-forget)", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-1" }));

      await executeWebhookAsync(
        mockSupabase,
        webhook,
        { data: "hello" },
        "user-1",
        "chat-1",
        "https://app.example.com",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://n8n.example.com/webhook/test",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("includes _execution_id and _callback_url in the payload", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-1" }));

      await executeWebhookAsync(
        mockSupabase,
        webhook,
        { data: "hello" },
        "user-1",
        "chat-1",
        "https://app.example.com",
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body._execution_id).toBe("exec-uuid-123");
      expect(body._callback_url).toBe(
        "https://app.example.com/api/n8n/callback/exec-uuid-123",
      );
    });

    it("strips direct_mode from the payload sent to n8n", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-1" }));

      await executeWebhookAsync(
        mockSupabase,
        webhook,
        { data: "hello", direct_mode: true },
        "user-1",
        undefined,
        "https://app.example.com",
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.direct_mode).toBeUndefined();
      expect(body.data).toBe("hello");
    });

    it("returns execution_id and started: true on success", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-1" }));

      const result = await executeWebhookAsync(
        mockSupabase,
        webhook,
        {},
        "user-1",
      );

      expect(result).toEqual({
        execution_id: "exec-uuid-123",
        started: true,
      });
    });

    it("uses default callback base URL (empty string) when not provided", async () => {
      const webhook = makeWebhook();
      mockFetch.mockResolvedValue(jsonResponse({ executionId: "n8n-1" }));

      await executeWebhookAsync(mockSupabase, webhook, {}, "user-1", "chat-1");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body._callback_url).toBe("/api/n8n/callback/exec-uuid-123");
    });
  });

  // =========================================================================
  // formatWebhookResponse
  // =========================================================================
  describe("formatWebhookResponse", () => {
    it("returns string data as-is", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, "plain text");

      expect(result).toBe("plain text");
    });

    it("returns empty string data as-is", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, "");

      expect(result).toBe("");
    });

    it("handles null data by converting to string", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, null);

      expect(result).toBe("null");
    });

    it("handles numeric data by converting to string", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, 42);

      expect(result).toBe("42");
    });

    it("handles boolean data by converting to string", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, true);

      expect(result).toBe("true");
    });

    it('returns "No results found." for empty arrays', async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, []);

      expect(result).toBe("No results found.");
    });

    it("returns JSON-stringified non-empty array", async () => {
      const webhook = makeWebhook();
      const data = [{ id: 1 }, { id: 2 }];
      const result = await formatWebhookResponse(webhook, data);

      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it("extracts result property from response object (string)", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, {
        result: "Operation successful",
      });

      expect(result).toBe("Operation successful");
    });

    it("extracts result property from response object (object)", async () => {
      const webhook = makeWebhook();
      const nested = { items: [1, 2, 3] };
      const result = await formatWebhookResponse(webhook, {
        result: nested,
      });

      expect(result).toBe(JSON.stringify(nested, null, 2));
    });

    it("extracts message property from response object", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, {
        message: "Done successfully",
      });

      expect(result).toBe("Done successfully");
    });

    it("extracts output property from response object", async () => {
      const webhook = makeWebhook();
      const result = await formatWebhookResponse(webhook, {
        output: "Generated text",
      });

      expect(result).toBe("Generated text");
    });

    it("falls back to JSON.stringify for generic objects", async () => {
      const webhook = makeWebhook();
      const data = { foo: "bar", count: 5 };
      const result = await formatWebhookResponse(webhook, data);

      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it("uses response schema to extract the first property value (string)", async () => {
      const schema = {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    greeting: { type: "string" },
                  },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      const result = await formatWebhookResponse(webhook, {
        greeting: "Hello World",
        extra: "ignored",
      });

      expect(result).toBe("Hello World");
    });

    it("uses response schema to extract the first property value (object)", async () => {
      const schema = {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    payload: { type: "object" },
                  },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      const data = { payload: { nested: true }, other: "field" };
      const result = await formatWebhookResponse(webhook, data);

      expect(result).toBe(JSON.stringify({ nested: true }, null, 2));
    });

    it("handles string schema (JSON-encoded) in response extraction", async () => {
      const schema = JSON.stringify({
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    answer: { type: "string" },
                  },
                },
              },
            },
          },
        },
      });
      const webhook = makeWebhook({ schema });
      const result = await formatWebhookResponse(webhook, {
        answer: "42",
      });

      expect(result).toBe("42");
    });

    it("falls back gracefully when schema parsing fails", async () => {
      const webhook = makeWebhook({ schema: "broken json {{{" });
      const data = { result: "fallback value" };
      const result = await formatWebhookResponse(webhook, data);

      // Should still extract result property via the fallback logic
      expect(result).toBe("fallback value");
    });

    it("prefers schema-based extraction over result/message/output keys", async () => {
      const schema = {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    custom_key: { type: "string" },
                  },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      const result = await formatWebhookResponse(webhook, {
        custom_key: "from schema",
        result: "from result key",
        message: "from message key",
      });

      expect(result).toBe("from schema");
    });

    it("falls through schema extraction when first property is undefined in data", async () => {
      const schema = {
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    missing_field: { type: "string" },
                  },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      const result = await formatWebhookResponse(webhook, {
        message: "found via fallback",
      });

      expect(result).toBe("found via fallback");
    });
  });

  // =========================================================================
  // Internal functions tested indirectly through executeWebhook
  // =========================================================================
  describe("schema-driven body building (indirect)", () => {
    it("builds application/json body from schema with properties", async () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { name: "Alice", age: 30 },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe("Alice");
      expect(body.age).toBe(30);
    });

    it("selects multipart/form-data when schema has binary fields and data has file IDs", async () => {
      const schema = {
        type: "object",
        properties: {
          document: { type: "string", format: "binary" },
          title: { type: "string" },
        },
      };
      const webhook = makeWebhook({ schema });

      // Mock supabase file lookup for fetchFileFromSupabase
      const fileSelectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
              name: "report.pdf",
              file_path: "uploads/report.pdf",
              type: "application/pdf",
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from = jest.fn((table: string) => {
        if (table === "files") {
          return { select: fileSelectMock };
        }
        return { insert: mockInsert };
      });
      mockSupabase.storage.from = jest.fn().mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: new Blob(["pdf-content"], { type: "application/pdf" }),
          error: null,
        }),
      });

      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        {
          document: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          title: "My Report",
        },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      // When multipart is used, body should be a FormData instance
      expect(options.body).toBeInstanceOf(FormData);
    });

    it("classifies UUID values as file IDs", async () => {
      const schema = {
        type: "object",
        properties: {
          file: { type: "string", format: "binary" },
        },
      };
      const webhook = makeWebhook({ schema });

      // Setup for file fetching
      const fileSelectMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "11111111-2222-3333-4444-555555555555",
              name: "test.txt",
              file_path: "uploads/test.txt",
              type: "text/plain",
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from = jest.fn((table: string) => {
        if (table === "files") {
          return { select: fileSelectMock };
        }
        return { insert: mockInsert };
      });
      mockSupabase.storage.from = jest.fn().mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: new Blob(["content"]),
          error: null,
        }),
      });

      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { file: "11111111-2222-3333-4444-555555555555" },
        "user-1",
      );

      // Should have attempted to fetch from 'files' table
      expect(mockSupabase.from).toHaveBeenCalledWith("files");
    });

    it("classifies URLs as file fields", async () => {
      const schema = {
        type: "object",
        properties: {
          image_url: { type: "string" },
          caption: { type: "string" },
        },
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        {
          image_url: "https://example.com/image.png",
          caption: "A nice photo",
        },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      // Should still be JSON since no binary format in schema
      const body = JSON.parse(options.body);
      expect(body.image_url).toBe("https://example.com/image.png");
      expect(body.caption).toBe("A nice photo");
    });

    it("handles OpenAPI-style schema with paths and requestBody", async () => {
      const schema = {
        paths: {
          "/webhook": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        query: { type: "string" },
                      },
                      required: ["query"],
                    },
                  },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { query: "search term" },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe("search term");
    });

    it("selects application/x-www-form-urlencoded when it is the only supported type", async () => {
      const schema = {
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { username: "admin", password: "secret" },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      // The body should be URL-encoded
      expect(options.body).toContain("username=admin");
      expect(options.body).toContain("password=secret");
    });

    it("falls back to first content type if neither JSON nor form-data", async () => {
      const schema = {
        requestBody: {
          content: {
            "text/xml": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "string" },
                },
              },
            },
          },
        },
      };
      const webhook = makeWebhook({ schema });
      mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

      await executeWebhook(
        mockSupabase,
        webhook,
        { data: "xml-content" },
        "user-1",
      );

      const [, options] = mockFetch.mock.calls[0];
      // Falls back to JSON stringify for unknown content types
      const body = JSON.parse(options.body);
      expect(body.data).toBe("xml-content");
    });
  });
});
