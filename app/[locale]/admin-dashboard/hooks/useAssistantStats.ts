"use client";

import { useQuery } from "@tanstack/react-query";
import { getAssistantStats } from "../services/apiChatStats";

export function useAssistantStats() {
  const { isLoading, data } = useQuery({
    queryFn: () => getAssistantStats(),
    queryKey: ["assistantStats"],
  });

  return { data, isLoading };
}
