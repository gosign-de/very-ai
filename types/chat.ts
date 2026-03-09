import { Tables } from "@/supabase/types";
import { ChatMessage, LLMID } from ".";

export interface ChatSettings {
  model: LLMID;
  imageModel: LLMID;
  prompt: string;
  temperature: number;
  role?: string;
  group_id?: string;
  contextLength: number;
  includeProfileContext: boolean;
  includeWorkspaceInstructions: boolean;
  embeddingsProvider: "openai" | "local";
  is_temp_chat?: boolean;
  thinkingProcess?: "none" | "minimal" | "low" | "medium" | "high";
  summary?: "auto" | "concise" | "detailed";
}

export interface ChatPayload {
  chatSettings: ChatSettings;
  workspaceInstructions: string;
  chatMessages: ChatMessage[];
  assistant: Tables<"assistants"> | null;
  messageFileItems: Tables<"file_items">[];
  chatFileItems: Tables<"file_items">[];
  enableSearch?: boolean;
  enableMaps?: boolean;
}

export interface ChatAPIPayload {
  chatSettings: ChatSettings;
  messages: Tables<"messages">[];
  actualModel?: string;
  file_ids?: string[];
  assistant_id?: string | null;
}

export interface GeneratedText {
  name: any;
  args: any;
  fullText: any;
}
