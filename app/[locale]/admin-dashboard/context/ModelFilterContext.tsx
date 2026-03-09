"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ModelFilterContextType {
  selectedModel: string;
  selectedModelId: string;
  setSelectedModel: (model: string, modelId: string) => void;
  dateRange: {
    start: string;
    end: string;
  };
  setDateRange: (range: { start: string; end: string }) => void;
}

const ModelFilterContext = createContext<ModelFilterContextType | undefined>(
  undefined,
);

export const useModelFilter = () => {
  const context = useContext(ModelFilterContext);
  if (!context) {
    throw new Error("useModelFilter must be used within a ModelFilterProvider");
  }
  return context;
};

interface ModelFilterProviderProps {
  children: ReactNode;
}

export const ModelFilterProvider = ({ children }: ModelFilterProviderProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize selectedModel from URL parameter or default to "All Models"
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    const modelFromUrl = searchParams.get("model");
    const result =
      modelFromUrl === "all_models" || !modelFromUrl
        ? "All Models"
        : modelFromUrl;
    return result;
  });

  // Initialize selectedModelId from URL parameter or default to "all_models"
  const [selectedModelId, setSelectedModelIdState] = useState<string>(() => {
    const modelFromUrl = searchParams.get("model");
    const result = modelFromUrl || "all_models";
    return result;
  });

  // Initialize date range with last 30 days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    return {
      start: start.toISOString().split("T")[0], // Format as YYYY-MM-DD
      end: end.toISOString().split("T")[0],
    };
  });

  // Sync selectedModel with URL parameters
  useEffect(() => {
    const modelFromUrl = searchParams.get("model");
    const currentModel =
      modelFromUrl === "all_models" || !modelFromUrl
        ? "All Models"
        : modelFromUrl;
    const currentModelId = modelFromUrl || "all_models";

    if (currentModel !== selectedModel || currentModelId !== selectedModelId) {
      setSelectedModelState(currentModel);
      setSelectedModelIdState(currentModelId);
    }
  }, [searchParams, selectedModel, selectedModelId]);

  // Function to set selected model and update URL
  const setSelectedModel = (model: string, modelId?: string) => {
    setSelectedModelState(model);

    const finalModelId =
      modelId || (model === "All Models" ? "all_models" : model);
    setSelectedModelIdState(finalModelId);

    // Update URL parameters
    const queryParams = new URLSearchParams(window.location.search);
    const modelParam = model === "All Models" ? "all_models" : finalModelId;
    queryParams.set("model", modelParam);
    queryParams.set("page", "1"); // Reset page to 1

    router.push(`${window.location.pathname}?${queryParams.toString()}`);
  };

  return (
    <ModelFilterContext.Provider
      value={{
        selectedModel,
        selectedModelId,
        setSelectedModel,
        dateRange,
        setDateRange,
      }}
    >
      {children}
    </ModelFilterContext.Provider>
  );
};
