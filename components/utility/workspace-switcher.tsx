"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChatbotUIContext } from "@/context/context";
import { createWorkspace } from "@/db/workspaces";
import {
  getAdminSettings,
  getAdminSettings as getAdminSettingsSync,
} from "@/lib/config/admin-settings";
import useHotkey from "@/lib/hooks/use-hotkey";
import { IconBuilding, IconHome, IconPlus } from "@tabler/icons-react";
import { ChevronsUpDown } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FC, useContext, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import logger from "@/app/utils/logger";

interface WorkspaceSwitcherProps {}

export const WorkspaceSwitcher: FC<WorkspaceSwitcherProps> = ({}) => {
  const { t } = useTranslation();

  useHotkey(t(";"), () => setOpen(prevState => !prevState));

  const {
    workspaces,
    workspaceImages,
    selectedWorkspace,
    setSelectedWorkspace,
    setWorkspaces,
    setChatMessages,
    setSelectedChat,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay,
    setChatFileItems,
  } = useContext(ChatbotUIContext);

  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedWorkspace) return;

    setValue(selectedWorkspace.id);
  }, [selectedWorkspace]);

  const handleCreateWorkspace = async () => {
    if (!selectedWorkspace) return;

    let adminSettings;

    try {
      adminSettings = await getAdminSettings();
    } catch (error) {
      logger.warn("Error loading admin settings, using defaults", {
        error: error instanceof Error ? error.message : String(error),
      });
      adminSettings = await getAdminSettingsSync();
    }

    try {
      logger.info("Creating new workspace", {
        userId: selectedWorkspace.user_id,
      });
      const createdWorkspace = await createWorkspace({
        user_id: selectedWorkspace.user_id,
        default_context_length: adminSettings.default_context_length,
        default_model: adminSettings.default_model,
        default_image_model: adminSettings.default_image_model,
        default_prompt: adminSettings.default_prompt,
        default_temperature: adminSettings.default_temperature,
        description: "",
        embeddings_provider: adminSettings.default_embeddings_provider,
        include_profile_context: adminSettings.include_profile_context,
        include_workspace_instructions:
          adminSettings.include_workspace_instructions,
        instructions: selectedWorkspace.instructions,
        is_home: false,
        name: t("New Workspace"),
      });

      // Clear chat state before switching to new workspace
      setChatMessages([]);
      setSelectedChat(null);
      setChatFiles([]);
      setChatImages([]);
      setChatFileItems([]);
      setNewMessageFiles([]);
      setNewMessageImages([]);
      setShowFilesDisplay(false);

      setWorkspaces([...workspaces, createdWorkspace]);
      setSelectedWorkspace(createdWorkspace);
      setOpen(false);

      return router.push(`/${createdWorkspace.id}/chat`);
    } catch (error) {
      logger.error("Error creating workspace", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to create workspace. Please try again.");
    }
  };

  const getWorkspaceName = (workspaceId: string) => {
    const workspace = workspaces.find(
      workspace => workspace.id === workspaceId,
    );

    if (!workspace) return;

    return workspace.name;
  };

  const handleSelect = (workspaceId: string) => {
    const workspace = workspaces.find(
      workspace => workspace.id === workspaceId,
    );

    if (!workspace) return;

    // Clear chat state before switching workspace
    setChatMessages([]);
    setSelectedChat(null);
    setChatFiles([]);
    setChatImages([]);
    setChatFileItems([]);
    setNewMessageFiles([]);
    setNewMessageImages([]);
    setShowFilesDisplay(false);

    setSelectedWorkspace(workspace);
    setOpen(false);
    logger.info("Switched workspace", { workspaceId });

    return router.push(`/${workspace.id}/chat`);
  };

  const workspaceImage = workspaceImages.find(
    image => image.workspaceId === selectedWorkspace?.id,
  );
  const imageSrc = workspaceImage
    ? workspaceImage.url
    : selectedWorkspace?.is_home
      ? ""
      : "";

  const IconComponent = selectedWorkspace?.is_home ? IconHome : IconBuilding;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-input flex h-[36px] w-full min-w-0 cursor-pointer items-center rounded-md border px-2 py-1 hover:opacity-50"
        >
          {selectedWorkspace && (
            <div className="shrink-0">
              {workspaceImage ? (
                <Image
                  style={{ width: "22px", height: "22px" }}
                  className="mr-2 rounded"
                  src={imageSrc}
                  width={22}
                  height={22}
                  alt={selectedWorkspace.name}
                />
              ) : (
                <IconComponent className="mb-0.5 mr-2" size={22} />
              )}
            </div>
          )}

          <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left">
            {getWorkspaceName(value) || "Select workspace..."}
          </span>

          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="px-1 py-2"
        align="start"
        side="bottom"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div className="space-y-2">
          <Button
            className="flex w-full items-center space-x-2"
            size="sm"
            onClick={handleCreateWorkspace}
          >
            <IconPlus />
            <div className="ml-2">{t("New Workspace")}</div>
          </Button>

          <Input
            placeholder={t("Search workspaces...")}
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="flex flex-col space-y-1">
            {workspaces
              .filter(workspace => workspace.is_home)
              .map(workspace => {
                const image = workspaceImages.find(
                  image => image.workspaceId === workspace.id,
                );

                return (
                  <Button
                    key={workspace.id}
                    className="flex items-center justify-start"
                    variant="ghost"
                    onClick={() => handleSelect(workspace.id)}
                  >
                    {image ? (
                      <Image
                        style={{ width: "28px", height: "28px" }}
                        className="mr-3 shrink-0 rounded"
                        src={image.url || ""}
                        width={28}
                        height={28}
                        alt={workspace.name}
                      />
                    ) : (
                      <IconHome className="mr-3 shrink-0" size={28} />
                    )}

                    <div className="overflow-hidden whitespace-nowrap text-lg font-semibold">
                      {workspace.name}
                    </div>
                  </Button>
                );
              })}

            {workspaces
              .filter(
                workspace =>
                  !workspace.is_home &&
                  workspace.name.toLowerCase().includes(search.toLowerCase()),
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(workspace => {
                const image = workspaceImages.find(
                  image => image.workspaceId === workspace.id,
                );
                return (
                  <Button
                    key={workspace.id}
                    className="flex items-center justify-start"
                    variant="ghost"
                    onClick={() => handleSelect(workspace.id)}
                  >
                    {image ? (
                      <Image
                        style={{ width: "28px", height: "28px" }}
                        className="mr-3 shrink-0 rounded"
                        src={image.url || ""}
                        width={28}
                        height={28}
                        alt={workspace.name}
                      />
                    ) : (
                      <IconBuilding className="mr-3 shrink-0" size={28} />
                    )}

                    <div className="overflow-hidden whitespace-nowrap text-lg font-semibold">
                      {workspace.name}
                    </div>
                  </Button>
                );
              })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
