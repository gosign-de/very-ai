import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "getToken" });

export async function getToken() {
  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL}/api/azureGroup/getToken`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      throw new Error(`Error fetching token: ${response.status}`);
    }

    const data: {
      token_type: string;
      expires_in: number;
      access_token: string;
    } = await response.json();

    return data.access_token;
  } catch (error) {
    logger.error("Error fetching token", {
      error: String((error as Error).message),
    });
    return null;
  }
}
