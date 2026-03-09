"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getChatStats } from "../services/apiChatStats";
import { useModelFilter } from "../context/ModelFilterContext";

export function useChatStats() {
  const searchParams = useSearchParams();
  const { selectedModelId } = useModelFilter();

  const numDays = !searchParams.get("last")
    ? "this_month"
    : searchParams.get("last");

  // Use the selectedModelId from ModelFilterContext, but pass null for "all_models"
  const modelName = selectedModelId === "all_models" ? null : selectedModelId;

  const { isLoading, data, error } = useQuery({
    queryFn: () => getChatStats(numDays, modelName),
    queryKey: [
      "chatStats",
      `last-${numDays}`,
      `model-${modelName || "all_models"}`,
    ],
    retry: 1,
    staleTime: 0, // Always refetch when component mounts
    refetchOnWindowFocus: false,
  });

  // Handle errors and provide fallback data
  if (error) {
    return { data: 0, isLoading: false };
  }

  return { data: data || 0, isLoading };
}
