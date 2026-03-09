import { LLM_LIST } from "./models/llm/llm-list";
import type { LLMID } from "@/types";

/**
 * Get all active model IDs from LLM_LIST
 * @returns Array of active model IDs
 */
export function getActiveModelIds(): LLMID[] {
  return LLM_LIST.map(model => model.modelId);
}

/**
 * Get the display name for a model ID
 * Looks up the model in LLM_LIST and returns its display name
 * @param modelId The model identifier
 * @returns Human-readable model name
 */
export function getModelDisplayName(modelId: string): string {
  if (!modelId) return "Unknown Model";

  // Handle the special "miscellaneous" group
  if (modelId === "miscellaneous") return "Miscellaneous";

  // Find the model in LLM_LIST
  const model = LLM_LIST.find(m => m.modelId === modelId);
  if (model) {
    return model.modelName;
  }

  // If no mapping found, format the ID nicely
  return modelId
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Check if a model should be included in analytics charts
 * Only active (non-deprecated) models from LLM_LIST are included
 * @param modelId The model identifier
 * @returns Whether the model should be included in analytics
 */
export function isModelIncludedInAnalytics(modelId: string): boolean {
  return LLM_LIST.some(model => model.modelId === modelId);
}

/**
 * Filter model data to only include models that should be shown in analytics
 * @param modelData Array of model data objects with a model property
 * @returns Filtered array containing only allowed models
 */
export function filterModelsForAnalytics<T extends { model: string }>(
  modelData: T[],
): T[] {
  return modelData.filter(item => isModelIncludedInAnalytics(item.model));
}

/**
 * Filter model count statistics to only include allowed models
 * @param modelCountStats Object with model IDs as keys and counts as values
 * @returns Filtered object containing only allowed models
 */
export function filterModelCountsForAnalytics(
  modelCountStats: Record<string, number>,
): Record<string, number> {
  const filteredStats: Record<string, number> = {};

  Object.entries(modelCountStats).forEach(([modelId, count]) => {
    if (isModelIncludedInAnalytics(modelId)) {
      filteredStats[modelId] = count;
    }
  });

  return filteredStats;
}

/**
 * Group model count statistics with "Miscellaneous" for non-analytics models
 * @param modelCountStats Object with model IDs as keys and counts as values
 * @returns Object with analytics models shown individually and others grouped as "Miscellaneous"
 */
export function groupModelCountsWithMiscellaneous(
  modelCountStats: Record<string, number>,
): Record<string, number> {
  const groupedStats: Record<string, number> = {};
  let miscellaneousCount = 0;

  Object.entries(modelCountStats).forEach(([modelId, count]) => {
    if (isModelIncludedInAnalytics(modelId)) {
      groupedStats[modelId] = count;
    } else {
      miscellaneousCount += count;
    }
  });

  // Add miscellaneous group if there are any non-analytics models
  if (miscellaneousCount > 0) {
    groupedStats["miscellaneous"] = miscellaneousCount;
  }

  return groupedStats;
}

/**
 * Group model data with "Miscellaneous" for non-analytics models in time series data
 * @param modelData Array of model data objects with a model property
 * @returns Array with analytics models shown individually and others grouped as "miscellaneous"
 */
export function groupModelsWithMiscellaneous<T extends { model: string }>(
  modelData: T[],
): T[] {
  return modelData.map(item => ({
    ...item,
    model: isModelIncludedInAnalytics(item.model)
      ? item.model
      : "miscellaneous",
  }));
}

/**
 * Get a shortened display name for charts and compact displays
 * @param modelId The model identifier
 * @returns Shortened human-readable model name
 */
export function getModelShortName(modelId: string): string {
  const fullName = getModelDisplayName(modelId);

  // Shorten some common long names for chart display
  const shortMappings: Record<string, string> = {
    "GPT-4o": "GPT-4o",
    "GPT-4o Mini": "GPT-4o Mini",
    "GPT-4 Turbo": "GPT-4 Turbo",
    "GPT-3.5 Turbo": "GPT-3.5",
    "Gemini 1.5 Pro": "Gemini 1.5 Pro",
    "Gemini 1.5 Flash": "Gemini Flash",
    "Gemini 2.5 Pro": "Gemini 2.5 Pro",
    "Claude 3 Opus": "Claude Opus",
    "Claude 3 Sonnet": "Claude Sonnet",
    "Claude 3 Haiku": "Claude Haiku",
    "Claude 3.5 Sonnet": "Claude 3.5",
    "Text Embedding 3 Small": "Embedding Small",
    "Text Embedding 3 Large": "Embedding Large",
  };

  return shortMappings[fullName] || fullName;
}
