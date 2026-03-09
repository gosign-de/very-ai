import { supabase } from "@/lib/supabase/browser-client";
import { TablesInsert, TablesUpdate } from "@/supabase/types";
import { getIsAdminGroups } from "@/db/azure_groups";
import { getGroupAssistantByUserId } from "@/db/group_assistants";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/assistants" });

export const getAssistantById = async (assistantId: string) => {
  const { data: assistant, error } = await supabase
    .from("assistants")
    .select("*")
    .eq("id", assistantId)
    .single();

  if (!assistant) {
    throw new Error(error.message);
  }

  return assistant;
};

export const getAssistantWorkspacesByWorkspaceId = async (
  workspaceId: string,
) => {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select(
      `
      id,
      name,
      assistants (*)
    `,
    )
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    throw new Error(error.message);
  }

  return workspace;
};

export const getAssistantByGroupId = async (groupIds: string[]) => {
  try {
    if (groupIds.length === 0) {
      return { groupassistants: [] };
    }
    const { data, error } = await supabase
      .from("assistants")
      .select("*")
      .not("group_id", "is", null);

    if (error) {
      throw error;
    }
    return { groupassistants: data };
  } catch (error) {
    logger.error("Error fetching group assistants", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
};

export const getAssistantWorkspacesByAssistantId = async (
  assistantId: string,
) => {
  const { data: assistant, error } = await supabase
    .from("assistants")
    .select(
      `
      id,
      name,
      workspaces (*)
    `,
    )
    .eq("id", assistantId)
    .single();

  if (!assistant) {
    throw new Error(error.message);
  }

  return assistant;
};

export const createAssistant = async (
  assistant: TablesInsert<"assistants">,
  workspace_id: string,
) => {
  const { data: createdAssistant, error } = await supabase
    .from("assistants")
    .insert([assistant])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAssistantWorkspace({
    user_id: createdAssistant.user_id,
    assistant_id: createdAssistant.id,
    workspace_id,
  });

  return createdAssistant;
};

export const createAssistants = async (
  assistants: TablesInsert<"assistants">[],
  workspace_id: string,
) => {
  const { data: createdAssistants, error } = await supabase
    .from("assistants")
    .insert(assistants)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  await createAssistantWorkspaces(
    createdAssistants.map(assistant => ({
      user_id: assistant.user_id,
      assistant_id: assistant.id,
      workspace_id,
    })),
  );

  return createdAssistants;
};

export const createAssistantWorkspace = async (item: {
  user_id: string;
  assistant_id: string;
  workspace_id: string;
}) => {
  const { data: createdAssistantWorkspace, error } = await supabase
    .from("assistant_workspaces")
    .insert([item])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdAssistantWorkspace;
};

export const createAssistantWorkspaces = async (
  items: { user_id: string; assistant_id: string; workspace_id: string }[],
) => {
  const { data: createdAssistantWorkspaces, error } = await supabase
    .from("assistant_workspaces")
    .insert(items)
    .select("*");

  if (error) throw new Error(error.message);

  return createdAssistantWorkspaces;
};

export const updateAssistant = async (
  assistantId: string,
  assistant: TablesUpdate<"assistants">,
) => {
  const { data: updatedAssistant, error } = await supabase
    .from("assistants")
    .update(assistant)
    .eq("id", assistantId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedAssistant;
};

export const deleteAssistant = async (assistantId: string) => {
  const { error } = await supabase
    .from("assistants")
    .delete()
    .eq("id", assistantId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const deleteAssistantWorkspace = async (
  assistantId: string,
  workspaceId: string,
) => {
  const { error } = await supabase
    .from("assistant_workspaces")
    .delete()
    .eq("assistant_id", assistantId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  return true;
};

export const fetchAssistantsByGroupId = async (groupId: string) => {
  const { data, error } = await supabase
    .from("assistants")
    .select("*")
    .eq("group_id", groupId);

  if (error) {
    logger.error("Error fetching assistants by group ID", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
  return data;
};

export const fetchAssistantById = async (assistantId: string) => {
  const { data, error } = await supabase
    .from("assistants")
    .select("*")
    .eq("id", assistantId)
    .single();

  if (error) {
    logger.error("Error fetching assistant by ID", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
  return data;
};

export const deleteGroupAssistant = async (
  assistantId: string,
  _groupIds?: string[],
) => {
  try {
    const { error } = await supabase
      .from("assistants")
      .delete()
      .eq("id", assistantId);

    if (error) {
      logger.error("Failed to delete group assistant", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      throw new Error(error.message);
    }

    return true;
  } catch (error) {
    logger.error("Error in deleteGroupAssistant", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
};

/**
 * Check if the current user can delete a specific group assistant
 * Returns true if:
 * - User is the owner of the assistant, OR
 * - User is an admin (admins can delete group assistants from all users)
 * @param assistantId - ID of the assistant to check
 * @param currentUserId - ID of the current user
 * @param userGroupIds - Array of group IDs that the current user belongs to
 * @returns boolean - true if user can delete the assistant, false otherwise
 */
export const canDeleteGroupAssistant = async (
  assistantId: string,
  currentUserId: string,
  userGroupIds: string[],
): Promise<boolean> => {
  try {
    // Get the assistant details
    const assistant = await getGroupAssistantByUserId(assistantId);

    if (!assistant) {
      return false;
    }

    // Check if user is the owner
    const isOwner = currentUserId === assistant.user_id;

    // Check if user is an admin (admins can delete all group assistants)
    const isAdmin = await getIsAdminGroups(userGroupIds);

    // User can delete if they are owner OR admin
    return isOwner || isAdmin;
  } catch (error) {
    logger.error("Error checking delete permission for group assistant", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
};
