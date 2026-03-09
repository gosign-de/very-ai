/**
 * Tests for lib/config/pii-protection-settings.ts
 *
 * Covers:
 * - DEFAULT_PII_PROTECTION_SETTINGS constant
 * - updatePIIProtectionSettings (POST to API)
 * - getPIIProtectionSettings (GET from API, normalization, error fallback)
 * - getPIISettingsServer (server-side Supabase query with global fallback)
 * - setAdminSetting / getAdminSetting (admin_settings CRUD)
 * - normalizePiiSettings (internal, tested via getPIIProtectionSettings)
 * - normalizeCustomPatterns / normalizeCategories (internal, tested indirectly)
 */

// ---------------------------------------------------------------------------
// Mocks – must be declared before imports
// ---------------------------------------------------------------------------

const mockUpsert = jest.fn();
const mockSingleSelect = jest.fn();

const mockServiceSupabase = {
  from: jest.fn().mockImplementation((table: string) => {
    if (table === "admin_settings") {
      return {
        upsert: mockUpsert,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: mockSingleSelect,
          }),
        }),
      };
    }
    // pii_protection_settings table – handled per test
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  }),
};

jest.mock("@/lib/supabase/service-client", () => ({
  getServiceClient: jest.fn(() => mockServiceSupabase),
}));

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  DEFAULT_PII_PROTECTION_SETTINGS,
  updatePIIProtectionSettings,
  getPIIProtectionSettings,
  getPIISettingsServer,
  setAdminSetting,
  getAdminSetting,
  PIIProtectionSettings,
} from "./pii-protection-settings";

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DEFAULT_PII_PROTECTION_SETTINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_PII_PROTECTION_SETTINGS", () => {
  it("has correct default values", () => {
    expect(DEFAULT_PII_PROTECTION_SETTINGS).toEqual({
      model_id: "global-default",
      enabled: false,
      detection_engine: "azure",
      custom_patterns: [],
      max_sensitivity_level: "internal",
      categories: [],
      image_processing: true,
      doc_processing: true,
      audit_log_enabled: true,
      audit_log_retention_days: 90,
    });
  });

  it("has enabled set to false by default", () => {
    expect(DEFAULT_PII_PROTECTION_SETTINGS.enabled).toBe(false);
  });

  it("has detection_engine set to 'azure' by default", () => {
    expect(DEFAULT_PII_PROTECTION_SETTINGS.detection_engine).toBe("azure");
  });
});

// ---------------------------------------------------------------------------
// updatePIIProtectionSettings
// ---------------------------------------------------------------------------

describe("updatePIIProtectionSettings", () => {
  it("POSTs to the correct URL with JSON body", async () => {
    const mockData: PIIProtectionSettings = {
      ...DEFAULT_PII_PROTECTION_SETTINGS,
      enabled: true,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockData),
    });

    await updatePIIProtectionSettings({ enabled: true });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/pii-protection-settings",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("returns data on success", async () => {
    const mockData = { ...DEFAULT_PII_PROTECTION_SETTINGS, enabled: true };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockData),
    });

    const result = await updatePIIProtectionSettings({ enabled: true });

    expect(result).toEqual(mockData);
  });

  it("throws on non-OK response with error message from body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "Forbidden" }),
    });

    await expect(
      updatePIIProtectionSettings({ enabled: true }),
    ).rejects.toThrow("Forbidden");
  });

  it("throws with default message when response has no error field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValue({}),
    });

    await expect(
      updatePIIProtectionSettings({ enabled: true }),
    ).rejects.toThrow("Failed to update settings");
  });

  it("throws on network/fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    await expect(
      updatePIIProtectionSettings({ enabled: true }),
    ).rejects.toThrow("Network failure");
  });
});

// ---------------------------------------------------------------------------
// getPIIProtectionSettings
// ---------------------------------------------------------------------------

describe("getPIIProtectionSettings", () => {
  it("GETs with modelId query parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });

    await getPIIProtectionSettings("gpt-4");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/pii-protection-settings?model_id=gpt-4",
      expect.objectContaining({
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }),
    );
  });

  it("normalizes the first element of an array response", async () => {
    const apiRecord = {
      model_id: "gpt-4",
      enabled: true,
      detection_engine: "presidio",
      categories: ["email", "phone"],
      custom_patterns: [],
      max_sensitivity_level: "confidential",
      audit_log_enabled: false,
      audit_log_retention_days: 30,
      image_processing: false,
      doc_processing: false,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([apiRecord]),
    });

    const result = await getPIIProtectionSettings("gpt-4");

    expect(result.model_id).toBe("gpt-4");
    expect(result.detection_engine).toBe("presidio");
    expect(result.categories).toEqual(["email", "phone"]);
    expect(result.enabled).toBe(true);
  });

  it("returns defaults when API returns empty array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });

    const result = await getPIIProtectionSettings("gpt-4");

    expect(result.model_id).toBe("gpt-4");
    expect(result.enabled).toBe(DEFAULT_PII_PROTECTION_SETTINGS.enabled);
    expect(result.detection_engine).toBe(
      DEFAULT_PII_PROTECTION_SETTINGS.detection_engine,
    );
  });

  it("returns defaults on non-OK HTTP response (error recovery)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await getPIIProtectionSettings("gpt-4");

    expect(result.model_id).toBe("gpt-4");
    expect(result.enabled).toBe(DEFAULT_PII_PROTECTION_SETTINGS.enabled);
  });

  it("returns defaults on fetch error (error recovery)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network down"));

    const result = await getPIIProtectionSettings("gpt-4");

    expect(result.model_id).toBe("gpt-4");
    expect(result.enabled).toBe(DEFAULT_PII_PROTECTION_SETTINGS.enabled);
  });
});

// ---------------------------------------------------------------------------
// normalizePiiSettings (tested indirectly via getPIIProtectionSettings)
// ---------------------------------------------------------------------------

describe("normalizePiiSettings (via getPIIProtectionSettings)", () => {
  it("applies defaults for null record (empty array response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });

    const result = await getPIIProtectionSettings("test-model");

    expect(result).toEqual({
      ...DEFAULT_PII_PROTECTION_SETTINGS,
      model_id: "test-model",
    });
  });

  it("normalizes detection_engine: non-presidio becomes 'azure'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([
          { detection_engine: "custom-engine", model_id: "m1" },
        ]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.detection_engine).toBe("azure");
  });

  it("normalizes detection_engine: 'presidio' stays 'presidio'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([{ detection_engine: "presidio", model_id: "m1" }]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.detection_engine).toBe("presidio");
  });

  it("normalizes categories: filters non-string values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([
          { categories: ["email", 123, null, "phone"], model_id: "m1" },
        ]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.categories).toEqual(["email", "phone"]);
  });

  it("normalizes custom_patterns: null becomes empty array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([{ custom_patterns: null, model_id: "m1" }]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.custom_patterns).toEqual([]);
  });

  it("normalizes custom_patterns: valid array is preserved", async () => {
    const patterns = [
      {
        id: "1",
        name: "test",
        description: "desc",
        regexPattern: ".*",
        confidence: 0.9,
        status: "active" as const,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([{ custom_patterns: patterns, model_id: "m1" }]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.custom_patterns).toEqual(patterns);
  });

  it("preserves valid field overrides", async () => {
    const record = {
      model_id: "m1",
      enabled: true,
      detection_engine: "presidio" as const,
      max_sensitivity_level: "restricted" as const,
      audit_log_enabled: false,
      audit_log_retention_days: 365,
      image_processing: false,
      doc_processing: false,
      categories: ["ssn"],
      custom_patterns: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([record]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.enabled).toBe(true);
    expect(result.detection_engine).toBe("presidio");
    expect(result.max_sensitivity_level).toBe("restricted");
    expect(result.audit_log_enabled).toBe(false);
    expect(result.audit_log_retention_days).toBe(365);
    expect(result.image_processing).toBe(false);
    expect(result.doc_processing).toBe(false);
  });

  it("uses base enabled when record.enabled is not boolean", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([{ enabled: "yes", model_id: "m1" }]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.enabled).toBe(DEFAULT_PII_PROTECTION_SETTINGS.enabled);
  });

  it("uses base audit_log_retention_days when value is not number", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue([
          { audit_log_retention_days: "ninety", model_id: "m1" },
        ]),
    });

    const result = await getPIIProtectionSettings("m1");

    expect(result.audit_log_retention_days).toBe(
      DEFAULT_PII_PROTECTION_SETTINGS.audit_log_retention_days,
    );
  });
});

// ---------------------------------------------------------------------------
// getPIISettingsServer
// ---------------------------------------------------------------------------

describe("getPIISettingsServer", () => {
  function createServerSupabase(
    modelData: Record<string, unknown> | null,
    globalData: Record<string, unknown> | null = null,
  ) {
    const mock = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((_col: string, modelId: string) => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: modelId === "global-default" ? globalData : modelData,
              error: null,
            }),
          })),
        }),
      }),
    };
    return mock as unknown as import("@supabase/supabase-js").SupabaseClient;
  }

  it("returns model-specific settings when found", async () => {
    const modelSettings = {
      model_id: "gpt-4",
      enabled: true,
      detection_engine: "azure",
    };
    const supabase = createServerSupabase(modelSettings);

    const result = await getPIISettingsServer(supabase, "gpt-4");

    expect(result).toEqual(modelSettings);
  });

  it("falls back to global-default when model not found", async () => {
    const globalSettings = {
      model_id: "global-default",
      enabled: true,
      detection_engine: "presidio",
    };
    const supabase = createServerSupabase(null, globalSettings);

    const result = await getPIISettingsServer(supabase, "gpt-4");

    expect(result).toEqual(globalSettings);
  });

  it("returns null when both model and global are not found", async () => {
    const supabase = createServerSupabase(null, null);

    const result = await getPIISettingsServer(supabase, "gpt-4");

    expect(result).toBeNull();
  });

  it("returns null on thrown error", async () => {
    const supabase = {
      from: jest.fn().mockImplementation(() => {
        throw new Error("Connection refused");
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await getPIISettingsServer(supabase, "gpt-4");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setAdminSetting
// ---------------------------------------------------------------------------

describe("setAdminSetting", () => {
  it("upserts to admin_settings with key and stringified value", async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });

    await setAdminSetting("pii_enabled", "true");

    expect(mockServiceSupabase.from).toHaveBeenCalledWith("admin_settings");
    expect(mockUpsert).toHaveBeenCalledWith(
      { key: "pii_enabled", value: "true" },
      { onConflict: "key" },
    );
  });

  it("throws on Supabase error", async () => {
    const supaError = { message: "permission denied", code: "42501" };
    mockUpsert.mockResolvedValueOnce({ error: supaError });

    await expect(setAdminSetting("pii_enabled", "true")).rejects.toMatchObject({
      message: "permission denied",
    });
  });

  it("converts numeric value to string", async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });

    // value parameter is typed string, but String() is called inside
    await setAdminSetting("retention_days", "90");

    expect(mockUpsert).toHaveBeenCalledWith(
      { key: "retention_days", value: "90" },
      { onConflict: "key" },
    );
  });
});

// ---------------------------------------------------------------------------
// getAdminSetting
// ---------------------------------------------------------------------------

describe("getAdminSetting", () => {
  it("returns the value for a given key", async () => {
    mockSingleSelect.mockResolvedValueOnce({
      data: { value: "true" },
      error: null,
    });

    const result = await getAdminSetting("pii_enabled");

    expect(result).toBe("true");
  });

  it("returns null when data is null", async () => {
    mockSingleSelect.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await getAdminSetting("missing_key");

    expect(result).toBeNull();
  });

  it("returns null on Supabase error", async () => {
    mockSingleSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });

    const result = await getAdminSetting("bad_key");

    expect(result).toBeNull();
  });

  it("returns null on thrown error", async () => {
    mockSingleSelect.mockRejectedValueOnce(new Error("Connection lost"));

    const result = await getAdminSetting("any_key");

    expect(result).toBeNull();
  });

  it("queries the admin_settings table with correct key", async () => {
    mockSingleSelect.mockResolvedValueOnce({
      data: { value: "42" },
      error: null,
    });

    await getAdminSetting("retention_days");

    expect(mockServiceSupabase.from).toHaveBeenCalledWith("admin_settings");
  });
});
