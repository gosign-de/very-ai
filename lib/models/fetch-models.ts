import { Tables } from "@/supabase/types";
import { LLM, LLMID, OpenRouterLLM } from "@/types";
import { toast } from "sonner";
import { LLM_LIST_MAP } from "./llm/llm-list";
import { filterModelsByGroupRestrictions } from "./model-restrictions";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/models/fetch-models" });

export const fetchHostedModels = async (
  profile: Tables<"profiles">,
  userGroupIds?: string[],
) => {
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

    const response = await fetch("/api/keys");

    if (!response.ok) {
      throw new Error(`Server is not responding.`);
    }

    const data = await response.json();

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

      if (profile?.[providerKey] || data.isUsingEnvKeyMap[provider]) {
        const models = LLM_LIST_MAP[provider];
        // console.log(`Models for ${provider}:`, models);

        if (Array.isArray(models)) {
          modelsToAdd.push(...models);
        }
      }
    }

    // Apply group-based model restrictions
    let filteredModels = modelsToAdd;
    if (userGroupIds && userGroupIds.length > 0) {
      filteredModels = await filterModelsByGroupRestrictions(
        modelsToAdd,
        userGroupIds,
      );
    }

    return {
      envKeyMap: data.isUsingEnvKeyMap,
      hostedModels: filteredModels,
    };
  } catch (error) {
    logger.warn("Error fetching hosted models", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
};

export const fetchOllamaModels = async () => {
  try {
    const response = await fetch(
      process.env.NEXT_PUBLIC_OLLAMA_URL + "/api/tags",
    );

    if (!response.ok) {
      throw new Error(`Ollama server is not responding.`);
    }

    const data = await response.json();

    const localModels: LLM[] = data.models.map((model: any) => ({
      modelId: model.name as LLMID,
      modelName: model.name,
      provider: "ollama",
      hostedId: model.name,
      platformLink: "https://ollama.ai/library",
      imageInput: false,
    }));

    return localModels;
  } catch (error) {
    logger.warn("Error fetching Ollama models", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
};

export const fetchOpenRouterModels = async () => {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");

    if (!response.ok) {
      throw new Error(`OpenRouter server is not responding.`);
    }

    const { data } = await response.json();

    const openRouterModels = data.map(
      (model: {
        id: string;
        name: string;
        context_length: number;
      }): OpenRouterLLM => ({
        modelId: model.id as LLMID,
        modelName: model.id,
        provider: "openrouter",
        hostedId: model.name,
        platformLink: "https://openrouter.dev",
        imageInput: false,
        maxContext: model.context_length,
      }),
    );

    return openRouterModels;
  } catch (error) {
    logger.error("Error fetching Open Router models", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    toast.error("Error fetching Open Router models: " + error);
  }
};
