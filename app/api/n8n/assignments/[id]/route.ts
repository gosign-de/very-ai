import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/assignments/[id]" });

// DELETE - Remove a webhook assignment
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

    // Check if assignment exists and belongs to user
    const { data: _assignment, error: fetchError } = await supabase
      .from("n8n_webhook_assignments")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Assignment not found" },
          { status: 404 },
        );
      }

      logger.error("Error checking assignment", { error: fetchError });
      return NextResponse.json(
        { message: fetchError.message },
        { status: 500 },
      );
    }

    // Delete assignment
    const { error: deleteError } = await supabase
      .from("n8n_webhook_assignments")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      logger.error("Error deleting assignment", { error: deleteError });
      return NextResponse.json(
        { message: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Assignment deleted successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in DELETE /api/n8n/assignments/[id]", {
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
