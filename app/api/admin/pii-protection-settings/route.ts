import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get("model_id");

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    let query = supabase
      .from("pii_protection_settings")
      .select("*")
      .eq("model_id", modelId);

    const { data, error } = await query;

    if (error) throw error;

    if (data.length == 0) {
      const { data: globalData, error: globalError } = await supabase
        .from("pii_protection_settings")
        .select("*")
        .eq("model_id", "global-default");

      if (globalError) throw globalError;
      return NextResponse.json(globalData ?? []);
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    const logger = createLogger({
      feature: "api/admin/pii-protection-settings",
    });
    logger.error("Error fetching PII protection settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model_id, ...newSettings } = body;
    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }
    if (!model_id || typeof model_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid model_id" },
        { status: 400 },
      );
    }

    const buildPayload = (includeProcessing = true) => ({
      model_id,
      enabled: newSettings.enabled,
      detection_engine: newSettings.detection_engine,
      custom_patterns: newSettings.custom_patterns,
      categories: newSettings.categories,
      max_sensitivity_level: newSettings.max_sensitivity_level,
      audit_log_enabled: newSettings.audit_log_enabled,
      audit_log_retention_days: newSettings.audit_log_retention_days,
      ...(includeProcessing
        ? {
            image_processing: newSettings.image_processing,
            doc_processing: newSettings.doc_processing,
          }
        : {}),
      updated_at: new Date().toISOString(),
    });

    let payload = buildPayload();

    const logger = createLogger({
      feature: "api/admin/pii-protection-settings",
    });
    logger.info("[PII] Upserting settings", { model_id, userId, payload });

    let { error } = await supabase
      .from("pii_protection_settings")
      .upsert(payload, { onConflict: "model_id" })
      .select()
      .single();

    if (error && /column .* does not exist/i.test(error.message ?? "")) {
      logger.warn(
        "[PII] Retrying upsert without image/doc processing columns",
        {
          error: error.message,
        },
      );
      payload = buildPayload(false);
      ({ error } = await supabase
        .from("pii_protection_settings")
        .upsert(payload, { onConflict: "model_id" })
        .select()
        .single());
    }

    if (error) {
      logger.error("Supabase upsert error", { error: error.message });
      return NextResponse.json(
        { error: error.message ?? "Failed to update settings" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const logger = createLogger({
      feature: "api/admin/pii-protection-settings",
    });
    logger.error("Error updating PII protection settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
