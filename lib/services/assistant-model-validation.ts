import { Tables } from "@/supabase/types";
import { LLMID } from "@/types";
import {
  validateAndGetAvailableModelAsync,
  isModelDeprecated,
  validateModelWithRestrictions,
} from "../models/model-availability";
import { updateAssistant } from "@/db/assistants";
import { supabase } from "@/lib/supabase/browser-client";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({
  feature: "lib/services/assistant-model-validation",
});

/**
 * Validate and update assistant model if it's deprecated
 */
export const validateAssistantModel = async (
  assistant: Tables<"assistants">,
  _showToast: boolean = false,
): Promise<Tables<"assistants">> => {
  const currentModel = assistant.model as LLMID;

  if (!currentModel) {
    return assistant;
  }

  // Check if the current model is deprecated
  if (isModelDeprecated(currentModel)) {
    // Use async model validation to get proper fallback from admin settings
    const fallbackModel = await validateAndGetAvailableModelAsync(currentModel);

    // Update the assistant with the fallback model
    const updatedAssistant = await updateAssistant(assistant.id, {
      ...assistant,
      model: fallbackModel,
    });

    // No toast notification as requested
    return updatedAssistant;
  }

  return assistant;
};

/**
 * Validate models for multiple assistants
 * Now also checks model restrictions based on user's groups
 */
export const validateAssistantModels = async (
  assistants: Tables<"assistants">[],
  _showToast: boolean = false,
): Promise<Tables<"assistants">[]> => {
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
      logger.error("Error fetching user groups for assistant validation", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    }
  }

  // Process all assistants in parallel for better performance
  const validationPromises = assistants.map(async assistant => {
    const currentModel = assistant.model as LLMID;

    if (currentModel) {
      // Validate model considering both deprecation and restrictions
      const validatedModel = await validateModelWithRestrictions(
        currentModel,
        userGroupIds,
      );

      if (validatedModel !== currentModel) {
        const updatedAssistant = await updateAssistant(assistant.id, {
          ...assistant,
          model: validatedModel,
        });
        return updatedAssistant;
      }
    }
    return assistant;
  });

  return Promise.all(validationPromises);
};
