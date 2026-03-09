import { userGroupIsValid } from "@/db/azure_groups-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const isValid = await userGroupIsValid();
    return NextResponse.json({ isValid });
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
