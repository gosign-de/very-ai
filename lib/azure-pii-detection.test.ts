/** @jest-environment node */

import { PiiDetectionResult, PiiLogs } from "./azure-pii-detection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRecognizePiiEntities = jest.fn();
const mockBeginAnalyzeActions = jest.fn();

jest.mock("@azure/ai-text-analytics", () => ({
  TextAnalyticsClient: jest.fn().mockImplementation(() => ({
    recognizePiiEntities: mockRecognizePiiEntities,
    beginAnalyzeActions: mockBeginAnalyzeActions,
  })),
  AzureKeyCredential: jest.fn().mockImplementation((key: string) => ({ key })),
}));

const mockLoggerError = jest.fn();

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: mockLoggerError,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ENDPOINT = "https://test.cognitiveservices.azure.com";
const TEST_API_KEY = "test-api-key";

function setEnvVars() {
  process.env.AZURE_PII_ENDPOINT = TEST_ENDPOINT;
  process.env.AZURE_PII_API_KEY = TEST_API_KEY;
}

function clearEnvVars() {
  delete process.env.AZURE_PII_ENDPOINT;
  delete process.env.AZURE_PII_API_KEY;
}

/** Build a mock poller whose pollUntilDone returns an async iterable of pages. */
function createMockPoller(pages: any[]) {
  return {
    pollUntilDone: jest.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const page of pages) {
          yield page;
        }
      },
    }),
  };
}

function createMockSupabase(insertResult: { error: any } = { error: null }) {
  const insert = jest.fn().mockResolvedValue(insertResult);
  const from = jest.fn().mockReturnValue({ insert });
  return { client: { from } as any, from, insert };
}

// ---------------------------------------------------------------------------
// Re-import the module under test for every describe so env vars are read
// fresh inside each function call (they are read at call-time, not import-time).
// ---------------------------------------------------------------------------

let detectAndRedactPii: typeof import("./azure-pii-detection").detectAndRedactPii;
let detectAndRedactPiiBatch: typeof import("./azure-pii-detection").detectAndRedactPiiBatch;
let logPiiAudit: typeof import("./azure-pii-detection").logPiiAudit;

beforeAll(async () => {
  const mod = await import("./azure-pii-detection");
  detectAndRedactPii = mod.detectAndRedactPii;
  detectAndRedactPiiBatch = mod.detectAndRedactPiiBatch;
  logPiiAudit = mod.logPiiAudit;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  setEnvVars();
});

afterEach(() => {
  clearEnvVars();
});

// ===========================================================================
// detectAndRedactPii
// ===========================================================================

describe("detectAndRedactPii", () => {
  // ---- environment variable guards ----------------------------------------

  it("throws when AZURE_PII_ENDPOINT is not set", async () => {
    delete process.env.AZURE_PII_ENDPOINT;

    await expect(detectAndRedactPii("hello")).rejects.toThrow(
      "Azure PII detection is not configured",
    );
  });

  it("throws when AZURE_PII_API_KEY is not set", async () => {
    delete process.env.AZURE_PII_API_KEY;

    await expect(detectAndRedactPii("hello")).rejects.toThrow(
      "Azure PII detection is not configured",
    );
  });

  it("throws when both env vars are missing", async () => {
    clearEnvVars();

    await expect(detectAndRedactPii("some text")).rejects.toThrow(
      "AZURE_PII_ENDPOINT and AZURE_PII_API_KEY",
    );
  });

  // ---- client creation ----------------------------------------------------

  it("creates TextAnalyticsClient with correct endpoint and key", async () => {
    const { TextAnalyticsClient, AzureKeyCredential } = jest.requireMock(
      "@azure/ai-text-analytics",
    );

    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "hi", entities: [] },
    ]);

    await detectAndRedactPii("hi");

    expect(AzureKeyCredential).toHaveBeenCalledWith(TEST_API_KEY);
    expect(TextAnalyticsClient).toHaveBeenCalledWith(
      TEST_ENDPOINT,
      expect.objectContaining({ key: TEST_API_KEY }),
    );
  });

  // ---- argument forwarding ------------------------------------------------

  it("passes text, language, and modelVersion to recognizePiiEntities", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "text", entities: [] },
    ]);

    await detectAndRedactPii("some text", "de");

    expect(mockRecognizePiiEntities).toHaveBeenCalledWith(
      ["some text"],
      "de",
      expect.objectContaining({ modelVersion: "latest" }),
    );
  });

  it("passes piiCategories as categoriesFilter when provided", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "text", entities: [] },
    ]);

    await detectAndRedactPii("text", "en", ["Person", "Email"]);

    expect(mockRecognizePiiEntities).toHaveBeenCalledWith(
      ["text"],
      "en",
      expect.objectContaining({
        categoriesFilter: ["Person", "Email"],
      }),
    );
  });

  it("omits categoriesFilter when piiCategories is undefined", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "text", entities: [] },
    ]);

    await detectAndRedactPii("text", "en");

    const options = mockRecognizePiiEntities.mock.calls[0][2];
    expect(options).not.toHaveProperty("categoriesFilter");
  });

  it("omits categoriesFilter when piiCategories is an empty array", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "text", entities: [] },
    ]);

    await detectAndRedactPii("text", "en", []);

    const options = mockRecognizePiiEntities.mock.calls[0][2];
    expect(options).not.toHaveProperty("categoriesFilter");
  });

  // ---- successful results -------------------------------------------------

  it("returns correct PiiDetectionResult with originalText, redactedText, entities", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      {
        redactedText: "Hello, *****",
        entities: [
          {
            text: "World",
            category: "Person",
            confidenceScore: 0.95,
            offset: 7,
            length: 5,
          },
        ],
      },
    ]);

    const result = await detectAndRedactPii("Hello, World");

    expect(result).toEqual<PiiDetectionResult>({
      originalText: "Hello, World",
      redactedText: "Hello, *****",
      entities: [
        {
          text: "World",
          category: "Person",
          confidenceScore: 0.95,
          offset: 7,
          length: 5,
        },
      ],
    });
  });

  it("maps entity fields correctly (text, category, confidenceScore, offset, length)", async () => {
    const rawEntity = {
      text: "john@example.com",
      category: "Email",
      subcategory: "EmailAddress",
      confidenceScore: 0.99,
      offset: 10,
      length: 16,
      // Extra properties from the SDK that should not leak
      someExtraProp: "should be dropped",
    };

    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "redacted", entities: [rawEntity] },
    ]);

    const result = await detectAndRedactPii("Contact: john@example.com");

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toEqual({
      text: "john@example.com",
      category: "Email",
      confidenceScore: 0.99,
      offset: 10,
      length: 16,
    });
    // subcategory and extra props should NOT be present in the mapped entity
    expect(result.entities[0]).not.toHaveProperty("subcategory");
    expect(result.entities[0]).not.toHaveProperty("someExtraProp");
  });

  it("handles empty entities array", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: "clean text", entities: [] },
    ]);

    const result = await detectAndRedactPii("clean text");

    expect(result.entities).toEqual([]);
    expect(result.redactedText).toBe("clean text");
  });

  it("returns original text as redactedText when result.redactedText is undefined", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { redactedText: undefined, entities: [] },
    ]);

    const result = await detectAndRedactPii("no redaction needed");

    expect(result.redactedText).toBe("no redaction needed");
  });

  it("handles multiple entities in a single result", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      {
        redactedText: "*** lives at ***",
        entities: [
          {
            text: "John",
            category: "Person",
            confidenceScore: 0.9,
            offset: 0,
            length: 4,
          },
          {
            text: "123 Main St",
            category: "Address",
            confidenceScore: 0.85,
            offset: 14,
            length: 11,
          },
        ],
      },
    ]);

    const result = await detectAndRedactPii("John lives at 123 Main St");

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].category).toBe("Person");
    expect(result.entities[1].category).toBe("Address");
  });

  // ---- error handling -----------------------------------------------------

  it("throws with descriptive message when result has error property", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { error: { message: "Invalid document" } },
    ]);

    await expect(detectAndRedactPii("bad doc")).rejects.toThrow(
      "PII detection failed",
    );
  });

  it("preserves the Azure error message in the thrown error", async () => {
    mockRecognizePiiEntities.mockResolvedValue([
      { error: { message: "Document too large" } },
    ]);

    await expect(detectAndRedactPii("huge")).rejects.toThrow(
      "Azure PII detection error: Document too large",
    );
  });

  it("throws with wrapped message on API/network error", async () => {
    mockRecognizePiiEntities.mockRejectedValue(new Error("Network timeout"));

    await expect(detectAndRedactPii("text")).rejects.toThrow(
      "PII detection failed: Network timeout",
    );
  });

  it("logs the error before re-throwing", async () => {
    mockRecognizePiiEntities.mockRejectedValue(new Error("connection refused"));

    await expect(detectAndRedactPii("text")).rejects.toThrow();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error in PII detection (simple)",
      expect.objectContaining({
        error: expect.objectContaining({ message: "connection refused" }),
      }),
    );
  });

  it("wraps non-Error thrown values into an Error", async () => {
    mockRecognizePiiEntities.mockRejectedValue("string error");

    await expect(detectAndRedactPii("text")).rejects.toThrow(
      "PII detection failed: string error",
    );
  });
});

// ===========================================================================
// detectAndRedactPiiBatch
// ===========================================================================

describe("detectAndRedactPiiBatch", () => {
  // ---- environment variable guards ----------------------------------------

  it("throws when AZURE_PII_ENDPOINT is not set", async () => {
    delete process.env.AZURE_PII_ENDPOINT;

    await expect(detectAndRedactPiiBatch(["a"])).rejects.toThrow(
      "Azure PII detection is not configured",
    );
  });

  it("throws when AZURE_PII_API_KEY is not set", async () => {
    delete process.env.AZURE_PII_API_KEY;

    await expect(detectAndRedactPiiBatch(["a"])).rejects.toThrow(
      "Azure PII detection is not configured",
    );
  });

  // ---- client creation & argument forwarding ------------------------------

  it("creates client and calls beginAnalyzeActions with correct params", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          {
            results: [{ redactedText: "hi", entities: [] }],
          },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    await detectAndRedactPiiBatch(["hello"], "en");

    expect(mockBeginAnalyzeActions).toHaveBeenCalledWith(
      ["hello"],
      expect.objectContaining({
        recognizePiiEntitiesActions: [
          expect.objectContaining({
            modelVersion: "latest",
            disableServiceLogs: true,
          }),
        ],
      }),
      "en",
    );
  });

  it("passes piiCategories as categoriesFilter in action", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          { results: [{ redactedText: "t", entities: [] }] },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    await detectAndRedactPiiBatch(["text"], "en", ["Email", "PhoneNumber"]);

    const actions = mockBeginAnalyzeActions.mock.calls[0][1];
    expect(actions.recognizePiiEntitiesActions[0]).toHaveProperty(
      "categoriesFilter",
      ["Email", "PhoneNumber"],
    );
  });

  it("omits categoriesFilter when piiCategories is not provided", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          { results: [{ redactedText: "t", entities: [] }] },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    await detectAndRedactPiiBatch(["text"], "en");

    const action =
      mockBeginAnalyzeActions.mock.calls[0][1].recognizePiiEntitiesActions[0];
    expect(action).not.toHaveProperty("categoriesFilter");
  });

  // ---- successful processing ----------------------------------------------

  it("processes single page with multiple documents correctly", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          {
            results: [
              {
                redactedText: "*** says hi",
                entities: [
                  {
                    text: "John",
                    category: "Person",
                    confidenceScore: 0.9,
                    offset: 0,
                    length: 4,
                  },
                ],
              },
              {
                redactedText: "No PII here",
                entities: [],
              },
            ],
          },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch([
      "John says hi",
      "No PII here",
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].originalText).toBe("John says hi");
    expect(results[0].redactedText).toBe("*** says hi");
    expect(results[0].entities).toHaveLength(1);
    expect(results[1].originalText).toBe("No PII here");
    expect(results[1].entities).toEqual([]);
  });

  it("processes multiple paginated results correctly", async () => {
    const page1 = {
      recognizePiiEntitiesResults: [
        {
          results: [{ redactedText: "redacted1", entities: [] }],
        },
      ],
    };
    const page2 = {
      recognizePiiEntitiesResults: [
        {
          results: [{ redactedText: "redacted2", entities: [] }],
        },
      ],
    };
    const poller = createMockPoller([page1, page2]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch(["text1", "text2"]);

    expect(results).toHaveLength(2);
    expect(results[0].redactedText).toBe("redacted1");
    expect(results[1].redactedText).toBe("redacted2");
  });

  it("maps entities correctly in batch results", async () => {
    const entity = {
      text: "jane@example.com",
      category: "Email",
      subcategory: "Work",
      confidenceScore: 0.97,
      offset: 5,
      length: 16,
      extraField: "dropped",
    };
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          {
            results: [{ redactedText: "Mail: ****", entities: [entity] }],
          },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch(["Mail: jane@example.com"]);

    expect(results[0].entities[0]).toEqual({
      text: "jane@example.com",
      category: "Email",
      confidenceScore: 0.97,
      offset: 5,
      length: 16,
    });
    expect(results[0].entities[0]).not.toHaveProperty("subcategory");
    expect(results[0].entities[0]).not.toHaveProperty("extraField");
  });

  it("returns an array of PiiDetectionResult", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          { results: [{ redactedText: "r", entities: [] }] },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch(["text"]);

    expect(Array.isArray(results)).toBe(true);
    expect(results[0]).toHaveProperty("originalText");
    expect(results[0]).toHaveProperty("redactedText");
    expect(results[0]).toHaveProperty("entities");
  });

  // ---- error handling: document-level errors ------------------------------

  it("handles document-level errors by pushing original text with empty entities", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          {
            results: [{ error: { message: "Invalid document language" } }],
          },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch(["bad doc"]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      originalText: "bad doc",
      redactedText: "bad doc",
      entities: [],
    });
  });

  it("logs document-level errors", async () => {
    const poller = createMockPoller([
      {
        recognizePiiEntitiesResults: [
          {
            results: [{ error: { message: "some doc error" } }],
          },
        ],
      },
    ]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    await detectAndRedactPiiBatch(["failing doc"]);

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error in document",
      expect.objectContaining({ index: 0 }),
    );
  });

  // ---- error handling: action-level errors --------------------------------

  it("handles action-level errors by continuing to next page", async () => {
    const errorPage = {
      recognizePiiEntitiesResults: [{ error: { message: "Action failed" } }],
    };
    const goodPage = {
      recognizePiiEntitiesResults: [
        {
          results: [{ redactedText: "ok", entities: [] }],
        },
      ],
    };
    const poller = createMockPoller([errorPage, goodPage]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    const results = await detectAndRedactPiiBatch(["text1", "text2"]);

    // The error page is skipped (continue), only the good page contributes
    expect(results).toHaveLength(1);
    expect(results[0].redactedText).toBe("ok");
  });

  it("logs action-level errors", async () => {
    const errorPage = {
      recognizePiiEntitiesResults: [
        { error: { message: "Action level failure" } },
      ],
    };
    const poller = createMockPoller([errorPage]);
    mockBeginAnalyzeActions.mockResolvedValue(poller);

    await detectAndRedactPiiBatch(["text"]);

    expect(mockLoggerError).toHaveBeenCalledWith(
      "PII Action Error",
      expect.objectContaining({
        error: expect.objectContaining({ message: "Action level failure" }),
      }),
    );
  });

  // ---- error handling: API / network errors -------------------------------

  it("throws with wrapped message on API error", async () => {
    mockBeginAnalyzeActions.mockRejectedValue(new Error("Service unavailable"));

    await expect(detectAndRedactPiiBatch(["text"])).rejects.toThrow(
      "Batch PII detection failed: Service unavailable",
    );
  });

  it("logs the error before re-throwing on API failure", async () => {
    mockBeginAnalyzeActions.mockRejectedValue(new Error("rate limited"));

    await expect(detectAndRedactPiiBatch(["text"])).rejects.toThrow();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error in batch PII detection (SDK)",
      expect.objectContaining({
        error: expect.objectContaining({ message: "rate limited" }),
      }),
    );
  });

  it("wraps non-Error thrown values into an Error", async () => {
    mockBeginAnalyzeActions.mockRejectedValue("raw string error");

    await expect(detectAndRedactPiiBatch(["text"])).rejects.toThrow(
      "Batch PII detection failed: raw string error",
    );
  });
});

// ===========================================================================
// logPiiAudit
// ===========================================================================

describe("logPiiAudit", () => {
  const sampleEntries: PiiLogs[] = [
    {
      userId: "user-1",
      userEmail: "user@example.com",
      modelId: "gpt-4",
      piiType: "Email",
      piiAction: "redact",
      detectionEngine: "azure",
    },
    {
      userId: "user-2",
      userEmail: "admin@example.com",
      modelId: "claude-3",
      piiType: "Person",
      piiAction: "flag",
      detectionEngine: "presidio",
    },
  ];

  it("maps entries to correct DB payload format", async () => {
    const { client, insert } = createMockSupabase();

    await logPiiAudit(client, sampleEntries);

    expect(insert).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        user_email: "user@example.com",
        model_id: "gpt-4",
        pii_type: "Email",
        pii_action: "redact",
        detection_engine: "azure",
      },
      {
        user_id: "user-2",
        user_email: "admin@example.com",
        model_id: "claude-3",
        pii_type: "Person",
        pii_action: "flag",
        detection_engine: "presidio",
      },
    ]);
  });

  it('calls supabase.from("pii_audit_logs").insert()', async () => {
    const { client, from, insert } = createMockSupabase();

    await logPiiAudit(client, [sampleEntries[0]]);

    expect(from).toHaveBeenCalledWith("pii_audit_logs");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("logs error when insert fails but does not throw", async () => {
    const dbError = { message: "constraint violation", code: "23505" };
    const { client } = createMockSupabase({ error: dbError });

    // Should NOT throw
    await expect(logPiiAudit(client, sampleEntries)).resolves.toBeUndefined();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error logging PII audit batch",
      expect.objectContaining({
        error: expect.objectContaining({ message: "constraint violation" }),
      }),
    );
  });

  it("handles empty entries array", async () => {
    const { client, insert } = createMockSupabase();

    await logPiiAudit(client, []);

    expect(insert).toHaveBeenCalledWith([]);
  });

  it("does not throw when supabase insert rejects", async () => {
    const insert = jest.fn().mockRejectedValue(new Error("network error"));
    const from = jest.fn().mockReturnValue({ insert });
    const client = { from } as any;

    await expect(logPiiAudit(client, sampleEntries)).resolves.toBeUndefined();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error logging PII audit batch",
      expect.objectContaining({
        error: expect.objectContaining({ message: "network error" }),
      }),
    );
  });
});
