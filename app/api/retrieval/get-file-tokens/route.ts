import { createClient } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/retrieval/get-file-tokens" });

export async function POST(request: NextRequest) {
  try {
    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: "User not found" }, { status: 401 });
    }
    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing fileId parameter" },
        { status: 400 },
      );
    }

    // Get total chunk count for this file
    const { count: totalChunks, error: countError } = await supabase
      .from("file_items")
      .select("*", { count: "exact", head: true })
      .eq("file_id", fileId);

    if (countError) {
      logger.error("Error fetching chunk count", { error: countError });
      return NextResponse.json(
        { error: "Failed to fetch chunk count" },
        { status: 500 },
      );
    }

    // Get total tokens for this file
    const { data: tokenData, error: tokenError } = await supabase
      .from("file_items")
      .select("tokens")
      .eq("file_id", fileId);

    if (tokenError) {
      logger.error("Error fetching token data", { error: tokenError });
      return new NextResponse(
        JSON.stringify({ message: "Failed to fetch token data" }),
        { status: 500 },
      );
    }

    // Calculate total tokens
    const totalTokens = tokenData?.reduce(
      (sum, item) => sum + (item.tokens || 0),
      0,
    );

    return new NextResponse(
      JSON.stringify({
        totalChunks: totalChunks || 0,
        totalTokens: totalTokens || 0,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    logger.error("Error in get-file-stats route", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return new NextResponse(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
}
