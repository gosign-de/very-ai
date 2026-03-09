import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({
  feature: "api/groupAssistant/updateConfidential",
});

export async function PUT(request: NextRequest) {
  try {
    const { id, is_confidential } = await request.json();

    if (!id || is_confidential === undefined) {
      return NextResponse.json(
        { success: false, error: "ID and is_confidential are required" },
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

    const { error } = await supabase
      .from("assistants")
      .update({ is_confidential })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { success: true, message: "Confidentiality updated successfully" },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error updating confidentiality", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { success: false, error: "Failed to update confidentiality" },
      { status: 500 },
    );
  }
}
