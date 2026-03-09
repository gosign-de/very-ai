import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/azureGroup/updateAllGroups" });

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const auth = await routeAuthentication(request);

    if (!auth) {
      return NextResponse.redirect(new URL("/no-access", request.url));
    }

    const { id, groupData } = await request.json();

    const { data: existingGroup, error: checkError } = await supabase
      .from("azure_groups")
      .select("id")
      .eq("group_id", id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      logger.error("Error checking group existence", {
        error: { message: checkError.message },
      });
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 },
      );
    }

    if (existingGroup) {
      // Update existing group
      const { error: updateError } = await supabase
        .from("azure_groups")
        .update({
          name: groupData.name,
          email: groupData.email,
        })
        .eq("group_id", id);

      if (updateError) {
        logger.error("Error updating group", {
          error: { message: updateError.message },
        });
        return NextResponse.json(
          { success: false, error: "Failed to update group" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, message: "Group updated" });
    } else {
      // Insert new group
      const { error: insertError } = await supabase
        .from("azure_groups")
        .insert({
          id: uuidv4(),
          group_id: id,
          name: groupData.name,
          email: groupData.email,
          group_status: false,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        logger.error("Error inserting group", {
          error: { message: insertError.message },
        });
        return NextResponse.json(
          { success: false, error: "Failed to create group" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, message: "Group created" });
    }
  } catch (error) {
    logger.error("Error in API", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    );
  }
}
