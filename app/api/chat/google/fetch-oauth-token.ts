import { GoogleAuth } from "google-auth-library";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat/google/oauth" });

export async function getGoogleOAuthToken() {
  try {
    // Get service account credentials from environment variable
    const serviceAccountCredentials = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || "{}",
    );

    // Create auth client from credentials object directly
    const auth = new GoogleAuth({
      credentials: serviceAccountCredentials,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token;
  } catch (error) {
    logger.error("Error getting Google OAuth token", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}
