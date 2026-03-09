import { LLM } from "@/types";

const OPENAI_PLATORM_LINK = "https://platform.openai.com/docs/overview";

// DALL-E Models -----------------------------
const DALL_E_3: LLM = {
  modelId: "dalle-3",
  modelName: "DALL-E 3",
  provider: "openai",
  hostedId: "dalle-3",
  platformLink: OPENAI_PLATORM_LINK,
  imageInput: true,
};
export const DALL_E_LLM_LIST: LLM[] = [DALL_E_3];
