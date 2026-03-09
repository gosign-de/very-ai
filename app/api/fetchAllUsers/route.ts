import { NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";
import { getToken } from "@/app/_lib/getTokens";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/fetchAllUsers" });

export async function GET(_request: Request) {
  try {
    const token = await getToken();
    if (!token) {
      return NextResponse.json(
        { error: "Failed to retrieve token" },
        { status: 401 },
      );
    }

    const client = Client.init({
      authProvider: done => done(null, token),
    });

    // Fetch all users from Azure
    const usersResponse = await client.api("/users").get();
    const users = usersResponse.value.map(user => ({
      id: user.id,
      userPrincipalName: user.userPrincipalName,
    }));

    logger.info("Fetched users", { userCount: users.length });

    return NextResponse.json({ text: "" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error fetching users", { error: { message: err.message } });
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
