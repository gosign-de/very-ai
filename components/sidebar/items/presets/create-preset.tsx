"use client";

import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item";
import { ChatSettingsForm } from "@/components/ui/chat-settings-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { PRESET_NAME_MAX } from "@/db/limits";
import { getWorkspaceContextLength } from "@/lib/chat-setting-limits";
import { TablesInsert } from "@/supabase/types";
import { LLMID } from "@/types";
import { FC, useContext, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface CreatePresetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const CreatePreset: FC<CreatePresetProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { t } = useTranslation();

  const { profile, selectedWorkspace } = useContext(ChatbotUIContext);

  const [name, setName] = useState("");
  const [isTyping, _setIsTyping] = useState(false);
  const [description, _setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const [presetChatSettings, setPresetChatSettings] = useState({
    model: selectedWorkspace?.default_model,
    imageModel: selectedWorkspace?.default_image_model,
    prompt: selectedWorkspace?.default_prompt,
    temperature: selectedWorkspace?.default_temperature,
    contextLength: getWorkspaceContextLength(
      selectedWorkspace?.default_context_length,
      (selectedWorkspace?.default_model || "gpt-4o") as LLMID,
    ),
    includeProfileContext: selectedWorkspace?.include_profile_context,
    includeWorkspaceInstructions:
      selectedWorkspace?.include_workspace_instructions,
    embeddingsProvider: selectedWorkspace?.embeddings_provider,
  });

  useEffect(() => {
    if (name.trim()) {
      setNameError("");
    }
  }, [name]);

  const validateForm = () => {
    if (!name.trim()) {
      setNameError("Name must be filled");
      return false;
    }
    return true;
  };

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  return (
    <SidebarCreateItem
      contentType="presets"
      isOpen={isOpen}
      isTyping={isTyping}
      onOpenChange={onOpenChange}
      onValidate={validateForm}
      createState={
        {
          user_id: profile.user_id,
          name,
          description,
          include_profile_context: presetChatSettings.includeProfileContext,
          include_workspace_instructions:
            presetChatSettings.includeWorkspaceInstructions,
          context_length: presetChatSettings.contextLength,
          model: presetChatSettings.model,
          image_model: presetChatSettings.imageModel,
          prompt: presetChatSettings.prompt,
          temperature: presetChatSettings.temperature,
          embeddings_provider: presetChatSettings.embeddingsProvider,
        } as TablesInsert<"presets">
      }
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>
              {t("Name")} <span className="text-red-500">*</span>
            </Label>

            <Input
              placeholder={t("Preset name...")}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={PRESET_NAME_MAX}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
          </div>

          <ChatSettingsForm
            chatSettings={presetChatSettings as any}
            onChangeChatSettings={setPresetChatSettings}
            useAdvancedDropdown={true}
          />
        </>
      )}
    />
  );
};
