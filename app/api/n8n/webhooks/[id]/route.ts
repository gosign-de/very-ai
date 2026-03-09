import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/webhooks/[id]" });

// GET - Fetch a single webhook by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const { data: webhook, error } = await supabase
      .from("n8n_webhooks")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 },
        );
      }

      logger.error("Error fetching webhook", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: webhook }, { status: 200 });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/webhooks/[id]", {
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

// PUT - Update a webhook
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      http_method,
      schema,
      custom_headers,
      status,
      thinking_steps_enabled,
      timeout_minutes,
    } = body;

    // Build update object with only provided fields
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (webhook_url !== undefined) updateData.webhook_url = webhook_url;
    if (http_method !== undefined) updateData.http_method = http_method;
    if (status !== undefined) updateData.status = status;
    if (thinking_steps_enabled !== undefined)
      updateData.thinking_steps_enabled = thinking_steps_enabled;
    if (timeout_minutes !== undefined)
      updateData.timeout_minutes = timeout_minutes;

    // Validate and parse schema if provided
    if (schema !== undefined) {
      try {
        updateData.schema =
          typeof schema === "string" ? JSON.parse(schema) : schema;
      } catch (_error) {
        return NextResponse.json(
          { error: "Invalid schema: must be valid JSON" },
          { status: 400 },
        );
      }
    }

    // Validate and parse custom_headers if provided
    if (custom_headers !== undefined) {
      if (custom_headers === null) {
        updateData.custom_headers = null;
      } else {
        try {
          updateData.custom_headers =
            typeof custom_headers === "string"
              ? JSON.parse(custom_headers)
              : custom_headers;
        } catch (_error) {
          return NextResponse.json(
            { error: "Invalid custom_headers: must be valid JSON" },
            { status: 400 },
          );
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const { data: webhook, error } = await supabase
      .from("n8n_webhooks")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 },
        );
      }

      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A webhook with this name already exists" },
          { status: 409 },
        );
      }

      logger.error("Error updating webhook", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: webhook }, { status: 200 });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in PUT /api/n8n/webhooks/[id]", {
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

// DELETE - Delete a webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    // Check if webhook exists and belongs to user
    const { data: _webhook, error: fetchError } = await supabase
      .from("n8n_webhooks")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 },
        );
      }

      logger.error("Error checking webhook", { error: fetchError });
      return NextResponse.json(
        { message: fetchError.message },
        { status: 500 },
      );
    }

    // Delete webhook (cascade will delete assignments and logs)
    const { error: deleteError } = await supabase
      .from("n8n_webhooks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      logger.error("Error deleting webhook", { error: deleteError });
      return NextResponse.json(
        { message: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Webhook deleted successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in DELETE /api/n8n/webhooks/[id]", {
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
