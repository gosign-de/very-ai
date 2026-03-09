"use client";

import { createClientLogger } from "@/lib/logger/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { createFolder } from "@/db/folders";
import { FC, useContext, useRef, useState, useEffect } from "react";
import { ContentType } from "@/types";
import { useTranslation } from "react-i18next";

const logger = createClientLogger({ component: "CreateFolder" });

interface CreateFolderProps {
  contentType: ContentType;
  showDialog: boolean;
  setShowDialog: (value: boolean) => void;
  groupId: string | null;
}

export const CreateFolder: FC<CreateFolderProps> = ({
  contentType,
  showDialog,
  setShowDialog,
  groupId: _groupId,
}) => {
  const { t } = useTranslation();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const { profile, selectedWorkspace, folders, setFolders } =
    useContext(ChatbotUIContext);
  const [name, setName] = useState("");

  useEffect(() => {
    if (showDialog) {
      setName("New Folder");
    }
  }, [showDialog]);

  const handleCreateFolder = async () => {
    if (!profile || !selectedWorkspace) return;

    try {
      const folderData = {
        user_id: profile.user_id,
        workspace_id: selectedWorkspace.id,
        name: name || "New Folder",
        description: "",
        type: contentType,
      };

      const createdFolder = await createFolder(folderData);
      setFolders([...folders, createdFolder]);
    } catch (error) {
      logger.error("Error creating folder", { error: String(error) });
    }

    setShowDialog(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      buttonRef.current?.click();
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        {/* <IconEdit className="hover:opacity-50" size={18} /> */}
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t("Create Folder")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label>{t("Name")}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            {t("Cancel")}
          </Button>

          <Button ref={buttonRef} onClick={handleCreateFolder}>
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
