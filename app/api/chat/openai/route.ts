import { createEdgeLogger } from "@/lib/logger/edge";
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import { ServerRuntime } from "next";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import { createStreamingResponse } from "@/lib/server/server-utils";
export const runtime: ServerRuntime = "edge";

const logger = createEdgeLogger({ feature: "api/chat/openai" });

export async function POST(request: Request) {
  const json = await request.json();
  const { chatSettings, messages, sequentialProcessing } = json as {
    chatSettings: ChatSettings;
    messages: any[];
    sequentialProcessing?: {
      enabled: boolean;
      fileId: string;
      totalChunks: number;
      totalTokens: number;
      chunksPerBatch: number;
      currentBatchStart: number;
      userQuery: string;
      queryType: string;
      maxBatchTokens?: number;
    };
  };

  logger.info("OpenAI chat request received", {
    model: chatSettings?.model,
    messageCount: messages?.length,
    hasSequentialProcessing: !!sequentialProcessing?.enabled,
  });

  // Check for sequential processing
  if (sequentialProcessing?.enabled) {
    return new Response(
      JSON.stringify({
        type: "sequential_processing",
        fileId: sequentialProcessing.fileId,
        totalChunks: sequentialProcessing.totalChunks,
        chunksPerBatch: sequentialProcessing.chunksPerBatch,
        totalBatches: Math.ceil(
          sequentialProcessing.totalChunks /
            sequentialProcessing.chunksPerBatch,
        ),
        model: chatSettings.model,
        provider: "openai",
        message:
          "File exceeds model token limit. Sequential processing required.",
        maxBatchTokens: sequentialProcessing.maxBatchTokens,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const profile = await getServerProfile();

    checkApiKey(profile.openai_api_key, "OpenAI");

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id,
    });

    const response = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens:
        chatSettings.model === "gpt-4-vision-preview" ||
        chatSettings.model === "gpt-4o"
          ? 4096
          : null, // TODO: Fix
      stream: true,
    });

    logger.info("OpenAI chat request completed successfully", {
      model: chatSettings?.model,
    });

    return await createStreamingResponse(response);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;

    logger.error("OpenAI chat route error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error,
      statusCode: errorCode,
      model: chatSettings?.model,
    });

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings.";
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings.";
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
