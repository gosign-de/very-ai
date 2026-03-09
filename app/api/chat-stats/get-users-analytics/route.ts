import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat-stats/get-users-analytics" });

export async function POST(request: NextRequest) {
  try {
    const { start_date, end_date } = await request.json();

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }
    const { data, error } = await supabase.rpc("get_users_analytics", {
      start_date,
      end_date,
    });

    if (error) {
      logger.error("Error fetching user analytics", { error });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching users analytics", {
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
