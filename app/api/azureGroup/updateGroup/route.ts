import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/azureGroup/updateGroup" });

export async function PUT(request: NextRequest) {
  try {
    const { groupId, isChecked } = await request.json();

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { error } = await supabase
      .from("azure_groups")
      .update({ group_status: isChecked })
      .eq("group_id", groupId);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { success: true, message: "Group status updated successfully" },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error updating group status", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return NextResponse.json(
      { success: false, error: "Failed to update group status" },
      { status: 500 },
    );
  }
}
