import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-model-stats" });

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

    const { data, error } = await supabase.rpc("get_model_stats_aggregated", {
      role_param: "assistant",
      time_period: period,
      model_name: modelParam,
    });

    if (error) {
      logger.error("Error fetching data", { error });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Filter by model if specified (this provides additional client-side filtering if needed)
    let filteredData = data;
    if (modelParam && modelParam !== "all_models") {
      filteredData = data.filter(message => message.model === modelParam);
    }

    return NextResponse.json(
      { success: true, data: filteredData },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error fetching model stats", {
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
