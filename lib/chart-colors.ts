// Professional color palette for charts
export const CHART_COLORS = [
  "#3B82F6", // Blue
  "#60A5FA", // Light Blue
  "#F59E0B", // Amber/Yellow
  "#F97316", // Orange
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#10B981", // Emerald
  "#EF4444", // Red
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#84CC16", // Lime
  "#F472B6", // Rose
];

// Fixed color mapping for specific models to ensure consistency
const FIXED_MODEL_COLORS: Record<string, string> = {
  // OpenAI models - Blue family
  "gpt-5.1": "#93C5FD", // Very Dark Blue (distinctive for GPT-5.1)
  "gpt-5": "#1E40AF", // Dark Blue (distinctive for GPT-5)
  "gpt-4o": "#3B82F6", // Blue
  "gpt-4o-mini": "#60A5FA", // Light Blue
  "gpt-4": "#1D4ED8", // Dark Blue
  "gpt-4-turbo": "#2563EB", // Medium Blue
  "gpt-3.5-turbo": "#93C5FD", // Very Light Blue
  "dalle-3": "#34D399", // Light Emerald

  // Google models - Green/Yellow/Orange family
  "gemini-1.5-pro": "#10B981", // Emerald
  "gemini-1.5-flash": "#34D399", // Light Emerald
  "gemini-2.5-flash": "#F59E0B", // Amber/Yellow
  "gemini-2.5-pro": "#F97316", // Orange
  "gemini-pro": "#065F46", // Very Dark Emerald
  "gemini-pro-vision": "#A7F3D0", // Pale Emerald
  "imagen-3.0-generate-002": "#84CC16", // Lime

  // Anthropic models - Purple family
  "claude-3-opus": "#8B5CF6", // Purple
  "claude-3-sonnet": "#A78BFA", // Light Purple
  "claude-3-haiku": "#C4B5FD", // Very Light Purple
  "claude-3-5-sonnet": "#7C3AED", // Dark Purple

  // Microsoft models - Orange family
  "phi-3": "#F97316", // Orange
  "phi-4": "#FB923C", // Light Orange

  // Meta models - Red family
  "llama-3": "#EF4444", // Red
  "llama-3.1": "#F87171", // Light Red
  "llama-3.2": "#FCA5A5", // Very Light Red

  // Mistral models - Cyan family
  "mistral-large": "#06B6D4", // Cyan
  "mistral-medium": "#22D3EE", // Light Cyan
  "mistral-small": "#67E8F9", // Very Light Cyan

  // OpenAI embeddings - Yellow family
  "text-embedding-3-small": "#F59E0B", // Amber/Yellow
  "text-embedding-3-large": "#FBBF24", // Light Amber
  "text-embedding-ada-002": "#FCD34D", // Very Light Amber

  // Others - Pink/Indigo family
  "command-r-plus": "#EC4899", // Pink
  "command-r": "#F472B6", // Rose
  "o3-mini": "#6366F1", // Indigo
  "o1-mini": "#9333EA", // Purple
};

// Create a mapping of model IDs to consistent colors
const modelColorMap = new Map<string, string>();

// Initialize the map with fixed colors
Object.entries(FIXED_MODEL_COLORS).forEach(([modelId, color]) => {
  modelColorMap.set(modelId, color);
});

export const getModelColor = (modelId: string): string => {
  // If color already assigned (either fixed or dynamic), return it
  if (modelColorMap.has(modelId)) {
    return modelColorMap.get(modelId)!;
  }

  // For unknown models, assign a color from the remaining palette
  // Use a hash of the model ID to ensure consistency
  const hash = modelId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = hash % CHART_COLORS.length;
  const color = CHART_COLORS[colorIndex];
  modelColorMap.set(modelId, color);

  return color;
};

// Pre-assign colors for known models to ensure consistency
export const preAssignModelColors = (modelIds: string[]): void => {
  modelIds.forEach(modelId => {
    // Only assign if not already assigned (fixed colors are already set)
    if (!modelColorMap.has(modelId)) {
      // Use hash-based assignment for consistency
      const hash = modelId
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colorIndex = hash % CHART_COLORS.length;
      modelColorMap.set(modelId, CHART_COLORS[colorIndex]);
    }
  });
};
