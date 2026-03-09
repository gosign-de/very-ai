import { ChatAPIPayload } from "@/types";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/model-fallback" });

// Model token limits
export const MODEL_TOKEN_LIMITS = {
  "gpt-4": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo-preview": 128000,
  "gpt-4-vision-preview": 128000,
  "gpt-5": 256000,
  "o1-preview": 128000,
  "o3-mini": 100000,
  "deepseek-r1": 128000,
  "gemini-2.5-flash": 1048576,
  "gemini-2.5-pro": 1048576,
} as const;

// Fallback model hierarchy - use non-thinking Gemini models for compatibility
export const FALLBACK_MODELS = {
  "gpt-4": "gemini-2.5-pro",
  "gpt-4o": "gemini-2.5-pro",
  "gpt-4o-mini": "gemini-2.5-pro",
  "gpt-4-turbo-preview": "gemini-2.5-pro",
  "gpt-4-vision-preview": "gemini-2.5-pro",
  "gpt-5": "gemini-2.5-pro",
  "claude-3-sonnet": "gemini-2.5-pro",
  "claude-3-haiku": "gemini-2.5-pro",
  "deepseek-r1": "gemini-2.5-pro",
  "o1-preview": "gemini-2.5-pro", // Use 1.5-pro instead of 2.5-pro to avoid thinking issues
  "o1-mini": "gemini-2.5-pro",
  "o3-mini": "gemini-2.5-pro",
} as const;

export interface FallbackResponse {
  shouldFallback: boolean;
  fallbackModel?: string;
  reason?: string;
}

export function checkTokenLimitAndFallback(
  model: string,
  tokenCount: number,
): FallbackResponse {
  const modelLimit =
    MODEL_TOKEN_LIMITS[model as keyof typeof MODEL_TOKEN_LIMITS];

  // If no limit defined, assume it's fine
  if (!modelLimit) {
    return { shouldFallback: false };
  }

  // Check if tokens exceed limit (use 95% to ensure safety margin)
  if (tokenCount > modelLimit * 0.95) {
    const fallbackModel =
      FALLBACK_MODELS[model as keyof typeof FALLBACK_MODELS];

    if (fallbackModel) {
      return {
        shouldFallback: true,
        fallbackModel,
        reason: `Token limit exceeded: ${tokenCount} > ${modelLimit}. Falling back to ${fallbackModel}`,
      };
    } else {
      return {
        shouldFallback: false,
        reason: `Token limit exceeded: ${tokenCount} > ${modelLimit}. No fallback available`,
      };
    }
  }

  return { shouldFallback: false };
}

// Helper function to route to correct endpoint based on model
export function getModelEndpoint(model: string): string {
  if (model.startsWith("gemini")) {
    return "/api/chat/google";
  } else if (model.startsWith("claude")) {
    return "/api/chat/anthropic";
  } else if (model === "deepseek-r1") {
    return "/api/chat/deepseek";
  } else {
    return "/api/chat/azure"; // Default for OpenAI models
  }
}

// Main fallback execution function
export async function executeWithFallback(
  originalPayload: ChatAPIPayload,
  tokenCount: number,
  request: Request,
): Promise<Response> {
  const fallbackCheck = checkTokenLimitAndFallback(
    originalPayload.chatSettings.model,
    tokenCount,
  );

  if (fallbackCheck.shouldFallback && fallbackCheck.fallbackModel) {
    // Fallback triggered

    // Create fallback payload with cleaned settings for Gemini
    const fallbackPayload = {
      ...originalPayload,
      chatSettings: {
        ...originalPayload.chatSettings,
        model: fallbackCheck.fallbackModel,
        contextLength:
          MODEL_TOKEN_LIMITS[
            fallbackCheck.fallbackModel as keyof typeof MODEL_TOKEN_LIMITS
          ] || 1048576,
        // Remove O1-specific settings that Gemini doesn't support
        reasoning: undefined,
        thinking: undefined,
        max_completion_tokens: undefined,
      },
    };

    // Clean messages to remove any O1-specific formatting
    if (fallbackPayload.messages) {
      fallbackPayload.messages = fallbackPayload.messages.map(msg => ({
        ...msg,
        // Remove any O1-specific message properties
        reasoning: undefined,
        thinking: undefined,
      }));
    }

    // Get the correct endpoint for fallback model
    const fallbackEndpoint = getModelEndpoint(fallbackCheck.fallbackModel);

    // Create new request for fallback with cleaned headers
    const cleanHeaders = new Headers();
    // Copy only safe headers from original request
    const headersToKeep = [
      "authorization",
      "accept",
      "accept-language",
      "user-agent",
      "x-forwarded-for",
      "x-real-ip",
    ];

    headersToKeep.forEach(header => {
      const value = request.headers.get(header);
      if (value) {
        cleanHeaders.set(header, value);
      }
    });

    // Set content type for JSON
    cleanHeaders.set("content-type", "application/json");
    // Add header to indicate this is a fallback request
    cleanHeaders.set("x-is-fallback", "true");

    // Use the origin from the request for Vercel deployment
    const origin =
      request.headers.get("origin") ||
      `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}` ||
      request.url.split("/api/")[0];

    const fallbackUrl = `${origin}${fallbackEndpoint}`;

    // Making fallback request

    try {
      const fallbackResponse = await fetch(fallbackUrl, {
        method: "POST",
        headers: cleanHeaders,
        body: JSON.stringify(fallbackPayload),
      });

      if (!fallbackResponse.ok) {
        // Fallback request failed
        throw new Error(`Fallback request failed: ${fallbackResponse.status}`);
      }

      // For streaming responses, we need to handle the body properly
      const contentType = fallbackResponse.headers.get("content-type");

      if (contentType && contentType.includes("text/plain")) {
        // This is a streaming response - create a new Response with the stream
        return new Response(fallbackResponse.body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-cache",
            "Transfer-Encoding": "chunked",
          },
        });
      } else {
        // For non-streaming responses, pass through as-is
        return fallbackResponse;
      }
    } catch (error) {
      logger.error("Fallback exception", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      throw error;
    }
  }

  // No fallback needed or available - return null to continue with original
  return null;
}
