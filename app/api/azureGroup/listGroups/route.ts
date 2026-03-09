import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/azureGroup/listGroups" });

export async function POST(request: Request) {
  try {
    const { access_token } = await request.json();

    if (!access_token) {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 },
      );
    }

    const url = "https://graph.microsoft.com/v1.0/groups";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch groups: ${response.status} - ${errorText}`,
      );
    }

    const groupsData = await response.json();
    return NextResponse.json(groupsData);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error fetching groups", { error: { message: err.message } });
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
