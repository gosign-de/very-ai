import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/callback" });

/**
 * POST /api/n8n/callback/[executionId]
 *
 * Callback endpoint for n8n to send step updates during async workflow execution.
 * Authenticates using a secret token in the Authorization header.
 * Uses service role client with user_id scoping (execution already has user_id stored).
 *
 * Headers:
 * - Authorization: Bearer <N8N_CALLBACK_SECRET>
 *
 * Body can contain:
 * - step: { number, name, status } - for step updates
 * - status: "running" | "completed" | "error" - for execution status updates
 * - result: any - final result when completed
 * - error_message: string - error details
 * - n8n_execution_id: string - n8n's internal execution ID
 * - total_steps: number - total steps in workflow
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  try {
    const { executionId } = await params;

    // Validate secret token from Authorization header
    const authHeader = request.headers.get("Authorization");
    const expectedSecret = process.env.N8N_CALLBACK_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 },
      );
    }

    const providedToken = authHeader.replace("Bearer ", "");
    if (providedToken !== expectedSecret) {
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 401 },
      );
    }

    if (!executionId) {
      return NextResponse.json(
        { error: "Execution ID is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const {
      thinkingcallback,
      step,
      status,
      result,
      error_message,
      n8n_execution_id,
      total_steps,
    } = body;

    // Create Supabase client with service role key
    // Execution already has user_id stored, so data is scoped correctly
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify execution exists and is not expired
    const { data: execution, error: fetchError } = await supabase
      .from("n8n_workflow_executions")
      .select("id, status, expires_at, user_id")
      .eq("id", executionId)
      .single();

    if (fetchError || !execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 },
      );
    }

    // Check if expired
    if (new Date(execution.expires_at) < new Date()) {
      // Mark as timeout if not already
      if (execution.status !== "timeout") {
        await supabase.rpc("update_execution_from_callback", {
          p_execution_id: executionId,
          p_status: "timeout",
          p_error_message: "Execution timed out",
        });
      }
      return NextResponse.json(
        { error: "Execution has expired" },
        { status: 410 },
      );
    }

    // Check if already completed
    if (["completed", "error", "timeout"].includes(execution.status)) {
      return NextResponse.json(
        { error: "Execution already finished", status: execution.status },
        { status: 409 },
      );
    }

    // Handle step update
    if (
      thinkingcallback &&
      typeof thinkingcallback === "object" &&
      thinkingcallback.value
    ) {
      const { error: thinkingError } = await supabase.rpc(
        "upsert_thinkingcallback_step",
        {
          p_execution_id: executionId,
          p_step_value: thinkingcallback.value,
        },
      );

      if (thinkingError) {
        logger.error("Thinkingcallback step error", { error: thinkingError });
      }
    }
    // Handle legacy step format (explicit number/name/status)
    else if (step && typeof step === "object") {
      const { number, name, status: stepStatus } = step;

      if (typeof number === "number" && name && stepStatus) {
        // Update step (RPC also updates execution.current_step which triggers Realtime)
        const { error: stepError } = await supabase.rpc(
          "upsert_workflow_step",
          {
            p_execution_id: executionId,
            p_step_number: number,
            p_step_name: name,
            p_status: stepStatus,
            p_metadata: step.metadata || null,
          },
        );

        if (stepError) {
          logger.error("Step upsert error", { error: stepError });
        }
      }
    }

    // Handle execution status update
    if (
      status ||
      result !== undefined ||
      error_message ||
      n8n_execution_id ||
      total_steps
    ) {
      // If completing, first complete any running step
      if (status === "completed" || status === "error") {
        const { error: completeError } = await supabase.rpc(
          "complete_last_thinkingcallback_step",
          {
            p_execution_id: executionId,
          },
        );
        if (completeError) {
          logger.error("complete_last_thinkingcallback_step error", {
            error: completeError,
          });
        }
      }

      // Ensure result is properly formatted for JSONB storage
      // If result is a string, try to parse it; otherwise keep as-is
      let processedResult = null;
      if (result !== undefined && result !== null) {
        if (typeof result === "string") {
          try {
            processedResult = JSON.parse(result);
          } catch {
            // If not valid JSON, wrap it in an object
            processedResult = { content: result };
          }
        } else {
          processedResult = result;
        }
      }

      logger.info("Updating execution", {
        executionId,
        status,
        hasResult: result !== undefined,
        resultType: typeof result,
        processedResultType: typeof processedResult,
      });

      const { error: updateError } = await supabase.rpc(
        "update_execution_from_callback",
        {
          p_execution_id: executionId,
          p_status: status || null,
          p_current_step: step?.number || null,
          p_total_steps: total_steps || null,
          p_result: processedResult,
          p_error_message: error_message || null,
          p_n8n_execution_id: n8n_execution_id || null,
        },
      );

      if (updateError) {
        logger.error("update_execution_from_callback error", {
          error: updateError,
        });
        return NextResponse.json(
          { error: "Failed to update execution", details: updateError.message },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { success: true, execution_id: executionId },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("n8n callback error", {
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
