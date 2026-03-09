import type { SupabaseClient } from "@supabase/supabase-js";

import type { PiiDetectionEngine } from "./pii-detection";

type AnySupabaseClient = SupabaseClient<any, any, any>;

type SensitivityLevel = "public" | "internal" | "confidential" | "restricted";

export interface PiiSettingsRecord {
  model_id: string;
  detection_engine: PiiDetectionEngine;
  categories: string[];
  enabled: boolean;
  max_sensitivity_level: SensitivityLevel;
  audit_log_enabled: boolean;
}

function ensureStringArray(values: unknown[]): string[] {
  return values.filter(item => typeof item === "string") as string[];
}

function parseCategories(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return ensureStringArray(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? ensureStringArray(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeSettings(row: Record<string, any>): PiiSettingsRecord {
  const detectionEngine =
    row.detection_engine === "presidio" ? "presidio" : "azure";

  return {
    model_id: row.model_id ?? "global-default",
    detection_engine: detectionEngine,
    categories: parseCategories(row.categories),
    enabled: Boolean(row.enabled),
    max_sensitivity_level: row.max_sensitivity_level ?? "internal",
    audit_log_enabled: Boolean(row.audit_log_enabled),
  };
}

export async function getPiiSettingsForModel(
  supabase: AnySupabaseClient,
  modelId: string,
  options: { fallbackToGlobal?: boolean } = {},
): Promise<PiiSettingsRecord | null> {
  const { fallbackToGlobal = true } = options;

  const { data, error } = await supabase
    .from("pii_protection_settings")
    .select(
      "model_id, detection_engine, categories, enabled, max_sensitivity_level, audit_log_enabled",
    )
    .eq("model_id", modelId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (data) {
    return normalizeSettings(data as Record<string, any>);
  }

  if (fallbackToGlobal && modelId !== "global-default") {
    const globalSettings = await getPiiSettingsForModel(
      supabase,
      "global-default",
      {
        fallbackToGlobal: false,
      },
    );

    return globalSettings ? { ...globalSettings, model_id: modelId } : null;
  }

  return null;
}
