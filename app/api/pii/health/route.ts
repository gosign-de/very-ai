import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { Database } from "@/supabase/types";
import {
  detectPii,
  isPiiEngineConfigured,
  type PiiDetectionEngine,
} from "@/lib/pii-detection";
import { getPiiSettingsForModel } from "@/lib/pii-settings-server";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/pii/health" });

const SAMPLE_TEXT = "Contact Jane Doe at jane.doe@example.com";
const SAMPLE_CATEGORY = ["Email"];

function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function checkEngineHealth(engine: PiiDetectionEngine) {
  const configured = isPiiEngineConfigured(engine);

  if (!configured) {
    return {
      configured: false,
      checked: false,
    };
  }

  try {
    const result = await detectPii(engine, SAMPLE_TEXT, "en", SAMPLE_CATEGORY);
    return {
      configured: true,
      checked: true,
      ok: true,
      entitiesDetected: result.entities.length,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      configured: true,
      checked: true,
      ok: false,
      error: err.message ?? "Unknown error",
    };
  }
}

export async function GET(_request: NextRequest) {
  const _profile = await getServerProfile();

  const supabaseAdmin = createSupabaseAdminClient();
  const modelId = "global-default";

  let detectionEngine: PiiDetectionEngine = "azure";
  let categories: string[] = [];

  try {
    const settings = await getPiiSettingsForModel(supabaseAdmin, modelId);
    if (settings) {
      detectionEngine = settings.detection_engine;
      categories = settings.categories ?? [];
    }
  } catch (error) {
    logger.error("Failed to load PII settings", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }

  const [azureHealth, presidioHealth] = await Promise.all([
    checkEngineHealth("azure"),
    checkEngineHealth("presidio"),
  ]);

  return NextResponse.json({
    selectedEngine: detectionEngine,
    modelId,
    categories,
    azure: azureHealth,
    presidio: presidioHealth,
    timestamp: new Date().toISOString(),
  });
}
