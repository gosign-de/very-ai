import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-top-users" });

export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { numDays, modelName } = await request.json();
    const { supabase } = createClient(request);

    // Convert "all_models" to null for the database function, keep specific model names as-is
    const modelParam =
      modelName === "all_models" ||
      modelName === null ||
      modelName === undefined
        ? null
        : modelName;

    const { data, error } = await supabase.rpc("get_top_users", {
      role_param: "assistant",
      limit_param: 5,
      time_period: numDays,
      model_param: modelParam,
    });

    if (error) {
      logger.error("Error fetching data", { error });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching top users", {
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
