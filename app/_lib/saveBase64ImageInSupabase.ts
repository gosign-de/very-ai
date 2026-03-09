import { Database } from "@/supabase/types";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "auth/saveBase64ImageInSupabase" });

const getSupabaseSession = async () => {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: "sb-veryai-auth-token",
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );
  return supabase;
};

const saveInStorage = async (supabase, userID: string, imageBlob: Blob) => {
  const fileName = `image-${Date.now()}.jpeg`;
  const { data, error } = await supabase.storage
    .from(`message_images/${userID}`) // Replace with your actual bucket name
    .upload(fileName, imageBlob, {
      contentType: "image/jpeg",
    });

  if (error) {
    logger.error("Error uploading image", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
  return data?.path;
};

const getImageUrl = async (supabase, userID, path) => {
  const expiryDurationInSeconds = 60 * 60 * 24 * 365 * 20; // 20 years
  const { data, error } = await supabase.storage
    .from("message_images")
    .createSignedUrl(`${userID}/${path}`, expiryDurationInSeconds);

  if (error) {
    logger.error("Error generating signed URL", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }

  return data.signedUrl;
};

function base64ToBlob(base64Data, contentType = "image/jpeg") {
  const byteCharacters = atob(base64Data.split(",")[1]);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = Array.from(slice, char => char.charCodeAt(0));
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

export const saveBase64ImageInSupabase = async (base64Image: string) => {
  const imageBlob = base64ToBlob(base64Image);

  const supabase = await getSupabaseSession();
  const userID = (await supabase.auth.getUser()).data.user.id;

  if (!userID) {
    throw new Error("User not found");
  }

  const path = await saveInStorage(supabase, userID, imageBlob);
  if (path) {
    const imageUrl = await getImageUrl(supabase, userID, path);
    return imageUrl;
  }
};
