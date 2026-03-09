"use client";

import { createClientLogger } from "@/lib/logger/client";
import { ChatbotUIContext } from "@/context/context";
import { updateAssistant } from "@/db/assistants";
import { updateChat } from "@/db/chats";
import { updateCollection } from "@/db/collections";
import { updateFile } from "@/db/files";
import { updateModel } from "@/db/models";
import { updatePreset } from "@/db/presets";
import { updatePrompt } from "@/db/prompts";
import { updateTool } from "@/db/tools";
import { cn } from "@/lib/utils";
import { Tables } from "@/supabase/types";
import { ContentType, DataItemType, DataListType, LLMID } from "@/types";
import { FC, useContext, useEffect, useRef, useState, useMemo } from "react";
import { Separator } from "../ui/separator";
import { AssistantItem } from "./items/assistants/assistant-item";
import { ChatItem } from "./items/chat/chat-item";
import { CollectionItem } from "./items/collections/collection-item";
import { FileItem } from "./items/files/file-item";
import { Folder } from "./items/folders/folder-item";
import { ModelItem } from "./items/models/model-item";
import { PresetItem } from "./items/presets/preset-item";
import { PromptItem } from "./items/prompts/prompt-item";
import { ToolItem } from "./items/tools/tool-item";
import { getAllAzureGroups } from "@/db/azure_groups";
import { getAllGroupsAssistants } from "@/db/group_assistants";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/browser-client";
import { useSession } from "next-auth/react";
import { useTranslation } from "react-i18next";
import { GroupAssistantItem } from "./items/groupassistants/group-assistant-item";
import { subscribeToGroupUpdates } from "@/lib/events/group-events";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { deleteFile } from "@/db/files";
import { deleteFileFromStorage } from "@/db/storage/files";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

const logger = createClientLogger({ component: "SidebarDataList" });

interface SidebarDataListProps {
  contentType: ContentType;
  data: DataListType;
  folders: Tables<"folders">[];
  searchTerm: string;
  selectedAssistantGroupId: string | null;
}

export const SidebarDataList: FC<SidebarDataListProps> = ({
  contentType,
  data,
  folders,
  searchTerm,
  selectedAssistantGroupId,
}) => {
  const { t } = useTranslation();

  const {
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setTools,
    setModels,
    setgroupsFolders,
    setContentState,
    setDataWithFolders,
    dataWithFolders,
    groupsFolders,
    selectedChat,
    groupassistants,
    setGroupAssistants,
    selectedAssistant,
    setChatSettings,
    setSelectedAssistant,
    setChatFiles,
    setNewMessageFiles,
    profile,
  } = useContext(ChatbotUIContext);

  const divRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const params = useParams();
  const workspaceId = params.workspaceid as string;
  const azureGroupsRef = useRef<any[]>([]);

  const { data: session } = useSession();
  const groups = useMemo(
    () => session?.user?.groups || [],
    [session?.user?.groups],
  );

  useEffect(() => {
    setContentState(contentType);
  }, [contentType, setContentState]);

  // Sync global group assistants state when it changes
  useEffect(() => {
    if (contentType === "group-assistants" && groupassistants.length > 0) {
      // Don't add group names here, just use the global state as is
      // Group names will be added in the filteredData logic
    }
  }, [groupassistants, contentType]);

  useEffect(() => {
    const loadAzureGroupsData = async () => {
      try {
        const azureGroups = await getAllAzureGroups();
        azureGroupsRef.current = azureGroups;
        const groupAssistants = await getAllGroupsAssistants(groupIds);
        const mergedGroupAssistants = groupAssistants
          .filter(assistant => assistant != null)
          .map(assistant => {
            const group = azureGroupsRef.current.find(
              g => g != null && g.group_id === assistant.group_id,
            );
            return {
              ...assistant,
              group_name: group ? group.name : "Unknown Group",
            };
          });
        setGroupAssistants(mergedGroupAssistants);
      } catch (error) {
        logger.error("Error loading data", { error: String(error) });
      }
    };

    if (contentType === "group-assistants") {
      loadAzureGroupsData();
    }

    const groupIds = groups.map(group => group.id);
    const channel = supabase
      .channel("custom-all-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "assistants" },
        payload => {
          if (payload.new.group_id && groupIds.includes(payload.new.group_id)) {
            const newAssistant = payload.new as Tables<"assistants">;
            // Just add the assistant to the global state without group_name
            setGroupAssistants(prevGroupAssistants => [
              ...prevGroupAssistants,
              newAssistant,
            ]);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "assistants" },
        payload => {
          const updatedAssistant = payload.new as Tables<"assistants">;

          setGroupAssistants(prevGroupAssistants => {
            const existingAssistant = prevGroupAssistants.find(
              assistant => assistant.id === updatedAssistant.id,
            );
            if (existingAssistant) {
              return prevGroupAssistants.map(assistant =>
                assistant.id === updatedAssistant.id
                  ? updatedAssistant
                  : assistant,
              );
            } else {
              if (
                updatedAssistant.group_id &&
                groupIds.includes(updatedAssistant.group_id)
              ) {
                return [...prevGroupAssistants, updatedAssistant];
              } else {
                return prevGroupAssistants;
              }
            }
          });

          // If the updated assistant is currently selected, update selectedAssistant and chatSettings
          if (
            selectedAssistant &&
            selectedAssistant.id === updatedAssistant.id
          ) {
            setSelectedAssistant(updatedAssistant);
            setChatSettings({
              model: updatedAssistant.model as LLMID,
              imageModel: updatedAssistant.image_model as LLMID,
              prompt: updatedAssistant.prompt,
              temperature: updatedAssistant.temperature,
              contextLength: updatedAssistant.context_length,
              includeProfileContext: updatedAssistant.include_profile_context,
              includeWorkspaceInstructions:
                updatedAssistant.include_workspace_instructions,
              embeddingsProvider: updatedAssistant.embeddings_provider as
                | "openai"
                | "local",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "assistants" },
        payload => {
          setGroupAssistants(prevGroupAssistants =>
            prevGroupAssistants.filter(
              assistant => assistant.id !== payload.old.id,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "folders" },
        payload => {
          if (payload.new.group_id && groupIds.includes(payload.new.group_id)) {
            const newFolder = payload.new;
            const group = azureGroupsRef.current.find(
              g => g != null && g.group_id === newFolder.group_id,
            );
            setgroupsFolders(prevGroupsFolders => [
              ...prevGroupsFolders,
              {
                ...newFolder,
                group_name: group ? group.name : "Unknown Group",
              },
            ]);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "folders" },
        payload => {
          if (payload.new.group_id && groupIds.includes(payload.new.group_id)) {
            const updatedFolder = payload.new;
            const group = azureGroupsRef.current.find(
              g => g != null && g.group_id === updatedFolder.group_id,
            );
            setgroupsFolders(prevGroupsFolders =>
              prevGroupsFolders.map(folder =>
                folder.id === updatedFolder.id
                  ? {
                      ...updatedFolder,
                      group_name: group ? group.name : "Unknown Group",
                    }
                  : folder,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "folders" },
        payload => {
          setgroupsFolders(prevGroupsFolders =>
            prevGroupsFolders.filter(folder => folder.id !== payload.old.id),
          );
        },
      )

      .subscribe();

    // Subscribe to group selection updates
    let unsubscribeGroupUpdates: (() => void) | undefined;
    if (contentType === "group-assistants") {
      unsubscribeGroupUpdates = subscribeToGroupUpdates(() => {
        loadAzureGroupsData();
      });
    }

    return () => {
      supabase.removeChannel(channel);
      if (unsubscribeGroupUpdates) {
        unsubscribeGroupUpdates();
      }
    };
  }, [workspaceId, contentType, groups, setGroupAssistants, setgroupsFolders]);

  useEffect(() => {
    const deleteTempChats = async () => {
      let userId = selectedChat?.user_id;
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        userId = user.id;
      }

      const query = supabase
        .from("chats")
        .delete()
        .eq("user_id", userId)
        .eq("is_temp_chat", true);

      if (selectedChat?.id) {
        query.neq("id", selectedChat.id);
      }

      await query;
    };

    deleteTempChats();
  }, [selectedChat]);

  const isFilesView = contentType === "files";

  const handleToggleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!isFilesView) return;
    if (selectedFileIds.size === data.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(
        new Set((data as Tables<"files">[]).map(file => file.id)),
      );
    }
  };

  const getCategorizedData = (data: any[]) => {
    const categories = [
      t("Today"),
      t("Yesterday"),
      t("Previous Week"),
      t("Older"),
    ];
    const categorizedData = categories.reduce(
      (acc, category) => {
        acc[category] = getSortedData(
          data,
          category as "Today" | "Yesterday" | "Previous Week" | "Older",
        );
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return categorizedData;
  };

  const getSortedData = (
    data: any,
    dateCategory: "Today" | "Yesterday" | "Previous Week" | "Older",
  ) => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const yesterdayStart = new Date(
      new Date().setDate(todayStart.getDate() - 1),
    );
    const oneWeekAgoStart = new Date(
      new Date().setDate(todayStart.getDate() - 7),
    );

    return data
      .filter((item: any) => {
        const itemDate = new Date(item.updated_at || item.created_at);
        switch (dateCategory) {
          case t("Today"):
            return itemDate >= todayStart;
          case t("Yesterday"):
            return itemDate >= yesterdayStart && itemDate < todayStart;
          case t("Previous Week"):
            return itemDate >= oneWeekAgoStart && itemDate < yesterdayStart;
          case t("Older"):
            return itemDate < oneWeekAgoStart;
          default:
            return true;
        }
      })
      .sort(
        (
          a: { updated_at: string; created_at: string },
          b: { updated_at: string; created_at: string },
        ) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime(),
      );
  };

  const getFilteredData = () => {
    let filteredData = data as any;

    if (contentType === "chats") {
      filteredData = filteredData.filter(
        (chat: any) =>
          !chat.direct_chat_email &&
          !("group_id" in chat && chat.group_id) &&
          !("folder_id" in chat && chat.folder_id),
      );
    } else if (contentType === "collections") {
      filteredData = data.filter((collection: any) => {
        return (
          collection.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          collection.group_id === null
        );
      });
    } else if (contentType === "group-assistants") {
      filteredData = groupassistants
        .filter(assistant => assistant != null)
        .map(assistant => {
          const group = azureGroupsRef.current.find(
            g => g != null && g.group_id === assistant.group_id,
          );
          return {
            ...assistant,
            group_name: group ? group.name : "Unknown Group",
          };
        });
      if (selectedAssistantGroupId !== null) {
        filteredData = filteredData.filter(
          (assistant: any) => assistant.group_id === selectedAssistantGroupId,
        );
      }
      filteredData = filteredData.filter((assistant: any) =>
        assistant.name?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    } else if (contentType === "assistants") {
      filteredData = data.filter((assistant: any) => {
        return (
          assistant.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          assistant.group_id === null
        );
      });
    }
    return getCategorizedData(filteredData);
  };

  const getDataListComponent = (
    contentType: ContentType,
    item: DataItemType,
  ) => {
    switch (contentType) {
      case "chats":
        return <ChatItem key={item.id} chat={item as Tables<"chats">} />;
      case "presets":
        return <PresetItem key={item.id} preset={item as Tables<"presets">} />;
      case "prompts":
        return <PromptItem key={item.id} prompt={item as Tables<"prompts">} />;
      case "files":
        return (
          <FileItem
            key={item.id}
            file={item as Tables<"files">}
            isSelectable={true}
            isSelected={selectedFileIds.has(item.id)}
            onToggleSelect={handleToggleSelectFile}
          />
        );
      case "collections":
        return (
          <CollectionItem
            key={item.id}
            collection={item as Tables<"collections">}
          />
        );
      case "assistants":
        return (
          <AssistantItem
            key={item.id}
            assistant={item as Tables<"assistants">}
            contentType={contentType}
          />
        );
      case "group-assistants":
        return (
          <div key={item.id}>
            {/* Only show group name when no specific group is selected (showing all groups) */}
            {selectedAssistantGroupId === null &&
              "group_name" in item &&
              item.group_name && (
                <>
                  <div className="mb-1 text-sm font-semibold text-gray-500">
                    {item.group_name as string}
                  </div>
                  <GroupAssistantItem
                    key={item.id}
                    assistant={item as Tables<"assistants">}
                  />
                </>
              )}
            {/* When a specific group is selected, just show the assistant without group name */}
            {selectedAssistantGroupId !== null && (
              <GroupAssistantItem
                key={item.id}
                assistant={item as Tables<"assistants">}
              />
            )}
          </div>
        );
      case "tools":
        return <ToolItem key={item.id} tool={item as Tables<"tools">} />;
      case "models":
        return <ModelItem key={item.id} model={item as Tables<"models">} />;
      default:
        return null;
    }
  };

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

  const updateFolder = async (itemId: string, folderId: string | null) => {
    const item: any = data.find(item => item.id === itemId);
    if (!item) return null;
    const updateFunction = updateFunctions[contentType];
    const setStateFunction = stateUpdateFunctions[contentType];
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

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.target as Element;
    if (!target.closest("#folder")) {
      const itemId = e.dataTransfer.getData("text/plain");
      updateFolder(itemId, null);
    }
    setIsDragOver(false);
  };

  useEffect(() => {
    if (divRef.current) {
      setIsOverflowing(
        divRef.current.scrollHeight > divRef.current.clientHeight,
      );
    }
  }, [data]);

  useEffect(() => {
    let newDataWithFolders = [];
    if (contentType === "chats") {
      newDataWithFolders = data.filter(item => item.folder_id);
    }
    setDataWithFolders(prevState => {
      if (JSON.stringify(prevState) !== JSON.stringify(newDataWithFolders)) {
        return newDataWithFolders;
      }
      return prevState;
    });
  }, [contentType, data, setDataWithFolders]);

  let dataWithoutFolders = [];
  if (
    contentType == "chats" ||
    contentType == "presets" ||
    contentType == "prompts" ||
    contentType == "files" ||
    contentType == "collections" ||
    contentType == "assistants" ||
    contentType == "tools" ||
    contentType == "models"
  ) {
    dataWithoutFolders = [...data.filter(item => item.folder_id === null)];
  } else if (contentType == "group-assistants") {
    dataWithoutFolders = [
      ...groupassistants.filter(
        item => item != null && item.folder_id === null,
      ),
    ];
  }

  const categorizedData = getFilteredData();

  const handleBulkDelete = async () => {
    if (!isFilesView || selectedFileIds.size === 0) return;

    setIsDeleting(true);
    const filesData = data as Tables<"files">[];
    const filesToDelete = filesData.filter(file =>
      selectedFileIds.has(file.id),
    );

    try {
      for (const file of filesToDelete) {
        await deleteFileFromStorage(
          file.file_path,
          file.original_file_path,
          profile?.developer_mode,
        );
        await deleteFile(file.id);
      }

      setFiles(prev =>
        prev.filter((file: Tables<"files">) => !selectedFileIds.has(file.id)),
      );
      setChatFiles(prev => prev.filter(file => !selectedFileIds.has(file.id)));
      setNewMessageFiles(prev =>
        prev.filter(file => !selectedFileIds.has(file.id)),
      );

      setSelectedFileIds(new Set());
      setShowDeleteDialog(false);

      toast.success(
        t("{{count}} files deleted successfully", {
          count: filesToDelete.length,
        }),
      );
    } catch (error) {
      toast.error(
        t("Error deleting files. {{error}}", {
          error,
        }),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {contentType === "files" && data.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-3 border-b px-1 py-3 bg-muted/30">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={
                selectedFileIds.size > 0 && selectedFileIds.size === data.length
              }
              onCheckedChange={toggleSelectAll}
              className="cursor-pointer"
            />
            <span
              className="text-sm font-medium text-foreground cursor-pointer select-none"
              onClick={toggleSelectAll}
            >
              {selectedFileIds.size === 0
                ? t("Select All")
                : t("{{count}} selected", { count: selectedFileIds.size })}
            </span>
          </div>
          {selectedFileIds.size > 0 && (
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {t("Delete")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t("Delete {{count}} files?", {
                      count: selectedFileIds.size,
                    })}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      "Are you sure you want to delete these {{count}} files? This action cannot be undone.",
                      { count: selectedFileIds.size },
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setShowDeleteDialog(false)}
                    disabled={isDeleting}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? t("Deleting...") : t("Delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
      <div
        ref={divRef}
        className="mt-2 flex flex-col overflow-auto"
        onDrop={handleDrop}
      >
        {contentType === "chats" && data.length === 0 && (
          <div className="flex grow flex-col items-center justify-center">
            <div className="text-muted-foreground p-8 text-center text-lg italic">
              {t("No regular chats.")}
            </div>
          </div>
        )}
        {contentType !== "chats" &&
          Object.values(categorizedData).flat().length === 0 && (
            <div className="flex grow flex-col items-center justify-center">
              <div className="text-muted-foreground p-8 text-center text-lg italic">
                {t("No")}{" "}
                {`${
                  {
                    presets: `${t("presets")} ${t("available")}`,
                    prompts: `${t("prompts")} ${t("available")}`,
                    files: `${t("files")} ${t("available")}`,
                    collections: `${t("collections")} ${t("available")}`,
                    assistants: t("assistants"),
                    "group-assistants": t("group-assistants"),
                    tools: t("tools"),
                    models: t("models"),
                  }[contentType] || t("items")
                }.`}
              </div>
            </div>
          )}
        {(dataWithFolders.length > 0 || dataWithoutFolders.length > 0) && (
          <div
            className={`h-full ${
              isOverflowing ? "w-[calc(100%-8px)]" : "w-full"
            } space-y-2 pt-2 ${isOverflowing ? "mr-2" : ""}`}
          >
            {contentType === "chats"
              ? folders.map(folder => (
                  <Folder
                    key={folder.id}
                    folder={folder}
                    onUpdateFolder={updateFolder}
                    contentType={contentType}
                  >
                    {dataWithFolders
                      .filter(item => item.folder_id === folder.id)
                      .map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => handleDragStart(e, item.id)}
                        >
                          {getDataListComponent(contentType, item)}
                        </div>
                      ))}
                  </Folder>
                ))
              : groupsFolders.map(groupfolder => (
                  <Folder
                    key={groupfolder.id}
                    folder={groupfolder}
                    onUpdateFolder={updateFolder}
                    contentType={contentType}
                  >
                    {dataWithFolders
                      .filter(item => item.folder_id === groupfolder.id)
                      .map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => handleDragStart(e, item.id)}
                        >
                          {getDataListComponent(contentType, item)}
                        </div>
                      ))}
                  </Folder>
                ))}

            {folders.length > 0 && <Separator />}

            {Object.entries(categorizedData).map(
              ([category, items]) =>
                items.length > 0 && (
                  <div key={category} className="pb-2">
                    <div className="text-muted-foreground mb-1 text-sm font-bold">
                      {category}
                    </div>

                    <div
                      className={cn(
                        "flex grow flex-col",
                        isDragOver && "bg-accent",
                      )}
                      onDrop={handleDrop}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                    >
                      {items.map((item: any) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={e => handleDragStart(e, item.id)}
                        >
                          {getDataListComponent(contentType, item)}
                        </div>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        )}
      </div>
      <div
        className={cn("flex grow", isDragOver && "bg-accent")}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
      />
    </>
  );
};

export default SidebarDataList;
