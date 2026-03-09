import { LLM } from "@/types";

const OPENAI_PLATORM_LINK = "https://platform.openai.com/docs/overview";

// OpenAI Models (UPDATED 1/25/24) -----------------------------
const GPT4o: LLM = {
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
};

const _o1Preview: LLM = {
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
};

// GPT-4 Turbo (UPDATED 1/25/24)
const _GPT4Turbo: LLM = {
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
};

// GPT-4 Vision (UPDATED 12/18/23)
const _GPT4Vision: LLM = {
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
};

// GPT-4 (UPDATED 1/29/24)
const _GPT4: LLM = {
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
};

// GPT-3.5 Turbo (UPDATED 1/25/24)
const _GPT3_5Turbo: LLM = {
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
};

const O3Mini: LLM = {
  modelId: "o3-mini",
  modelName: "o3-mini",
  provider: "openai",
  hostedId: "o3-mini",
  platformLink: OPENAI_PLATORM_LINK, // or use the actual link: https://platform.openai.com/docs/models/gpt-4o
  imageInput: false,
  pricing: {
    currency: "USD",
    unit: "1M tokens",
    inputCost: 0.25,
    outputCost: 0.5,
  },
};

// GPT-5 (UPDATED 11/20/25)
const GPT5: LLM = {
  modelId: "gpt-5",
  modelName: "GPT-5",
  provider: "openai",
  hostedId: "gpt-5",
  platformLink: OPENAI_PLATORM_LINK,
  imageInput: false,
  pricing: {
    currency: "USD",
    unit: "1M tokens",
    inputCost: 1.25,
    outputCost: 10,
  },
};

const GPT5_1: LLM = {
  modelId: "gpt-5.1",
  modelName: "GPT-5.1",
  provider: "openai",
  hostedId: "gpt-5.1",
  platformLink: OPENAI_PLATORM_LINK,
  imageInput: false,
  pricing: {
    currency: "USD",
    unit: "1M tokens",
    inputCost: 1.25,
    outputCost: 10,
  },
};

export const OPENAI_LLM_LIST: LLM[] = [
  GPT5_1,
  GPT5,
  GPT4o,
  O3Mini,
  // o1Preview,
  // GPT4Turbo,
  // GPT4Vision,
  // GPT4,
  // GPT3_5Turbo
];
