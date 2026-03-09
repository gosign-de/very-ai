import { getServerProfile } from "@/lib/server/server-chat-helpers";

function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  try {
    const _profile = await getServerProfile();

    const json = await request.json();
    const { schema, customHeaders } = json;

    if (!schema) {
      return Response.json({ error: "Schema is required" }, { status: 400 });
    }

    // Parse schema to get server URL and path
    const parsedSchema = JSON.parse(schema);
    const serverUrl = parsedSchema.servers?.[0]?.url;
    const paths = parsedSchema.paths;
    const firstPath = Object.keys(paths || {})[0];

    if (!serverUrl || !firstPath) {
      return Response.json(
        { error: "Invalid schema: missing server URL or paths" },
        { status: 400 },
      );
    }

    const fullUrl = serverUrl + firstPath;

    // SSRF protection: block requests to internal network addresses
    if (isInternalUrl(fullUrl)) {
      return Response.json(
        { error: "Requests to internal network addresses are not allowed" },
        { status: 400 },
      );
    }

    // Parse custom headers
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (customHeaders) {
      try {
        // Remove any control characters (newlines, tabs, etc.)
        const cleanedHeaders = customHeaders.replace(/[\n\r\t]/g, "").trim();
        const parsedHeaders = JSON.parse(cleanedHeaders);
        headers = { ...headers, ...parsedHeaders };
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        return Response.json(
          { error: `Invalid custom headers JSON: ${err.message}` },
          { status: 400 },
        );
      }
    }

    // Get the HTTP method from the first path
    const pathConfig = paths[firstPath];
    const method = Object.keys(pathConfig)[0]?.toUpperCase() || "POST";

    // Extract test data from schema if available
    let testBody = undefined;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const operation = pathConfig[Object.keys(pathConfig)[0]];

      // Look for test data in multiple places (in order of preference):
      // 1. Custom x-test-request field at operation level
      // 2. Example in requestBody
      // 3. Examples in requestBody schema properties

      if (operation["x-test-request"]) {
        // Custom test data defined by user
        testBody = operation["x-test-request"];
      } else if (operation.requestBody?.content?.["application/json"]) {
        const content = operation.requestBody.content["application/json"];

        if (content.example) {
          // Use example from requestBody
          testBody = content.example;
        } else if (content.schema?.example) {
          // Use example from schema
          testBody = content.schema.example;
        } else if (content.schema?.properties) {
          // Build test body from property examples
          testBody = {};
          Object.keys(content.schema.properties).forEach(key => {
            const prop = content.schema.properties[key];
            if (prop.example !== undefined) {
              testBody[key] = prop.example;
            }
          });

          // If no examples found, use empty object
          if (Object.keys(testBody).length === 0) {
            testBody = { test: true };
          }
        }
      }

      // Default fallback
      if (!testBody) {
        testBody = { test: true };
      }
    }

    // Make test request from backend (no CORS issues)
    const response = await fetch(fullUrl, {
      method,
      headers,
      ...(testBody && { body: JSON.stringify(testBody) }),
    });

    if (response.ok) {
      return Response.json({
        success: true,
        message: "Connection successful!",
        status: response.status,
      });
    } else {
      return Response.json({
        success: false,
        message: `Connection responded with status: ${response.status}`,
        status: response.status,
      });
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return Response.json(
      {
        success: false,
        error: `Connection failed: ${err.message}`,
      },
      { status: 500 },
    );
  }
}
