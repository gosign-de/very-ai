/**
 * API Route: Process Message for PII Detection
 * Handles PII detection and masking for user messages
 */

import { NextRequest, NextResponse } from "next/server";
import { processUserMessage } from "@/lib/pii-message-processor";
import { createClient } from "@/lib/supabase/middleware";
import { isPiiEngineConfigured } from "@/lib/pii-detection";
import { logPiiAudit } from "@/lib/azure-pii-detection";
import { getPiiSettingsForModel } from "@/lib/pii-settings-server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/pii/process-message" });

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { content, language, model_id } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    const userEmail = sessionData?.session?.user?.email;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    const effectiveModelId = model_id || "global-default";
    let detectionEngine: "azure" | "presidio" = "azure";
    let piiCategories: string[] = [];
    let audit_log_enabled: boolean = false;

    try {
      const piiSettings = await getPiiSettingsForModel(
        supabase,
        effectiveModelId,
      );

      if (piiSettings) {
        detectionEngine = piiSettings.detection_engine;
        piiCategories = piiSettings.categories ?? [];
        audit_log_enabled = piiSettings.audit_log_enabled;
      }
    } catch (error) {
      logger.error("Failed to load PII settings", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    }

    if (!isPiiEngineConfigured(detectionEngine)) {
      return NextResponse.json(
        {
          error: "PII detection is not configured",
          originalContent: content,
          redactedContent: content,
          piiDetected: false,
        },
        { status: 200 },
      );
    }
    logger.info("Using PII detection engine", {
      detectionEngine,
      effectiveModelId,
    });
    // Process message for PII with selected categories
    const result = await processUserMessage(
      content,
      language,
      piiCategories,
      detectionEngine,
    );
    // Log PII audit entries
    if (audit_log_enabled) {
      await logPiiAudit(
        supabase,
        result.piiEntities.map(entity => ({
          userId,
          userEmail,
          modelId: effectiveModelId,
          piiType: entity.category,
          piiAction: "Anonymized",
          detectionEngine,
        })),
      );
    }
    return NextResponse.json({
      originalContent: result.originalContent,
      redactedContent: result.redactedContent,
      piiDetected: result.piiEntities.length > 0,
      entitiesCount: result.piiEntities.length,
      entities: result.piiEntities,
      tokenMap: result.tokenMap,
      tokenMetadata: result.tokenMetadata,
      detectionEngine,
      effectiveModelId,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error processing message for PII", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      {
        error: "Failed to process message for PII",
        details: err.message,
      },
      { status: 500 },
    );
  }
}
