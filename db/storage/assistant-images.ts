import { supabase } from "@/lib/supabase/browser-client";
import { Tables } from "@/supabase/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/storage/assistant-images" });

export const uploadAssistantImage = async (
  assistant: Tables<"assistants">,
  image: File,
) => {
  const bucket = "assistant_images";

  const imageSizeLimit = 6000000; // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  const currentPath = assistant.image_path;
  let filePath = `${assistant.user_id}/${assistant.id}/${Date.now()}`;

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

export const copyAssistantImage = async (
  assistant: Tables<"assistants">,
  imagePath: string,
) => {
  const bucket = "assistant_images";
  const filePath = `${assistant.user_id}/${assistant.id}/${Date.now()}`;
  const { error: copyError } = await supabase.storage
    .from(bucket)
    .copy(imagePath, filePath);

  if (copyError) {
    logger.error("Error copying image of assistant", {
      error:
        copyError instanceof Error
          ? { message: copyError.message, name: copyError.name }
          : copyError,
    });
  }

  return filePath;
};

export const uploadSignatureImage = async (
  assistant: Tables<"assistants">,
  image: File,
) => {
  const bucket = "assistant_images";

  const imageSizeLimit = 6000000; // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`);
  }

  const currentPath = assistant.image_path;
  let filePath = `${assistant.user_id}/${assistant.id}/${Date.now()}`;

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
export const getAssistantImageFromStorage = async (filePath: string) => {
  try {
    const { data, error } = await supabase.storage
      .from("assistant_images")
      .createSignedUrl(filePath, 60 * 60 * 24); // 24hrs

    if (error) {
      throw new Error("Error downloading assistant image");
    }

    return data.signedUrl;
  } catch (error) {
    logger.error("Error getting assistant image from storage", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
};
