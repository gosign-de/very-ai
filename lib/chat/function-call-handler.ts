/**
 * Shared function-call response builder for chat routes.
 *
 * All providers map the same four built-in function names
 * (generateImage, create_pdf, crawlWebsite, searchWeb) to a response
 * payload that the frontend consumes.  This module centralises that
 * mapping so it is defined once instead of in every route file.
 *
 * Provider-specific extras (e.g. Deepseek's `format_file`, or Google's
 * `originalFunctionName` / `crawlerData` wrapper) are handled via the
 * optional `overrides` parameter or via the provider-specific helpers
 * exported below.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionCallResponseBase {
  action: string | boolean;
  [key: string]: unknown;
}

export interface ImageResponse extends FunctionCallResponseBase {
  action: "image";
  prompt: string;
  provider?: string;
}

export interface PdfResponse extends FunctionCallResponseBase {
  action: "pdf";
  pdf_content: string;
  table_data: unknown;
}

export interface CrawlResponse extends FunctionCallResponseBase {
  action: "crawl";
  url: string | string[];
  depth: number;
  userId: string;
  maxPages: number;
  extractTextOption: boolean;
}

export interface WebSearchResponse extends FunctionCallResponseBase {
  action: "websearch";
  function_name: string;
  query: string;
  provider?: string;
}

export interface GoogleFunctionCallResponse {
  action: string | boolean;
  originalFunctionName?: string;
  prompt?: string;
  query?: string;
  numResults?: number;
  pdf_content?: string;
  table_data?: unknown;
  crawlerData?: {
    url: string | string[];
    userId: string;
    maxDepth: number;
    maxPages: number;
    extractTextOption: boolean;
  };
}

type BuiltInFunctionName =
  | "generateImage"
  | "create_pdf"
  | "crawlWebsite"
  | "searchWeb";

// ---------------------------------------------------------------------------
// Core builder (OpenAI / Azure / Deepseek shape)
// ---------------------------------------------------------------------------

/**
 * Builds the JSON response body that the frontend expects when the LLM
 * triggers one of the four built-in function calls.
 *
 * @param functionName - The function name returned by the model.
 * @param functionArgs - The parsed arguments object from the model.
 * @param overrides    - Optional provider-specific fields merged into the
 *                       response (e.g. `{ provider: "deepseek" }`).
 * @returns A plain object ready to be JSON-serialised.
 */
export function buildFunctionCallResponse(
  functionName: string,
  functionArgs: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): FunctionCallResponseBase {
  const responseMap: Record<BuiltInFunctionName, FunctionCallResponseBase> = {
    generateImage: {
      action: "image",
      prompt: (functionArgs?.prompt as string) ?? "",
    },
    create_pdf: {
      action: "pdf",
      pdf_content: (functionArgs?.content as string) ?? "",
      table_data: functionArgs?.tableData ?? null,
    },
    crawlWebsite: {
      action: "crawl",
      url: functionArgs?.url ?? "",
      depth: (functionArgs?.depth as number) ?? 2,
      userId: (functionArgs?.userId as string) ?? "",
      maxPages: (functionArgs?.maxPages as number) ?? 10,
      extractTextOption:
        functionArgs?.extractTextOption !== undefined
          ? (functionArgs.extractTextOption as boolean)
          : true,
    },
    searchWeb: {
      action: "websearch",
      function_name: "searchWeb",
      query: (functionArgs?.query as string) ?? "",
    },
  };

  const base = responseMap[functionName as BuiltInFunctionName] ?? {
    action: false,
  };

  if (overrides) {
    return { ...base, ...overrides };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Google Vertex AI variant
// ---------------------------------------------------------------------------

/**
 * Builds the function-call response in the shape expected by the Google
 * route.  The Google route uses slightly different field names
 * (`originalFunctionName`, `crawlerData` wrapper, etc.).
 *
 * @param functionName - The function name returned by the model.
 * @param args         - The parsed arguments object from the model.
 * @returns A GoogleFunctionCallResponse ready to be JSON-serialised.
 */
export function buildGoogleFunctionCallResponse(
  functionName: string,
  args: Record<string, unknown>,
): GoogleFunctionCallResponse {
  const responseMap: Record<string, GoogleFunctionCallResponse> = {
    create_pdf: {
      action: "pdf",
      originalFunctionName: "create_pdf",
      pdf_content: (args?.content as string) ?? "",
      table_data: args?.tableData ?? null,
    },
    crawlWebsite: {
      action: "crawl",
      originalFunctionName: "crawlWebsite",
      crawlerData: {
        url: (args?.url as string | string[]) ?? "",
        userId: (args?.userId as string) ?? "",
        maxDepth: (args?.maxDepth as number) ?? 2,
        maxPages: (args?.maxPages as number) ?? 10,
        extractTextOption:
          args?.extractTextOption !== undefined
            ? (args.extractTextOption as boolean)
            : true,
      },
    },
    generateImage: {
      action: "image",
      originalFunctionName: "generateImage",
      prompt: (args?.prompt as string) ?? "",
    },
    searchWeb: {
      action: "websearch",
      originalFunctionName: "searchWeb",
      query: (args?.query as string) ?? "",
      numResults: (args?.numResults as number) ?? 1,
    },
  };

  return responseMap[functionName] ?? { action: false };
}

// ---------------------------------------------------------------------------
// Default "no match" response
// ---------------------------------------------------------------------------

export const DEFAULT_FUNCTION_RESPONSE: FunctionCallResponseBase = {
  action: false,
};
