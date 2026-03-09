import { GoogleAuth } from "google-auth-library";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat/deepseek/oauth" });

export async function getDeepseekOAuthToken(serviceAccountKey: string) {
  try {
    const key = JSON.parse(serviceAccountKey);
    const auth = new GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    return token;
  } catch (error) {
    logger.error("Error getting Deepseek access token", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}
