import { NextRequest, NextResponse } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/n8n/test-connection" });

// POST - Test connection to n8n instance
export async function POST(request: NextRequest) {
  try {
    const auth = await routeAuthentication(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { n8n_url, n8n_api_key } = body;

    if (!n8n_url || !n8n_api_key) {
      return NextResponse.json(
        { error: "n8n URL and API key are required" },
        { status: 400 },
      );
    }

    // Validate URL format
    let baseUrl: string;
    try {
      const url = new URL(n8n_url);
      baseUrl = url.origin;
    } catch (_e) {
      return NextResponse.json(
        { error: "Invalid n8n URL format" },
        { status: 400 },
      );
    }

    // Test connection by calling n8n API
    // We'll try to fetch workflows which is a simple endpoint that requires authentication
    try {
      const testUrl = `${baseUrl}/api/v1/workflows`;

      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          "X-N8N-API-KEY": n8n_api_key,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        // Connection successful
        const data = await response.json();

        return NextResponse.json(
          {
            success: true,
            message: "Connection successful",
            info: {
              n8n_url: baseUrl,
              workflows_count: data?.data?.length || 0,
            },
          },
          { status: 200 },
        );
      } else if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid API key - authentication failed",
          },
          { status: 200 },
        );
      } else if (response.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "n8n API endpoint not found - please check your n8n URL",
          },
          { status: 200 },
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `Connection failed with status ${response.status}`,
          },
          { status: 200 },
        );
      }
    } catch (fetchError: unknown) {
      // Network or connection error
      logger.error("n8n connection test failed", {
        error:
          fetchError instanceof Error
            ? { message: fetchError.message, name: fetchError.name }
            : fetchError,
      });
      const fetchErr =
        fetchError instanceof Error
          ? fetchError
          : new Error(String(fetchError));
      return NextResponse.json(
        {
          success: false,
          error:
            fetchErr.message ||
            "Cannot reach n8n instance - please check the URL and network connectivity",
        },
        { status: 200 },
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in POST /api/n8n/test-connection", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
