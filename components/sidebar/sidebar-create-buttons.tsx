"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler";
import { ContentType } from "@/types";
import { IconFolderPlus, IconPlus } from "@tabler/icons-react";
import { FC, useState, useEffect } from "react";
import { Button } from "../ui/button";
import { CreateAssistant } from "./items/assistants/create-assistant";
import { CreateCollection } from "./items/collections/create-collection";
import { CreateFile } from "./items/files/create-file";
import { CreateModel } from "./items/models/create-model";
import { CreatePreset } from "./items/presets/create-preset";
import { CreatePrompt } from "./items/prompts/create-prompt";
import { CreateTool } from "./items/tools/create-tool";
import { useSession } from "next-auth/react";
import { CreateGroupAssistant } from "./items/groupassistants/create-group-assistant";
import { getUserSelectedGroups } from "@/db/azure_groups";
import GroupState from "@/components/GroupState";
import { CreateFolder } from "./items/folders/create-folder";
import { useTranslation } from "react-i18next";
import { subscribeToGroupUpdates } from "@/lib/events/group-events";

const logger = createClientLogger({ component: "SidebarCreateButtons" });

interface SidebarCreateButtonsProps {
  contentType: ContentType;
  hasData: boolean;
  onGroupSelect: (groupId: string) => void;
  onCollectionGroupSelect: (collectionGroupId: string) => void;
  onAssistantGroupSelect: (collectionGroupId: string) => void;
}
export const SidebarCreateButtons: FC<SidebarCreateButtonsProps> = ({
  contentType,
  hasData,
  onGroupSelect,
  onCollectionGroupSelect,
  onAssistantGroupSelect,
}) => {
  const { t } = useTranslation();

  const { data: _session } = useSession();
  const { handleNewChat } = useChatHandler();

  const [_selectedGroupId, setSelectedGroupId] = useState(null);
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false);
  const [isCreatingGroupAssistant, setIsGroupCreatingAssistant] =
    useState(false);
  const [isCreatingTool, setIsCreatingTool] = useState(false);
  const [isCreatingModel, setIsCreatingModel] = useState(false);
  const [selectedAssistantGroupId, setSelectedAssistantGroupId] = useState("");
  const [azureassistantsGroups, setAzureAssistantsGroups] = useState<any[]>([]);
  const [_loadingassistantsGroups, setLoadingassistantsGroups] = useState(true);
  const [_errorassistantsGroups, setErrorassistantsGroups] = useState<
    string | null
  >(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);

  useEffect(() => {
    const savedGroupId = sessionStorage.getItem("selectedGroupId");
    if (savedGroupId) {
      setSelectedGroupId(savedGroupId);
      GroupState.setSelectedGroup(savedGroupId);
    }

    const handleGroupChangeFromState = groupId => {
      setSelectedGroupId(groupId);
    };

    GroupState.subscribe(handleGroupChangeFromState);
    return () => {
      GroupState.unsubscribe(handleGroupChangeFromState);
    };
  }, []);

  const fetchAssistantGroups = async () => {
    try {
      const selectedGroups = await getUserSelectedGroups();
      setAzureAssistantsGroups(selectedGroups);
      setLoadingassistantsGroups(false);
    } catch (error) {
      logger.error("Error fetching Azure assistantsgroups", {
        error: String(error),
      });
      setErrorassistantsGroups("Failed to fetch assistantsgroups");
      setLoadingassistantsGroups(false);
    }
  };

  useEffect(() => {
    fetchAssistantGroups();

    // Subscribe to group updates
    const unsubscribe = subscribeToGroupUpdates(() => {
      fetchAssistantGroups();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const getCreateFunction = () => {
    switch (contentType) {
      case "chats":
        return async () => {
          await handleNewChat();
        };
      case "presets":
        return async () => {
          setIsCreatingPreset(true);
        };
      case "prompts":
        return async () => {
          setIsCreatingPrompt(true);
        };
      case "files":
        return async () => {
          setIsCreatingFile(true);
        };
      case "collections":
        return async () => {
          setIsCreatingCollection(true);
        };
      case "assistants":
        return async () => {
          setIsCreatingAssistant(true);
        };
      case "group-assistants":
        return async () => {
          setIsGroupCreatingAssistant(true);
        };
      case "tools":
        return async () => {
          setIsCreatingTool(true);
        };
      case "models":
        return async () => {
          setIsCreatingModel(true);
        };
      default:
        break;
    }
  };

  useEffect(() => {
    if (contentType !== "group-assistants") {
      onAssistantGroupSelect(null);
      setSelectedAssistantGroupId("");
    }
  }, [
    contentType,
    onGroupSelect,
    onCollectionGroupSelect,
    onAssistantGroupSelect,
  ]);

  const contentTypeDisplayNames: Record<ContentType, string> = {
    chats: t("Chats"),
    presets: t("Presets"),
    prompts: t("Prompts"),
    files: t("Files"),
    collections: t("Collections"),
    assistants: t("Assistants"),
    "group-assistants": t("Group Assistants"),
    tools: t("Tools"),
    models: t("Models"),
  };

  const displayName = contentTypeDisplayNames[contentType];

  const createButtonText = {
    presets: "New Presets",
    prompts: "New Prompts",
    files: "New Files",
    collections: "New Collections",
    assistants: "New Assistants",
  };

  const shouldDisplayButton = ![
    "chats",
    "group-chats",
    "presets",
    "prompts",
    "files",
    "collections",
    "assistants",
  ].includes(contentType);

  return (
    <div className="flex w-full flex-col space-y-2">
      {contentType === "chats" && (
        <>
          <div className="mb-4">
            <h3 className="text-lg font-semibold">{t("Chats")}</h3>
            <div className="flex">
              <Button
                className="flex h-[36px] grow"
                onClick={getCreateFunction()}
              >
                <IconPlus className="mr-1" size={20} />
                {t("New Chat")}
              </Button>
              {hasData && (
                <Button
                  className="ml-2 h-[36px]"
                  onClick={() => setShowFolderDialog(true)}
                >
                  <IconFolderPlus size={20} />
                </Button>
              )}
            </div>
          </div>
          <CreateFolder
            contentType={contentType}
            showDialog={showFolderDialog}
            setShowDialog={setShowFolderDialog}
            groupId={null}
          />
        </>
      )}

      {(shouldDisplayButton || createButtonText[contentType]) && (
        <Button className="flex h-[36px] grow" onClick={getCreateFunction()}>
          <IconPlus className="mr-1" size={20} />
          {t(createButtonText[contentType] || t("New"))}{" "}
          {contentType !== "presets" &&
            contentType !== "prompts" &&
            contentType !== "files" &&
            contentType !== "collections" &&
            contentType !== "assistants" &&
            displayName}
        </Button>
      )}

      {isCreatingPrompt && (
        <CreatePrompt
          isOpen={isCreatingPrompt}
          onOpenChange={setIsCreatingPrompt}
        />
      )}

      {isCreatingPreset && (
        <CreatePreset
          isOpen={isCreatingPreset}
          onOpenChange={setIsCreatingPreset}
        />
      )}

      {isCreatingFile && (
        <CreateFile isOpen={isCreatingFile} onOpenChange={setIsCreatingFile} />
      )}

      {isCreatingCollection && (
        <CreateCollection
          isOpen={isCreatingCollection}
          onOpenChange={setIsCreatingCollection}
        />
      )}

      {isCreatingAssistant && (
        <CreateAssistant
          isOpen={isCreatingAssistant}
          onOpenChange={setIsCreatingAssistant}
        />
      )}

      {contentType === "group-assistants" && isCreatingGroupAssistant && (
        <CreateGroupAssistant
          isOpen={isCreatingGroupAssistant}
          onOpenChange={setIsGroupCreatingAssistant}
          contentType={contentType}
        />
      )}

      {contentType === "group-assistants" && (
        <>
          <h3 className="text-lg font-semibold">{t("Select Group")}</h3>
          <div className="flex">
            <select
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:none flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={e => {
                const selectedassistantId = e.target.value;
                // Convert empty string to null for "All Groups" option
                const groupId =
                  selectedassistantId === "" ? null : selectedassistantId;
                setSelectedAssistantGroupId(selectedassistantId);
                onAssistantGroupSelect(groupId);
              }}
              value={selectedAssistantGroupId || ""}
            >
              {/* Add "All Groups" option to show all assistants */}
              <option value="">{t("All Groups")}</option>
              {azureassistantsGroups.map(group => (
                <option key={group.group_id} value={group.group_id}>
                  {group.name || group.group_id}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {isCreatingTool && (
        <CreateTool isOpen={isCreatingTool} onOpenChange={setIsCreatingTool} />
      )}

      {isCreatingModel && (
        <CreateModel
          isOpen={isCreatingModel}
          onOpenChange={setIsCreatingModel}
        />
      )}
    </div>
  );
};
export default SidebarCreateButtons;
