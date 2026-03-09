import { Tables } from "@/supabase/types";
import { LLMID } from "@/types";
import {
  validateAndGetAvailableModelAsync,
  isModelDeprecated,
  validateModelWithRestrictions,
} from "../models/model-availability";
import { updateWorkspace } from "@/db/workspaces";
import { supabase } from "@/lib/supabase/browser-client";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({
  feature: "lib/services/workspace-model-validation",
});

/**
 * Validate and update workspace default model if it's deprecated
 */
export const validateWorkspaceModel = async (
  workspace: Tables<"workspaces">,
  _showToast: boolean = false,
): Promise<Tables<"workspaces">> => {
  const currentModel = workspace.default_model as LLMID;

  if (!currentModel) {
    return workspace;
  }

  // Check if the current model is deprecated
  if (isModelDeprecated(currentModel)) {
    // Get admin settings to use the configured fallback model
    const fallbackModel = await validateAndGetAvailableModelAsync(currentModel);

    // Update the workspace with the fallback model
    const updatedWorkspace = await updateWorkspace(workspace.id, {
      ...workspace,
      default_model: fallbackModel,
    });

    // No toast notification as requested
    return updatedWorkspace;
  }

  return workspace;
};

/**
 * Validate and update workspace image model if it's deprecated
 */
export const validateWorkspaceImageModel = async (
  workspace: Tables<"workspaces">,
  _showToast: boolean = false,
): Promise<Tables<"workspaces">> => {
  const currentImageModel = workspace.default_image_model as LLMID;

  if (!currentImageModel) {
    return workspace;
  }

  // Check if the current image model is deprecated
  if (isModelDeprecated(currentImageModel)) {
    const fallbackModel =
      await validateAndGetAvailableModelAsync(currentImageModel);

    // Update the workspace with the fallback model
    const updatedWorkspace = await updateWorkspace(workspace.id, {
      ...workspace,
      default_image_model: fallbackModel,
    });

    // No toast notification as requested
    return updatedWorkspace;
  }

  return workspace;
};

/**
 * Validate both default model and image model for a workspace
 * Now also checks model restrictions based on user's groups
 */
export const validateWorkspaceModels = async (
  workspace: Tables<"workspaces">,
  _showToast: boolean = false,
): Promise<Tables<"workspaces">> => {
  let updatedWorkspace = workspace;

  // Get ALL user groups (not just selected) for restriction checking
  const session = (await supabase.auth.getSession()).data.session;
  let userGroupIds: string[] = [];

  if (session?.user?.id) {
    try {
      const { data: allGroups } = await supabase
        .from("managed_user_groups")
        .select("group_id")
        .eq("user_id", session.user.id);

      if (allGroups) {
        userGroupIds = allGroups.map((g: any) => g.group_id);
      }
    } catch (error) {
      logger.error("Error fetching user groups for validation", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    }
  }

  // Validate default model (check both deprecation and restrictions)
  const currentModel = updatedWorkspace.default_model as LLMID;
  if (currentModel) {
    const validatedModel = await validateModelWithRestrictions(
      currentModel,
      userGroupIds,
    );

    if (validatedModel !== currentModel) {
      updatedWorkspace = await updateWorkspace(updatedWorkspace.id, {
        ...updatedWorkspace,
        default_model: validatedModel,
      });
    }
  }

  // Validate image model (check both deprecation and restrictions)
  const currentImageModel = updatedWorkspace.default_image_model as LLMID;
  if (currentImageModel) {
    const validatedImageModel = await validateModelWithRestrictions(
      currentImageModel,
      userGroupIds,
    );

    if (validatedImageModel !== currentImageModel) {
      updatedWorkspace = await updateWorkspace(updatedWorkspace.id, {
        ...updatedWorkspace,
        default_image_model: validatedImageModel,
      });
    }
  }

  return updatedWorkspace;
};
