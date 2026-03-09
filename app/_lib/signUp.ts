"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { userGroupIsValid } from "@/db/azure_groups-server";
import { setUserAzureId, updateUserGroups } from "@/db/profile";
import { createLogger } from "@/lib/logger";

export const signUp = async () => {
  const logger = createLogger({ feature: "auth", action: "signUp" });

  const azureUserSession = await auth();
  if (!azureUserSession) {
    logger.warn("Sign-up attempted without Azure session");
    return redirect(`/`);
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  logger.info("Attempting sign-up", {
    email: azureUserSession.user.userPrincipalName,
    azureUserId: azureUserSession.user.id,
  });

  const { data, error } = await supabase.auth.signUp({
    email: azureUserSession.user.userPrincipalName,
    password: process.env.NEXT_LOGIN_PASSWORD as string,
  });

  if (error) {
    logger.error("Sign-up failed", {
      error: error.message,
      email: azureUserSession.user.userPrincipalName,
    });
    return redirect(`/login?message=${error.message}`);
  }

  if (!data.user) {
    logger.error("Sign-up returned no user data");
    return redirect(`/login?message=Sign up failed`);
  }

  logger.info("Sign-up successful", {
    userId: data.user.id,
    email: azureUserSession.user.userPrincipalName,
  });

  if (!(await userGroupIsValid())) {
    logger.warn("User group validation failed", {
      userId: data.user.id,
    });
    return redirect(`/no-access`);
  }

  try {
    await setUserAzureId(supabase, data.user.id, azureUserSession.user.id);
    await updateUserGroups(
      supabase,
      data.user.id,
      azureUserSession.user.id,
      azureUserSession.user.groups,
    );

    logger.info("User Azure data set successfully", {
      userId: data.user.id,
      azureUserId: azureUserSession.user.id,
    });
  } catch (err) {
    logger.error("Failed to update user azure data", {
      error: err instanceof Error ? err.message : String(err),
      userId: data.user.id,
    });
    throw new Error("Failed to update user azure data");
  }

  return redirect("/setup");
};
