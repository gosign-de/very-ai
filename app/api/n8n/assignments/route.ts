import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/assignments" });

// GET - Fetch all webhook assignments for the authenticated user
// Supports filtering by entity_type, entity_id, or webhook_id via query params
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
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const webhookId = searchParams.get("webhook_id");

    // Check if user is admin
    const { data: _isAdmin } = await supabase.rpc("is_admin", {
      user_id: userId,
    });

    let query = supabase.from("n8n_webhook_assignments").select(`
        *,
        n8n_webhooks (
          id,
          name,
          description,
          webhook_url,
          http_method,
          schema,
          custom_headers,
          status,
          thinking_steps_enabled,
          timeout_minutes
        )
      `);

    // If not admin, filter by user_id
    // if (!isAdmin) {
    //   query = query.eq("user_id", userId);
    // }

    // Apply filters if provided
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (entityId) {
      query = query.eq("entity_id", entityId);
    }
    if (webhookId) {
      query = query.eq("webhook_id", webhookId);
    }

    query = query.order("created_at", { ascending: false });

    const { data: assignments, error } = await query;

    if (error) {
      logger.error("Error fetching assignments", { error });
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    // Enrich assistant assignments with assistant details (name, sharing, author)
    const enrichedAssignments = await Promise.all(
      (assignments || []).map(async (assignment: any) => {
        if (assignment.entity_type === "assistant") {
          const { data: assistant } = await supabase
            .from("assistants")
            .select("id, name, sharing, user_id, author, group_id")
            .eq("id", assignment.entity_id)
            .single();

          if (assistant) {
            return {
              ...assignment,
              entity_details: {
                name: assistant.name,
                sharing: assistant.sharing,
                author: assistant.author || "Unknown",
                group_id: assistant.group_id,
              },
            };
          }
        }
        return assignment;
      }),
    );

    return NextResponse.json(
      { success: true, data: enrichedAssignments },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/assignments", {
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

// POST - Create a new webhook assignment
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
    const { webhook_id, entity_type, entity_id } = body;

    // Validation
    if (!webhook_id || !entity_type || !entity_id) {
      return NextResponse.json(
        {
          error: "Missing required fields: webhook_id, entity_type, entity_id",
        },
        { status: 400 },
      );
    }

    // Validate entity_type
    if (!["model", "assistant"].includes(entity_type)) {
      return NextResponse.json(
        { error: "entity_type must be 'model' or 'assistant'" },
        { status: 400 },
      );
    }

    // Verify webhook exists and belongs to user
    const { data: webhook, error: webhookError } = await supabase
      .from("n8n_webhooks")
      .select("id, status")
      .eq("id", webhook_id)
      .eq("user_id", userId)
      .single();

    if (webhookError || !webhook) {
      return NextResponse.json(
        { error: "Webhook not found or does not belong to you" },
        { status: 404 },
      );
    }

    // If entity_type is assistant, verify assistant exists and belongs to user
    if (entity_type === "assistant") {
      const { data: assistant, error: assistantError } = await supabase
        .from("assistants")
        .select("id")
        .eq("id", entity_id)
        .eq("user_id", userId)
        .single();

      if (assistantError || !assistant) {
        return NextResponse.json(
          { error: "Assistant not found or does not belong to you" },
          { status: 404 },
        );
      }
    }

    // Create assignment
    const { data: assignment, error } = await supabase
      .from("n8n_webhook_assignments")
      .insert({
        user_id: userId,
        webhook_id,
        entity_type,
        entity_id,
      })
      .select(
        `
        *,
        n8n_webhooks (
          id,
          name,
          description,
          webhook_url,
          http_method,
          schema,
          custom_headers,
          status,
          thinking_steps_enabled,
          timeout_minutes
        )
      `,
      )
      .single();

    if (error) {
      logger.error("Error creating assignment", { error });

      // Handle unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This webhook is already assigned to this entity" },
          { status: 409 },
        );
      }

      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, data: assignment },
      { status: 201 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in POST /api/n8n/assignments", {
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
