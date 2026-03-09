import { supabase } from "@/lib/supabase/browser-client";
import { LLM, LLMID } from "@/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/models/model-restrictions" });

/**
 * Filter models based on user's group restrictions
 * If no restrictions exist for the user's groups, all models are allowed
 */
export async function filterModelsByGroupRestrictions(
  models: LLM[],
  userGroupIds: string[],
): Promise<LLM[]> {
  try {
    // If user has no groups, return all models
    if (!userGroupIds || userGroupIds.length === 0) {
      return models;
    }

    // Fetch all restrictions for user's groups
    const { data: restrictions, error } = await supabase
      .from("model_restrictions")
      .select("*")
      .in("group_id", userGroupIds);

    if (error) {
      logger.error("Error fetching model restrictions", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      // On error, return all models (fail open)
      return models;
    }

    // If no restrictions exist for ANY group, all models are allowed
    if (!restrictions || restrictions.length === 0) {
      return models;
    }

    // Group restrictions by group_id - now only contains RESTRICTED models (is_allowed: false)
    // Absence of a model in the map means it's ALLOWED
    const restrictionsByGroup = new Map<string, Set<string>>();

    restrictions.forEach(restriction => {
      // Only track restricted models (is_allowed: false)
      if (!restriction.is_allowed) {
        if (!restrictionsByGroup.has(restriction.group_id)) {
          restrictionsByGroup.set(restriction.group_id, new Set());
        }
        restrictionsByGroup
          .get(restriction.group_id)!
          .add(restriction.model_id);
      }
    });

    // UNION LOGIC: Show models that are allowed in AT LEAST ONE group
    // Model is shown if ANY group allows it (doesn't restrict it)
    const filteredModels = models.filter(model => {
      // Check each group - if ANY group allows the model, show it
      for (const groupId of userGroupIds) {
        const restrictedModels = restrictionsByGroup.get(groupId);

        // If group has no restrictions, it allows ALL models
        if (!restrictedModels) {
          return true;
        }

        // If model is NOT in the restricted set for this group, it's allowed
        if (!restrictedModels.has(model.modelId)) {
          return true;
        }
      }

      // Model is restricted by ALL groups - block it
      return false;
    });

    return filteredModels;
  } catch (error) {
    logger.error("Error in filterModelsByGroupRestrictions", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    // On error, return all models (fail open)
    return models;
  }
}

/**
 * Check if a specific model is allowed for user's groups
 */
export async function isModelAllowedForUser(
  modelId: LLMID,
  userGroupIds: string[],
): Promise<boolean> {
  try {
    // If user has no groups, allow all models
    if (!userGroupIds || userGroupIds.length === 0) {
      return true;
    }

    // Check restrictions for this model across user's groups
    const { data: restrictions, error } = await supabase
      .from("model_restrictions")
      .select("*")
      .in("group_id", userGroupIds)
      .eq("model_id", modelId);

    if (error) {
      logger.error("Error checking model allowance", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      // On error, allow the model (fail open)
      return true;
    }

    // If no restrictions exist, model is allowed
    if (!restrictions || restrictions.length === 0) {
      return true;
    }

    // Group restrictions by group_id - only contains RESTRICTED models (is_allowed: false)
    const restrictionsByGroup = new Map<string, Set<string>>();
    restrictions.forEach(r => {
      // Only track restricted models
      if (!r.is_allowed) {
        if (!restrictionsByGroup.has(r.group_id)) {
          restrictionsByGroup.set(r.group_id, new Set());
        }
        restrictionsByGroup.get(r.group_id)!.add(r.model_id);
      }
    });

    // UNION LOGIC: Model is allowed if AT LEAST ONE group allows it
    // Check each group - if ANY group allows the model, return true
    for (const groupId of userGroupIds) {
      const restrictedModels = restrictionsByGroup.get(groupId);

      // If group has no restrictions, it allows ALL models
      if (!restrictedModels) {
        return true;
      }

      // If model is NOT in the restricted set for this group, it's allowed
      if (!restrictedModels.has(modelId)) {
        return true;
      }
    }

    // Model is restricted by ALL groups - block it
    return false;
  } catch (error) {
    logger.error("Error in isModelAllowedForUser", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    // On error, allow the model (fail open)
    return true;
  }
}

/**
 * Get all restrictions for a specific group
 */
export async function getGroupModelRestrictions(
  groupId: string,
): Promise<{ modelId: string; isAllowed: boolean }[]> {
  try {
    const { data: restrictions, error } = await supabase
      .from("model_restrictions")
      .select("*")
      .eq("group_id", groupId);

    if (error) {
      logger.error("Error fetching group restrictions", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      return [];
    }

    return (restrictions || []).map(r => ({
      modelId: r.model_id,
      isAllowed: r.is_allowed,
    }));
  } catch (error) {
    logger.error("Error in getGroupModelRestrictions", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
}
