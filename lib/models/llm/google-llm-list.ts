import { LLM } from "@/types";

const GOOGLE_PLATORM_LINK = "https://ai.google.dev/";

// Google Models (UPDATED 12/22/23) -----------------------------

// Gemini 1.5 Flash
const _GEMINI_1_5_FLASH: LLM = {
  modelId: "gemini-1.5-flash",
  modelName: "Gemini 1.5 Flash",
  provider: "google",
  hostedId: "gemini-1.5-flash",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Gemini 2.5 Flash
const GEMINI_2_5_FLASH: LLM = {
  modelId: "gemini-2.5-flash",
  modelName: "Gemini 2.5 Flash",
  provider: "google",
  hostedId: "gemini-2.5-flash",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Gemini 2.5 Pro
const GEMINI_2_5_PRO: LLM = {
  modelId: "gemini-2.5-pro",
  modelName: "Gemini 2.5 Pro",
  provider: "google",
  hostedId: "gemini-2.5-pro",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Gemini 1.5 Pro (UPDATED 05/28/24)
const _GEMINI_1_5_PRO: LLM = {
  modelId: "gemini-1.5-pro-latest",
  modelName: "Gemini 1.5 Pro",
  provider: "google",
  hostedId: "gemini-1.5-pro-latest",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Gemini Pro (UPDATED 12/22/23)
const _GEMINI_PRO: LLM = {
  modelId: "gemini-pro",
  modelName: "Gemini Pro",
  provider: "google",
  hostedId: "gemini-pro",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Gemini Pro Vision (UPDATED 12/22/23)
const _GEMINI_PRO_VISION: LLM = {
  modelId: "gemini-pro-vision",
  modelName: "Gemini Pro Vision",
  provider: "google",
  hostedId: "gemini-pro-vision",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false,
};

// Imagen 3
const IMAGEN_3: LLM = {
  modelId: "imagen-3.0-generate-002",
  modelName: "Imagen 3.0",
  provider: "google",
  hostedId: "imagen-3.0-generate-002",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: true,
};

export const GOOGLE_LLM_LIST: LLM[] = [
  // GEMINI_PRO,
  // GEMINI_PRO_VISION,
  // GEMINI_1_5_PRO,
  // GEMINI_1_5_FLASH,
  GEMINI_2_5_FLASH,
  GEMINI_2_5_PRO,
  IMAGEN_3,
];
