import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/statistics" });

// GET - Fetch webhook statistics for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    // Call the database function for statistics
    const { data: stats, error } = await supabase.rpc(
      "get_webhook_statistics",
      {
        p_user_id: userId,
        p_days: days,
      },
    );

    if (error) {
      logger.error("Error fetching webhook statistics", { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Call the database function for model usage
    const { data: modelUsage, error: modelError } = await supabase.rpc(
      "get_webhook_usage_by_model",
      {
        p_user_id: userId,
        p_days: days,
      },
    );

    if (modelError) {
      logger.error("Error fetching model usage", { error: modelError });
      // Don't fail the request if model usage fails
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          overall: stats?.[0] || {
            total_webhooks: 0,
            active_webhooks: 0,
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            success_rate: 0,
            avg_execution_time_ms: 0,
          },
          by_model: modelUsage || [],
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/statistics", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
