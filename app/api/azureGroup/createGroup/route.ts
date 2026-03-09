import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/azureGroup/createGroup" });

export async function POST(request: NextRequest) {
  try {
    const groupData = await request.json();

    if (!groupData || Object.keys(groupData).length === 0) {
      return NextResponse.json(
        { success: false, error: "Group data is required" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { data, error } = await supabase
      .from("azure_groups")
      .insert(groupData)
      .select("*");

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    logger.error("Error creating group", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { success: false, error: "Failed to create group" },
      { status: 500 },
    );
  }
}
