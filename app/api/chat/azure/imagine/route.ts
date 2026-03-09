import { saveImageInSupabase } from "@/app/_lib/saveImageInSupabase";

import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { ChatSettings } from "@/types";
import OpenAI from "openai";
import { saveBase64ImageInSupabase } from "@/app/_lib/saveBase64ImageInSupabase";
import { getGoogleOAuthToken } from "../../google/fetch-oauth-token";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/chat/azure/imagine" });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const {
      chatSettings,
      messages: _messages,
      customPrompt,
      base64Images: _base64Images,
      action: _action,
    } = json as {
      chatSettings: ChatSettings;
      messages: any[];
      customPrompt: string;
      base64Images: string[];
      action: string;
    };
    if (chatSettings.imageModel === "dalle-3") {
      const profile = await getServerProfile();
      checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");

      const ENDPOINT = profile.azure_openai_endpoint;
      const KEY = profile.azure_openai_api_key;
      let DEPLOYMENT_ID = process.env["AZURE_IMAGINE_DEPLOYMENT"];

      if (!ENDPOINT || !KEY || !DEPLOYMENT_ID) {
        return new Response(
          JSON.stringify({ message: "Azure resources not found" }),
          {
            status: 400,
          },
        );
      }
      const azureOpenai = new OpenAI({
        apiKey: KEY,
        baseURL: `${ENDPOINT}/openai/deployments/${DEPLOYMENT_ID}`,
        defaultQuery: { "api-version": "2023-12-01-preview" },
        defaultHeaders: { "api-key": KEY },
      });

      const response = await azureOpenai.images.generate({
        prompt: customPrompt,
        size: "1024x1024",
        model: chatSettings.imageModel || "dalle-3",
      });

      return new Response(
        JSON.stringify({
          imageUrl: `<<imageUrlStart>>${response.data[0].url}<<imageUrlEnd>>`,
        }),
        {
          status: 201,
        },
      );
    } else if (chatSettings.imageModel === "flux.1") {
      const endpoint = process.env["FLUX1_API_ENDPOINT"];
      const Bearer = process.env["FLUX1_BEARER_TOKEN"];
      const myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");
      myHeaders.append("Authorization", `Bearer ${Bearer}`);

      const body = JSON.stringify({
        inputs: customPrompt,
      });

      const url = endpoint;

      const response = await fetch(url, {
        method: "POST",
        headers: myHeaders,
        body: body,
        redirect: "follow",
      });

      const imageUrl = await saveImageInSupabase(response, "blob");

      return new Response(
        JSON.stringify({
          imageUrl: `<<imageUrlStart>>${imageUrl}<<imageUrlEnd>>`,
        }),
        {
          status: 201,
        },
      );
    } else if (chatSettings.imageModel === "imagen-3.0-generate-002") {
      const url = `https://${process.env.VERTEX_AI_GEMINI_LOCATION}-aiplatform.googleapis.com/v1/projects/${process.env.VERTEX_AI_GEMINI_PROJECT_ID}/locations/${process.env.VERTEX_AI_GEMINI_LOCATION}/publishers/google/models/imagen-3.0-generate-002:predict`;

      const body = JSON.stringify({
        instances: [{ prompt: customPrompt }],
        parameters: { sampleCount: 1 },
      });

      const accessToken = await getGoogleOAuthToken();

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: body,
        redirect: "follow",
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Failed to generate image", { errorText });
        return new Response(
          JSON.stringify({
            message: `Google Imagen API error: ${response.status} ${response.statusText}`,
            details: errorText,
          }),
          { status: response.status },
        );
      }

      const jsonResponse = await response.json();

      if (jsonResponse.predictions && jsonResponse.predictions.length > 0) {
        const prediction = jsonResponse.predictions[0];

        // Handle base64 encoded image data
        if (prediction.bytesBase64Encoded) {
          // Save base64 image to Supabase
          const imageData = prediction.bytesBase64Encoded;
          const mimeType = prediction.mimeType || "image/png";
          const base64WithPrefix = `data:${mimeType};base64,${imageData}`;

          const imageUrl = await saveBase64ImageInSupabase(base64WithPrefix);

          return new Response(
            JSON.stringify({
              imageUrl: `<<imageUrlStart>>${imageUrl}<<imageUrlEnd>>`,
            }),
            {
              status: 201,
            },
          );
        } else {
          // FIX: Handle missing bytesBase64Encoded
          logger.error("Missing bytesBase64Encoded in prediction", {
            prediction,
          });
          return new Response(
            JSON.stringify({
              message: "No image data returned from Google Imagen API",
            }),
            { status: 500 },
          );
        }
      } else {
        // FIX: Handle missing predictions
        return new Response(
          JSON.stringify({
            message: "No predictions returned from Google Imagen API",
          }),
          { status: 500 },
        );
      }
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    let errorMessage = err.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;

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
