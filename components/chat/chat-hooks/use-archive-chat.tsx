import { createClientLogger } from "@/lib/logger/client";
import { ChatbotUIContext } from "@/context/context";
import { createFolder } from "@/db/folders";
import { updateChat } from "@/db/chats";
import { updateCollection } from "@/db/collections";
import { updateFile } from "@/db/files";
import { updateModel } from "@/db/models";
import { updatePreset } from "@/db/presets";
import { updatePrompt } from "@/db/prompts";
import { updateTool } from "@/db/tools";
import { updateAssistant } from "@/db/assistants";
import { useContext, useEffect } from "react";
import { fetchChatsByFolder } from "@/db/chats";

const logger = createClientLogger({ component: "UseArchiveChat" });

export const useArchiveChatHandler = () => {
  const {
    folders,
    setFolders,
    contentState,
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setTools,
    setModels,
    chats,
    setArchivedChatIds,
    dataWithFolders,
    profile,
    selectedWorkspace,
  } = useContext(ChatbotUIContext);

  const regularChats = chats.filter(chat => chat.group_id === null);

  let data = [];

  if (contentState == "chats") {
    data = regularChats;
  }

  const updateFunctions = {
    chats: updateChat,
    presets: updatePreset,
    prompts: updatePrompt,
    files: updateFile,
    collections: updateCollection,
    assistants: updateAssistant,
    tools: updateTool,
    models: updateModel,
  };

  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    tools: setTools,
    models: setModels,
  };

  const updateArchiveFolder = async (
    itemId: string,
    folderId: string | null,
  ) => {
    const item: any = data.find(item => item.id === itemId);
    if (!item) return null;
    const updateFunction = updateFunctions[contentState];
    const setStateFunction = stateUpdateFunctions[contentState];
    if (!updateFunction || !setStateFunction) return;

    const updatedItem = await updateFunction(item.id, {
      folder_id: folderId,
    });

    setStateFunction((items: any) =>
      items.map((item: any) =>
        item.id === updatedItem.id ? updatedItem : item,
      ),
    );
  };

  const fetchArchivedChats = async () => {
    try {
      const archiveFolders = [
        ...folders.filter(folder => folder.name === "Archive Chats"),
      ];

      if (archiveFolders.length === 0) return;

      let allArchivedChats = [];

      for (const folder of archiveFolders) {
        const archivedChats = await fetchChatsByFolder(folder.id);
        allArchivedChats = [
          ...allArchivedChats,
          ...archivedChats.map(chat => chat.id),
        ];
      }
      setArchivedChatIds(allArchivedChats);
    } catch (error) {
      logger.error("Error fetching archived chats", { error: String(error) });
    }
  };
  useEffect(() => {
    fetchArchivedChats();
  }, [contentState, folders]);

  useEffect(() => {
    if (!dataWithFolders) return;
    setArchivedChatIds(prevArchivedChatIds => {
      const currentArchivedIds = new Set(
        folders
          .filter(folder => folder.name === "Archive Chats")
          .flatMap(folder =>
            dataWithFolders
              .filter(chat => chat.folder_id === folder.id)
              .map(chat => chat.id),
          ),
      );
      return prevArchivedChatIds.filter(id => currentArchivedIds.has(id));
    });
  }, [dataWithFolders, folders]);

  const archiveChat = async selectedChat => {
    if (!selectedChat) return;
    try {
      let archiveFolder;
      archiveFolder = folders.find(
        folder =>
          folder.name === "Archive Chats" &&
          folder.type === contentState &&
          folder.user_id === profile.user_id,
      );
      if (!archiveFolder) {
        const folderData = {
          user_id: profile.user_id,
          workspace_id: selectedWorkspace.id,
          name: "Archive Chats",
          description: "Folder for archived chats",
          type: contentState,
        };

        archiveFolder = await createFolder(folderData);
        setFolders([...folders, archiveFolder]);
      }
      await updateArchiveFolder(selectedChat.id, archiveFolder.id);
      setArchivedChatIds(prev => [...prev, selectedChat.id]);
    } catch (error) {
      logger.error("Error archiving chat", { error: String(error) });
    }
  };
  return {
    archiveChat,
  };
};
