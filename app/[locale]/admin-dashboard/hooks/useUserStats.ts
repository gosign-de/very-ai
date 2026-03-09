"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getUserStats } from "../services/apiChatStats";
import { useModelFilter } from "../context/ModelFilterContext";

export function useUserStats() {
  const searchParams = useSearchParams();
  const { selectedModelId } = useModelFilter();

  const numDays = searchParams.get("last") || "this_month";
  // Use the selectedModelId from ModelFilterContext, but pass null for "all_models"
  const modelName = selectedModelId === "all_models" ? null : selectedModelId;
  const page = parseInt(searchParams.get("page") || "1", 10);

  const { isLoading, data } = useQuery({
    queryFn: () => getUserStats(numDays, modelName, page),
    queryKey: [
      "userStats",
      `last-${numDays}`,
      `model-${modelName || "all_models"}`,
      `page-${page}`,
    ],
  });

  return { data, isLoading };
}
