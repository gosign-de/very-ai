import { createClient } from "@/lib/supabase/middleware";
import { i18nRouter } from "next-i18n-router";
import { NextResponse, type NextRequest } from "next/server";
import i18nConfig from "./i18nConfig";

export async function proxy(request: NextRequest) {
  const i18nResult = i18nRouter(request, i18nConfig);
  if (i18nResult) return i18nResult;

  try {
    const { supabase, response } = createClient(request);

    // getUser() validates the token server-side and refreshes if needed,
    // ensuring cookies stay in sync between server and browser.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const redirectToChat = user && request.nextUrl.pathname === "/";

    if (redirectToChat) {
      const { data: homeWorkspace, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_home", true)
        .single();

      if (!homeWorkspace) {
        throw new Error(error?.message);
      }

      return NextResponse.redirect(
        new URL(`/${homeWorkspace.id}/chat`, request.url),
      );
    }

    return response;
  } catch (_e) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next|auth).*)",
};
