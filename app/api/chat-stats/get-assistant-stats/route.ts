import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-assistant-stats" });

export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { supabase } = createClient(request);

    const { data, error } = await supabase.rpc("get_assistant_stats");

    if (error) {
      logger.error("Error fetching data", { error });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching assistant stats", {
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
