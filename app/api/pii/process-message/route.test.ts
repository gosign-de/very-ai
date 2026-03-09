/** @jest-environment node */

import { NextRequest } from "next/server";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetSession = jest.fn();

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};

jest.mock("@/lib/pii-message-processor", () => ({
  processUserMessage: jest.fn(),
}));

jest.mock("@/lib/supabase/middleware", () => ({
  createClient: jest.fn(() => ({ supabase: mockSupabase })),
}));

jest.mock("@/lib/pii-detection", () => ({
  isPiiEngineConfigured: jest.fn(),
}));

jest.mock("@/lib/azure-pii-detection", () => ({
  logPiiAudit: jest.fn(),
}));

jest.mock("@/lib/pii-settings-server", () => ({
  getPiiSettingsForModel: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { POST } from "./route";
import { processUserMessage } from "@/lib/pii-message-processor";
import { isPiiEngineConfigured } from "@/lib/pii-detection";
import { logPiiAudit } from "@/lib/azure-pii-detection";
import { getPiiSettingsForModel } from "@/lib/pii-settings-server";

const mockProcessMessage = processUserMessage as jest.MockedFunction<
  typeof processUserMessage
>;
const mockIsConfigured = isPiiEngineConfigured as jest.MockedFunction<
  typeof isPiiEngineConfigured
>;
const mockLogAudit = logPiiAudit as jest.MockedFunction<typeof logPiiAudit>;
const mockGetSettings = getPiiSettingsForModel as jest.MockedFunction<
  typeof getPiiSettingsForModel
>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

function createPostRequest(body: Record<string, unknown>) {
  return createMockRequest("/api/pii/process-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId = "user-123", email = "test@example.com") {
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: { id: userId, email },
      },
    },
  });
}

function mockUnauthenticated() {
  mockGetSession.mockResolvedValue({
    data: { session: null },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/pii/process-message", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue(null);
    mockIsConfigured.mockReturnValue(true);
    mockLogAudit.mockResolvedValue(undefined);
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it("returns 400 when content is missing", async () => {
    const request = createPostRequest({});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Content is required");
  });

  it("returns 400 when content is empty string", async () => {
    const request = createPostRequest({ content: "" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Content is required");
  });

  // ── Authentication ──────────────────────────────────────────────────────

  it("returns 401 when user is not authenticated", async () => {
    mockUnauthenticated();

    const request = createPostRequest({ content: "Hello world" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("User not found");
  });

  // ── Engine not configured ───────────────────────────────────────────────

  it("returns 200 with 'not configured' when engine is not configured", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(false);

    const request = createPostRequest({ content: "Hello Jane Doe" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBe("PII detection is not configured");
    expect(body.piiDetected).toBe(false);
    expect(body.originalContent).toBe("Hello Jane Doe");
    expect(body.redactedContent).toBe("Hello Jane Doe");
  });

  // ── Successful processing ──────────────────────────────────────────────

  it("processes message successfully and returns PII detection results", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "gpt-4",
      detection_engine: "azure",
      categories: ["Email", "Person"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "Contact Jane at jane@example.com",
      redactedContent: "Contact [PERSON_1] at [EMAIL_1]",
      piiEntities: [
        {
          text: "Jane",
          category: "Person",
          confidenceScore: 0.95,
          offset: 8,
          length: 4,
        },
        {
          text: "jane@example.com",
          category: "Email",
          confidenceScore: 0.99,
          offset: 16,
          length: 16,
        },
      ],
      tokenMap: '{"[PERSON_1]":"Jane","[EMAIL_1]":"jane@example.com"}',
      tokenMetadata: [
        {
          token: "[PERSON_1]",
          originalValue: "Jane",
          category: "Person",
          confidenceScore: 0.95,
          position: 0,
        },
        {
          token: "[EMAIL_1]",
          originalValue: "jane@example.com",
          category: "Email",
          confidenceScore: 0.99,
          position: 1,
        },
      ],
    });

    const request = createPostRequest({
      content: "Contact Jane at jane@example.com",
      language: "en",
      model_id: "gpt-4",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.originalContent).toBe("Contact Jane at jane@example.com");
    expect(body.redactedContent).toBe("Contact [PERSON_1] at [EMAIL_1]");
    expect(body.piiDetected).toBe(true);
    expect(body.entitiesCount).toBe(2);
    expect(body.entities).toHaveLength(2);
    expect(body.tokenMap).toBeDefined();
    expect(body.tokenMetadata).toHaveLength(2);
    expect(body.detectionEngine).toBe("azure");
    expect(body.effectiveModelId).toBe("gpt-4");
  });

  it("calls processUserMessage with correct parameters", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "claude-3",
      detection_engine: "presidio",
      categories: ["Email"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({
      content: "test content",
      language: "de",
      model_id: "claude-3",
    });
    await POST(request);

    expect(mockProcessMessage).toHaveBeenCalledWith(
      "test content",
      "de",
      ["Email"],
      "presidio",
    );
  });

  it("returns piiDetected=false when no entities found", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockProcessMessage.mockResolvedValue({
      originalContent: "Hello world",
      redactedContent: "Hello world",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({ content: "Hello world" });
    const response = await POST(request);
    const body = await response.json();

    expect(body.piiDetected).toBe(false);
    expect(body.entitiesCount).toBe(0);
  });

  // ── Audit logging ──────────────────────────────────────────────────────

  it("logs PII audit when audit_log_enabled is true", async () => {
    mockAuthenticated("user-456", "user@corp.com");
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "gpt-4",
      detection_engine: "azure",
      categories: ["Email"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: true,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "email: test@test.com",
      redactedContent: "email: [EMAIL_1]",
      piiEntities: [
        {
          text: "test@test.com",
          category: "Email",
          confidenceScore: 0.99,
          offset: 7,
          length: 13,
        },
      ],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({
      content: "email: test@test.com",
      model_id: "gpt-4",
    });
    await POST(request);

    expect(mockLogAudit).toHaveBeenCalledWith(mockSupabase, [
      {
        userId: "user-456",
        userEmail: "user@corp.com",
        modelId: "gpt-4",
        piiType: "Email",
        piiAction: "Anonymized",
        detectionEngine: "azure",
      },
    ]);
  });

  it("skips audit logging when audit_log_enabled is false", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "global-default",
      detection_engine: "azure",
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [
        {
          text: "test@test.com",
          category: "Email",
          confidenceScore: 0.99,
          offset: 0,
          length: 13,
        },
      ],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({ content: "test" });
    await POST(request);

    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("skips audit logging when settings are null (default)", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue(null);
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({ content: "test" });
    await POST(request);

    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  // ── Model ID handling ──────────────────────────────────────────────────

  it("uses model-specific PII settings when model_id is provided", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "claude-3-opus",
      detection_engine: "presidio",
      categories: ["Person"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({
      content: "test",
      model_id: "claude-3-opus",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(mockGetSettings).toHaveBeenCalledWith(mockSupabase, "claude-3-opus");
    expect(body.effectiveModelId).toBe("claude-3-opus");
  });

  it("falls back to global-default model when model_id is not provided", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue(null);
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({ content: "test" });
    const response = await POST(request);
    const body = await response.json();

    expect(mockGetSettings).toHaveBeenCalledWith(
      mockSupabase,
      "global-default",
    );
    expect(body.effectiveModelId).toBe("global-default");
  });

  // ── Settings failure ───────────────────────────────────────────────────

  it("handles settings load failure gracefully and continues", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockRejectedValue(new Error("DB error"));
    mockProcessMessage.mockResolvedValue({
      originalContent: "test",
      redactedContent: "test",
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({ content: "test" });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it("returns 500 on unexpected error during processing", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockProcessMessage.mockRejectedValue(
      new Error("Processing engine crashed"),
    );

    const request = createPostRequest({ content: "Hello world" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to process message for PII");
    expect(body.details).toBe("Processing engine crashed");
  });

  it("returns 500 with stringified error when non-Error is thrown", async () => {
    mockAuthenticated();
    mockIsConfigured.mockReturnValue(true);
    mockProcessMessage.mockRejectedValue("unexpected string error");

    const request = createPostRequest({ content: "Hello world" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to process message for PII");
    expect(body.details).toBe("unexpected string error");
  });

  it("logs audit entries for multiple PII entities", async () => {
    mockAuthenticated("user-789", "multi@corp.com");
    mockIsConfigured.mockReturnValue(true);
    mockGetSettings.mockResolvedValue({
      model_id: "gpt-4",
      detection_engine: "azure",
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: true,
    });
    mockProcessMessage.mockResolvedValue({
      originalContent: "Jane Doe jane@test.com 555-1234",
      redactedContent: "[PERSON_1] [EMAIL_1] [PHONE_1]",
      piiEntities: [
        {
          text: "Jane Doe",
          category: "Person",
          confidenceScore: 0.95,
          offset: 0,
          length: 8,
        },
        {
          text: "jane@test.com",
          category: "Email",
          confidenceScore: 0.99,
          offset: 9,
          length: 13,
        },
        {
          text: "555-1234",
          category: "PhoneNumber",
          confidenceScore: 0.9,
          offset: 23,
          length: 8,
        },
      ],
      tokenMap: "{}",
      tokenMetadata: [],
    });

    const request = createPostRequest({
      content: "Jane Doe jane@test.com 555-1234",
      model_id: "gpt-4",
    });
    await POST(request);

    expect(mockLogAudit).toHaveBeenCalledWith(mockSupabase, [
      {
        userId: "user-789",
        userEmail: "multi@corp.com",
        modelId: "gpt-4",
        piiType: "Person",
        piiAction: "Anonymized",
        detectionEngine: "azure",
      },
      {
        userId: "user-789",
        userEmail: "multi@corp.com",
        modelId: "gpt-4",
        piiType: "Email",
        piiAction: "Anonymized",
        detectionEngine: "azure",
      },
      {
        userId: "user-789",
        userEmail: "multi@corp.com",
        modelId: "gpt-4",
        piiType: "PhoneNumber",
        piiAction: "Anonymized",
        detectionEngine: "azure",
      },
    ]);
  });
});
