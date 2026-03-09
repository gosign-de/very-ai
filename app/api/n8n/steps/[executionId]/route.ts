import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/steps" });

/**
 * GET /api/n8n/steps/[executionId]
 *
 * Polling endpoint for frontend to check async workflow execution status.
 * Returns current status, steps progress, and error details if failed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { executionId } = await params;

    if (!executionId) {
      return NextResponse.json(
        { error: "Execution ID is required" },
        { status: 400 },
      );
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }

    // Fetch execution with user ownership check (RLS handles this)
    const { data: execution, error: execError } = await supabase
      .from("n8n_workflow_executions")
      .select(
        `
        id,
        status,
        current_step,
        total_steps,
        error_message,
        result,
        n8n_execution_id,
        started_at,
        completed_at,
        expires_at
      `,
      )
      .eq("id", executionId)
      .eq("user_id", userId)
      .single();

    if (execError || !execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 },
      );
    }

    // Fetch steps for this execution
    const { data: steps, error: _stepsError } = await supabase
      .from("n8n_workflow_steps")
      .select(
        `
        step_number,
        step_name,
        status,
        started_at,
        completed_at,
        duration_ms

      `,
      )
      .eq("execution_id", executionId)
      .order("step_number", { ascending: true });

    // Check if execution is expired
    const isExpired =
      execution.expires_at && new Date(execution.expires_at) < new Date();
    const effectiveStatus =
      isExpired && execution.status === "running"
        ? "timeout"
        : execution.status;

    // Build response
    const response: any = {
      success: true,
      execution: {
        id: execution.id,
        status: effectiveStatus,
        current_step: execution.current_step,
        total_steps: execution.total_steps,
        n8n_execution_id: execution.n8n_execution_id,
        started_at: execution.started_at,
        completed_at: execution.completed_at,
      },
      steps: steps || [],
    };

    // Include error message for failed executions
    if (
      ["error", "cancelled", "timeout"].includes(effectiveStatus) &&
      execution.error_message
    ) {
      response.execution.error_message = execution.error_message;
    }

    // Include result for completed executions
    if (effectiveStatus === "completed" && execution.result) {
      response.execution.result = execution.result;
    }

    // Flag for frontend to know if polling should continue
    response.is_finished = [
      "completed",
      "error",
      "cancelled",
      "timeout",
    ].includes(effectiveStatus);

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/steps/[executionId]", {
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
