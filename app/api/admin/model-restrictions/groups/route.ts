import { NextRequest, NextResponse } from "next/server";
import { getActiveModelIds } from "@/lib/model-names";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { authenticateApiRequest } from "@/lib/auth/api-guard";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/admin/model-restrictions/groups" });

// Disable caching for this route - always fetch fresh data
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiRequest(request);
    if ("error" in authResult) {
      return authResult.error;
    }
    // Use service role key to bypass RLS - same as Groups tab
    const adminClient = createServiceRoleClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch all Azure groups from database
    const { data: groups, error: groupsError } = await adminClient
      .from("azure_groups")
      .select("*");

    if (groupsError) {
      logger.error("Error fetching groups", { error: groupsError });
      return NextResponse.json(
        { error: "Failed to fetch groups", details: groupsError.message },
        { status: 500 },
      );
    }

    // Fetch restrictions for each group individually (workaround for RLS issue with SELECT *)
    const restrictionsByGroup: Record<string, any[]> = {};

    for (const group of groups || []) {
      const { data: groupRestrictions, error: restrictionError } =
        await adminClient
          .from("model_restrictions")
          .select("*")
          .eq("group_id", group.group_id);

      if (!restrictionError && groupRestrictions) {
        restrictionsByGroup[group.group_id] = groupRestrictions;
      }
    }

    // Combine groups with their restriction stats
    const groupsWithStats = (groups || []).map((group: any) => {
      // Match restrictions by group_id field from azure_groups table
      const groupRestrictions = restrictionsByGroup[group.group_id] || [];

      // Filter to only count ACTIVE models (not old/inactive models)
      // Database now only contains RESTRICTED models (is_allowed: false)
      const activeModelIds = getActiveModelIds();
      const activeRestrictions = groupRestrictions.filter((r: any) =>
        activeModelIds.includes(r.model_id),
      );

      // Count restricted models (only active models with is_allowed: false)
      const restrictedCount = activeRestrictions.filter(
        (r: any) => !r.is_allowed,
      ).length;

      // Total active models count
      const totalActiveModels = activeModelIds.length;

      // Allowed models = total - restricted
      const allowedCount = totalActiveModels - restrictedCount;

      // A group has custom restrictions if there are any active restriction records
      const hasRestrictions = restrictedCount > 0;

      const stats = {
        id: group.group_id, // Use group_id as the primary identifier
        display_name: group.name || group.group_id,
        description: group.type || group.email,
        hasRestrictions: hasRestrictions,
        restrictionCount: activeRestrictions.length,
        allowedModels: allowedCount,
        restrictedModels: restrictedCount,
      };

      return stats;
    });

    // Return with no-cache headers to prevent stale data in production
    const response = NextResponse.json(
      { data: groupsWithStats },
      { status: 200 },
    );
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  } catch (error) {
    logger.error("Error in GET /api/admin/model-restrictions/groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
