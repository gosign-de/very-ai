import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/getToken" });

export async function GET(_request: Request) {
  try {
    const profile = await getServerProfile();
    if (!profile) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const tenantId = process.env.AUTH_AZURE_AD_TENANT_ID;
    const clientId = process.env.AUTH_AZURE_AD_ID;
    const clientSecret = process.env.AUTH_AZURE_AD_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Environment variables are missing" },
        { status: 500 },
      );
    }

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const formData = new URLSearchParams();
    formData.append("grant_type", "client_credentials");
    formData.append("client_id", clientId);
    formData.append("client_secret", clientSecret);
    formData.append("scope", "https://graph.microsoft.com/.default");

    const tokenResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Failed to fetch token: ${tokenResponse.status} - ${errorText}`,
      );
    }

    const tokenData = await tokenResponse.json();
    return NextResponse.json(tokenData);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error fetching token", { error: { message: err.message } });
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
