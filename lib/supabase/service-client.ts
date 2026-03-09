import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/supabase/types";

// Lazy Supabase service client — avoids crash at build time when env vars are empty.
// The client is created on first use, not at module import time.
let _client: SupabaseClient<Database> | null = null;

export function getServiceClient(): SupabaseClient<Database> {
  if (!_client) {
    const url =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set. " +
          "Service client cannot be created without valid credentials.",
      );
    }
    _client = createClient<Database>(url, key);
  }
  return _client;
}
