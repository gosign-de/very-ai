import { Tables } from "@/supabase/types";

export interface ChatMessage {
  message: Tables<"messages">;
  fileItems: string[];
  metadata?: any;
}

export interface PinnedMessage {
  message: Tables<"messages">;
  fileItems: string[];
}
