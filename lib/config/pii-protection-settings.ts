// PII Protection Settings configuration
// Stores settings for Data Loss Prevention and PII Protection

import { SupabaseClient } from "@supabase/supabase-js";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({
  feature: "lib/config/pii-protection-settings",
});

export interface CustomPattern {
  id: string;
  name: string;
  description: string;
  regexPattern: string;
  confidence: number;
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

export interface PIIProtectionSettings {
  model_id: string; // Added
  enabled: boolean;
  detection_engine: "azure" | "presidio";
  custom_patterns: CustomPattern[];
  max_sensitivity_level: "public" | "internal" | "confidential" | "restricted";
  categories: string[];
  image_processing: boolean;
  doc_processing: boolean;
  audit_log_enabled: boolean;
  audit_log_retention_days: number;
  created_at?: string;
  updated_at?: string;
}

import { getServiceClient } from "@/lib/supabase/service-client";
const getSupabase = () => getServiceClient();

// Default PII Protection settings
export const DEFAULT_PII_PROTECTION_SETTINGS: PIIProtectionSettings = {
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
};

export async function updatePIIProtectionSettings(
  newSettings: Partial<PIIProtectionSettings>,
): Promise<PIIProtectionSettings> {
  try {
    const response = await fetch("/api/admin/pii-protection-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newSettings),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to update settings");
    }

    logger.info("PII Protection settings updated successfully");
    return data;
  } catch (error) {
    logger.error("Error updating PII Protection settings", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}

type PiiSettingsResponse = Partial<PIIProtectionSettings> & {
  model_id?: string | null;
  custom_patterns?: CustomPattern[] | null;
  categories?: string[] | null;
  detection_engine?: "azure" | "presidio" | null;
  max_sensitivity_level?:
    | "public"
    | "internal"
    | "confidential"
    | "restricted"
    | null;
};

function normalizePiiSettings(
  modelId: string,
  record: PiiSettingsResponse | null,
): PIIProtectionSettings {
  const normalizeCustomPatterns = (
    value: PiiSettingsResponse["custom_patterns"],
  ): CustomPattern[] => {
    if (!value) return [];
    return Array.isArray(value) ? value : [];
  };

  const normalizeCategories = (
    value: PiiSettingsResponse["categories"],
  ): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(category => typeof category === "string");
    }
    return [];
  };

  const base: PIIProtectionSettings = {
    ...DEFAULT_PII_PROTECTION_SETTINGS,
    model_id: modelId,
  };

  if (!record) {
    return base;
  }

  return {
    ...base,
    ...record,
    model_id: record.model_id ?? modelId,
    detection_engine:
      record.detection_engine === "presidio" ? "presidio" : "azure",
    custom_patterns: normalizeCustomPatterns(record.custom_patterns),
    categories: normalizeCategories(record.categories),
    max_sensitivity_level:
      record.max_sensitivity_level ?? base.max_sensitivity_level,
    enabled:
      typeof record.enabled === "boolean" ? record.enabled : base.enabled,
    audit_log_enabled:
      typeof record.audit_log_enabled === "boolean"
        ? record.audit_log_enabled
        : base.audit_log_enabled,
    audit_log_retention_days:
      typeof record.audit_log_retention_days === "number"
        ? record.audit_log_retention_days
        : base.audit_log_retention_days,
  };
}

export async function getPIIProtectionSettings(
  modelId: string,
): Promise<PIIProtectionSettings> {
  try {
    const response = await fetch(
      `/api/admin/pii-protection-settings?model_id=${modelId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }

    const data = await response.json();
    const record = (
      Array.isArray(data) && data.length > 0 ? data[0] : null
    ) as PiiSettingsResponse | null;

    return normalizePiiSettings(modelId, record);
  } catch (error) {
    logger.error("Error fetching PII settings by model ID", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return normalizePiiSettings(modelId, null);
  }
}

export async function getPIISettingsServer(
  supabaseAdmin: SupabaseClient,
  modelId: string,
): Promise<PIIProtectionSettings | null> {
  try {
    // Try to get model-specific settings
    const { data: piiSettings, error: _error } = await supabaseAdmin
      .from("pii_protection_settings")
      .select("*")
      .eq("model_id", modelId)
      .maybeSingle();

    // If no specific data, fall back to global default
    if (!piiSettings) {
      logger.warn("No settings for model, using global-default", { modelId });

      const { data: globalSettings, error: _globalError } = await supabaseAdmin
        .from("pii_protection_settings")
        .select("*")
        .eq("model_id", "global-default")
        .maybeSingle();
      return globalSettings;
    }

    return piiSettings;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error fetching PII settings", {
      error: { message: err.message },
    });
    return null;
  }
}

// Save or update a setting in the admin_settings table
export async function setAdminSetting(
  key: string,
  value: string,
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("admin_settings")
      .upsert({ key, value: String(value) }, { onConflict: "key" });

    if (error) throw error;
  } catch (err) {
    logger.error("Error saving setting", {
      key,
      error:
        err instanceof Error ? { message: err.message, name: err.name } : err,
    });
    throw err;
  }
}

// Get a setting value from the admin_settings table
export async function getAdminSetting(key: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabase()
      .from("admin_settings")
      .select("value")
      .eq("key", key)
      .single();

    if (error) {
      throw error;
    }

    return data?.value ?? null;
  } catch (err) {
    logger.error("Error fetching setting", {
      key,
      error:
        err instanceof Error ? { message: err.message, name: err.name } : err,
    });
    return null;
  }
}
