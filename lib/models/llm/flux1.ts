import { LLM } from "@/types";

const FLUX1_PLATORM_LINK = "https://flux1ai.com/";

// FLUX.1 Models -----------------------------
const FLUX1: LLM = {
  modelId: "flux.1",
  modelName: "FLUX.1",
  provider: "flux1",
  hostedId: "flux.1",
  platformLink: FLUX1_PLATORM_LINK,
  imageInput: true,
};
export const FLUX1_LLM_LIST: LLM[] = [FLUX1];
