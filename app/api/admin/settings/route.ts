import { NextRequest, NextResponse } from "next/server";
import { AdminSettings } from "@/lib/config/admin-settings";
import { routeAuthentication } from "@/db/authentication";
import { authenticateApiRequest } from "@/lib/auth/api-guard";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

// Default admin settings
const DEFAULT_SETTINGS: AdminSettings = {
  default_model: "gemini-2.5-pro",
  default_image_model: "imagen-3.0-generate-002",
  default_context_length: 1048576,
  default_temperature: 0.5,
  default_prompt: "You are a helpful AI assistant.",
  default_embeddings_provider: "openai",
  include_profile_context: true,
  include_workspace_instructions: true,
  default_fallback_model: "gemini-2.5-pro",
  onedrive_enabled: true,
  sharepoint_enabled: false,
};

// Helper function to read settings from database
async function readSettingsFromDB(): Promise<AdminSettings> {
  try {
    const { data, error } = await getServiceClient()
      .from("admin_settings")
      .select("key, value");

    if (error) {
      const logger = createLogger({ feature: "api/admin/settings" });
      logger.error("Error reading admin settings from database", {
        error: error.message,
      });
      return DEFAULT_SETTINGS;
    }

    // Convert array of {key, value} to AdminSettings object
    const settings: Record<string, any> = {};

    data?.forEach(item => {
      const key = item.key;
      let value: any = item.value;

      // Convert string values to appropriate types
      if (key === "default_context_length" || key === "default_temperature") {
        value = parseFloat(value);
      } else if (
        key === "include_profile_context" ||
        key === "include_workspace_instructions" ||
        key === "onedrive_enabled" ||
        key === "sharepoint_enabled"
      ) {
        value = value === "true";
      }

      settings[key] = value;
    });

    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/settings" });
    logger.error("Error in readSettingsFromDB", {
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_SETTINGS;
  }
}

// Helper function to write settings to database
async function writeSettingsToDB(settings: AdminSettings): Promise<void> {
  try {
    // Convert AdminSettings object to array of {key, value} for database
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value), // Convert all values to strings for database storage
    }));

    // Update each setting
    for (const update of updates) {
      const { error } = await getServiceClient()
        .from("admin_settings")
        .upsert(update, { onConflict: "key" });

      if (error) {
        const logger = createLogger({ feature: "api/admin/settings" });
        logger.error("Error updating admin setting", {
          key: update.key,
          error: error.message,
        });
        throw error;
      }
    }
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/settings" });
    logger.error("Error in writeSettingsToDB", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiRequest(request);
    if ("error" in authResult) {
      return authResult.error;
    }
    const settings = await readSettingsFromDB();
    return NextResponse.json(settings);
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/settings" });
    logger.error("Error getting admin settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const body = await request.json();
    const newSettings = body as Partial<AdminSettings>;

    // Read current settings and merge with new ones
    const currentSettings = await readSettingsFromDB();

    const updatedSettings = { ...currentSettings, ...newSettings };

    // Write updated settings to database
    await writeSettingsToDB(updatedSettings);

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/settings" });
    logger.error("Error updating admin settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
