import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAuthentication } from "@/db/authentication";
import { authenticateApiRequest } from "@/lib/auth/api-guard";
import { createLogger } from "@/lib/logger";

// Disable caching for this route - always fetch fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET: Fetch all model restrictions or for a specific group
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiRequest(request);
    if ("error" in authResult) {
      return authResult.error;
    }
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    let query = supabase
      .from("model_restrictions")
      .select("*")
      .order("created_at", { ascending: false });

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query;

    if (error) {
      const logger = createLogger({ feature: "api/admin/model-restrictions" });
      logger.error("Error fetching model restrictions", {
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to fetch model restrictions", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/model-restrictions" });
    logger.error("Error in GET /api/admin/model-restrictions", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST: Create or update model restrictions for a group
export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const body = await request.json();
    const { groupId, modelRestrictions } = body;

    if (!groupId || !Array.isArray(modelRestrictions)) {
      return NextResponse.json(
        {
          error:
            "Invalid request body. Expected groupId and modelRestrictions array.",
        },
        { status: 400 },
      );
    }

    // Get current user from auth (optional - since we're using service role)
    // For now, we'll set created_by to null or a system user

    // Delete existing restrictions for this group
    const { error: deleteError } = await supabase
      .from("model_restrictions")
      .delete()
      .eq("group_id", groupId);

    if (deleteError) {
      const logger = createLogger({ feature: "api/admin/model-restrictions" });
      logger.error("Error deleting old restrictions", {
        error: deleteError.message,
      });
      return NextResponse.json(
        {
          error: "Failed to update restrictions",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    // Insert new restrictions
    // Note: Only active models should be sent from frontend, but we validate here too
    if (modelRestrictions.length > 0) {
      const restrictionsToInsert = modelRestrictions.map((mr: any) => ({
        group_id: groupId,
        model_id: mr.modelId,
        is_allowed: mr.isAllowed,
        created_by: null, // Can be set to admin user ID if needed
      }));

      const { error: insertError } = await supabase
        .from("model_restrictions")
        .insert(restrictionsToInsert);

      if (insertError) {
        const logger = createLogger({
          feature: "api/admin/model-restrictions",
        });
        logger.error("Error inserting restrictions", {
          error: insertError.message,
        });
        return NextResponse.json(
          {
            error: "Failed to save restrictions",
            details: insertError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Model restrictions updated successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/model-restrictions" });
    logger.error("Error in POST /api/admin/model-restrictions", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE: Remove all restrictions for a group (reset to default)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json(
        { error: "Group ID is required" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("model_restrictions")
      .delete()
      .eq("group_id", groupId);

    if (error) {
      const logger = createLogger({ feature: "api/admin/model-restrictions" });
      logger.error("Error deleting restrictions", { error: error.message });
      return NextResponse.json(
        { error: "Failed to delete restrictions", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Restrictions removed successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    const logger = createLogger({ feature: "api/admin/model-restrictions" });
    logger.error("Error in DELETE /api/admin/model-restrictions", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
