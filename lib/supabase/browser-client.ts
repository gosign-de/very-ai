import { Database } from "@/supabase/types";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    cookieOptions: {
      name: "sb-veryai-auth-token",
    },
  },
);
