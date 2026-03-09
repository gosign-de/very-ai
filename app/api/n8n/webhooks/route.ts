import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/webhooks" });

// GET - Fetch all webhooks for the authenticated user
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

    // Check if user is admin
    const { data: _isAdmin } = await supabase.rpc("is_admin", {
      user_id: userId,
    });

    let query = supabase
      .from("n8n_webhooks")
      .select("*")
      .order("created_at", { ascending: false });

    // If not admin, filter by user_id
    // if (!isAdmin) {
    //   query = query.eq("user_id", userId);
    // }

    const { data: webhooks, error } = await query;

    if (error) {
      logger.error("Error fetching webhooks", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, data: webhooks },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/webhooks", {
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

// POST - Create a new webhook
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
      name,
      description,
      webhook_url,
      http_method = "POST",
      schema,
      custom_headers,
      status = "active",
      thinking_steps_enabled = false,
      timeout_minutes = 15,
    } = body;

    // Validation
    if (!name || !webhook_url || !schema) {
      return NextResponse.json(
        { error: "Missing required fields: name, webhook_url, schema" },
        { status: 400 },
      );
    }

    // Validate schema is valid JSON
    try {
      if (typeof schema === "string") {
        JSON.parse(schema);
      }
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid schema: must be valid JSON" },
        { status: 400 },
      );
    }

    // Validate custom_headers is valid JSON if provided
    if (custom_headers) {
      try {
        if (typeof custom_headers === "string") {
          JSON.parse(custom_headers);
        }
      } catch (_error) {
        return NextResponse.json(
          { error: "Invalid custom_headers: must be valid JSON" },
          { status: 400 },
        );
      }
    }

    // Insert webhook
    const { data: webhook, error } = await supabase
      .from("n8n_webhooks")
      .insert({
        user_id: userId,
        name,
        description: description || null,
        webhook_url,
        http_method,
        schema: typeof schema === "string" ? JSON.parse(schema) : schema,
        custom_headers: custom_headers
          ? typeof custom_headers === "string"
            ? JSON.parse(custom_headers)
            : custom_headers
          : null,
        status,
        thinking_steps_enabled,
        timeout_minutes,
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating webhook", { error });

      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A webhook with this name already exists" },
          { status: 409 },
        );
      }

      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: webhook }, { status: 201 });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in POST /api/n8n/webhooks", {
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
