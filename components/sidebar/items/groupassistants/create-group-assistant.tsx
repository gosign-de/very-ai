"use client";

import { createClientLogger } from "@/lib/logger/client";
import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item";
import { ChatSettingsForm } from "@/components/ui/chat-settings-form";
import ImagePicker from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { ASSISTANT_DESCRIPTION_MAX, ASSISTANT_NAME_MAX } from "@/db/limits";
import { getWorkspaceContextLength } from "@/lib/chat-setting-limits";
import { Tables, TablesInsert } from "@/supabase/types";
import { LLMID } from "@/types";
import { FC, useContext, useEffect, useState, useMemo } from "react";
import { AssistantRetrievalSelect } from "../assistants/assistant-retrieval-select";
// import { AssistantToolSelect } from "../assistants/assistant-tool-select"
import { useSession } from "next-auth/react";
import { getUserSelectedGroups } from "@/db/azure_groups";
import { useTranslation } from "react-i18next";
import { subscribeToGroupUpdates } from "@/lib/events/group-events";

const logger = createClientLogger({ component: "CreateGroupAssistant" });

interface CreateGroupAssistant {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  contentType: string;
}

export const CreateGroupAssistant: FC<CreateGroupAssistant> = ({
  isOpen,
  onOpenChange,
  contentType,
}) => {
  const { t } = useTranslation();

  const { profile, selectedWorkspace } = useContext(ChatbotUIContext);
  const { data: session } = useSession();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");

  // Use Azure session display name for group assistants
  useEffect(() => {
    // Prioritize givenName + surname for proper display name, fall back to displayName
    const azureDisplayName =
      session?.user?.givenName && session?.user?.surname
        ? `${session.user.givenName} ${session.user.surname}`
        : session?.user?.displayName || session?.user?.name || "";

    const profileDisplayName = profile?.display_name;
    const profileUsername = profile?.username;

    // Priority: Azure proper name (givenName + surname) > profile display_name > profile username > Azure displayName
    const authorName =
      azureDisplayName || profileDisplayName || profileUsername || "";

    setAuthor(authorName);
  }, [profile, session]);
  const [assistantChatSettings, setAssistantChatSettings] = useState({
    model: selectedWorkspace?.default_model,
    imageModel: selectedWorkspace?.default_image_model,
    prompt: selectedWorkspace?.default_prompt,
    temperature: selectedWorkspace?.default_temperature,
    contextLength: getWorkspaceContextLength(
      selectedWorkspace?.default_context_length,
      (selectedWorkspace?.default_model || "gpt-4o") as LLMID,
    ),
    includeProfileContext: false,
    includeWorkspaceInstructions: false,
    embeddingsProvider: selectedWorkspace?.embeddings_provider,
  });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState("");
  const [selectedAssistantRetrievalItems, setSelectedAssistantRetrievalItems] =
    useState<(Tables<"files"> | Tables<"collections">)[]>([]);
  const [selectedAssistantToolItems, _setSelectedAssistantToolItems] = useState<
    Tables<"tools">[]
  >([]);
  const [selectedAssistantRole, setSelectedAssistantRole] =
    useState<string>("default");
  // const [postUsername, setPostUsername] = useState<string>(null);
  // const [postPassword, setPostPassword] = useState<string>(null);
  // const [postWebsiteUrl, setPostWebsiteUrl] = useState<string>(null);
  const groups = useMemo(
    () => session?.user?.groups || ([] as { id: string }[]),
    [session?.user?.groups],
  );
  const [azureGroups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>("");

  const [_loadingGroups, setLoadingGroups] = useState(true);
  const [_errorGroups, setErrorGroups] = useState<string | null>(null);

  const groupIds = groups.map(group => group.id);
  const _addToolTab = groupIds.some(
    id =>
      id === "9ec44798-cf1c-49fc-8949-af148876a7ca" ||
      id === "88f1d300-add8-43ab-b94c-cb38506c6dce",
  );

  const fetchGroups = async () => {
    try {
      const selectedGroups = await getUserSelectedGroups();
      setGroups(selectedGroups);
      setLoadingGroups(false);
    } catch (error) {
      logger.error("Error fetching Azure groups", { error: String(error) });
      setErrorGroups("Failed to fetch groups");
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (contentType === "group-assistants") {
      fetchGroups();
    }
  }, [contentType]);

  useEffect(() => {
    if (contentType === "group-assistants") {
      // Subscribe to group updates
      const unsubscribe = subscribeToGroupUpdates(() => {
        fetchGroups();
      });

      return () => {
        unsubscribe();
      };
    }
  }, [contentType]);

  useEffect(() => {
    setAssistantChatSettings(prevSettings => {
      const previousPrompt = prevSettings.prompt || "";
      const previousPromptParts = previousPrompt.split(". ");

      previousPromptParts[0] = name ? `You are ${name}` : "";

      return {
        ...prevSettings,
        prompt: previousPromptParts.join(". "),
      };
    });
  }, [name]);

  const handleRetrievalItemSelect = (
    item: Tables<"files"> | Tables<"collections">,
  ) => {
    setSelectedAssistantRetrievalItems(prevState => {
      const isItemAlreadySelected = prevState.find(
        selectedItem => selectedItem.id === item.id,
      );

      if (isItemAlreadySelected) {
        return prevState.filter(selectedItem => selectedItem.id !== item.id);
      } else {
        return [...prevState, item];
      }
    });
  };

  const _handleRoleSelect = (role: string) => {
    setSelectedAssistantRole(role);
  };

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  return (
    <SidebarCreateItem
      contentType="group-assistants"
      // modal={true}
      createState={
        {
          image: selectedImage,
          user_id: profile.user_id,
          group_id: selectedGroupId,
          name: name.trim(),
          description: description.trim(),
          author: author.trim(),
          image_path: "",
          sharing: "private",
          include_profile_context: assistantChatSettings.includeProfileContext,
          include_workspace_instructions:
            assistantChatSettings.includeWorkspaceInstructions,
          context_length: assistantChatSettings.contextLength,
          model: assistantChatSettings.model,
          image_model: assistantChatSettings.imageModel,
          prompt: assistantChatSettings.prompt,
          role: selectedAssistantRole,
          // username: postUsername,
          // password: postPassword,
          // website_url: postWebsiteUrl,
          temperature: assistantChatSettings.temperature,
          embeddings_provider: assistantChatSettings.embeddingsProvider,
          files: selectedAssistantRetrievalItems.filter(item =>
            item.hasOwnProperty("type"),
          ) as Tables<"files">[],
          collections: selectedAssistantRetrievalItems.filter(
            item => !item.hasOwnProperty("type"),
          ) as Tables<"collections">[],
          tools: selectedAssistantToolItems,
        } as TablesInsert<"assistants">
      }
      isOpen={isOpen}
      isTyping={false}
      renderInputs={() => (
        <>
          <div className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label>
                  {t("Name")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder={t("Assistant name...")}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={ASSISTANT_NAME_MAX}
                />
              </div>

              {/* Role field hidden - roles are added via API/MCP integration webhooks
              <div>
                <Label>{t("Role")}</Label>
                <AssistantRoleSelect
                  selectedAssistantRole={selectedAssistantRole}
                  onAssistantRoleSelect={handleRoleSelect}
                />
              </div>
              */}

              {/* {selectedAssistantRole === "post" && (
                <>
                  <div>
                    <Label>{t("Username")}</Label>
                    <Input
                      placeholder={t("Post username...")}
                      value={postUsername}
                      onChange={e => setPostUsername(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>{t("Password")}</Label>
                    <Input
                      type="password"
                      placeholder={t("Post password...")}
                      value={postPassword}
                      onChange={e => setPostPassword(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>{t("Website URL")}</Label>
                    <Input
                      placeholder={t("Website URL...")}
                      value={postWebsiteUrl}
                      onChange={e => setPostWebsiteUrl(e.target.value)}
                    />
                  </div>
                </>
              )} */}
            </div>

            <div className="space-y-1 pt-2">
              <Label>{t("Description")}</Label>

              <Input
                placeholder={t("Assistant description...")}
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={ASSISTANT_DESCRIPTION_MAX}
              />
            </div>

            <div className="space-y-1 pt-2">
              <Label className="flex space-x-1">
                <div>{t("Image")}</div>

                <div className="text-xs">(optional)</div>
              </Label>

              <ImagePicker
                src={imageLink}
                image={selectedImage}
                onSrcChange={setImageLink}
                onImageChange={setSelectedImage}
                width={100}
                height={100}
              />
            </div>

            <ChatSettingsForm
              chatSettings={assistantChatSettings as any}
              onChangeChatSettings={setAssistantChatSettings}
              useAdvancedDropdown={true}
            />

            <div className="space-y-1 pt-2">
              <Label>{t("Files & Collections")}</Label>

              <AssistantRetrievalSelect
                selectedAssistantRetrievalItems={
                  selectedAssistantRetrievalItems
                }
                onAssistantRetrievalItemsSelect={handleRetrievalItemSelect}
              />
            </div>

            <h3 className="text-lg font-semibold">{t("Select Group")}</h3>
            <div className="flex">
              <select
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:none flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={e => {
                  const selectedId = e.target.value;
                  setSelectedGroupId(selectedId);
                }}
                value={selectedGroupId}
              >
                <option value="" disabled>
                  {t("Select Group")}
                </option>
                {azureGroups.map(group => (
                  <option key={group.group_id} value={group.group_id}>
                    {group.name || group.group_id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
      onOpenChange={onOpenChange}
    />
  );
};
