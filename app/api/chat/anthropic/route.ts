import { createEdgeLogger } from "@/lib/logger/edge";
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits";
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { getBase64FromDataURL, getMediaTypeFromDataURL } from "@/lib/utils";
import { ChatSettings } from "@/types";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const logger = createEdgeLogger({ feature: "api/chat/anthropic" });

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const { chatSettings, messages } = json as {
      chatSettings: ChatSettings;
      messages: any[];
    };

    logger.info("Anthropic chat request received", {
      model: chatSettings?.model,
      messageCount: messages?.length,
    });
    const profile = await getServerProfile();

    checkApiKey(profile.anthropic_api_key, "Anthropic");

    let ANTHROPIC_FORMATTED_MESSAGES: any = messages.slice(1);

    ANTHROPIC_FORMATTED_MESSAGES = ANTHROPIC_FORMATTED_MESSAGES?.map(
      (message: any) => {
        const messageContent =
          typeof message?.content === "string"
            ? [message.content]
            : message?.content;

        return {
          ...message,
          content: messageContent.map((content: any) => {
            if (typeof content === "string") {
              // Handle the case where content is a string
              return { type: "text", text: content };
            } else if (
              content?.type === "image_url" &&
              content?.image_url?.url?.length
            ) {
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: getMediaTypeFromDataURL(content.image_url.url),
                  data: getBase64FromDataURL(content.image_url.url),
                },
              };
            } else {
              return content;
            }
          }),
        };
      },
    );

    const anthropic = createAnthropic({
      apiKey: profile.anthropic_api_key || "",
    });

    try {
      const result = await streamText({
        model: anthropic(chatSettings.model),
        messages: ANTHROPIC_FORMATTED_MESSAGES,
        temperature: chatSettings.temperature,
        system: messages[0].content,
        maxOutputTokens:
          CHAT_SETTING_LIMITS[chatSettings.model].MAX_TOKEN_OUTPUT_LENGTH,
      });

      logger.info("Anthropic chat request completed successfully", {
        model: chatSettings?.model,
      });
      return result.toTextStreamResponse();
    } catch (error: unknown) {
      logger.error("Error calling Anthropic API", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : error,
        statusCode: (error as any)?.status,
        model: chatSettings?.model,
      });
      return new NextResponse(
        JSON.stringify({
          message: "An error occurred while calling the Anthropic API",
        }),
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;

    logger.error("Anthropic chat route error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error,
      statusCode: errorCode,
    });

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Anthropic API Key not found. Please set it in your profile settings.";
    } else if (errorCode === 401) {
      errorMessage =
        "Anthropic API Key is incorrect. Please fix it in your profile settings.";
    }

    return new NextResponse(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
