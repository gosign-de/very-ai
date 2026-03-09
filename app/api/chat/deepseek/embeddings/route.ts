import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatAPIPayload } from "@/types";
import { getDeepseekOAuthToken } from "../fetch-oauth-token";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      chatSettings,
      messages,
      actualModel: _actualModel,
    } = json as ChatAPIPayload;
    const profile = await getServerProfile();
    checkApiKey(
      profile.deepseek_api_service_account ||
        process.env.DEEPSEEK_API_SERVICE_ACCOUNT,
      "Deepseek",
    );

    const ENDPOINT = process.env.DEEPSEEK_API_ENDPOINT;

    // Get access token using Google Auth
    const accessToken = await getDeepseekOAuthToken(
      profile.deepseek_api_service_account!,
    );

    if (!ENDPOINT) {
      return new Response(
        JSON.stringify({ message: "Deepseek endpoint not found" }),
        {
          status: 400,
        },
      );
    }

    // Use Deepseek R1 model for all requests (no model-specific routing needed)
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-r1-0528-maas",
        messages: messages,
        temperature: chatSettings.temperature,
        max_tokens: 8192,
        stream: false,
        thinking: false,
        reasoning: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepseek API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Extract the content from the first choice's message (matching Azure format)
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({
        message: content,
      }),
      {
        status: 200,
      },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
