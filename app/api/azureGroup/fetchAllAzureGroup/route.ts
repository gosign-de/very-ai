import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/azureGroup/fetchAllAzureGroup" });

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { data: groups, error } = await supabase
      .from("azure_groups")
      .select("*");

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: groups }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching Azure groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return NextResponse.json(
      { success: false, error: "Failed to fetch groups" },
      { status: 500 },
    );
  }
}
