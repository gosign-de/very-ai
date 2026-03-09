import { LLM, LLMID } from "@/types";
import { LLM_LIST } from "./llm/llm-list";
import { getModelInfoWithDeprecated } from "./deprecated-models";
import {
  getAdminSettings,
  getAdminSettingsSync,
} from "@/lib/config/admin-settings";
import { isModelAllowedForUser } from "./model-restrictions";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/models/model-availability" });

// Default fallback models for each provider
const DEFAULT_FALLBACK_MODELS: Record<string, LLMID> = {
  openai: "gpt-4o",
  azure: "gpt-4o",
  google: "gemini-2.5-pro",
  anthropic: "claude-3-haiku-20240307",
  mistral: "mistral-nemo",
  groq: "llama3-8b-8192",
  perplexity: "mixtral-8x7b-instruct",
  dalle: "dalle-3",
  flux1: "flux.1",
  // deepseek: Models deprecated - no active fallback available
};

/**
 * Check if a model is currently available (not commented out)
 */
export const isModelAvailable = (modelId: LLMID): boolean => {
  return LLM_LIST.some(model => model.modelId === modelId);
};

/**
 * Get the default fallback model for a provider
 */
export const getDefaultFallbackModelSync = (provider: string): LLMID => {
  // Get current admin settings
  const adminSettings = getAdminSettingsSync();

  // First try admin configured fallback
  if (
    adminSettings.default_fallback_model &&
    isModelAvailable(adminSettings.default_fallback_model)
  ) {
    return adminSettings.default_fallback_model;
  }

  // Then try provider-specific fallback
  const providerFallback = DEFAULT_FALLBACK_MODELS[provider];
  if (providerFallback && isModelAvailable(providerFallback)) {
    return providerFallback;
  }

  // Finally, use any available model or fallback to admin default
  const firstAvailableModel = LLM_LIST[0]?.modelId;
  return firstAvailableModel || adminSettings.default_fallback_model;
};

export const getDefaultFallbackModel = getDefaultFallbackModelSync; // For backwards compatibility

/**
 * Find a fallback model for a given model ID (async version)
 * First tries to find a model from the same provider, then falls back to default
 */
export const findFallbackModelAsync = async (
  modelId: LLMID,
): Promise<LLMID> => {
  // Get current admin settings from database
  const adminSettings = await getAdminSettings();

  // First priority: use admin configured fallback model if available
  if (
    adminSettings.default_fallback_model &&
    isModelAvailable(adminSettings.default_fallback_model)
  ) {
    return adminSettings.default_fallback_model;
  }

  // Find the original model to get its provider
  let originalModel = LLM_LIST.find(model => model.modelId === modelId);
  let provider: string | undefined;

  if (originalModel) {
    provider = originalModel.provider;
  } else {
    // If not found in current list, check deprecated models for provider info
    const deprecatedModel = getModelInfoWithDeprecated(modelId);
    if (deprecatedModel) {
      provider = deprecatedModel.provider;
    }
  }

  if (!provider) {
    // If we can't find the original model or its provider, use admin settings default
    return adminSettings.default_fallback_model;
  }

  // Second priority: try to find another available model from the same provider
  const sameProviderModels = LLM_LIST.filter(
    model => model.provider === provider && model.modelId !== modelId,
  );

  if (sameProviderModels.length > 0) {
    // Return the first available model from the same provider
    return sameProviderModels[0].modelId;
  }

  // If no models from the same provider are available, use the admin fallback or default
  return (
    adminSettings.default_fallback_model ||
    getDefaultFallbackModelSync(provider)
  );
};

/**
 * Find a fallback model for a given model ID (sync version for backwards compatibility)
 * First tries to find a model from the same provider, then falls back to default
 */
export const findFallbackModel = (modelId: LLMID): LLMID => {
  // Get current admin settings (sync version uses static defaults)
  const adminSettings = getAdminSettingsSync();

  // First priority: use admin configured fallback model if available
  if (
    adminSettings.default_fallback_model &&
    isModelAvailable(adminSettings.default_fallback_model)
  ) {
    return adminSettings.default_fallback_model;
  }

  // Find the original model to get its provider
  let originalModel = LLM_LIST.find(model => model.modelId === modelId);
  let provider: string | undefined;

  if (originalModel) {
    provider = originalModel.provider;
  } else {
    // If not found in current list, check deprecated models for provider info
    const deprecatedModel = getModelInfoWithDeprecated(modelId);
    if (deprecatedModel) {
      provider = deprecatedModel.provider;
    }
  }

  if (!provider) {
    // If we can't find the original model or its provider, use admin settings default
    return adminSettings.default_fallback_model;
  }

  // Second priority: try to find another available model from the same provider
  const sameProviderModels = LLM_LIST.filter(
    model => model.provider === provider && model.modelId !== modelId,
  );

  if (sameProviderModels.length > 0) {
    // Return the first available model from the same provider
    return sameProviderModels[0].modelId;
  }

  // If no models from the same provider are available, use the admin fallback or default
  return (
    adminSettings.default_fallback_model ||
    getDefaultFallbackModelSync(provider)
  );
};

/**
 * Validate and potentially update a model ID to ensure it's available (async version)
 */
export const validateAndGetAvailableModelAsync = async (
  modelId: LLMID,
): Promise<LLMID> => {
  if (isModelAvailable(modelId)) {
    return modelId;
  }

  return await findFallbackModelAsync(modelId);
};

/**
 * Validate and potentially update a model ID to ensure it's available (sync version)
 */
export const validateAndGetAvailableModel = (modelId: LLMID): LLMID => {
  if (isModelAvailable(modelId)) {
    return modelId;
  }

  return findFallbackModel(modelId);
};

/**
 * Get model information for display purposes (even if deprecated)
 * This preserves the original model info for historical context
 */
export const getModelInfo = (modelId: LLMID): LLM | null => {
  // First check if it's currently available
  const availableModel = LLM_LIST.find(model => model.modelId === modelId);
  if (availableModel) {
    return availableModel;
  }

  // If not available, check deprecated models for historical display
  return getModelInfoWithDeprecated(modelId);
};

/**
 * Check if a model is deprecated (not in current LLM_LIST)
 */
export const isModelDeprecated = (modelId: LLMID): boolean => {
  return !isModelAvailable(modelId);
};

/**
 * Get all available models for a specific provider
 */
export const getAvailableModelsForProvider = (provider: string): LLM[] => {
  return LLM_LIST.filter(model => model.provider === provider);
};

/**
 * Get all available model IDs
 */
export const getAvailableModelIds = (): LLMID[] => {
  return LLM_LIST.map(model => model.modelId);
};

/**
 * Find the first available non-restricted model for a user
 * Priority: Admin fallback → Same provider → Same type
 * Respects model type - image models replaced with image models, LLMs with LLMs
 * Uses the imageInput property to distinguish between image and text models
 */
export const findAvailableNonRestrictedModel = async (
  originalModelId: LLMID,
  userGroupIds: string[],
  isDeprecated: boolean = false,
): Promise<LLMID> => {
  // Find the original model's provider and type
  let originalModel = LLM_LIST.find(model => model.modelId === originalModelId);
  let provider: string | undefined;
  let isImageModel = false;

  if (originalModel) {
    provider = originalModel.provider;
    isImageModel = originalModel.imageInput;
  } else {
    const deprecatedModel = getModelInfoWithDeprecated(originalModelId);
    if (deprecatedModel) {
      provider = deprecatedModel.provider;
      isImageModel = deprecatedModel.imageInput;
    }
  }

  // Get admin settings
  const adminSettings = await getAdminSettings();

  // PRIORITY 1: If model is deprecated, try admin fallback model FIRST
  if (isDeprecated && adminSettings.default_fallback_model) {
    const fallbackModel = LLM_LIST.find(
      m => m.modelId === adminSettings.default_fallback_model,
    );

    // Only use admin fallback if it matches the model type (image vs text)
    if (fallbackModel && fallbackModel.imageInput === isImageModel) {
      const isAllowed = await isModelAllowedForUser(
        adminSettings.default_fallback_model,
        userGroupIds,
      );
      if (isAllowed) {
        return adminSettings.default_fallback_model;
      }
    } else {
      logger.info("Admin fallback type mismatch or not found");
    }
  }

  // PRIORITY 2: Try same provider models (respecting model type)
  if (provider) {
    const sameProviderModels = LLM_LIST.filter(
      model =>
        model.provider === provider &&
        model.modelId !== originalModelId &&
        model.imageInput === isImageModel,
    );

    for (const model of sameProviderModels) {
      const isAllowed = await isModelAllowedForUser(
        model.modelId,
        userGroupIds,
      );
      if (isAllowed) {
        return model.modelId;
      }
    }
  }

  // PRIORITY 3: Try same TYPE (image or text)
  const sameTypeModels = LLM_LIST.filter(
    model =>
      model.modelId !== originalModelId &&
      model.imageInput === isImageModel &&
      model.modelId !== adminSettings.default_fallback_model, // Already tried
  );

  for (const model of sameTypeModels) {
    const isAllowed = await isModelAllowedForUser(model.modelId, userGroupIds);
    if (isAllowed) {
      return model.modelId;
    }
  }

  // FALLBACK: Return admin default (even if restricted - shouldn't happen)
  return adminSettings.default_fallback_model;
};

/**
 * Validate model availability considering both deprecation and restrictions
 * Replaces restricted models with available alternatives
 * Priority for deprecated: Admin fallback → Same provider → Same type
 */
export const validateModelWithRestrictions = async (
  modelId: LLMID,
  userGroupIds: string[],
): Promise<LLMID> => {
  // First check if model is deprecated
  const deprecated = isModelDeprecated(modelId);

  if (deprecated) {
    // Find a non-deprecated, non-restricted replacement (with deprecated flag)
    return await findAvailableNonRestrictedModel(modelId, userGroupIds, true);
  }

  // Model is not deprecated, check if it's restricted
  const isAllowed = await isModelAllowedForUser(modelId, userGroupIds);

  if (!isAllowed) {
    // Model is restricted, find a replacement (not deprecated)
    return await findAvailableNonRestrictedModel(modelId, userGroupIds, false);
  }

  // Model is available and not restricted
  return modelId;
};
