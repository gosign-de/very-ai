"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { userGroupIsValid } from "@/db/azure_groups-server";
import { setUserAzureId, updateUserGroups } from "@/db/profile";
import { createLogger } from "@/lib/logger";

export const signIn = async () => {
  const logger = createLogger({ feature: "auth", action: "signIn" });

  const azureUserSession = await auth();
  if (!azureUserSession) {
    logger.warn("Sign-in attempted without Azure session");
    return redirect(`/`);
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  logger.info("Attempting sign-in", {
    email: azureUserSession.user.userPrincipalName,
    userId: azureUserSession.user.id,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: azureUserSession.user.userPrincipalName,
    password: process.env.NEXT_LOGIN_PASSWORD as string,
  });

  if (error) {
    logger.error("Sign-in failed", {
      error: error.message,
      email: azureUserSession.user.userPrincipalName,
    });

    // User doesn't exist in Supabase - create them
    if (error.message === "Invalid login credentials") {
      logger.info("User not found, attempting sign-up", {
        email: azureUserSession.user.userPrincipalName,
      });

      // Try to sign up the user directly instead of redirecting
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: azureUserSession.user.userPrincipalName,
          password: process.env.NEXT_LOGIN_PASSWORD as string,
        });

      if (signUpError || !signUpData.user) {
        // User exists but has a different password — reset it via service role
        if (signUpError?.message === "User already registered") {
          logger.info(
            "User exists with different password, resetting via admin",
            {
              email: azureUserSession.user.userPrincipalName,
            },
          );

          const { getServiceClient } =
            await import("@/lib/supabase/service-client");
          const adminClient = getServiceClient();

          // Find user by email
          const { data: userList } = await adminClient.auth.admin.listUsers();
          const existingUser = (
            userList?.users as { id: string; email?: string }[] | undefined
          )?.find(u => u.email === azureUserSession.user.userPrincipalName);

          if (existingUser) {
            await adminClient.auth.admin.updateUserById(existingUser.id, {
              password: process.env.NEXT_LOGIN_PASSWORD as string,
            });

            // Retry sign-in with updated password
            const { data: retryData, error: retryError } =
              await supabase.auth.signInWithPassword({
                email: azureUserSession.user.userPrincipalName,
                password: process.env.NEXT_LOGIN_PASSWORD as string,
              });

            if (!retryError && retryData.user) {
              logger.info("Sign-in successful after password reset", {
                userId: retryData.user.id,
              });

              try {
                await setUserAzureId(
                  supabase,
                  retryData.user.id,
                  azureUserSession.user.id,
                );
                await updateUserGroups(
                  supabase,
                  retryData.user.id,
                  azureUserSession.user.id,
                  azureUserSession.user.groups,
                );
              } catch (err) {
                logger.error("Failed to update user azure data after reset", {
                  error: err instanceof Error ? err.message : String(err),
                });
              }

              const { data: workspaces } = await supabase
                .from("workspaces")
                .select("*")
                .eq("user_id", retryData.user.id)
                .eq("is_home", true)
                .limit(1);

              if (!workspaces?.[0]) {
                return redirect("/setup");
              }

              const { data: profiles } = await supabase
                .from("profiles")
                .select("has_onboarded")
                .eq("user_id", retryData.user.id)
                .limit(1);

              if (!profiles?.[0]?.has_onboarded) {
                return redirect("/setup");
              }

              const currentLocale =
                (await cookies()).get("NEXT_LOCALE")?.value || "en";
              const localePath =
                currentLocale === "en" ? "" : `/${currentLocale}`;
              return redirect(`${localePath}/${workspaces[0].id}/chat`);
            }
          }
        }

        logger.error("Sign-up failed", {
          error: signUpError?.message,
          email: azureUserSession.user.userPrincipalName,
        });
        return redirect(`/`);
      }

      logger.info("Sign-up successful", {
        userId: signUpData.user.id,
        email: azureUserSession.user.userPrincipalName,
      });

      if (!(await userGroupIsValid())) {
        logger.warn("User group validation failed", {
          userId: signUpData.user.id,
        });
        return redirect(`/no-access`);
      }

      try {
        await setUserAzureId(
          supabase,
          signUpData.user.id,
          azureUserSession.user.id,
        );
        await updateUserGroups(
          supabase,
          signUpData.user.id,
          azureUserSession.user.id,
          azureUserSession.user.groups,
        );

        logger.info("User Azure data set successfully", {
          userId: signUpData.user.id,
          azureUserId: azureUserSession.user.id,
        });
      } catch (err) {
        logger.error("Failed to update user azure data", {
          error: err instanceof Error ? err.message : String(err),
          userId: signUpData.user.id,
        });
      }

      return redirect("/setup");
    }

    return redirect(`/`);
  }

  try {
    await setUserAzureId(supabase, data.user.id, azureUserSession.user.id);
    await updateUserGroups(
      supabase,
      data.user.id,
      azureUserSession.user.id,
      azureUserSession.user.groups,
    );

    logger.info("User Azure data updated successfully", {
      userId: data.user.id,
      azureUserId: azureUserSession.user.id,
      groupsCount: azureUserSession.user.groups?.length || 0,
    });
  } catch (err) {
    logger.error("Failed to update user Azure data", {
      error: err instanceof Error ? err.message : String(err),
      userId: data.user.id,
    });
    // Continue even if Azure data update fails
  }

  const { data: workspaces, error: homeWorkspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("user_id", data.user.id)
    .eq("is_home", true)
    .limit(1);

  const homeWorkspace = workspaces?.[0];

  if (!homeWorkspace) {
    logger.error("Home workspace not found", {
      userId: data.user.id,
      error: homeWorkspaceError?.message,
    });
    // User exists but no workspace - they need to complete setup
    return redirect("/setup");
  }

  if (!(await userGroupIsValid())) {
    logger.warn("User group validation failed", {
      userId: data.user.id,
    });
    return redirect(`/no-access`);
  }

  // Check if user has onboarded
  const { data: profiles } = await supabase
    .from("profiles")
    .select("has_onboarded")
    .eq("user_id", data.user.id)
    .limit(1);

  const profile = profiles?.[0];

  if (!profile?.has_onboarded) {
    logger.info("User not onboarded, redirecting to setup", {
      userId: data.user.id,
    });
    return redirect("/setup");
  }

  logger.info("Sign-in successful", {
    userId: data.user.id,
    workspaceId: homeWorkspace.id,
    email: azureUserSession.user.userPrincipalName,
  });

  const currentLocale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  const localePath = currentLocale === "en" ? "" : `/${currentLocale}`;
  return redirect(`${localePath}/${homeWorkspace.id}/chat`);
};
