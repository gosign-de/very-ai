import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createClient as createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";
import { serverLogger } from "@/lib/logger";

type AuthSuccess = {
  supabase: SupabaseClient;
  response: Response;
  userId: string;
};

type AuthFailure = {
  error: NextResponse;
};

const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function authenticateApiRequest(
  request: NextRequest,
): Promise<AuthSuccess | AuthFailure> {
  const { supabase, response } = createMiddlewareSupabaseClient(request);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    serverLogger.error("Error fetching session in API guard", {
      error: sessionError.message,
      feature: "auth",
      action: "authenticateApiRequest",
    });
    return { error: unauthorizedResponse() };
  }

  const userId = session?.user?.id;

  if (!userId) {
    serverLogger.warn("API request without valid user session", {
      feature: "auth",
      action: "authenticateApiRequest",
    });
    return { error: unauthorizedResponse() };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    serverLogger.error("Error verifying user profile in API guard", {
      userId,
      error: profileError.message,
      feature: "auth",
      action: "authenticateApiRequest",
    });
    return {
      error: NextResponse.json(
        { error: "Failed to verify user" },
        { status: 500 },
      ),
    };
  }

  if (!profile) {
    serverLogger.warn("User profile not found in API guard", {
      userId,
      feature: "auth",
      action: "authenticateApiRequest",
    });
    return {
      error: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }

  return {
    supabase,
    response,
    userId,
  };
}
