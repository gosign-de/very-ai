import { LLMID } from "@/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/config/admin-settings" });

// Static admin settings configuration
// This file stores the default values that will be used for new workspaces
// Admins can update these values through the admin dashboard

export interface AdminSettings {
  default_model: LLMID;
  default_image_model: LLMID;
  default_context_length: number;
  default_temperature: number;
  default_prompt: string;
  default_embeddings_provider: "openai" | "local";
  include_profile_context: boolean;
  include_workspace_instructions: boolean;
  default_fallback_model: LLMID;
  onedrive_enabled: boolean;
  sharepoint_enabled: boolean;
}

// Default admin settings - these will be used for new workspaces
const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  default_model: "gemini-2.5-pro",
  default_image_model: "imagen-3.0-generate-002",
  default_context_length: 1048576, // Full context length by default
  default_temperature: 0.5,
  default_prompt: "You are a helpful AI assistant.",
  default_embeddings_provider: "openai",
  include_profile_context: true,
  include_workspace_instructions: true,
  default_fallback_model: "gemini-2.5-pro",
  onedrive_enabled: false,
  sharepoint_enabled: false,
};

// Function to get admin settings from database API or use defaults
export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    const response = await fetch("/api/admin/settings", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const settings = await response.json();
      return { ...DEFAULT_ADMIN_SETTINGS, ...settings };
    }
  } catch (error) {
    logger.error("Error loading admin settings from API", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }

  return DEFAULT_ADMIN_SETTINGS;
}

// Function to get specific admin setting
export async function getAdminSetting<K extends keyof AdminSettings>(
  key: K,
): Promise<AdminSettings[K]> {
  const settings = await getAdminSettings();
  return settings[key];
}

// Function to update admin settings (for use in admin dashboard)
export async function updateAdminSettings(
  newSettings: Partial<AdminSettings>,
): Promise<void> {
  try {
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newSettings),
    });

    if (!response.ok) {
      throw new Error("Failed to update admin settings");
    }
  } catch (error) {
    logger.error("Error saving admin settings", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}

// Synchronous version for server-side usage (returns defaults)
export function getAdminSettingsSync(): AdminSettings {
  logger.info("Getting admin settings sync", {
    settings: DEFAULT_ADMIN_SETTINGS,
  });
  return DEFAULT_ADMIN_SETTINGS;
}
