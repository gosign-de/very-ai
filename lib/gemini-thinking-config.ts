// Configuration for Gemini 2.5 Pro thinking mode
// Based on the Python genai SDK configuration structure

import { HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai";

interface ThinkingConfig {
  thinkingBudget: number; // -1 for unlimited thinking budget
  includeThoughts?: boolean; // Include thinking content in response
}

interface GenerateContentRequestWithThinking {
  contents: any[];
  generationConfig: any;
  safetySettings?: any[];
  tools?: any[];
  thinkingConfig?: ThinkingConfig;
}

/**
 * Creates a properly configured request for Gemini 2.5 Pro with thinking mode
 * This matches the Python genai SDK configuration:
 * thinking_config=types.ThinkingConfig(thinking_budget=-1)
 */
export function createGemini25ProRequest(
  contents: any[],
  generationConfig: any,
  safetySettings?: any[],
  tools?: any[],
): GenerateContentRequestWithThinking {
  const request: GenerateContentRequestWithThinking = {
    contents,
    generationConfig,
    safetySettings,
    tools,
    // Enable thinking mode with unlimited budget
    thinkingConfig: {
      thinkingBudget: -1, // -1 = unlimited thinking budget (matches Python config)
      includeThoughts: true, // Include thinking content in response
    },
  };

  return request;
}

// Safety settings that match Python genai SDK configuration
// Note: These use Vertex AI enum values, not string literals
export const GEMINI_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

/**
 * Debug function to check if thinking content is properly structured
 * @param chunk - The response chunk from Vertex AI
 * @returns Thinking content if found, null otherwise
 */
export function extractThinkingContent(chunk: any): string | null {
  // Check all possible locations where thinking content might appear
  const possiblePaths = [
    () => chunk.thinking,
    () => chunk.thinkingContent,
    () => chunk.candidates?.[0]?.thinking,
    () => chunk.candidates?.[0]?.thinkingContent,
    () => chunk.candidates?.[0]?.content?.thinking,
    () => chunk.candidates?.[0]?.content?.thinkingContent,
    () => chunk.usage?.thinkingContent,
    () => chunk.usageMetadata?.thinkingContent,
    () => chunk.response?.thinking,
    () => chunk.response?.thinkingContent,
    // Check if this is a thinking-specific chunk (might have different structure)
    () =>
      chunk.candidates?.[0]?.content?.parts?.find((part: any) => part.thinking)
        ?.thinking,
    () =>
      chunk.candidates?.[0]?.content?.parts?.find(
        (part: any) => part.thinkingContent,
      )?.thinkingContent,
  ];

  for (const getPath of possiblePaths) {
    try {
      const content = getPath();
      if (content && typeof content === "string") {
        return content;
      }
    } catch {
      // Continue to next path
    }
  }

  return null;
}

// Note: The thinking content will be available in the response stream
// for Gemini 2.5 Pro models and should be handled separately from regular content
