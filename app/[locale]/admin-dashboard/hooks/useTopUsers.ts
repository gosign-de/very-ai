"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getTopUsers } from "../services/apiChatStats";
import { useModelFilter } from "../context/ModelFilterContext";

export function useTopUsers() {
  const searchParams = useSearchParams();
  const { selectedModelId } = useModelFilter();

  const numDays = !searchParams.get("last")
    ? "this_month"
    : searchParams.get("last");

  // Use the selectedModelId from ModelFilterContext, but pass null for "all_models"
  const modelName = selectedModelId === "all_models" ? null : selectedModelId;

  const { isLoading, data, error } = useQuery({
    queryFn: () => getTopUsers(numDays, modelName),
    queryKey: [
      "topUsers",
      `last-${numDays}`,
      `model-${modelName || "all_models"}`,
    ],
    retry: 1,
    staleTime: 0, // Always refetch when component mounts
    refetchOnWindowFocus: false,
  });

  // Handle errors and provide fallback data
  if (error) {
    return { data: [], isLoading: false };
  }

  return { data: data || [], isLoading };
}
