"use client";

import { createClientLogger } from "@/lib/logger/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChatbotUIContext } from "@/context/context";
import { deleteAssistant, deleteGroupAssistant } from "@/db/assistants";
import { deleteChat } from "@/db/chats";
import { deleteCollection } from "@/db/collections";
import { deleteFile } from "@/db/files";
import { deleteModel } from "@/db/models";
import { deletePreset } from "@/db/presets";
import { deletePrompt } from "@/db/prompts";
import { deleteFileFromStorage } from "@/db/storage/files";
import { deleteTool } from "@/db/tools";
import { Tables } from "@/supabase/types";
import { toast } from "sonner";
import { ContentType, DataItemType } from "@/types";
import { FC, useContext, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "next-auth/react";
import { WithTooltip } from "@/components/ui/with-tooltip";
import { getIsAdminGroups } from "@/db/azure_groups";
import { getGroupAssistantByUserId } from "@/db/group_assistants";
import { supabase } from "@/lib/supabase/browser-client";

const logger = createClientLogger({ component: "SidebarDeleteItem" });

interface SidebarDeleteItemProps {
  item: DataItemType;
  contentType: ContentType;
}

export const SidebarDeleteItem: FC<SidebarDeleteItemProps> = ({
  item,
  contentType,
}) => {
  const { t } = useTranslation();

  const {
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setGroupAssistants,
    setTools,
    setModels,
    profile,
    hasAccess,
    setHasAccess,
    setChatFiles,
    setNewMessageFiles,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showDialog, setShowDialog] = useState(false);
  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);

  // Check access permissions for group assistants
  useEffect(() => {
    const checkGroupAssistantAccess = async () => {
      if (contentType === "group-assistants") {
        try {
          const assistantUser = await getGroupAssistantByUserId(item.id);
          const authSession = (await supabase.auth.getSession()).data.session;

          // Check if user is the owner of the assistant
          const isOwner = authSession?.user?.id === assistantUser?.user_id;

          // Check if user is an admin in any group (admins can delete all group assistants)
          const isAdmin = await getIsAdminGroups(groupIds);

          // User has access if they are the owner OR an admin
          setHasAccess(isOwner || isAdmin);
        } catch (error) {
          logger.error("Error checking group assistant access", {
            error: String(error),
          });
          setHasAccess(false);
        }
      } else {
        // For non-group assistants, always allow access
        setHasAccess(true);
      }
    };

    checkGroupAssistantAccess();
  }, [contentType, item.id, groupIds, setHasAccess]);
  const deleteFunctions = {
    chats: async (chat: Tables<"chats">) => {
      await deleteChat(chat.id);
    },
    presets: async (preset: Tables<"presets">) => {
      await deletePreset(preset.id);
    },
    prompts: async (prompt: Tables<"prompts">) => {
      await deletePrompt(prompt.id);
    },
    files: async (file: Tables<"files">) => {
      await deleteFileFromStorage(
        file.file_path,
        file.original_file_path,
        profile?.developer_mode,
      );
      await deleteFile(file.id);

      // Also remove from chat UI state if selected
      setChatFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
      setNewMessageFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
    },
    collections: async (collection: Tables<"collections">) => {
      await deleteCollection(collection.id);
    },
    assistants: async (assistant: Tables<"assistants">) => {
      await deleteAssistant(assistant.id);
      setChats(prevState =>
        prevState.filter(chat => chat.assistant_id !== assistant.id),
      );
    },

    "group-assistants": async (assistant: Tables<"assistants">) => {
      await deleteGroupAssistant(assistant.id, groupIds);
      setChats(prevState =>
        prevState.filter(chat => chat.assistant_id !== assistant.id),
      );
    },

    tools: async (tool: Tables<"tools">) => {
      await deleteTool(tool.id);
    },
    models: async (model: Tables<"models">) => {
      await deleteModel(model.id);
    },
  };

  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    "group-assistants": setGroupAssistants,
    tools: setTools,
    models: setModels,
  };

  const handleDelete = async () => {
    try {
      // Additional check for group assistants access control
      if (contentType === "group-assistants" && !hasAccess) {
        toast.error(
          t("You don't have permission to delete this Group Assistant"),
        );
        return;
      }

      const setStateFunction = stateUpdateFunctions[contentType];
      if (!setStateFunction) return;

      const deleteFunction = deleteFunctions[contentType];
      if (!deleteFunction) return;

      await deleteFunction(item as any);

      setStateFunction((prevItems: any) =>
        prevItems.filter((prevItem: any) => prevItem.id !== item.id),
      );

      setShowDialog(false);

      const deleteMessage = t("{{contentType}} deleted successfully", {
        contentType: contentType.replace("_", " "),
      });

      toast.success(deleteMessage);
    } catch (error) {
      toast.error(
        t(`Error deleting ${contentType.replace("_", " ")}. ${error}.`),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      buttonRef.current?.click();
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        {contentType === "group-assistants" && hasAccess === false ? (
          <WithTooltip
            display={t("You don't have access to delete this Group Assistant")}
            trigger={
              <Button className={"disable-button text-red-500"} variant="ghost">
                {t("Delete")}
              </Button>
            }
          />
        ) : (
          <Button className={"text-red-500"} variant="ghost">
            {t("Delete")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {t("Delete")} {contentType.slice(0, -1)}
          </DialogTitle>

          <DialogDescription>
            {t("Are you sure you want to delete {{name}}?", {
              name: item.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            {t("Cancel")}
          </Button>

          <Button ref={buttonRef} variant="destructive" onClick={handleDelete}>
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface CustomSidebarDeleteItemProps {
  item: DataItemType;
  contentType: ContentType;
}

export const CustomSidebarDelete: FC<CustomSidebarDeleteItemProps> = ({
  item,
  contentType,
}) => {
  const { t } = useTranslation();
  const {
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setGroupAssistants,
    setTools,
    setModels,
    profile,
    setChatFiles,
    setNewMessageFiles,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showDialog, setShowDialog] = useState(false);

  const deleteFunctions = {
    chats: async (chat: Tables<"chats">) => {
      await deleteChat(chat.id);
    },
    presets: async (preset: Tables<"presets">) => {
      await deletePreset(preset.id);
    },
    prompts: async (prompt: Tables<"prompts">) => {
      await deletePrompt(prompt.id);
    },
    files: async (file: Tables<"files">) => {
      await deleteFileFromStorage(
        file.file_path,
        file.original_file_path,
        profile?.developer_mode,
      );
      await deleteFile(file.id);

      // Also remove from chat UI state if selected
      setChatFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
      setNewMessageFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
    },
    collections: async (collection: Tables<"collections">) => {
      await deleteCollection(collection.id);
    },
    assistants: async (assistant: Tables<"assistants">) => {
      await deleteAssistant(assistant.id);
      setChats(prevState =>
        prevState.filter(chat => chat.assistant_id !== assistant.id),
      );
    },
    tools: async (tool: Tables<"tools">) => {
      await deleteTool(tool.id);
    },
    models: async (model: Tables<"models">) => {
      await deleteModel(model.id);
    },
  };

  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    "group-assistants": setGroupAssistants,
    tools: setTools,
    models: setModels,
  };

  const handleDelete = async () => {
    try {
      const setStateFunction = stateUpdateFunctions[contentType];
      if (!setStateFunction) return;

      const deleteFunction = deleteFunctions[contentType];
      if (!deleteFunction) return;

      await deleteFunction(item as any);

      setStateFunction((prevItems: any) =>
        prevItems.filter((prevItem: any) => prevItem.id !== item.id),
      );

      setShowDialog(false);

      const deleteMessage = t("{{contentType}} deleted successfully", {
        contentType: contentType.replace("_", " "),
      });

      toast.success(deleteMessage);
    } catch (error) {
      toast.error(
        t(`Error deleting ${contentType.replace("_", " ")}. ${error}.`),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      buttonRef.current?.click();
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <Button className="text-red-500" variant="ghost">
          {t("Delete")}
        </Button>
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {t("Delete")} {contentType.slice(0, -1)}
          </DialogTitle>

          <DialogDescription>
            {t("Are you sure you want to delete {{name}}?", {
              name: item.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            {t("Cancel")}
          </Button>

          <Button ref={buttonRef} variant="destructive" onClick={handleDelete}>
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
