import { openapiToFunctions } from "@/lib/openapi-conversion";
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { Tables } from "@/supabase/types";
import { ChatSettings } from "@/types";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import { createStreamingResponse } from "@/lib/server/server-utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat/tools" });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { chatSettings, messages, selectedTools } = json as {
      chatSettings: ChatSettings;
      messages: any[];
      selectedTools: Tables<"tools">[];
    };
    const profile = await getServerProfile();

    checkApiKey(profile.openai_api_key, "OpenAI");

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id,
    });

    let allTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
    let allRouteMaps = {};
    let schemaDetails = [];

    for (const selectedTool of selectedTools) {
      try {
        const convertedSchema = await openapiToFunctions(
          JSON.parse(selectedTool.schema as string),
        );
        const tools = convertedSchema.functions || [];
        allTools = allTools.concat(tools);

        const routeMap = convertedSchema.routes.reduce(
          (map: Record<string, string>, route) => {
            map[route.path.replace(/{(\w+)}/g, ":$1")] = route.operationId;
            return map;
          },
          {},
        );

        allRouteMaps = { ...allRouteMaps, ...routeMap };

        schemaDetails.push({
          title: convertedSchema.info.title,
          description: convertedSchema.info.description,
          url: convertedSchema.info.server,
          headers: selectedTool.custom_headers,
          routeMap,
          requestInBody: convertedSchema.routes[0].requestInBody,
        });
      } catch (error: unknown) {
        logger.error("Error converting schema", {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
      }
    }

    const firstResponse = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages,
      tools: allTools.length > 0 ? allTools : undefined,
    });

    const message = firstResponse.choices[0].message;
    messages.push(message);
    const toolCalls = message.tool_calls || [];

    if (toolCalls.length === 0) {
      return new Response(message.content, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const secondResponse = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages,
      stream: true,
    });

    return await createStreamingResponse(secondResponse);
  } catch (error: unknown) {
    logger.error("Tools route error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    const errorMessage =
      (error as any)?.error?.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
