import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createClient } from "@/lib/supabase/middleware";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/settings" });

// GET - Fetch n8n settings for the current user
export async function GET(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Fetch settings from profiles table
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("n8n_url, n8n_api_key")
      .eq("user_id", userId)
      .single();

    if (error) {
      logger.error("Error fetching n8n settings", { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          n8n_url: profile?.n8n_url || null,
          n8n_api_key: profile?.n8n_api_key || null,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in GET /api/n8n/settings", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Save n8n settings
export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = createClient(request);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const body = await request.json();
    const { n8n_url, n8n_api_key } = body;

    // Validate required fields
    if (!n8n_url || !n8n_api_key) {
      return NextResponse.json(
        { error: "n8n URL and API key are required" },
        { status: 400 },
      );
    }

    // Validate URL format
    try {
      new URL(n8n_url);
    } catch (_e) {
      return NextResponse.json(
        { error: "Invalid n8n URL format" },
        { status: 400 },
      );
    }

    // Update settings in profiles table
    const { error } = await supabase
      .from("profiles")
      .update({
        n8n_url,
        n8n_api_key,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      logger.error("Error saving n8n settings", { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Settings saved successfully",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in POST /api/n8n/settings", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
