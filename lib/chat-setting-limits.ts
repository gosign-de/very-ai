import { LLMID } from "@/types";

type ChatSettingLimits = {
  MIN_TEMPERATURE: number;
  MAX_TEMPERATURE: number;
  MAX_TOKEN_OUTPUT_LENGTH: number;
  MAX_CONTEXT_LENGTH: number;
  DEFAULT_CONTEXT_LENGTH: number;
};

export const CHAT_SETTING_LIMITS: Record<LLMID, ChatSettingLimits> = {
  // ANTHROPIC MODELS
  "claude-2.1": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 200000,
    DEFAULT_CONTEXT_LENGTH: 200000,
  },
  "claude-instant-1.2": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 100000,
    DEFAULT_CONTEXT_LENGTH: 100000,
  },
  "claude-3-haiku-20240307": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 200000,
    DEFAULT_CONTEXT_LENGTH: 200000,
  },
  "claude-3-sonnet-20240229": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 200000,
    DEFAULT_CONTEXT_LENGTH: 200000,
  },
  "claude-3-opus-20240229": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 200000,
    DEFAULT_CONTEXT_LENGTH: 200000,
  },
  "claude-3-5-sonnet-20240620": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 200000,
    DEFAULT_CONTEXT_LENGTH: 200000,
  },

  // GOOGLE MODELS

  "gemini-1.5-flash": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 1040384,
    DEFAULT_CONTEXT_LENGTH: 1040384,
  },
  "gemini-2.5-flash": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 65535,
    MAX_CONTEXT_LENGTH: 1048576,
    DEFAULT_CONTEXT_LENGTH: 1048576,
  },
  "gemini-2.5-pro": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 65535,
    MAX_CONTEXT_LENGTH: 1048576,
    DEFAULT_CONTEXT_LENGTH: 1048576,
  },
  "gemini-1.5-pro-latest": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 1040384,
    DEFAULT_CONTEXT_LENGTH: 1040384,
  },
  "gemini-pro": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 2048,
    MAX_CONTEXT_LENGTH: 30720,
    DEFAULT_CONTEXT_LENGTH: 30720,
  },
  "gemini-pro-vision": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 12288,
    DEFAULT_CONTEXT_LENGTH: 12288,
  },
  "imagen-3.0-generate-002": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },

  "mistral-nemo": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 128000,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },

  "mistral-tiny": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 2000,
    MAX_CONTEXT_LENGTH: 8000,
    DEFAULT_CONTEXT_LENGTH: 8000,
  },
  "mistral-small-latest": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 2000,
    MAX_CONTEXT_LENGTH: 32000,
    DEFAULT_CONTEXT_LENGTH: 32000,
  },
  "mistral-medium-latest": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 2000,
    MAX_CONTEXT_LENGTH: 32000,
    DEFAULT_CONTEXT_LENGTH: 32000,
  },
  "mistral-large-latest": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 2000,
    MAX_CONTEXT_LENGTH: 32000,
    DEFAULT_CONTEXT_LENGTH: 32000,
  },

  // GROQ MODELS
  "llama3-8b-8192": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 8192,
    DEFAULT_CONTEXT_LENGTH: 8192,
  },
  "llama3-70b-8192": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 8192,
    DEFAULT_CONTEXT_LENGTH: 8192,
  },
  "mixtral-8x7b-32768": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 32768,
    DEFAULT_CONTEXT_LENGTH: 32768,
  },
  "gemma-7b-it": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 8192,
    DEFAULT_CONTEXT_LENGTH: 8192,
  },

  // OPENAI MODELS
  "gpt-3.5-turbo": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 4096,
    DEFAULT_CONTEXT_LENGTH: 4096,
    // MAX_CONTEXT_LENGTH: 16385 (TODO: Change this back to 16385 when OpenAI bumps the model)
  },
  "gpt-4-turbo-preview": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },
  "gpt-4-vision-preview": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },
  "gpt-4": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 8192,
    DEFAULT_CONTEXT_LENGTH: 8192,
  },
  "gpt-4o": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },
  "gpt-5": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 256000,
    DEFAULT_CONTEXT_LENGTH: 256000,
  },
  "gpt-5.1": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 128000,
    MAX_CONTEXT_LENGTH: 272000,
    DEFAULT_CONTEXT_LENGTH: 272000,
  },
  "o1-preview": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },
  "o3-mini": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 100000,
    MAX_CONTEXT_LENGTH: 100000,
    DEFAULT_CONTEXT_LENGTH: 100000,
  },
  // PERPLEXITY MODELS
  "pplx-7b-online": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.99,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 4096,
    DEFAULT_CONTEXT_LENGTH: 4096,
  },
  "pplx-70b-online": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.99,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 4096,
    DEFAULT_CONTEXT_LENGTH: 4096,
  },
  "pplx-7b-chat": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 8192,
    DEFAULT_CONTEXT_LENGTH: 8192,
  },
  "pplx-70b-chat": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 4096,
    DEFAULT_CONTEXT_LENGTH: 4096,
  },
  "mixtral-8x7b-instruct": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "mistral-7b-instruct": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "llama-2-70b-chat": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 4096,
    DEFAULT_CONTEXT_LENGTH: 4096,
  },
  "codellama-34b-instruct": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "codellama-70b-instruct": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "sonar-small-chat": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "sonar-small-online": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 12000,
    MAX_CONTEXT_LENGTH: 12000,
    DEFAULT_CONTEXT_LENGTH: 12000,
  },
  "sonar-medium-chat": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 16384,
    MAX_CONTEXT_LENGTH: 16384,
    DEFAULT_CONTEXT_LENGTH: 16384,
  },
  "sonar-medium-online": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 12000,
    MAX_CONTEXT_LENGTH: 12000,
    DEFAULT_CONTEXT_LENGTH: 12000,
  },

  // DALL-E MODELS
  "dalle-3": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },

  // FLUX.1 MODELS
  "flux.1": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 2.0,
    MAX_TOKEN_OUTPUT_LENGTH: 4096,
    MAX_CONTEXT_LENGTH: 128000,
    DEFAULT_CONTEXT_LENGTH: 128000,
  },
  // DEEPSEEK MODELS
  "deepseek-ai/deepseek-r1-0528-maas": {
    MIN_TEMPERATURE: 0.0,
    MAX_TEMPERATURE: 1.0,
    MAX_TOKEN_OUTPUT_LENGTH: 8192,
    MAX_CONTEXT_LENGTH: 163840,
    DEFAULT_CONTEXT_LENGTH: 163840,
  },
};

// Utility function to get the default context length for a model
export function getDefaultContextLength(modelId: LLMID): number {
  const limits = CHAT_SETTING_LIMITS[modelId];
  return limits?.DEFAULT_CONTEXT_LENGTH || 4096;
}

// Utility function to get the maximum context length for a model
export function getMaxContextLength(modelId: LLMID): number {
  const limits = CHAT_SETTING_LIMITS[modelId];
  return limits?.MAX_CONTEXT_LENGTH || 4096;
}

// Smart function to get workspace context length with better UX
// - If no workspace default is set, use model's default context length
// - If workspace default is the old generic 4096, use model's default context length
// - If workspace default is set and within model limits, use workspace default
// - If workspace default exceeds model limits, cap at model's max context length
export function getWorkspaceContextLength(
  workspaceDefaultContextLength: number | undefined | null,
  modelId: LLMID,
): number {
  const modelDefaultContextLength = getDefaultContextLength(modelId);

  // If no workspace default is set, use model's default
  if (!workspaceDefaultContextLength) {
    return modelDefaultContextLength;
  }

  // If workspace default is the old generic 4096, use model's default instead
  // This handles existing workspaces that were created with the old default
  if (workspaceDefaultContextLength === 4096) {
    return modelDefaultContextLength;
  }

  // If workspace default is set, use it but cap at model's maximum
  return Math.min(workspaceDefaultContextLength, modelDefaultContextLength);
}

// Utility function to get the maximum token output length for a model
export function getMaxTokenOutputLength(modelId: LLMID): number {
  const limits = CHAT_SETTING_LIMITS[modelId];
  return limits?.MAX_TOKEN_OUTPUT_LENGTH || 4096;
}
