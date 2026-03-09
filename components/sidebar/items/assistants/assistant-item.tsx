"use client";

import { createClientLogger } from "@/lib/logger/client";
import { ChatSettingsForm } from "@/components/ui/chat-settings-form";
import ImagePicker from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { ASSISTANT_DESCRIPTION_MAX, ASSISTANT_NAME_MAX } from "@/db/limits";
import { Tables } from "@/supabase/types";
import { IconRobotFace } from "@tabler/icons-react";

import Image from "next/image";
import { FC, useContext, useEffect, useState } from "react";
import { SidebarItem } from "../all/sidebar-display-item";
import { AssistantRetrievalSelect } from "./assistant-retrieval-select";
import { getAllGroupsAssistantsImages } from "@/db/group_assistants";
import { useTranslation } from "react-i18next";
import { useSession } from "next-auth/react";
import { getUserSelectedGroups } from "@/db/azure_groups";
import { AssistantToolSelect } from "./assistant-tool-select";
import { subscribeToGroupUpdates } from "@/lib/events/group-events";
import { supabase } from "@/lib/supabase/browser-client";

const logger = createClientLogger({ component: "AssistantItem" });

interface AssistantItemProps {
  assistant: Tables<"assistants">;
  contentType: string;
}

export const AssistantItem: FC<AssistantItemProps> = ({
  assistant,
  contentType,
}) => {
  const { t } = useTranslation();
  const { selectedWorkspace, assistantImages, profile } =
    useContext(ChatbotUIContext);

  const [name, setName] = useState(assistant.name);
  const [isTyping, _setIsTyping] = useState(false);
  const [description, setDescription] = useState(assistant.description);
  const [author, _setAuthor] = useState(assistant.author || "");

  const [selectedAssistantRole, setSelectedAssistantRole] = useState<string>(
    assistant.role,
  );

  const [assistantChatSettings, setAssistantChatSettings] = useState({
    model: assistant.model,
    imageModel: assistant.image_model,
    prompt: assistant.prompt,
    // role: assistant.role,
    temperature: assistant.temperature,
    contextLength: assistant.context_length,
    includeProfileContext: assistant.include_profile_context,
    includeWorkspaceInstructions: assistant.include_workspace_instructions,
  });

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState("");
  const [azureGroups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>("");

  const [_loadingGroups, setLoadingGroups] = useState(true);
  const [_errorGroups, setErrorGroups] = useState<string | null>(null);
  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);
  const [groupImages, setGroupImages] = useState([]);

  const addToolTab = groupIds.some(
    id =>
      id === "9ec44798-cf1c-49fc-8949-af148876a7ca" ||
      id === "88f1d300-add8-43ab-b94c-cb38506c6dce",
  );

  // Check if assistant has a thinking-enabled webhook (direct mode)
  const [hasThinkingEnabledWebhook, setHasThinkingEnabledWebhook] =
    useState(false);
  const [webhookCheckComplete, setWebhookCheckComplete] = useState(false);

  useEffect(() => {
    const checkThinkingEnabledWebhook = async () => {
      if (!assistant?.id) {
        setWebhookCheckComplete(true);
        return;
      }

      try {
        const { data: assignments, error } = await supabase
          .from("n8n_webhook_assignments")
          .select(
            `
            webhook_id,
            n8n_webhooks (
              thinking_steps_enabled,
              status
            )
          `,
          )
          .eq("entity_type", "assistant")
          .eq("entity_id", assistant.id);

        if (!error && assignments) {
          const hasThinkingEnabled = assignments.some(
            (a: any) =>
              a.n8n_webhooks?.thinking_steps_enabled === true &&
              a.n8n_webhooks?.status === "active",
          );
          setHasThinkingEnabledWebhook(hasThinkingEnabled);
        } else {
          setHasThinkingEnabledWebhook(false);
        }
      } catch (error) {
        logger.error("Error checking webhooks", { error: String(error) });
        setHasThinkingEnabledWebhook(false);
      } finally {
        setWebhookCheckComplete(true);
      }
    };

    checkThinkingEnabledWebhook();
  }, [assistant?.id, assistant?.name]);

  const _handleRoleSelect = (role: string) => {
    setSelectedAssistantRole(role);
  };

  useEffect(() => {
    const fetchGroupImages = async () => {
      if (assistant?.image_path) {
        const imagePaths = [assistant.image_path];
        const groupImagesData = await getAllGroupsAssistantsImages(imagePaths);

        setGroupImages(groupImagesData);
      }
    };

    fetchGroupImages();
  }, [assistant]);

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
    if (contentType === "assistants") {
      fetchGroups();
    }
  }, [contentType]);

  useEffect(() => {
    if (contentType === "assistants") {
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
    const assistantImage =
      assistantImages.find(image => image.path === assistant.image_path)
        ?.base64 || "";
    setImageLink(assistantImage);
  }, [assistant, assistantImages]);

  const handleFileSelect = (
    file: Tables<"files">,
    setSelectedAssistantFiles: React.Dispatch<
      React.SetStateAction<Tables<"files">[]>
    >,
  ) => {
    setSelectedAssistantFiles(prevState => {
      const isFileAlreadySelected = prevState.find(
        selectedFile => selectedFile.id === file.id,
      );

      if (isFileAlreadySelected) {
        return prevState.filter(selectedFile => selectedFile.id !== file.id);
      } else {
        return [...prevState, file];
      }
    });
  };

  const handleCollectionSelect = (
    collection: Tables<"collections">,
    setSelectedAssistantCollections: React.Dispatch<
      React.SetStateAction<Tables<"collections">[]>
    >,
  ) => {
    setSelectedAssistantCollections(prevState => {
      const isCollectionAlreadySelected = prevState.find(
        selectedCollection => selectedCollection.id === collection.id,
      );

      if (isCollectionAlreadySelected) {
        return prevState.filter(
          selectedCollection => selectedCollection.id !== collection.id,
        );
      } else {
        return [...prevState, collection];
      }
    });
  };

  const handleToolSelect = (
    tool: Tables<"tools">,
    setSelectedAssistantTools: React.Dispatch<
      React.SetStateAction<Tables<"tools">[]>
    >,
  ) => {
    setSelectedAssistantTools(prevState => {
      const isToolAlreadySelected = prevState.find(
        selectedTool => selectedTool.id === tool.id,
      );

      if (isToolAlreadySelected) {
        return prevState.filter(selectedTool => selectedTool.id !== tool.id);
      } else {
        return [...prevState, tool];
      }
    });
  };

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  // console.log(object);

  return (
    <SidebarItem
      item={assistant}
      contentType="assistants"
      isTyping={isTyping}
      icon={
        assistant?.group_id && groupImages.length > 0 ? (
          <div style={{ display: "flex", gap: "5px" }}>
            {groupImages.map((image, index) => (
              <Image
                key={index}
                style={{ width: "30px", height: "30px" }}
                className="rounded"
                src={image}
                alt={`${assistant.name} - ${index}`}
                width={40}
                height={30}
              />
            ))}
          </div>
        ) : imageLink ? (
          <Image
            style={{ width: "30px", height: "30px" }}
            className="rounded"
            src={imageLink}
            alt={assistant.name}
            width={40}
            height={30}
          />
        ) : (
          <IconRobotFace
            className="bg-primary text-secondary border-primary rounded border-DEFAULT p-1"
            width={30}
            height={30}
          />
        )
      }
      updateState={{
        image: selectedImage,
        user_id: assistant.user_id,
        name,
        description,
        author,
        include_profile_context: assistantChatSettings.includeProfileContext,
        include_workspace_instructions:
          assistantChatSettings.includeWorkspaceInstructions,
        context_length: assistantChatSettings.contextLength,
        model: assistantChatSettings.model,
        image_model: assistantChatSettings.imageModel,
        image_path: assistant.image_path,
        prompt: assistantChatSettings.prompt,
        temperature: assistantChatSettings.temperature,
        role: selectedAssistantRole,
        group_id: selectedGroupId || assistant.group_id,
      }}
      renderInputs={(renderState: {
        startingAssistantFiles: Tables<"files">[];
        setStartingAssistantFiles: React.Dispatch<
          React.SetStateAction<Tables<"files">[]>
        >;
        selectedAssistantFiles: Tables<"files">[];
        setSelectedAssistantFiles: React.Dispatch<
          React.SetStateAction<Tables<"files">[]>
        >;
        startingAssistantCollections: Tables<"collections">[];
        setStartingAssistantCollections: React.Dispatch<
          React.SetStateAction<Tables<"collections">[]>
        >;
        selectedAssistantCollections: Tables<"collections">[];
        setSelectedAssistantCollections: React.Dispatch<
          React.SetStateAction<Tables<"collections">[]>
        >;
        startingAssistantTools: Tables<"tools">[];
        setStartingAssistantTools: React.Dispatch<
          React.SetStateAction<Tables<"tools">[]>
        >;
        selectedAssistantTools: Tables<"tools">[];
        setSelectedAssistantTools: React.Dispatch<
          React.SetStateAction<Tables<"tools">[]>
        >;
      }) => (
        <>
          <div className="space-y-1">
            <Label>{t("Name")}</Label>

            <Input
              placeholder={t("Assistant name...")}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={ASSISTANT_NAME_MAX}
            />
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

          {/* Role field hidden - roles are added via API/MCP integration webhooks
          <div className="space-y-1 pt-2">
            <Label>{t("Role")}</Label>
            <AssistantRoleSelect
              selectedAssistantRole={selectedAssistantRole}
              onAssistantRoleSelect={handleRoleSelect}
            />
          </div>
          */}

          <div className="space-y-1">
            <Label>{t("Image")}</Label>

            {assistant?.group_id && groupImages.length > 0 ? (
              <div style={{ display: "flex", gap: "5px" }}>
                {groupImages.map((image, index) => (
                  <ImagePicker
                    key={index}
                    src={image}
                    image={selectedImage}
                    onSrcChange={() => setSelectedImage(image)}
                    onImageChange={setSelectedImage}
                    width={100}
                    height={100}
                  />
                ))}
              </div>
            ) : (
              <ImagePicker
                src={imageLink}
                image={selectedImage}
                onSrcChange={setImageLink}
                onImageChange={setSelectedImage}
                width={100}
                height={100}
              />
            )}
          </div>

          {/* Hide model settings when assistant has thinking-enabled webhook (direct mode) */}
          {/* Wait for webhook check to complete, then show only if no thinking-enabled webhook */}
          {webhookCheckComplete && !hasThinkingEnabledWebhook && (
            <ChatSettingsForm
              chatSettings={assistantChatSettings as any}
              onChangeChatSettings={setAssistantChatSettings}
              useAdvancedDropdown={true}
            />
          )}

          {/* Hide Files & Collections when assistant has thinking-enabled webhook (direct mode) */}
          {webhookCheckComplete && !hasThinkingEnabledWebhook && (
            <div className="space-y-1 pt-2">
              <Label>{t("Files & Collections")}</Label>

              <AssistantRetrievalSelect
                selectedAssistantRetrievalItems={
                  [
                    ...renderState.selectedAssistantFiles,
                    ...renderState.selectedAssistantCollections,
                  ].length === 0
                    ? [
                        ...renderState.startingAssistantFiles,
                        ...renderState.startingAssistantCollections,
                      ]
                    : [
                        ...renderState.startingAssistantFiles.filter(
                          startingFile =>
                            ![
                              ...renderState.selectedAssistantFiles,
                              ...renderState.selectedAssistantCollections,
                            ].some(
                              selectedFile =>
                                selectedFile.id === startingFile.id,
                            ),
                        ),
                        ...renderState.selectedAssistantFiles.filter(
                          selectedFile =>
                            !renderState.startingAssistantFiles.some(
                              startingFile =>
                                startingFile.id === selectedFile.id,
                            ),
                        ),
                        ...renderState.startingAssistantCollections.filter(
                          startingCollection =>
                            ![
                              ...renderState.selectedAssistantFiles,
                              ...renderState.selectedAssistantCollections,
                            ].some(
                              selectedCollection =>
                                selectedCollection.id === startingCollection.id,
                            ),
                        ),
                        ...renderState.selectedAssistantCollections.filter(
                          selectedCollection =>
                            !renderState.startingAssistantCollections.some(
                              startingCollection =>
                                startingCollection.id === selectedCollection.id,
                            ),
                        ),
                      ]
                }
                onAssistantRetrievalItemsSelect={item =>
                  "type" in item
                    ? handleFileSelect(
                        item,
                        renderState.setSelectedAssistantFiles,
                      )
                    : handleCollectionSelect(
                        item,
                        renderState.setSelectedAssistantCollections,
                      )
                }
              />
            </div>
          )}

          {addToolTab && (
            <div className="space-y-1">
              <Label>{t("Tools")}</Label>

              <AssistantToolSelect
                selectedAssistantTools={
                  renderState.selectedAssistantTools.length === 0
                    ? renderState.startingAssistantTools
                    : [
                        ...renderState.startingAssistantTools.filter(
                          startingTool =>
                            !renderState.selectedAssistantTools.some(
                              selectedTool =>
                                selectedTool.id === startingTool.id,
                            ),
                        ),
                        ...renderState.selectedAssistantTools.filter(
                          selectedTool =>
                            !renderState.startingAssistantTools.some(
                              startingTool =>
                                startingTool.id === selectedTool.id,
                            ),
                        ),
                      ]
                }
                onAssistantToolsSelect={tool =>
                  handleToolSelect(tool, renderState.setSelectedAssistantTools)
                }
              />
            </div>
          )}
          <div className="space-y-1 pt-2">
            <h3 className="text-lg font-semibold">{t("Share With Group")}</h3>
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
    />
  );
};
