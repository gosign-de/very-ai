"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
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
import { deleteWorkspace } from "@/db/workspaces";
import { Tables } from "@/supabase/types";
import { FC, useContext, useRef, useState } from "react";
import { Input } from "../ui/input";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

const logger = createClientLogger({ component: "DeleteWorkspace" });

interface DeleteWorkspaceProps {
  workspace: Tables<"workspaces">;
  onDelete: () => void;
}

export const DeleteWorkspace: FC<DeleteWorkspaceProps> = ({
  workspace,
  onDelete,
}) => {
  const { t } = useTranslation();
  const {
    workspaces,
    setWorkspaces,
    setSelectedWorkspace,
    setChatMessages,
    setSelectedChat,
    setChatFiles,
    setChatImages,
    setChatFileItems,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay,
  } = useContext(ChatbotUIContext);
  const { handleNewChat: _handleNewChat } = useChatHandler();
  const router = useRouter();

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false);

  const [name, setName] = useState("");

  const handleDeleteWorkspace = async () => {
    try {
      await deleteWorkspace(workspace.id);

      const filteredWorkspaces = workspaces.filter(w => w.id !== workspace.id);

      // Find Home workspace, or fallback to first available workspace
      const homeWorkspace =
        filteredWorkspaces.find(w => w.is_home) || filteredWorkspaces[0];

      if (homeWorkspace) {
        // Clear chat state before switching
        setChatMessages([]);
        setSelectedChat(null);
        setChatFiles([]);
        setChatImages([]);
        setChatFileItems([]);
        setNewMessageFiles([]);
        setNewMessageImages([]);
        setShowFilesDisplay(false);

        setWorkspaces(filteredWorkspaces);
        setSelectedWorkspace(homeWorkspace);

        setShowWorkspaceDialog(false);
        onDelete();

        // Navigate after state updates
        router.push(`/${homeWorkspace.id}/chat`);
      } else {
        // No workspaces left
        setWorkspaces([]);
        setSelectedWorkspace(null);
        setShowWorkspaceDialog(false);
        onDelete();
        router.push("/");
      }
    } catch (error) {
      logger.error("Error deleting workspace", { error: String(error) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      buttonRef.current?.click();
    }
  };

  return (
    <Dialog open={showWorkspaceDialog} onOpenChange={setShowWorkspaceDialog}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("Delete")}</Button>
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {t("Delete")} {workspace.name}
          </DialogTitle>

          <DialogDescription className="space-y-1">
            {t("WARNING: Deleting a workspace will delete all of its data.")}
          </DialogDescription>
        </DialogHeader>

        <Input
          className="mt-4"
          placeholder={t("Type the name of this workspace to confirm")}
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowWorkspaceDialog(false)}>
            {t("Cancel")}
          </Button>

          <Button
            ref={buttonRef}
            variant="destructive"
            onClick={handleDeleteWorkspace}
            disabled={name !== workspace.name}
          >
            {t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
