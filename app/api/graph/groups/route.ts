import { auth } from "@/app/_lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    const accessToken = session?.user?.accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token available in session" },
        { status: 401 },
      );
    }

    const { groupIds } = await request.json();

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid groupIds array" },
        { status: 400 },
      );
    }

    // For single group, use direct API call
    if (groupIds.length === 1) {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${groupIds[0]}?$select=id,displayName,mail,description,groupTypes`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        return NextResponse.json([]);
      }

      const group = await response.json();
      return NextResponse.json([
        {
          id: group.id,
          displayName: group.displayName,
          mail: group.mail,
          description: group.description,
          groupTypes: group.groupTypes,
        },
      ]);
    }

    // For multiple groups, use batch API
    const requests = groupIds.map((groupId: string, index: number) => ({
      id: index.toString(),
      method: "GET",
      url: `/groups/${groupId}?$select=id,displayName,mail,description,groupTypes`,
    }));

    const batchResponse = await fetch(
      "https://graph.microsoft.com/v1.0/$batch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: requests,
        }),
      },
    );

    if (!batchResponse.ok) {
      return NextResponse.json([]);
    }

    const batchResult = await batchResponse.json();
    const groups: any[] = [];

    batchResult.responses.forEach((response: any) => {
      if (response.status === 200 && response.body) {
        groups.push({
          id: response.body.id,
          displayName: response.body.displayName,
          mail: response.body.mail,
          description: response.body.description,
          groupTypes: response.body.groupTypes,
        });
      }
    });

    return NextResponse.json(groups);
  } catch (_error) {
    return NextResponse.json([]);
  }
}
