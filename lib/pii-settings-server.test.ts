/**
 * Tests for lib/pii-settings-server.ts
 *
 * Covers:
 * - getPiiSettingsForModel (model lookup, global fallback, error handling)
 * - normalizeSettings (detection_engine mapping, defaults, Boolean coercion)
 * - parseCategories (array, JSON string, null, non-array)
 * - ensureStringArray (filters non-strings)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPiiSettingsForModel,
  PiiSettingsRecord,
} from "./pii-settings-server";

// ---------------------------------------------------------------------------
// Helpers to build a minimal mock SupabaseClient
// ---------------------------------------------------------------------------

interface MockQueryResult {
  data: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

function createMockSupabase(
  results: Record<string, MockQueryResult>,
): SupabaseClient<any, any, any> {
  // results is keyed by model_id; the mock chains from().select().eq().maybeSingle()
  const mock = {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((_col: string, modelId: string) => ({
          maybeSingle: jest
            .fn()
            .mockResolvedValue(results[modelId] ?? { data: null, error: null }),
        })),
      }),
    }),
  } as unknown as SupabaseClient<any, any, any>;
  return mock;
}

// ---------------------------------------------------------------------------
// getPiiSettingsForModel – happy paths
// ---------------------------------------------------------------------------

describe("getPiiSettingsForModel", () => {
  it("returns normalized settings when model-specific row exists", async () => {
    const row = {
      model_id: "gpt-4",
      detection_engine: "azure",
      categories: ["email", "phone"],
      enabled: true,
      max_sensitivity_level: "confidential",
      audit_log_enabled: true,
    };
    const supabase = createMockSupabase({
      "gpt-4": { data: row, error: null },
    });

    const result = await getPiiSettingsForModel(supabase, "gpt-4");

    expect(result).toEqual<PiiSettingsRecord>({
      model_id: "gpt-4",
      detection_engine: "azure",
      categories: ["email", "phone"],
      enabled: true,
      max_sensitivity_level: "confidential",
      audit_log_enabled: true,
    });
  });

  it("falls back to global-default when model not found (default behavior)", async () => {
    const globalRow = {
      model_id: "global-default",
      detection_engine: "presidio",
      categories: ["ssn"],
      enabled: true,
      max_sensitivity_level: "restricted",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({
      "global-default": { data: globalRow, error: null },
      // "gpt-4" is missing – no entry
    });

    const result = await getPiiSettingsForModel(supabase, "gpt-4");

    expect(result).not.toBeNull();
    // model_id should be overridden to the requested model
    expect(result!.model_id).toBe("gpt-4");
    expect(result!.detection_engine).toBe("presidio");
    expect(result!.categories).toEqual(["ssn"]);
  });

  it("falls back to global-default when fallbackToGlobal is explicitly true", async () => {
    const globalRow = {
      model_id: "global-default",
      detection_engine: "azure",
      categories: [],
      enabled: false,
      max_sensitivity_level: "internal",
      audit_log_enabled: true,
    };
    const supabase = createMockSupabase({
      "global-default": { data: globalRow, error: null },
    });

    const result = await getPiiSettingsForModel(supabase, "claude-3", {
      fallbackToGlobal: true,
    });

    expect(result).not.toBeNull();
    expect(result!.model_id).toBe("claude-3");
  });

  it("returns null when model not found and fallbackToGlobal=false", async () => {
    const supabase = createMockSupabase({});

    const result = await getPiiSettingsForModel(supabase, "gpt-4", {
      fallbackToGlobal: false,
    });

    expect(result).toBeNull();
  });

  it("returns null when both model and global-default are not found", async () => {
    const supabase = createMockSupabase({});

    const result = await getPiiSettingsForModel(supabase, "gpt-4");

    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it("throws on query error with code other than PGRST116", async () => {
    const supabase = createMockSupabase({
      "gpt-4": {
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      },
    });

    await expect(
      getPiiSettingsForModel(supabase, "gpt-4"),
    ).rejects.toMatchObject({
      code: "42P01",
    });
  });

  it("ignores PGRST116 error (no rows found) and treats as missing", async () => {
    const globalRow = {
      model_id: "global-default",
      detection_engine: "azure",
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: true,
    };
    const supabase = createMockSupabase({
      "gpt-4": {
        data: null,
        error: { code: "PGRST116", message: "no rows" },
      },
      "global-default": { data: globalRow, error: null },
    });

    const result = await getPiiSettingsForModel(supabase, "gpt-4");

    expect(result).not.toBeNull();
    expect(result!.model_id).toBe("gpt-4");
  });

  it("returns null for PGRST116 when fallbackToGlobal=false", async () => {
    const supabase = createMockSupabase({
      "gpt-4": {
        data: null,
        error: { code: "PGRST116", message: "no rows" },
      },
    });

    const result = await getPiiSettingsForModel(supabase, "gpt-4", {
      fallbackToGlobal: false,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeSettings (tested indirectly through getPiiSettingsForModel)
// ---------------------------------------------------------------------------

describe("normalizeSettings (via getPiiSettingsForModel)", () => {
  it("maps detection_engine 'presidio' to 'presidio'", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "presidio",
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.detection_engine).toBe("presidio");
  });

  it("maps any non-'presidio' detection_engine to 'azure'", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "something-else",
      categories: [],
      enabled: false,
      max_sensitivity_level: "public",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.detection_engine).toBe("azure");
  });

  it("maps null detection_engine to 'azure'", async () => {
    const row = {
      model_id: "m1",
      detection_engine: null,
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.detection_engine).toBe("azure");
  });

  it("defaults model_id to 'global-default' when null", async () => {
    const row = {
      model_id: null,
      detection_engine: "azure",
      categories: [],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({
      "global-default": { data: row, error: null },
    });

    const result = await getPiiSettingsForModel(supabase, "global-default", {
      fallbackToGlobal: false,
    });

    expect(result!.model_id).toBe("global-default");
  });

  it("coerces enabled via Boolean()", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: [],
      enabled: 0, // falsy
      max_sensitivity_level: "internal",
      audit_log_enabled: 1, // truthy
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.enabled).toBe(false);
    expect(result!.audit_log_enabled).toBe(true);
  });

  it("defaults max_sensitivity_level to 'internal' when null", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: [],
      enabled: true,
      max_sensitivity_level: null,
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.max_sensitivity_level).toBe("internal");
  });
});

// ---------------------------------------------------------------------------
// parseCategories (tested indirectly through normalizeSettings)
// ---------------------------------------------------------------------------

describe("parseCategories (via getPiiSettingsForModel)", () => {
  it("handles an array of strings", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: ["email", "phone", "ssn"],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual(["email", "phone", "ssn"]);
  });

  it("handles a valid JSON string containing an array", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: '["email","phone"]',
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual(["email", "phone"]);
  });

  it("returns empty array for null categories", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: null,
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual([]);
  });

  it("returns empty array for undefined categories", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      // categories omitted
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual([]);
  });

  it("filters non-string items from array categories", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: ["email", 123, null, "phone", true],
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual(["email", "phone"]);
  });

  it("returns empty array for invalid JSON string", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: "not-valid-json",
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual([]);
  });

  it("returns empty array for JSON string containing non-array", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: '{"not":"array"}',
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual([]);
  });

  it("returns empty array for number type categories", async () => {
    const row = {
      model_id: "m1",
      detection_engine: "azure",
      categories: 42,
      enabled: true,
      max_sensitivity_level: "internal",
      audit_log_enabled: false,
    };
    const supabase = createMockSupabase({ m1: { data: row, error: null } });

    const result = await getPiiSettingsForModel(supabase, "m1");

    expect(result!.categories).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fallback global settings get model_id overridden
// ---------------------------------------------------------------------------

describe("global fallback model_id override", () => {
  it("overrides model_id from global-default to the requested model", async () => {
    const globalRow = {
      model_id: "global-default",
      detection_engine: "presidio",
      categories: ["credit_card"],
      enabled: true,
      max_sensitivity_level: "restricted",
      audit_log_enabled: true,
    };
    const supabase = createMockSupabase({
      "global-default": { data: globalRow, error: null },
    });

    const result = await getPiiSettingsForModel(supabase, "claude-opus");

    expect(result).not.toBeNull();
    expect(result!.model_id).toBe("claude-opus");
    // Confirm other fields are preserved from global
    expect(result!.detection_engine).toBe("presidio");
    expect(result!.categories).toEqual(["credit_card"]);
    expect(result!.enabled).toBe(true);
    expect(result!.max_sensitivity_level).toBe("restricted");
    expect(result!.audit_log_enabled).toBe(true);
  });
});
