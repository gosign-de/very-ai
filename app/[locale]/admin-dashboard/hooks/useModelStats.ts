"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getModelStats } from "../services/apiChatStats";
import { useModelFilter } from "../context/ModelFilterContext";

export function useModelStats() {
  const searchParams = useSearchParams();
  const { selectedModelId } = useModelFilter();

  const numDays = !searchParams.get("last")
    ? "this_month"
    : searchParams.get("last");

  // Use the selectedModelId directly, but pass null for "all_models" to get all data
  const modelName = selectedModelId === "all_models" ? null : selectedModelId;

  const { isLoading, data, error } = useQuery({
    queryFn: () => getModelStats(numDays, modelName),
    queryKey: [
      "modelStats",
      `last-${numDays}`,
      `model-${modelName || "all_models"}`,
    ],
    retry: 1,
    staleTime: 0, // Always refetch when component mounts
    refetchOnWindowFocus: false,
  });

  // Handle errors and provide fallback data
  if (error) {
    return {
      data: { modelStats: [], modelCountStats: {} },
      isLoading: false,
    };
  }

  return {
    data: data || { modelStats: [], modelCountStats: {} },
    isLoading,
  };
}
