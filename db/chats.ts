import { supabase } from "@/lib/supabase/browser-client";
import { TablesInsert, TablesUpdate } from "@/supabase/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ component: "db/chats" });

export const getChatById = async (chatId: string) => {
  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .eq("is_temp_chat", false)
    .maybeSingle();

  return chat;
};

export const getChatsByWorkspaceId = async (workspaceId: string) => {
  const { data: chats, error } = await supabase
    .from("chats")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_temp_chat", false)
    .order("created_at", { ascending: false });

  if (!chats) {
    throw new Error(error.message);
  }

  return chats;
};

export const createChat = async (chat: TablesInsert<"chats">) => {
  const { data: createdChat, error } = await supabase
    .from("chats")
    .insert([chat])
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdChat;
};

export const createChats = async (chats: TablesInsert<"chats">[]) => {
  const { data: createdChats, error } = await supabase
    .from("chats")
    .insert(chats)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return createdChats;
};

export const updateChat = async (
  chatId: string,
  chat: TablesUpdate<"chats">,
) => {
  const { data: updatedChat, error } = await supabase
    .from("chats")
    .update(chat)
    .eq("id", chatId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedChat;
};

export const deleteChat = async (chatId: string) => {
  const { error } = await supabase.from("chats").delete().eq("id", chatId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const fetchChatsByFolder = async folderId => {
  const { data, error } = await supabase
    .from("chats")
    .select("id")
    .eq("folder_id", folderId);

  if (error) throw error;
  return data;
};

export const updateChatModel = async (chatId: string, newModel: string) => {
  try {
    const { data: chat, error: fetchError } = await supabase
      .from("chats")
      .select("model")
      .eq("id", chatId)
      .single();

    if (fetchError) {
      logger.error("Error fetching chat", {
        error:
          fetchError instanceof Error
            ? { message: fetchError.message, name: fetchError.name }
            : fetchError,
      });
      return;
    }

    const currentModel = chat.model || "";
    const models = currentModel.split(",").map(m => m.trim());
    let updatedModel = currentModel;
    if (models.length === 0 || models[models.length - 1] !== newModel) {
      updatedModel = currentModel ? `${currentModel},${newModel}` : newModel;
    }

    const { data: updatedChat, error: updateError } = await supabase
      .from("chats")
      .update({ model: updatedModel })
      .eq("id", chatId)
      .select("*")
      .single();

    if (updateError) {
      logger.error("Error updating model history", {
        error:
          updateError instanceof Error
            ? { message: updateError.message, name: updateError.name }
            : updateError,
      });
      return;
    }

    return updatedChat;
  } catch (error) {
    logger.error("Error in updateChatModel", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
  }
};

export const getCurrentModel = (modelString: string | null): string => {
  if (!modelString) return "";
  const models = modelString.split(",").map(m => m.trim());
  return models[models.length - 1];
};
