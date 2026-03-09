import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import { createStreamingResponse } from "@/lib/server/server-utils";
import { ServerRuntime } from "next";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import { chatRequestSchema } from "@/lib/validation/schemas";

export const runtime: ServerRuntime = "edge";

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
    const profile = await getServerProfile();

    checkApiKey(profile.openrouter_api_key, "OpenRouter");

    const openai = new OpenAI({
      apiKey: profile.openrouter_api_key || "",
      baseURL: "https://openrouter.ai/api/v1",
    });

    const response = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens: undefined,
      stream: true,
    });

    return await createStreamingResponse(response);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenRouter API Key not found. Please set it in your profile settings.";
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
