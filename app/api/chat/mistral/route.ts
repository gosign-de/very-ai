import { createEdgeLogger } from "@/lib/logger/edge";
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits";
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import OpenAI from "openai";
import { createStreamingResponse } from "@/lib/server/server-utils";
import { chatRequestSchema } from "@/lib/validation/schemas";
export const runtime = "edge";

const logger = createEdgeLogger({ feature: "api/chat/mistral" });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = chatRequestSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ message: "Invalid request body" }), {
        status: 400,
      });
    }
    const { chatSettings, messages } = json as {
      chatSettings: ChatSettings;
      messages: any[];
    };
    logger.info("Mistral chat request received", {
      model: chatSettings?.model,
      messageCount: messages?.length,
    });
    const profile = await getServerProfile();

    checkApiKey(profile.mistral_api_key, "Mistral");

    // Mistral is compatible the OpenAI SDK
    const mistral = new OpenAI({
      apiKey: profile.mistral_api_key || "",
      baseURL: process.env.MISTRAL_API_ENDPOINT || "https://api.mistral.ai/v1",
    });

    const response = await mistral.chat.completions.create({
      model: chatSettings.model,
      messages,
      max_tokens:
        CHAT_SETTING_LIMITS[chatSettings.model].MAX_TOKEN_OUTPUT_LENGTH,
      stream: true,
    });

    // Tee the stream into two branches
    const [stream1, _stream2] = response.tee();

    // Now you can consume stream1
    for await (const chunk of stream1) {
      if (chunk.choices[0].finish_reason === "content_filter") {
        throw new Error(
          "Your query was flagged as potentially unsafe. The AI model can sometimes mistakenly identify content as unsafe. Please try rephrasing your request or submitting it again, and you might receive a different response.",
        );
      }
    }

    logger.info("Mistral chat request completed successfully", {
      model: chatSettings?.model,
    });
    return await createStreamingResponse(response);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    logger.error("Mistral chat route error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error,
      statusCode: errorCode,
    });

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Mistral API Key not found. Please set it in your profile settings.";
    } else if (errorCode === 401) {
      errorMessage =
        "Mistral API Key is incorrect. Please fix it in your profile settings.";
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
