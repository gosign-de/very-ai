"use client";

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
import { deleteFolder } from "@/db/folders";
import { supabase } from "@/lib/supabase/browser-client";
import { Tables } from "@/supabase/types";
import { ContentType } from "@/types";
import { IconTrash } from "@tabler/icons-react";
import { FC, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import logger from "@/app/utils/logger";

interface DeleteFolderProps {
  folder: Tables<"folders">;
  contentType: ContentType;
}

export const DeleteFolder: FC<DeleteFolderProps> = ({
  folder,
  contentType,
}) => {
  const { t } = useTranslation();

  const {
    setChats,
    setFolders,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setTools,
    setModels,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showFolderDialog, setShowFolderDialog] = useState(false);

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

  const handleDeleteFolderOnly = async () => {
    logger.info("Deleting folder only", { folderId: folder.id, contentType });
    try {
      await deleteFolder(folder.id);

      setFolders(prevState => prevState.filter(c => c.id !== folder.id));
      setShowFolderDialog(false);

      const setStateFunction = stateUpdateFunctions[contentType];
      if (setStateFunction) {
        setStateFunction((prevItems: any) =>
          prevItems.map((item: any) =>
            item.id === folder.id || item.folder_id === folder.id
              ? { ...item, folder_id: null }
              : item,
          ),
        );
      }

      logger.success("Folder deleted", { folderId: folder.id });
    } catch (error) {
      logger.error("Failed to delete folder", {
        folderId: folder.id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(t("Something went wrong. Please try again."));
    }
  };

  const handleDeleteFolderAndItems = async () => {
    const setStateFunction = stateUpdateFunctions[contentType];

    if (!setStateFunction) return;

    logger.info("Deleting folder and contained items", {
      folderId: folder.id,
      contentType,
    });

    const { error } = await supabase
      .from(
        contentType as
          | "chats"
          | "presets"
          | "prompts"
          | "files"
          | "collections"
          | "assistants"
          | "tools"
          | "models",
      )
      .delete()
      .eq("folder_id", folder.id);

    if (error) {
      logger.error("Failed to delete items in folder", {
        folderId: folder.id,
        contentType,
        error: error.message,
      });
      toast.error(error.message);
      return;
    }

    setStateFunction((prevItems: any) =>
      prevItems.filter((item: any) => item.folder_id !== folder.id),
    );

    await handleDeleteFolderOnly();
  };

  return (
    <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
      <DialogTrigger asChild>
        <IconTrash className="hover:opacity-50" size={18} />
      </DialogTrigger>

      <DialogContent className="min-w-[550px]">
        <DialogHeader>
          <DialogTitle>
            {t("Delete")} {folder.name}
          </DialogTitle>

          <DialogDescription>
            {t("Are you sure you want to delete this folder?")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowFolderDialog(false)}>
            {t("Cancel")}
          </Button>

          <Button
            ref={buttonRef}
            variant="destructive"
            onClick={handleDeleteFolderAndItems}
          >
            {t("Delete Folder & Included Items")}
          </Button>

          <Button
            ref={buttonRef}
            variant="destructive"
            onClick={handleDeleteFolderOnly}
          >
            {t("Delete Folder Only")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
