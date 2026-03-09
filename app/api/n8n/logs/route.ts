import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/logs" });

// GET - Fetch webhook execution logs for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("webhook_id");
    const status = searchParams.get("status");
    const modelId = searchParams.get("model_id");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("n8n_webhook_logs")
      .select(
        `
        *,
        n8n_webhooks (
          id,
          name
        )
      `,
        { count: "exact" },
      )
      .eq("user_id", userId);

    // Apply filters if provided
    if (webhookId) {
      query = query.eq("webhook_id", webhookId);
    }
    if (status === "errors_only") {
      // Filter for all error-related statuses
      query = query.in("status", ["cancelled", "error", "timeout"]);
    } else if (status) {
      query = query.eq("status", status);
    }
    if (modelId) {
      query = query.eq("model_id", modelId);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      logger.error("Error fetching webhook logs", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: logs,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: count ? offset + limit < count : false,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/logs", {
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

// POST - Create a new webhook log (used by webhook execution)
export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    const body = await request.json();
    const {
      webhook_id,
      model_id,
      assistant_id,
      chat_id,
      request_data,
      response_data,
      status,
      error_message,
      execution_time_ms,
      http_status_code,
    } = body;

    // Validation
    if (!webhook_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: webhook_id, status" },
        { status: 400 },
      );
    }

    // Call database function to log execution
    const { data: logId, error } = await supabase.rpc("log_webhook_execution", {
      p_user_id: userId,
      p_webhook_id: webhook_id,
      p_model_id: model_id || null,
      p_assistant_id: assistant_id || null,
      p_chat_id: chat_id || null,
      p_request_data: request_data || null,
      p_response_data: response_data || null,
      p_status: status,
      p_error_message: error_message || null,
      p_execution_time_ms: execution_time_ms || null,
      p_http_status_code: http_status_code || null,
    });

    if (error) {
      logger.error("Error creating webhook log", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, data: { id: logId } },
      { status: 201 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in POST /api/n8n/logs", {
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
