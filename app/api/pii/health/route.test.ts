/** @jest-environment node */

import { NextRequest } from "next/server";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock("@/lib/pii-detection", () => ({
  detectPii: jest.fn(),
  isPiiEngineConfigured: jest.fn(),
}));

jest.mock("@/lib/pii-settings-server", () => ({
  getPiiSettingsForModel: jest.fn(),
}));

jest.mock("@/lib/server/server-chat-helpers", () => ({
  getServerProfile: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { GET } from "./route";
import { detectPii, isPiiEngineConfigured } from "@/lib/pii-detection";
import { getPiiSettingsForModel } from "@/lib/pii-settings-server";

const mockDetectPii = detectPii as jest.MockedFunction<typeof detectPii>;
const mockIsConfigured = isPiiEngineConfigured as jest.MockedFunction<
  typeof isPiiEngineConfigured
>;
const mockGetSettings = getPiiSettingsForModel as jest.MockedFunction<
  typeof getPiiSettingsForModel
>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/pii/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue(null);
    mockIsConfigured.mockReturnValue(false);
  });

  it("returns JSON with azure and presidio health status keys", async () => {
    mockIsConfigured.mockReturnValue(false);

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("azure");
    expect(body).toHaveProperty("presidio");
  });

  it("reports configured=false when engine is not configured", async () => {
    mockIsConfigured.mockReturnValue(false);

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.configured).toBe(false);
    expect(body.azure.checked).toBe(false);
    expect(body.presidio.configured).toBe(false);
    expect(body.presidio.checked).toBe(false);
  });

  it("reports ok=true when detection succeeds", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockDetectPii.mockResolvedValue({
      originalText: "Contact Jane Doe at jane.doe@example.com",
      redactedText: "Contact ***** at *****",
      entities: [
        {
          text: "jane.doe@example.com",
          category: "Email",
          confidenceScore: 0.99,
          offset: 21,
          length: 20,
        },
      ],
    });

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.configured).toBe(true);
    expect(body.azure.checked).toBe(true);
    expect(body.azure.ok).toBe(true);
    expect(body.azure.entitiesDetected).toBe(1);
    expect(body.presidio.ok).toBe(true);
  });

  it("reports ok=false with error when detection fails", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockDetectPii.mockRejectedValue(new Error("Service unavailable"));

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.configured).toBe(true);
    expect(body.azure.checked).toBe(true);
    expect(body.azure.ok).toBe(false);
    expect(body.azure.error).toBe("Service unavailable");
  });

  it("reports ok=false when detection throws a non-Error value", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockDetectPii.mockRejectedValue("string error");

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.ok).toBe(false);
    expect(body.azure.error).toBe("string error");
  });

  it("includes selectedEngine, modelId, categories, and timestamp", async () => {
    mockGetSettings.mockResolvedValue({
      model_id: "global-default",
      detection_engine: "presidio",
      categories: ["Email", "Person"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    });

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.selectedEngine).toBe("presidio");
    expect(body.modelId).toBe("global-default");
    expect(body.categories).toEqual(["Email", "Person"]);
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("loads settings from global-default model", async () => {
    mockGetSettings.mockResolvedValue({
      model_id: "global-default",
      detection_engine: "azure",
      categories: ["Email"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: true,
    });

    await GET(createMockRequest("/api/pii/health"));

    expect(mockGetSettings).toHaveBeenCalledWith(
      mockSupabase,
      "global-default",
    );
  });

  it("handles settings load failure gracefully and defaults to azure", async () => {
    mockGetSettings.mockRejectedValue(new Error("DB connection failed"));
    mockIsConfigured.mockReturnValue(false);

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedEngine).toBe("azure");
    expect(body.categories).toEqual([]);
  });

  it("defaults to azure engine when settings return null", async () => {
    mockGetSettings.mockResolvedValue(null);

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.selectedEngine).toBe("azure");
    expect(body.categories).toEqual([]);
  });

  it("checks both engines concurrently with mixed configuration", async () => {
    mockIsConfigured.mockImplementation((engine: string) => engine === "azure");
    mockDetectPii.mockResolvedValue({
      originalText: "test",
      redactedText: "test",
      entities: [],
    });

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.configured).toBe(true);
    expect(body.azure.ok).toBe(true);
    expect(body.presidio.configured).toBe(false);
    expect(body.presidio.checked).toBe(false);
  });

  it("returns entitiesDetected=0 when no entities are found", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockDetectPii.mockResolvedValue({
      originalText: "No PII here",
      redactedText: "No PII here",
      entities: [],
    });

    const response = await GET(createMockRequest("/api/pii/health"));
    const body = await response.json();

    expect(body.azure.ok).toBe(true);
    expect(body.azure.entitiesDetected).toBe(0);
  });
});
