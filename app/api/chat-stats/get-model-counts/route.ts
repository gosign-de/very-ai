import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-model-counts" });

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

    const { data, error } = await supabase.rpc("get_model_counts", {
      role_param: "assistant",
      time_period: period,
    });

    if (error) {
      logger.error("Error fetching model counts", { error });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Filter by model if specified
    let filteredData = data;
    if (modelParam && modelParam !== "all_models") {
      filteredData = data.filter(item => item.model === modelParam);
    }

    // Convert array of {model, count} to object format for pie chart
    const modelCountStats = filteredData.reduce((acc, item) => {
      if (item.model && item.count) {
        acc[item.model] = Number(item.count);
      }
      return acc;
    }, {});

    return NextResponse.json(
      { success: true, data: modelCountStats },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error fetching model counts", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return NextResponse.json(
      { success: false, error: "Failed to fetch model counts" },
      { status: 500 },
    );
  }
}
