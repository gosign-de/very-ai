import { supabase } from "@/lib/supabase/browser-client";
import { getAssistantImageFromStorage } from "@/db/storage/assistant-images";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/group_assistants" });

export const getAllGroupsAssistants = async (groupIds: string[]) => {
  try {
    if (groupIds.length === 0) {
      return [];
    }

    // Get user's selected groups
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return [];
    }

    // Get only the selected groups
    const { data: selectedGroups, error: groupError } = await supabase
      .from("managed_user_groups")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("is_selected", true);

    if (groupError) {
      logger.error("Error fetching selected groups", {
        error:
          groupError instanceof Error
            ? { message: groupError.message, name: groupError.name }
            : groupError,
      });
      return [];
    }

    const selectedGroupIds = selectedGroups?.map(g => g.group_id) || [];

    // If no groups are selected, return empty array
    if (selectedGroupIds.length === 0) {
      return [];
    }

    // Fetch assistants only from selected groups
    const { data, error } = await supabase
      .from("assistants")
      .select("*")
      .in("group_id", selectedGroupIds);

    if (error) {
      throw error;
    }
    return data || [];
  } catch (error) {
    logger.error("Error fetching group assistants", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return [];
  }
};

export const getAllGroupsAssistantsImages = async (imagePaths: string[]) => {
  // Fetch all images in parallel for better performance
  const imageUrls = await Promise.all(
    imagePaths.map(imagePath => getAssistantImageFromStorage(imagePath)),
  );
  return imageUrls;
};

export const getGroupAssistantByUserId = async (assistantId: string) => {
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
