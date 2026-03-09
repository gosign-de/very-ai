import { LLM } from "@/types";

const OPENAI_PLATORM_LINK = "https://platform.openai.com/docs/overview";
const GOOGLE_PLATORM_LINK = "https://ai.google.dev/";

// Deprecated models that are no longer available but need to be preserved for historical context
export const DEPRECATED_MODELS: Record<string, LLM> = {
  // OpenAI deprecated models
  "gpt-5": {
    modelId: "gpt-5",
    modelName: "GPT-5",
    provider: "openai",
    hostedId: "gpt-5",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 10,
      outputCost: 30,
    },
  },
  "gpt-4o": {
    modelId: "gpt-4o",
    modelName: "GPT-4o",
    provider: "openai",
    hostedId: "gpt-4o",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 5,
      outputCost: 15,
    },
  },
  "o1-preview": {
    modelId: "o1-preview",
    modelName: "o1-preview",
    provider: "openai",
    hostedId: "o1-preview",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 5,
      outputCost: 15,
    },
  },
  "gpt-4-turbo-preview": {
    modelId: "gpt-4-turbo-preview",
    modelName: "GPT-4o",
    provider: "openai",
    hostedId: "gpt-4-turbo-preview",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 10,
      outputCost: 30,
    },
  },
  "gpt-4-vision-preview": {
    modelId: "gpt-4-vision-preview",
    modelName: "GPT-4 Vision",
    provider: "openai",
    hostedId: "gpt-4-vision-preview",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 10,
    },
  },
  "gpt-4": {
    modelId: "gpt-4",
    modelName: "GPT-4",
    provider: "openai",
    hostedId: "gpt-4",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 30,
      outputCost: 60,
    },
  },
  "gpt-3.5-turbo": {
    modelId: "gpt-3.5-turbo",
    modelName: "GPT-3.5 Turbo",
    provider: "openai",
    hostedId: "gpt-3.5-turbo",
    platformLink: OPENAI_PLATORM_LINK,
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 0.5,
      outputCost: 1.5,
    },
  },

  // Google deprecated models
  "gemini-pro": {
    modelId: "gemini-pro",
    modelName: "Gemini Pro",
    provider: "google",
    hostedId: "gemini-pro",
    platformLink: GOOGLE_PLATORM_LINK,
    imageInput: false,
  },
  "gemini-pro-vision": {
    modelId: "gemini-pro-vision",
    modelName: "Gemini Pro Vision",
    provider: "google",
    hostedId: "gemini-pro-vision",
    platformLink: GOOGLE_PLATORM_LINK,
    imageInput: false,
  },
  "gemini-1.5-pro-latest": {
    modelId: "gemini-1.5-pro-latest",
    modelName: "Gemini 1.5 Pro",
    provider: "google",
    hostedId: "gemini-1.5-pro-latest",
    platformLink: GOOGLE_PLATORM_LINK,
    imageInput: false,
  },
  "gemini-1.5-flash": {
    modelId: "gemini-1.5-flash",
    modelName: "Gemini 1.5 Flash",
    provider: "google",
    hostedId: "gemini-1.5-flash",
    platformLink: GOOGLE_PLATORM_LINK,
    imageInput: false,
  },

  // DeepSeek deprecated models
  "deepseek-ai/deepseek-r1-0528-maas": {
    modelId: "deepseek-ai/deepseek-r1-0528-maas",
    modelName: "DeepSeek-R1",
    provider: "deepseek",
    hostedId: "deepseek-ai/deepseek-r1-0528-maas",
    platformLink: "https://platform.deepseek.com/",
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 0.5,
      outputCost: 1.5,
    },
  },

  // Mistral deprecated models
  "mistral-tiny": {
    modelId: "mistral-tiny",
    modelName: "Mistral Tiny",
    provider: "mistral",
    hostedId: "mistral-tiny",
    platformLink: "https://docs.mistral.ai/",
    imageInput: false,
  },
  "mistral-small-latest": {
    modelId: "mistral-small-latest",
    modelName: "Mistral Small",
    provider: "mistral",
    hostedId: "mistral-small-latest",
    platformLink: "https://docs.mistral.ai/",
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 2,
      outputCost: 6,
    },
  },
  "mistral-medium-latest": {
    modelId: "mistral-medium-latest",
    modelName: "Mistral Medium",
    provider: "mistral",
    hostedId: "mistral-medium-latest",
    platformLink: "https://docs.mistral.ai/",
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 2.7,
      outputCost: 8.1,
    },
  },
  "mistral-large-latest": {
    modelId: "mistral-large-latest",
    modelName: "Mistral Large",
    provider: "mistral",
    hostedId: "mistral-large-latest",
    platformLink: "https://docs.mistral.ai/",
    imageInput: false,
    pricing: {
      currency: "USD",
      unit: "1M tokens",
      inputCost: 8,
      outputCost: 24,
    },
  },
};

/**
 * Get model information for display purposes, including deprecated models
 */
export const getModelInfoWithDeprecated = (modelId: string): LLM | null => {
  // First check if it's in the deprecated models
  if (DEPRECATED_MODELS[modelId]) {
    return DEPRECATED_MODELS[modelId];
  }

  // If not found in deprecated models, return null
  // The calling code should check the current LLM_LIST as well
  return null;
};
