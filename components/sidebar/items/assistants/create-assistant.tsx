"use client";

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
import { FC, useContext, useEffect, useState } from "react";
import { AssistantRetrievalSelect } from "./assistant-retrieval-select";
import { AssistantRoleSelect } from "./assistant-role-select";
import { useTranslation } from "react-i18next";
import { useSession } from "next-auth/react";

interface CreateAssistantProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const CreateAssistant: FC<CreateAssistantProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { t } = useTranslation();

  const { profile, selectedWorkspace } = useContext(ChatbotUIContext);

  const [name, setName] = useState("");
  const [isTyping, _setIsTyping] = useState(false);
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [nameError, setNameError] = useState("");
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

  // State for the selected role and additional fields
  const [selectedAssistantRole, setSelectedAssistantRole] =
    useState<string>("default");

  // Handler function for selecting a role
  const handleRoleSelect = (role: string) => {
    setSelectedAssistantRole(role);
  };

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState("");
  const [selectedAssistantRetrievalItems, setSelectedAssistantRetrievalItems] =
    useState<(Tables<"files"> | Tables<"collections">)[]>([]);
  const [selectedAssistantToolItems, _setSelectedAssistantToolItems] = useState<
    Tables<"tools">[]
  >([]);

  // Signature assistant specific fields
  const [signaturePersonName, setSignaturePersonName] = useState("");
  const [signatureCompanyName, setSignatureCompanyName] = useState("");
  const [signatureReferenceImage, setSignatureReferenceImage] =
    useState<File | null>(null);
  const [signatureFieldsError, setSignatureFieldsError] = useState("");

  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);
  const _addToolTab = groupIds.some(
    id =>
      id === "9ec44798-cf1c-49fc-8949-af148876a7ca" ||
      id === "88f1d300-add8-43ab-b94c-cb38506c6dce",
  );

  // Use Azure session display name for assistants
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

  // Clear error when name is typed
  useEffect(() => {
    if (name.trim()) {
      setNameError("");
    }
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

  // Validation function
  const validateForm = () => {
    if (!name.trim()) {
      setNameError(t("Name must be filled"));
      return false;
    }

    // Validate signature-assistant specific fields
    if (selectedAssistantRole === "signature-assistant") {
      if (
        !signaturePersonName.trim() ||
        !signatureCompanyName.trim() ||
        !signatureReferenceImage
      ) {
        setSignatureFieldsError(
          t(
            "Person Name, Company Name, and Reference Image are required for Signature Assistant",
          ),
        );
        return false;
      }
      setSignatureFieldsError("");
    }

    return true;
  };

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  return (
    <SidebarCreateItem
      contentType="assistants"
      createState={
        {
          image: selectedImage,
          user_id: profile.user_id,
          name,
          description,
          author,
          include_profile_context: assistantChatSettings.includeProfileContext,
          include_workspace_instructions:
            assistantChatSettings.includeWorkspaceInstructions,
          context_length: assistantChatSettings.contextLength,
          model: assistantChatSettings.model,
          image_model: assistantChatSettings.imageModel,
          image_path: "",
          prompt:
            selectedAssistantRole === "signature-assistant"
              ? `${assistantChatSettings.prompt}\n\nPerson Name: ${signaturePersonName}\nCompany: ${signatureCompanyName}`
              : assistantChatSettings.prompt,
          group_id: null,
          temperature: assistantChatSettings.temperature,
          role: selectedAssistantRole,
          embeddings_provider: assistantChatSettings.embeddingsProvider,
          files: selectedAssistantRetrievalItems.filter(item =>
            item.hasOwnProperty("type"),
          ) as Tables<"files">[],
          collections: selectedAssistantRetrievalItems.filter(
            item => !item.hasOwnProperty("type"),
          ) as Tables<"collections">[],
          tools: selectedAssistantToolItems,
          // Custom properties for signature-assistant (handled separately in sidebar-create-item)
          signatureReferenceImage:
            selectedAssistantRole === "signature-assistant"
              ? signatureReferenceImage
              : null,
          signaturePersonName:
            selectedAssistantRole === "signature-assistant"
              ? signaturePersonName
              : null,
          signatureCompanyName:
            selectedAssistantRole === "signature-assistant"
              ? signatureCompanyName
              : null,
        } as TablesInsert<"assistants"> & {
          signatureReferenceImage?: File | null;
          signaturePersonName?: string | null;
          signatureCompanyName?: string | null;
        }
      }
      isOpen={isOpen}
      isTyping={isTyping}
      onValidate={validateForm}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>
              {t("Name")} <span className="text-red-500">*</span>
            </Label>

            <Input
              placeholder={t("Assistant name...")}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={ASSISTANT_NAME_MAX}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
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
            <Label>{t("Role")}</Label>
            <AssistantRoleSelect
              selectedAssistantRole={selectedAssistantRole}
              onAssistantRoleSelect={handleRoleSelect}
            />
          </div>

          {/* Signature Assistant specific fields */}
          {selectedAssistantRole === "signature-assistant" && (
            <div className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 mt-2">
              <div className="text-sm font-medium text-zinc-200">
                {t("Signature Assistant Configuration")}
              </div>

              <div className="space-y-1">
                <Label>
                  {t("Person Name")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder={t("e.g. Jane Smith")}
                  value={signaturePersonName}
                  onChange={e => setSignaturePersonName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-1">
                <Label>
                  {t("Company Name")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder={t("e.g. Gosign GmbH")}
                  value={signatureCompanyName}
                  onChange={e => setSignatureCompanyName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-1">
                <Label>
                  {t("Reference Signature Image")}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) setSignatureReferenceImage(file);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
                  />
                </div>
                {signatureReferenceImage && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ✓ {signatureReferenceImage.name}
                  </div>
                )}
              </div>

              {signatureFieldsError && (
                <p className="text-sm text-red-500">{signatureFieldsError}</p>
              )}
            </div>
          )}
          <div className="space-y-1 pt-2">
            <Label className="flex space-x-1">
              <div>{t("Image")}</div>

              <div className="text-xs">({t("optional")})</div>
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
              selectedAssistantRetrievalItems={selectedAssistantRetrievalItems}
              onAssistantRetrievalItemsSelect={handleRetrievalItemSelect}
            />
          </div>
        </>
      )}
      onOpenChange={onOpenChange}
    />
  );
};
