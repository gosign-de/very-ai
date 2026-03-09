import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({
  feature: "api/chat-stats/get-monthly-active-users",
});

export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    const { start_date, end_date } = await request.json();

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { supabase } = createClient(request);

    const { data, error } = await supabase.rpc("get_monthly_active_users", {
      start_date,
      end_date,
    });

    if (error) {
      logger.error("Error fetching data", { error });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching monthly active users", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return NextResponse.json(
      { success: false, error: "Failed to fetch monthly active users" },
      { status: 500 },
    );
  }
}
