import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { Client } from "@microsoft/microsoft-graph-client";
import { saveProfileImage } from "@/db/profile";
import { createLogger } from "@/lib/logger";

// Helper function to refresh access token
const refreshAccessToken = async (token: any) => {
  try {
    const url = `https://login.microsoftonline.com/${process.env.AUTH_AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_AZURE_AD_ID!,
        client_secret: process.env.AUTH_AZURE_AD_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    const logger = createLogger({
      feature: "auth",
      action: "refreshAccessToken",
    });
    logger.error("Error refreshing access token", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
};

// Helper function to fetch all pages of user groups
const getAllUserGroups = async (client: any) => {
  let groups = [];
  let response = await client
    .api("/me/memberOf")
    .select("id,displayName,mail,description,groupTypes")
    .get();

  groups.push(...response.value);

  // Keep fetching while there's a next page
  while (response["@odata.nextLink"]) {
    response = await client.api(response["@odata.nextLink"]).get();
    groups.push(...response.value);
  }

  return groups;
};

// Function to fetch user details, groups, and roles from Microsoft Graph API
const getUserDetails = async (accessToken: string) => {
  const client = Client.init({
    authProvider: done => done(null, accessToken),
  });

  try {
    const userDetails = await client.api("/me").get();
    const userGroupData = await getAllUserGroups(client);

    // Skip the first group in the list
    const groupsWithoutFirst = userGroupData.slice(1);
    const userGroups = {
      value: groupsWithoutFirst.map(item => ({
        id: item.id,
        displayName: item.displayName,
        groupTypes: item.groupTypes,
      })),
    };

    // Try fetching user photo (optional)
    let userPhoto = null;
    try {
      userPhoto = await client.api("/me/photo/$value").get();
    } catch (error) {
      const logger = createLogger({
        feature: "auth",
        action: "getUserDetails",
      });
      logger.warn("Could not fetch user photo", {
        error: error instanceof Error ? error.message : String(error),
        userId: userDetails?.id,
      });
    }

    return {
      ...userDetails,
      groups: userGroups.value,
      photo: userPhoto,
    };
  } catch (error) {
    const logger = createLogger({ feature: "auth", action: "getUserDetails" });
    logger.error("Error fetching user details from Microsoft Graph API", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : String(error),
    });
    throw error;
  }
};

const isEntraConfigured =
  !!process.env.AUTH_AZURE_AD_ID &&
  !!process.env.AUTH_AZURE_AD_SECRET &&
  !!process.env.AUTH_AZURE_AD_TENANT_ID;

const authConfig = {
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" ||
    process.env.NODE_ENV === "development",
  providers: isEntraConfigured
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_AZURE_AD_ID!,
          clientSecret: process.env.AUTH_AZURE_AD_SECRET!,
          issuer: `https://login.microsoftonline.com/${process.env.AUTH_AZURE_AD_TENANT_ID}/v2.0`,
          authorization: {
            params: {
              scope:
                "openid profile email offline_access User.Read Group.Read.All",
            },
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account }: { token: any; account?: any }) {
      const logger = createLogger({ feature: "auth", action: "jwt" });

      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = Date.now() + (account.expires_in || 3600) * 1000;

        try {
          const userDetails = await getUserDetails(account.access_token);
          token.userDetails = userDetails;
          token.accessToken = account?.access_token;

          logger.info("User details fetched successfully", {
            userId: userDetails.id,
            email: userDetails.userPrincipalName,
            groupsCount: userDetails.groups?.length || 0,
          });

          if (token.picture) {
            await saveProfileImage({
              profile_image: token.picture,
              user_id: token.userDetails.id,
            }).catch(() => {});
            delete token.picture;
            logger.info("Profile image saved", {
              userId: token.userDetails.id,
            });
          }
        } catch (error: unknown) {
          // logger.error below covers the structured logging for this error
          logger.error(
            "Failed to fetch user details from Microsoft Graph API:",
            {
              error:
                error instanceof Error
                  ? {
                      message: error.message,
                      stack: error.stack,
                      name: error.name,
                    }
                  : String(error),
            },
          );
        }

        return token;
      }

      // Return as-is if no expiration or not expired yet
      if (!token.expiresAt || Date.now() < token.expiresAt - 5 * 60 * 1000) {
        return token;
      }

      // Token expiring soon, refresh it
      if (token.refreshToken) {
        logger.info("Refreshing access token", {
          expiresAt: token.expiresAt,
          userId: token.userDetails?.id,
        });

        const refreshedToken = await refreshAccessToken(token);

        if (refreshedToken.error) {
          logger.error("Failed to refresh access token", {
            error: refreshedToken.error,
            userId: token.userDetails?.id,
          });
          return refreshedToken;
        }

        logger.info("Access token refreshed successfully", {
          userId: token.userDetails?.id,
        });

        // Fetch user details with new token if missing
        if (!refreshedToken.userDetails && refreshedToken.accessToken) {
          try {
            refreshedToken.userDetails = await getUserDetails(
              refreshedToken.accessToken,
            );
            logger.info("User details fetched after token refresh", {
              userId: refreshedToken.userDetails?.id,
            });
          } catch (error: unknown) {
            logger.error("Failed to fetch user details after refresh", {
              error:
                error instanceof Error
                  ? {
                      message: error.message,
                      stack: error.stack,
                      name: error.name,
                    }
                  : String(error),
              userId: refreshedToken.userDetails?.id,
            });
          }
        }

        return refreshedToken;
      }

      // No refresh token available, mark as error
      logger.error("No refresh token available, token expired", {
        userId: token.userDetails?.id,
      });
      return {
        ...token,
        error: "RefreshAccessTokenError",
      };
    },
    async session({ session, token }) {
      const logger = createLogger({ feature: "auth", action: "session" });

      // If token has error, don't return session (force re-login)
      if (token.error) {
        logger.warn("Session rejected due to token error", {
          error: token.error,
          userId: token.userDetails?.id,
        });
        return null;
      }

      if (token.userDetails) {
        // Include additional user details in session
        session.user = {
          ...session.user,
          ...token.userDetails,
          accessToken: token.accessToken,
        };
      }
      return session;
    },
    async authorized({ auth }) {
      return !!auth?.user;
    },
  },
};

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
