import { supabase } from "@/lib/supabase/browser-client";
import { Tables } from "@/supabase/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/storage/workspace-images" });

export const uploadWorkspaceImage = async (
  workspace: Tables<"workspaces">,
  image: File,
) => {
  const bucket = "workspace_images";

  const imageSizeLimit = 6000000; // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  const currentPath = workspace.image_path;
  let filePath = `${workspace.user_id}/${workspace.id}/${Date.now()}`;

  if (currentPath.length > 0) {
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([currentPath]);

    if (deleteError) {
      throw new Error("Error deleting old image");
    }
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, image, {
      upsert: true,
    });

  if (error) {
    throw new Error("Error uploading image");
  }

  return filePath;
};

export const getWorkspaceImageFromStorage = async (filePath: string) => {
  try {
    const { data, error } = await supabase.storage
      .from("workspace_images")
      .createSignedUrl(filePath, 60 * 60 * 24); // 24hrs

    if (error) {
      throw new Error("Error downloading workspace image");
    }

    return data.signedUrl;
  } catch (error) {
    logger.error("Error getting workspace image from storage", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
};
