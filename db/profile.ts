import { supabase } from "@/lib/supabase/browser-client";
import { TablesInsert, TablesUpdate } from "@/supabase/types";
import { getSession } from "next-auth/react";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/supabase/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@microsoft/microsoft-graph-client";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/profile" });

export const getProfileByUserId = async (userId: string) => {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    logger.error("Error fetching profile", {
      error: { message: error.message },
    });
    throw new Error(error.message);
  }

  const profile = profiles?.[0];
  if (!profile) {
    throw new Error("Profile not found");
  }

  return profile;
};

export const getProfilesByUserId = async (userId: string) => {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    logger.error("Error fetching profiles", {
      error: { message: error.message },
    });
    throw new Error(error.message);
  }

  if (!profiles) {
    throw new Error("Profiles not found");
  }

  return profiles;
};

export const createProfile = async (profile: TablesInsert<"profiles">) => {
  const { data: createdProfile, error } = await supabase
    .from("profiles")
    .insert([profile])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdProfile;
};

export const updateProfile = async (
  profileId: string,
  profile: TablesUpdate<"profiles">,
) => {
  const { data: updatedProfile, error } = await supabase
    .from("profiles")
    .update(profile)
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedProfile;
};

export const deleteProfile = async (profileId: string) => {
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const saveProfileImg = async (
  profile: TablesInsert<"profile_images">,
) => {
  const { data: createdProfileImg, error } = await supabase
    .from("profile_images")
    .upsert([profile])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdProfileImg;
};

/**
 * Server-side function to save profile image using service role
 * ONLY used during NextAuth authentication flow where user is verified via Azure AD
 * This is safe because it's only accessible from server-side auth callback
 */
export const saveProfileImage = async (
  profile: TablesInsert<"profile_images">,
) => {
  // Validate input
  if (!profile.user_id || !profile.profile_image) {
    throw new Error("user_id and profile_image are required");
  }

  // Create admin client (same pattern as route.ts)
  const supabaseAdmin = createClient<Database>(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: createdProfileImg, error } = await supabaseAdmin
    .from("profile_images")
    .upsert([profile])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdProfileImg;
};

export const getProfileImage = async () => {
  try {
    const azureUserSession = await getSession();
    const client = Client.init({
      authProvider: done => done(null, azureUserSession.user.accessToken),
    });

    const userPhotoBlob = await client.api("/me/photo/$value").get();
    return userPhotoBlob || null;
  } catch (error) {
    logger.warn("Error fetching user photo", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
};

/* Profile image */
export const getProfiles = async () => {
  const { data: profileImg, error: _error } = await supabase
    .from("profile_images")
    .select("*");

  return profileImg || [];
};

export const getProfileBySessionId = async (sessionId: string) => {
  const { data: sessionValue, error: _error } = await supabase
    .from("profile_images")
    .select("user_id")
    .eq("user_id", sessionId)
    .maybeSingle();

  return sessionValue ? { user_id: sessionValue.user_id } : null;
};

export const getChatGroupId = async (chatId: string) => {
  if (!chatId) return false;

  const { data, error } = await supabase
    .from("chats")
    .select("group_id")
    .eq("id", chatId)
    .not("group_id", "is", null)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
};

export const getCurrentUserSessionId = async () => {
  const azureUserSession = await getSession();

  const sessionId = azureUserSession?.user?.id || null;

  const profileData = await getProfileBySessionId(sessionId);
  const userId = profileData ? profileData?.user_id : null;

  return userId || null;
};

export const setUserAzureId = async (
  supabase: SupabaseClient<Database>,
  supabaseUserId: string,
  azureUserId: string,
) => {
  // First check if this azure_user_id is already assigned to this user
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("user_id, azure_user_id")
    .eq("user_id", supabaseUserId)
    .single();

  // If the user already has this azure_user_id, no need to update
  if (existingProfile?.azure_user_id === azureUserId) {
    return;
  }

  // Check if another user already has this azure_user_id
  const { data: conflictingProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("azure_user_id", azureUserId)
    .neq("user_id", supabaseUserId)
    .maybeSingle();

  if (conflictingProfile) {
    logger.warn(
      "Azure user ID already assigned to another user, skipping update",
      {
        azureUserId,
        existingUserId: conflictingProfile.user_id,
        targetUserId: supabaseUserId,
      },
    );
    return;
  }

  // Safe to update
  const { data: _data, error } = await supabase
    .from("profiles")
    .update({ azure_user_id: azureUserId })
    .eq("user_id", supabaseUserId);
  if (error) {
    logger.error("Error updating azure_user_id", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error("Failed to update user Azure data");
  }
};
export const fetchAllAzureGroups = async () => {
  try {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: groups, error } = await supabase
      .from("azure_groups")
      .select("*");
    if (error) {
      throw error;
    }
    return groups;
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
export const updateUserGroups = async (
  supabase: SupabaseClient<Database>,
  user_id: string,
  azure_user_id: string,
  azureUserGroups: { id: string }[],
) => {
  const validGroups = await fetchAllAzureGroups();
  const validGroupIds = new Set(validGroups.map(group => group.group_id));
  const validEntries = azureUserGroups
    .filter(group => validGroupIds.has(group.id))
    .map(group => ({
      user_id,
      azure_user_id,
      group_id: group.id,
    }));
  if (validEntries.length === 0) {
    logger.info("No valid groups to upsert");
    return;
  }
  // Upsert only valid entries
  const { error: upsertError } = await supabase
    .from("user_groups")
    .upsert(validEntries, {
      onConflict: "user_id,azure_user_id,group_id",
    });
  if (upsertError) {
    logger.error("Upsert error", {
      error:
        upsertError instanceof Error
          ? { message: upsertError.message, name: upsertError.name }
          : upsertError,
    });
  }
};
