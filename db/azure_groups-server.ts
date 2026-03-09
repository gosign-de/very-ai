// Server-only Azure groups functions
// This file should only be imported in server-side code (API routes, server components, server actions)
import "server-only";

import { auth } from "@/app/_lib/auth";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "db/azure_groups-server" });

/**
 * Check if the current user's Azure AD groups are valid
 * This function requires server-side authentication
 * @returns boolean - true if user has valid groups, false otherwise
 */
export const userGroupIsValid = async () => {
  const azureUserSession = await auth();

  // Extract group IDs from azureUserSession
  if (!azureUserSession?.user?.groups) {
    return false;
  }

  const userGroupIds = azureUserSession?.user?.groups.map(group => group.id);

  // Use server-side Supabase client with service role to bypass RLS
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase.rpc("check_azure_groups_exists", {
    group_ids: userGroupIds,
  });

  if (error) {
    logger.error("Error checking groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }

  return data;
};
