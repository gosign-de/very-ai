import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    entraEnabled:
      !!process.env.AUTH_AZURE_AD_ID &&
      !!process.env.AUTH_AZURE_AD_SECRET &&
      !!process.env.AUTH_AZURE_AD_TENANT_ID,
  });
}
