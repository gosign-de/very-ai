import { Database } from "@/supabase/types";
import { createClient } from "@supabase/supabase-js";
import { getServerProfile } from "@/lib/server/server-chat-helpers";

export async function POST(request: Request) {
  const json = await request.json();
  const { username } = json as {
    username: string;
  };

  try {
    const _profile = await getServerProfile();
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: usernames, error } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("username", username);

    if (!usernames) {
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ isAvailable: !usernames.length }), {
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage =
      (error as any)?.error?.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
