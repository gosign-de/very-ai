import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-chat-stats" });

export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { period, modelName } = await request.json();
    const { supabase } = createClient(request);

    // Convert "all_models" to null for the database function, keep specific model names as-is
    const modelParam =
      modelName === "all_models" ||
      modelName === null ||
      modelName === undefined
        ? null
        : modelName;

    const { data, error } = await supabase.rpc("get_request_count", {
      role_param: "assistant",
      time_period: period,
      model_param: modelParam,
    });

    if (error) {
      logger.error("Error fetching message counts", { error });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching chat stats", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return NextResponse.json(
      { success: false, error: "Failed to fetch assistants" },
      { status: 500 },
    );
  }
}
