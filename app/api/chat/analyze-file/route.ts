import { getServerProfile } from "@/lib/server/server-chat-helpers";
import {
  VertexAI,
  GenerateContentRequest,
  Content,
  Part,
} from "@google-cloud/vertexai";
import { getMaxTokenOutputLength } from "@/lib/chat-setting-limits";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

const logger = createLogger({ feature: "api/chat/analyze-file" });

export const runtime = "nodejs";

interface AnalyzeFileRequest {
  fileId: string;
  userQuery: string;
  batchStart: number;
  batchSize: number;
  model: string;
  provider: string;
  temperature?: number;
  previousFindings?: string[];
  isFinalSynthesis?: boolean;
  skipSummaryChunk?: boolean;
  includeSummaryChunk?: boolean;
  enableThinking?: boolean;
  maxBatchTokens?: number; // Maximum tokens allowed per batch
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeFileRequest;
    const {
      fileId,
      userQuery,
      batchStart,
      batchSize,
      model,
      provider,
      temperature = 0.7,
      previousFindings = [],
      isFinalSynthesis = false,
    } = body;

    // Validate required parameters
    // For final synthesis, we don't need batchStart or batchSize
    if (isFinalSynthesis) {
      if (!model || !provider || !userQuery || !previousFindings?.length) {
        return new Response(
          JSON.stringify({
            error: "Missing required parameters for synthesis",
          }),
          { status: 400 },
        );
      }
    } else {
      if (
        !fileId ||
        !userQuery ||
        batchStart === undefined ||
        !batchSize ||
        !model ||
        !provider
      ) {
        return new Response(
          JSON.stringify({ message: "Missing required parameters" }),
          { status: 400 },
        );
      }
    }

    const profile = await getServerProfile();

    // If this is a final synthesis request, process all findings
    if (isFinalSynthesis && previousFindings.length > 0) {
      let summaryChunkContent = "";

      // Fetch summary chunk (chunk 0) if requested
      if (body.includeSummaryChunk && fileId) {
        const { data: summaryChunk } = await getServiceClient()
          .from("file_items")
          .select("content")
          .eq("file_id", fileId)
          .eq("chunk_index", 0)
          .single();

        if (summaryChunk) {
          summaryChunkContent = summaryChunk.content;
        }
      }

      // Create a more structured prompt for better synthesis
      const isGPTModel =
        model.startsWith("gpt") ||
        model.includes("o3-mini") ||
        model.includes("o1");

      const synthesisPrompt = isGPTModel
        ? `You have analyzed ALL ${previousFindings.length} batches containing the COMPLETE dataset.

Query: "${userQuery}"

${
  summaryChunkContent
    ? `SUMMARY STATISTICS (GROUND TRUTH):
${summaryChunkContent}

IMPORTANT: The statistics above show the ACTUAL totals from the complete dataset. Use these numbers to verify your final answer.
`
    : ""
}

EXTRACTED DATA FROM ALL BATCHES:
${previousFindings.join("\n\n")}

CRITICAL INSTRUCTIONS:
1. FIRST: Check the SUMMARY STATISTICS section for the ground truth totals if provided
2. SECOND: Compile ALL items from the EXTRACTED DATA section
3. THIRD: Verify your count matches the statistics (if applicable)
4. FOURTH: Present the COMPLETE answer including:
   - Total count (matching the summary statistics)
   - Complete list of ALL items
   - Any additional analysis requested

REQUIREMENTS:
- You MUST include EVERY item found across ALL batches
- Your total count MUST match the summary statistics
- Do NOT truncate or summarize - provide the COMPLETE data
- If listing items, show them in a clear, organized format`
        : // Original prompt for other models
          `You are analyzing ALL ${previousFindings.length} batches.

Query: "${userQuery}"

Complete Data:
${previousFindings.join("\n")}

${summaryChunkContent ? `Stats: ${summaryChunkContent}` : ""}

IMPORTANT: You have the COMPLETE dataset ("Complete Data"). Provide a complete answer based on ALL the data.`;

      // Route to appropriate provider for synthesis
      // Use lower temperature for synthesis to ensure consistent integration of findings
      const synthesisTemperature = isGPTModel
        ? Math.min(temperature, 0.3)
        : temperature;

      const synthesisResponse = await processSynthesis(
        synthesisPrompt,
        model,
        provider,
        synthesisTemperature,
        profile,
        body.enableThinking || false,
      );

      return new Response(
        JSON.stringify({
          type: "final_synthesis",
          response: synthesisResponse,
          totalBatches: previousFindings.length,
        }),
        { status: 200 },
      );
    }

    // If maxBatchTokens is provided, fetch chunks dynamically based on token count
    let fileItems: any[] = [];

    if (body.maxBatchTokens) {
      // Fetch all remaining chunks starting from batchStart
      const { data: allChunks, error: dbError } = await getServiceClient()
        .from("file_items")
        .select("content, chunk_index, tokens")
        .eq("file_id", fileId)
        .gte("chunk_index", batchStart)
        .order("chunk_index", { ascending: true });

      if (dbError) {
        logger.error("Database error fetching file chunks", { error: dbError });
        return new Response(
          JSON.stringify({ message: "Error fetching file chunks" }),
          { status: 500 },
        );
      }

      // Accumulate chunks until we reach the token limit
      let currentTokens = 0;
      for (const chunk of allChunks || []) {
        const chunkTokens = chunk.tokens || 0;
        if (
          currentTokens + chunkTokens > body.maxBatchTokens &&
          fileItems.length > 0
        ) {
          break; // Would exceed limit, stop here (ensure at least 1 chunk)
        }
        fileItems.push(chunk);
        currentTokens += chunkTokens;
      }
    } else {
      // Fallback to fixed batch size
      const { data, error: dbError } = await getServiceClient()
        .from("file_items")
        .select("content, chunk_index, tokens")
        .eq("file_id", fileId)
        .order("chunk_index", { ascending: true })
        .range(batchStart, batchStart + batchSize - 1);

      if (dbError) {
        logger.error("Database error fetching file chunks", { error: dbError });
        return new Response(
          JSON.stringify({ message: "Error fetching file chunks" }),
          { status: 500 },
        );
      }

      fileItems = data || [];
    }

    if (!fileItems || fileItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No chunks found for the specified range",
          hasMore: false,
        }),
        { status: 404 },
      );
    }

    // Check if there are more chunks after this batch
    const { count: totalChunks } = await getServiceClient()
      .from("file_items")
      .select("*", { count: "exact", head: true })
      .eq("file_id", fileId);

    const hasMore = batchStart + fileItems.length < (totalChunks || 0);

    // Combine chunks into a single text with minimal formatting
    const batchContent = fileItems.map(item => item.content).join("\n---\n"); // Simple separator instead of chunk labels

    // Calculate tokens
    const batchTokens = fileItems.reduce(
      (sum, item) => sum + (item.tokens || 0),
      0,
    );

    // Create a more concise analysis prompt
    const batchNumber = Math.floor(batchStart / batchSize) + 1;

    // Remove listing query detection - treat all queries the same

    const analysisPrompt = `Extract data from Batch ${batchNumber}
    Query: "${userQuery}"
    
    Batch Content: 
    ${batchContent}
    
    TASK: Extract information that directly answers the query.
    
    IMPORTANT:
    1. Read the query carefully to understand what is being asked
    2. Extract ONLY data that matches the query criteria
    3. If the query asks for specific items (e.g., "jobs in healthcare"), extract ONLY those items
    4. If the query asks for counts or statistics, extract the relevant numbers
    5. Do NOT include unrelated information
    
    Format:
    - For lists: One item per line
    - For counts/statistics: Just the numbers and what they represent
    - No explanations or additional formatting`;

    // Process the batch with the appropriate provider
    const findings = await processBatch(
      analysisPrompt,
      model,
      provider,
      temperature,
      profile,
    );

    return new Response(
      JSON.stringify({
        type: "batch_analysis",
        findings,
        batchStart,
        processedChunks: fileItems.length,
        hasMore,
        nextBatchStart: hasMore ? batchStart + fileItems.length : null,
        batchTokens,
        totalChunks: totalChunks || 0,
      }),
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("Error in analyze-file route", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
}

// Process a batch with the specified provider
async function processBatch(
  prompt: string,
  model: string,
  provider: string,
  temperature: number,
  profile: any,
  isSynthesis: boolean = false,
): Promise<string> {
  switch (provider) {
    case "google":
      return processWithGoogle(prompt, model, temperature, isSynthesis);
    case "openai":
    case "azure": // Azure uses the same processing as OpenAI
      return processWithAzureOpenAI(
        prompt,
        model,
        temperature,
        profile,
        isSynthesis,
      );
    case "anthropic":
      return processWithAnthropic(prompt, model, temperature, profile);
    case "deepseek":
      return processWithDeepseek(prompt, model, temperature, profile);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Process synthesis with the specified provider
async function processSynthesis(
  prompt: string,
  model: string,
  provider: string,
  temperature: number,
  profile: any,
  enableThinking: boolean = false,
): Promise<string> {
  // Pass enableThinking flag for synthesis
  return processBatch(
    prompt,
    model,
    provider,
    temperature,
    profile,
    enableThinking,
  );
}

// Google/Vertex AI processing
async function processWithGoogle(
  prompt: string,
  model: string,
  temperature: number,
  isSynthesis: boolean = false,
): Promise<string> {
  try {
    let saCreds: Record<string, any>;
    try {
      saCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS!);
    } catch {
      throw new Error("Invalid or missing GOOGLE_SERVICE_ACCOUNT_CREDENTIALS");
    }

    const vertexAI = new VertexAI({
      project: process.env.VERTEX_AI_GEMINI_PROJECT_ID!,
      location: process.env.VERTEX_AI_GEMINI_LOCATION!,
      googleAuthOptions: {
        credentials: saCreds,
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      },
    });

    const gemini = vertexAI.getGenerativeModel({ model });

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: prompt }] as Part[],
      },
    ];

    const maxTokens = getMaxTokenOutputLength(model as any);
    const generationConfig: any = {
      temperature,
      maxOutputTokens: maxTokens, // Use full capacity for both batch and synthesis
    };

    // Enable thinking for synthesis on Gemini 2.5 models if requested
    if (
      isSynthesis &&
      (model.includes("2.5-pro") || model.includes("2.5-flash"))
    ) {
      generationConfig.thinkingConfig = {
        thinkingBudget: -1, // Unlimited thinking budget
        includeThoughts: true, // Enable thinking output in response
      };
    }

    const req: GenerateContentRequest = {
      contents,
      generationConfig,
    };

    // Use streaming API like in Google route
    const response = await gemini.generateContentStream(req);

    // Collect all text chunks
    let responseText = "";
    let thinkingContent = "";

    for await (const chunk of response.stream) {
      if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
        const candidateParts = chunk.candidates[0].content.parts;

        candidateParts.forEach(part => {
          if (part.text) {
            // Check if this is thinking content for synthesis
            if (isSynthesis && (part as any).thought) {
              thinkingContent += part.text;
            } else {
              responseText += part.text;
            }
          }
        });
      } else {
      }
    }

    // If we have thinking content from synthesis, append it
    if (thinkingContent && isSynthesis) {
      responseText =
        responseText.trim() + `\n\n<think>\n${thinkingContent}\n</think>`;
    }

    // Ensure we have some response text
    if (!responseText) {
      return "Unable to process this batch. The content may be too complex or contain unsupported data.";
    }

    return responseText.trim();
  } catch (error: unknown) {
    logger.error("Google processing error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    // Return a fallback response instead of throwing
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message?.includes("Invalid candidate structure")) {
      return "Unable to process this batch due to API response format issues.";
    }

    throw error;
  }
}

// OpenAI processing
async function processWithAzureOpenAI(
  prompt: string,
  model: string,
  temperature: number,
  profile: any,
  _isSynthesis: boolean = false,
): Promise<string> {
  // Check if using Azure OpenAI
  // Azure OpenAI configuration
  const ENDPOINT = profile.azure_openai_endpoint;
  const KEY = profile.azure_openai_api_key;

  if (!ENDPOINT || !KEY) {
    throw new Error("Azure OpenAI endpoint or key not configured");
  }

  // Get deployment ID based on model
  let DEPLOYMENT_ID = "";
  switch (model) {
    case "gpt-4-turbo-preview":
      DEPLOYMENT_ID = profile.azure_openai_45_turbo_id || "";
      break;
    case "gpt-4o":
      DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
      break;
    case "gpt-5":
      DEPLOYMENT_ID = profile.azure_openai_gpt5_id || "gpt-5";
      break;
    case "gpt-5.1":
      DEPLOYMENT_ID = process.env.AZURE_GPT_5_1_NAME || "gpt-5.1";
      break;
    case "o3-mini":
      DEPLOYMENT_ID = (profile as any).azure_openai_o3_mini_id || "o3-mini";
      break;
    default:
      DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
  }

  if (!DEPLOYMENT_ID) {
    throw new Error(`No deployment ID configured for model: ${model}`);
  }

  const apiVersion =
    model === "o3-mini" ? "2024-12-01-preview" : "2023-12-01-preview";

  const { OpenAI } = await import("openai");
  const azureOpenai = new OpenAI({
    apiKey: KEY,
    baseURL: `${ENDPOINT}/openai/deployments/${DEPLOYMENT_ID}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": KEY },
  });
  const isO3Mini = model === "o3-mini";
  const isGpt5 = model === "gpt-5";
  const isGpt5_1 = model === "gpt-5.1";
  const maxTokens = getMaxTokenOutputLength(model as any);

  const response = await azureOpenai.chat.completions.create({
    model: DEPLOYMENT_ID,
    messages: [{ role: "user", content: prompt }],
    ...(isO3Mini
      ? {
          max_completion_tokens: maxTokens,
          reasoning_effort: "medium",
        }
      : isGpt5_1
        ? {
            max_completion_tokens: maxTokens,
            reasoning_effort: "medium",
          }
        : isGpt5
          ? {
              max_completion_tokens: maxTokens,
            }
          : {
              max_tokens: maxTokens,
              temperature: temperature,
            }),
    stream: false,
  } as any);

  return response.choices[0].message.content || "";
}

// Anthropic processing
async function processWithAnthropic(
  prompt: string,
  model: string,
  temperature: number,
  profile: any,
): Promise<string> {
  const apiKey = profile.anthropic_api_key;

  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const maxTokens = getMaxTokenOutputLength(model as any);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: Math.min(maxTokens, 2048),
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Deepseek processing
async function processWithDeepseek(
  prompt: string,
  model: string,
  temperature: number,
  profile: any,
): Promise<string> {
  const apiKey = profile.deepseek_api_key;

  if (!apiKey) {
    throw new Error("Deepseek API key not configured");
  }

  const maxTokens = getMaxTokenOutputLength(model as any);

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: Math.min(maxTokens, 2048),
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Deepseek API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
