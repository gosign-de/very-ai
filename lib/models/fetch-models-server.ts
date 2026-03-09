import { Tables } from "@/supabase/types";
import { LLM } from "@/types";
import { LLM_LIST_MAP } from "./llm/llm-list";
import { getEnvKeyMap } from "@/lib/server/env-key-helper";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/models/fetch-models-server" });

// Server-side version of fetchHostedModels that doesn't use fetch
export const fetchHostedModelsServer = async (profile: Tables<"profiles">) => {
  try {
    const providers = [
      "google",
      "anthropic",
      "mistral",
      "groq",
      "perplexity",
      "dalle",
      "flux1",
      "deepseek",
    ];

    if (profile.use_azure_openai) {
      providers.push("azure");
    } else {
      providers.push("openai");
    }

    // Get environment key map directly without fetch
    const isUsingEnvKeyMap = getEnvKeyMap();

    let modelsToAdd: LLM[] = [];

    for (const provider of providers) {
      let providerKey: keyof typeof profile;

      if (provider === "google") {
        providerKey = "google_gemini_api_key";
      } else if (provider === "azure") {
        providerKey = "azure_openai_api_key";
      } else if (provider === "deepseek") {
        providerKey = "deepseek_api_service_account";
      } else {
        providerKey = `${provider}_api_key` as keyof typeof profile;
      }

      if (profile?.[providerKey] || isUsingEnvKeyMap[provider]) {
        const models = LLM_LIST_MAP[provider];

        if (Array.isArray(models)) {
          modelsToAdd.push(...models);
        }
      }
    }

    return {
      envKeyMap: isUsingEnvKeyMap,
      hostedModels: modelsToAdd,
    };
  } catch (error) {
    logger.warn("Error fetching hosted models", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
};
