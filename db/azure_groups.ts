import { supabase } from "@/lib/supabase/browser-client";
import { createClient } from "@supabase/supabase-js";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/azure_groups" });

// userGroupIsValid has been moved to db/azure_groups-server.ts
// Import it from there in server-side code only
// This prevents client components from importing server-only auth code

export const getAllAzureGroups = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("user_groups")
      .select("azure_groups(*)")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    const formattedData = data
      .map(item => item.azure_groups)
      .filter(g => g != null);
    return formattedData;
  } catch (error) {
    logger.error("Error fetching azure groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
};

/**
 * Get user's effective groups (admin predefined + user selected)
 * This should be used in group wizards to show only the groups the user has access to
 * @returns Array of groups that the user can use
 * @deprecated Use getUserSelectedGroups instead - get_user_effective_groups RPC doesn't exist
 */
export const getUserEffectiveGroups = async () => {
  // This function uses a non-existent RPC function
  // Use getUserSelectedGroups instead
  return getUserSelectedGroups();
};
export const getGroups = async (groupIds: string[]) => {
  try {
    const { data: group, error } = await supabase
      .from("azure_groups")
      .select("*")
      .in("group_id", groupIds);

    if (error) {
      throw error;
    }
    return group || [];
  } catch (error) {
    logger.error("Error fetching azure groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
};

/**
 * Check if the current user is an admin in any of their groups
 * Admins have elevated permissions including the ability to delete group assistants from all users
 * @param groupIds - Array of group IDs that the user belongs to
 * @returns boolean - true if user is admin in any group, false otherwise
 */
export const getIsAdminGroups = async (
  groupIds: string[],
): Promise<boolean> => {
  try {
    if (!groupIds || groupIds.length === 0) {
      return false;
    }

    const { data: groups, error } = await supabase
      .from("azure_groups")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("role", "admin");

    if (error) {
      logger.error("Error checking admin status", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      throw error;
    }

    // User is admin if they have admin role in any of their groups
    return groups.length > 0;
  } catch (error) {
    logger.error("Error fetching azure groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
};

/**
 * Get user's managed groups with their selection status
 * @param sessionGroups - Optional array of groups from user's session
 * @returns Array of managed groups with selection status
 */
export const getUserManagedGroups = async (sessionGroups?: any[]) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return [];
    }

    // First check if user has any managed groups
    const { data: managedGroups, error: managedError } = await supabase
      .from("managed_user_groups")
      .select("*")
      .eq("user_id", user.id);

    if (managedError) {
      logger.error("Error fetching managed groups", {
        error:
          managedError instanceof Error
            ? { message: managedError.message, name: managedError.name }
            : managedError,
      });
      return [];
    }

    // If no managed groups exist, initialize them
    if (!managedGroups || managedGroups.length === 0) {
      await supabase.rpc("initialize_managed_groups_for_user", {
        p_user_id: user.id,
      });
    }

    // Also check if there are azure_groups that user has access to but aren't in managed_user_groups
    if (sessionGroups && sessionGroups.length > 0) {
      const sessionGroupIds = sessionGroups.map(g => g.id);

      // Find groups that exist in azure_groups AND user has access to, but not in managed_user_groups
      const { data: existingAzureGroups } = await supabase
        .from("azure_groups")
        .select("group_id")
        .in("group_id", sessionGroupIds);

      if (existingAzureGroups && existingAzureGroups.length > 0) {
        const managedGroupIds = managedGroups?.map(m => m.group_id) || [];
        const missingGroups = existingAzureGroups.filter(
          ag => !managedGroupIds.includes(ag.group_id),
        );

        // Add missing groups to managed_user_groups
        if (missingGroups.length > 0) {
          const toInsert = missingGroups.map(g => ({
            user_id: user.id,
            group_id: g.group_id,
            is_selected: true,
          }));

          await supabase.from("managed_user_groups").insert(toInsert).select();
        }
      }
    }

    // Fetch managed groups with azure group details
    const { data, error } = await supabase
      .from("managed_user_groups")
      .select(
        `
        *,
        azure_groups (
          group_id,
          name,
          type,
          email
        )
      `,
      )
      .eq("user_id", user.id)
      .order("azure_groups(name)");

    if (error) {
      logger.error("Error fetching managed groups with details", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      return [];
    }

    const dbGroups = data || [];

    // Use session groups if provided
    if (sessionGroups && sessionGroups.length > 0) {
      // Get group IDs that are already in DB
      const dbGroupIds = dbGroups.map(group => group.group_id);

      // Find session groups not in DB and apply filtering
      const sessionOnlyGroups = sessionGroups.filter(sessionGroup => {
        // If group is already in DB, it will be shown from dbGroups
        if (dbGroupIds.includes(sessionGroup.id)) {
          return false;
        }

        // For session-only groups, filter out security groups and _ext groups
        const endsWithExt =
          sessionGroup.displayName &&
          sessionGroup.displayName.toLowerCase().endsWith("_ext");

        // Check if group type explicitly contains "Security"
        const isSecurityGroup =
          sessionGroup.type && sessionGroup.type.includes("Security");

        // Log filtered groups
        if (endsWithExt || isSecurityGroup) {
          logger.info("Filtering out session-only group", {
            displayName: sessionGroup.displayName,
            endsWithExt,
            isSecurityGroup,
            type: sessionGroup.type,
          });
        }

        // Include only if NOT security type AND NOT ending with _ext
        return !endsWithExt && !isSecurityGroup;
      });

      // Fetch missing group names from Graph API
      let enrichedSessionGroups = sessionOnlyGroups;

      // Check if any session groups are missing display names
      const groupsNeedingNames = sessionOnlyGroups.filter(
        sessionGroup =>
          !sessionGroup.displayName || sessionGroup.displayName.trim() === "",
      );

      if (groupsNeedingNames.length > 0) {
        try {
          // Use direct fetch to our API endpoint
          const response = await fetch("/api/graph/groups", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              groupIds: groupsNeedingNames.map(g => g.id),
            }),
          });

          if (response.ok) {
            const graphGroups = await response.json();

            // Enrich session groups with Graph API data
            enrichedSessionGroups = sessionOnlyGroups.map(sessionGroup => {
              const graphGroup = graphGroups.find(
                (g: any) => g.id === sessionGroup.id,
              );
              if (graphGroup) {
                return {
                  ...sessionGroup,
                  displayName: graphGroup.displayName,
                  mail: graphGroup.mail,
                  description: graphGroup.description,
                  groupTypes: graphGroup.groupTypes,
                };
              }
              return sessionGroup;
            });
          } else {
            logger.error("Graph API response not ok", {
              status: response.status,
            });
          }
        } catch (error) {
          logger.error("Error fetching group names from Graph API", {
            error:
              error instanceof Error
                ? { message: error.message, name: error.name }
                : error,
          });
          // Continue with original session groups if Graph API fails
        }
      }

      // Add session-only groups to the result
      const sessionOnlyEntries = enrichedSessionGroups.map(sessionGroup => ({
        id: `session_${sessionGroup.id}_${user.id}`,
        user_id: user.id,
        group_id: sessionGroup.id,
        is_selected: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        azure_groups: {
          group_id: sessionGroup.id,
          name: sessionGroup.displayName || sessionGroup.id,
          type: sessionGroup.groupTypes?.join(", ") || null,
          email: sessionGroup.mail || null,
        },
        is_session_only: true,
      }));

      // Combine DB groups with session-only groups
      const allGroups = [
        ...dbGroups.map(group => ({ ...group, is_session_only: false })),
        ...sessionOnlyEntries,
      ];

      // Sort by group name
      allGroups.sort((a, b) => {
        const nameA = a.azure_groups?.name || a.group_id;
        const nameB = b.azure_groups?.name || b.group_id;
        return nameA.localeCompare(nameB);
      });

      return allGroups;
    }

    // Fallback: just return DB groups if session fetch fails
    return dbGroups.map(group => ({ ...group, is_session_only: false }));
  } catch (error) {
    logger.error("Error in getUserManagedGroups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
};

/**
 * Update managed group selection status
 * Creates new entry for session-only groups, updates existing entries
 * @param groupId - Group ID to update
 * @param isSelected - New selection status
 * @param sessionGroupData - Optional session group data for creating azure_groups entry
 * @returns boolean - success status
 */
export const updateManagedGroupSelection = async (
  groupId: string,
  isSelected: boolean,
  sessionGroupData?: {
    displayName?: string;
    name?: string;
    mail?: string;
    email?: string;
    groupTypes?: string[];
    type?: string;
    description?: string;
  },
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return false;
    }

    // Try the database function first (if it exists)

    // If session data doesn't have displayName, try to fetch from Graph API
    let enrichedSessionData = sessionGroupData;
    if (
      sessionGroupData &&
      (!sessionGroupData.displayName ||
        sessionGroupData.displayName.trim() === "")
    ) {
      try {
        const response = await fetch("/api/graph/groups", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ groupIds: [groupId] }),
        });

        if (response.ok) {
          const graphGroups = await response.json();
          if (graphGroups.length > 0) {
            const graphGroup = graphGroups[0];
            enrichedSessionData = {
              ...sessionGroupData,
              displayName: graphGroup.displayName,
              mail: graphGroup.mail,
              description: graphGroup.description,
              groupTypes: graphGroup.groupTypes,
            };
          }
        } else {
          logger.error("Graph API response not ok", {
            status: response.status,
          });
        }
      } catch (error) {
        logger.error("Error fetching group details from Graph API", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
        // Continue with original session data if Graph API fails
      }
    }

    try {
      const rpcParams = {
        p_user_id: user.id,
        p_group_id: groupId,
        p_group_name:
          enrichedSessionData?.displayName ||
          enrichedSessionData?.name ||
          groupId,
        p_group_email:
          enrichedSessionData?.mail || enrichedSessionData?.email || null,
        p_group_type:
          enrichedSessionData?.groupTypes?.[0] ||
          enrichedSessionData?.type ||
          null,
        p_is_selected: isSelected,
      };

      const { data, error } = await supabase.rpc(
        "create_session_group_and_manage",
        rpcParams,
      );

      if (!error && data === true) {
        return true;
      } else if (!error && data === false) {
        // The function ran but failed internally - let's try to get more info
        return false;
      } else if (error) {
        logger.error("Database function had an error", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
        return false;
      }

      // If function has error, log it and fall back
      logger.error("Database function error", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    } catch (funcError) {
      logger.error("Database function exception", {
        error:
          funcError instanceof Error
            ? { message: funcError.message, name: funcError.name }
            : funcError,
      });
    }

    // Fallback: Try to update existing entry first
    const { data: updateResult, error: updateError } = await supabase
      .from("managed_user_groups")
      .update({ is_selected: isSelected })
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .select();

    if (updateError) {
      logger.error("Error updating managed group", {
        error:
          updateError instanceof Error
            ? { message: updateError.message, name: updateError.name }
            : updateError,
      });
      return false;
    }

    // If no rows were updated, this is a session-only group that doesn't exist in azure_groups
    if (!updateResult || updateResult.length === 0) {
      logger.error(
        "Cannot create session-only group: Group must exist in azure_groups table first",
      );
      logger.error(
        "Please ask your administrator to add this group to the system",
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error in updateManagedGroupSelection", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
};

/**
 * Get user's selected groups for display in dropdowns
 * This replaces getUserEffectiveGroups for group assistant dropdown
 * @returns Array of selected groups
 */
export const getUserSelectedGroups = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return [];
    }

    const { data, error } = await supabase.rpc("get_user_selected_groups", {
      p_user_id: user.id,
    });

    if (error) {
      logger.error("Error fetching selected groups", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error("Error fetching selected groups", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
};

// Server-side admin check that bypasses RLS using service role
export const getIsAdminGroupsServer = async (groupIds: string[]) => {
  try {
    // Create admin client with service role to bypass RLS
    const adminSupabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: groups, error } = await adminSupabase
      .from("azure_groups")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("role", "admin");

    if (error) {
      logger.error("Error fetching azure groups (server)", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      return false;
    }

    return groups.length > 0;
  } catch (error) {
    logger.error("Error in getIsAdminGroupsServer", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
};
