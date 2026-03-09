import { authenticateApiRequest } from "@/lib/auth/api-guard";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiRequest(request);
    if ("error" in authResult) {
      return authResult.error;
    }

    // SharePoint uses the same Azure AD app registration as OneDrive
    // Personal Microsoft account configuration (consumers)
    const personalClientId = process.env.ONEDRIVE_CLIENT_ID_PERSONAL;

    // Organization account configuration
    const orgClientId = process.env.ONEDRIVE_CLIENT_ID;
    const orgTenantId = process.env.AUTH_AZURE_AD_TENANT_ID;

    return NextResponse.json({
      personal: {
        clientId: personalClientId,
        authority: "https://login.microsoftonline.com/consumers",
      },
      organization: {
        clientId: orgClientId,
        tenantId: orgTenantId,
        authority: orgTenantId
          ? `https://login.microsoftonline.com/${orgTenantId}`
          : undefined,
      },
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch SharePoint configuration" },
      { status: 500 },
    );
  }
}
