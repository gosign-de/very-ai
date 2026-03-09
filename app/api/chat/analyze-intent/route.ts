import { NextRequest, NextResponse } from "next/server";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat/analyze-intent" });

export const runtime = "nodejs";

interface AnalyzeIntentRequest {
  userQuery: string;
  fileType?: string;
  hasLargeFile?: boolean;
  summaryContent?: string;
}

interface IntentAnalysis {
  requiresFullData: boolean;
  queryType:
    | "metadata"
    | "listing"
    | "filtering"
    | "aggregation"
    | "statistical"
    | "complex";
  justification: string;
  suggestedApproach: "summary_only" | "batch_processing" | "hybrid";
  confidence: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeIntentRequest;
    const { userQuery, fileType = "spreadsheet", summaryContent } = body;

    if (!userQuery) {
      return NextResponse.json(
        { error: "User query is required" },
        { status: 400 },
      );
    }

    const profile = await getServerProfile();

    // Define the function for intent analysis
    const functions = [
      {
        name: "analyzeQueryIntent",
        description:
          "Analyze user query to determine if full file processing is needed",
        parameters: {
          type: "object",
          properties: {
            requiresFullData: {
              type: "boolean",
              description:
                "True if query needs access to all records, false if summary is sufficient",
            },
            queryType: {
              type: "string",
              enum: [
                "metadata",
                "listing",
                "filtering",
                "aggregation",
                "statistical",
                "complex",
              ],
              description: "The type of query being asked",
            },
            justification: {
              type: "string",
              description:
                "Brief explanation of why full data is or isn't needed",
            },
            suggestedApproach: {
              type: "string",
              enum: ["summary_only", "batch_processing", "hybrid"],
              description: "Recommended processing approach",
            },
            confidence: {
              type: "number",
              description: "Confidence level of the analysis (0-1)",
              minimum: 0,
              maximum: 1,
            },
          },
          required: [
            "requiresFullData",
            "queryType",
            "justification",
            "suggestedApproach",
            "confidence",
          ],
        },
      },
    ];

    // Create a specialized prompt for intent analysis
    const systemPrompt = `Analyze query intent for file processing strategy.

File: ${fileType}
Summary: ${summaryContent ? "Available" : "NO"}

${!summaryContent ? "RULE: summary_only FORBIDDEN (no summary data). Choose hybrid or batch_processing.\n" : ""}
APPROACH SELECTION:

1. summary_only (use ONLY if summary available):
   - Row/column counts, headers, field names
   - Frequency counts (columns with ≤100 unique values)
   - Top values, numeric stats (min/max/avg)
   - File overview, unique counts, distributions

2. hybrid (DEFAULT - use for 99% of queries):
   - ALL "Find", "Search", "Show", "List" queries
   - ALL exploration, filtering, data extraction
   - Questions answerable from relevant chunks
   - ANY query that doesn't explicitly ask to process the complete file

3. batch_processing (EXTREMELY RARE - use ONLY if):
   - User EXPLICITLY says "process complete file", "process entire file", "analyze whole file"
   - User EXPLICITLY says "process all chunks", "read entire document"
   - Query contains phrases like "process the full file", "go through the whole file"
   
   DO NOT use batch_processing for:
   - "list all X" - use hybrid
   - "find all X" - use hybrid
   - "show all X" - use hybrid
   - ANY data extraction query - use hybrid

DEFAULT: Always choose hybrid unless user explicitly asks to process the complete/entire/whole file.`;

    // Determine which model to use based on provider
    // Use Azure OpenAI
    const ENDPOINT = profile.azure_openai_endpoint;
    const KEY = profile.azure_openai_api_key;
    // Use the GPT-4o deployment ID from profile, similar to the main azure route
    const DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "gpt-4o";
    if (!ENDPOINT || !KEY || !DEPLOYMENT_ID) {
      throw new Error("Azure OpenAI configuration missing");
    }

    const { OpenAI } = await import("openai");
    const azureOpenai = new OpenAI({
      apiKey: KEY,
      baseURL: `${ENDPOINT}/openai/deployments/${DEPLOYMENT_ID}`,
      defaultQuery: { "api-version": "2023-12-01-preview" },
      defaultHeaders: { "api-key": KEY },
    });

    const response = await azureOpenai.chat.completions.create({
      model: DEPLOYMENT_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this query: "${userQuery}"` },
      ],
      functions,
      function_call: { name: "analyzeQueryIntent" },
      temperature: 0.3,
    });

    // Extract the function call result
    const functionCall = response.choices[0]?.message?.function_call;

    if (!functionCall || !functionCall.arguments) {
      throw new Error("No function call response received");
    }

    const intentAnalysis = JSON.parse(functionCall.arguments) as IntentAnalysis;

    // Log the analysis for debugging
    logger.info("Query Intent Analysis", {
      query: userQuery,
      analysis: intentAnalysis,
    });

    // Optional: Add a small delay to make the animation visible
    // await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({
      success: true,
      analysis: intentAnalysis,
      query: userQuery,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error analyzing query intent", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    // Return a default conservative analysis on error
    return NextResponse.json({
      success: false,
      error: err.message,
      analysis: {
        requiresFullData: true,
        queryType: "complex",
        justification:
          "Error during analysis, defaulting to full processing for safety",
        suggestedApproach: "batch_processing",
        confidence: 0.5,
      },
    });
  }
}
