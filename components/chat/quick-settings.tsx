"use client";

import { ChatbotUIContext } from "@/context/context";
import { getAssistantCollectionsByAssistantId } from "@/db/assistant-collections";
import { getAssistantFilesByAssistantId } from "@/db/assistant-files";
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools";
import { getCollectionFilesByCollectionId } from "@/db/collection-files";
import useHotkey from "@/lib/hooks/use-hotkey";
import { getWorkspaceContextLength } from "@/lib/chat-setting-limits";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import { Tables } from "@/supabase/types";
import { LLMID } from "@/types";
import { IconChevronDown, IconRobotFace } from "@tabler/icons-react";
import Image from "next/image";
import { FC, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModelIcon } from "../models/model-icon";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { QuickSettingOption } from "./quick-setting-option";
import { supabase } from "@/lib/supabase/browser-client";
import { useSession } from "next-auth/react";

interface QuickSettingsProps {}

export const QuickSettings: FC<QuickSettingsProps> = ({}) => {
  const { t } = useTranslation();

  useHotkey("p", () => setIsOpen(prevState => !prevState));
  const [groupAssistantsdata, setGroupAssistantsData] = useState<any[]>([]);
  const {
    presets,
    assistants,
    groupassistants,
    selectedAssistant,
    selectedPreset,
    chatSettings,
    setSelectedPreset,
    setSelectedAssistant,
    setChatSettings,
    assistantImages,
    groupassistantImages,
    setChatFiles,
    setSelectedTools,
    setShowFilesDisplay: _setShowFilesDisplay,
    selectedWorkspace,
  } = useContext(ChatbotUIContext);

  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const _azureGroupsRef = useRef<any[]>([]);
  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // FIX: hacky
    }
  }, [isOpen]);

  const handleSelectQuickSetting = async (
    item: Tables<"presets"> | Tables<"assistants"> | null,
    contentType: "presets" | "assistants" | "remove",
  ) => {
    // console.log({ item, contentType })
    if (contentType === "assistants" && item) {
      setSelectedAssistant(item as Tables<"assistants">);
      setLoading(true);

      // Fetch assistant files, collections, and tools in parallel for better performance
      const [
        assistantFilesResult,
        assistantCollectionsResult,
        assistantToolsResult,
      ] = await Promise.all([
        getAssistantFilesByAssistantId(item.id),
        getAssistantCollectionsByAssistantId(item.id),
        getAssistantToolsByAssistantId(item.id),
      ]);

      const assistantFiles = assistantFilesResult.files;
      const assistantCollections = assistantCollectionsResult.collections;
      const assistantTools = assistantToolsResult.tools;

      // Fetch all collection files in parallel
      const collectionFilesResults = await Promise.all(
        assistantCollections.map(collection =>
          getCollectionFilesByCollectionId(collection.id),
        ),
      );
      const allCollectionFiles = collectionFilesResults.flatMap(
        result => result.files,
      );
      const allFiles = [...assistantFiles, ...allCollectionFiles];

      setSelectedTools(assistantTools);
      setChatFiles(
        allFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          file: null,
        })),
      );
      // if (allFiles.length > 0) setShowFilesDisplay(true)
      setLoading(false);
      setSelectedPreset(null);
    } else if (contentType === "presets" && item) {
      setSelectedPreset(item as Tables<"presets">);
      setSelectedAssistant(null);
      setChatFiles([]);
      setSelectedTools([]);
    } else {
      setSelectedPreset(null);
      setSelectedAssistant(null);
      setChatFiles([]);
      setSelectedTools([]);
      if (selectedWorkspace) {
        setChatSettings({
          model: selectedWorkspace.default_model as LLMID,
          imageModel: selectedWorkspace.default_image_model as LLMID,
          prompt: selectedWorkspace.default_prompt,
          temperature: selectedWorkspace.default_temperature,
          contextLength: getWorkspaceContextLength(
            selectedWorkspace.default_context_length,
            selectedWorkspace.default_model as LLMID,
          ),
          includeProfileContext: selectedWorkspace.include_profile_context,
          includeWorkspaceInstructions:
            selectedWorkspace.include_workspace_instructions,
          embeddingsProvider: selectedWorkspace.embeddings_provider as
            | "openai"
            | "local",
          is_temp_chat: chatSettings.is_temp_chat || false,
        });
      }
      return;
    }

    setChatSettings({
      model: item.model as LLMID,
      imageModel: item.image_model as LLMID,
      prompt: item.prompt,
      role: "role" in item ? item.role : undefined,
      temperature: item.temperature,
      contextLength: item.context_length,
      includeProfileContext: item.include_profile_context,
      includeWorkspaceInstructions: item.include_workspace_instructions,
      embeddingsProvider: item.embeddings_provider as "openai" | "local",
      is_temp_chat: chatSettings.is_temp_chat || false,
    });
  };

  const checkIfModified = () => {
    if (!chatSettings) return false;

    if (selectedPreset) {
      return (
        selectedPreset.include_profile_context !==
          chatSettings?.includeProfileContext ||
        selectedPreset.include_workspace_instructions !==
          chatSettings.includeWorkspaceInstructions ||
        selectedPreset.context_length !== chatSettings.contextLength ||
        selectedPreset.model !== chatSettings.model ||
        selectedPreset.prompt !== chatSettings.prompt ||
        selectedPreset.temperature !== chatSettings.temperature
      );
    } else if (selectedAssistant) {
      return (
        selectedAssistant.include_profile_context !==
          chatSettings.includeProfileContext ||
        selectedAssistant.include_workspace_instructions !==
          chatSettings.includeWorkspaceInstructions ||
        selectedAssistant.context_length !== chatSettings.contextLength ||
        selectedAssistant.model !== chatSettings.model ||
        selectedAssistant.prompt !== chatSettings.prompt ||
        selectedAssistant.temperature !== chatSettings.temperature
      );
    }

    return false;
  };

  const _isModified = checkIfModified();
  useEffect(() => {
    const channel = supabase
      .channel("group-assistants-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "assistants" },
        payload => {
          const newAssistant = payload.new;
          if (groupIds.includes(newAssistant.group_id)) {
            setGroupAssistantsData((prev = []) => {
              const updatedState = [...prev, newAssistant];
              return updatedState;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "assistants" },
        payload => {
          const updatedAssistant = payload.new;

          // Update group assistants data if it's a group assistant
          if (groupIds.includes(updatedAssistant.group_id)) {
            setGroupAssistantsData((prev = []) => {
              const existingAssistant = prev.find(
                assistant => assistant.id === updatedAssistant.id,
              );
              if (existingAssistant) {
                return prev.map(assistant =>
                  assistant.id === updatedAssistant.id
                    ? {
                        ...existingAssistant,
                        ...updatedAssistant,
                      }
                    : assistant,
                );
              } else {
                return [...prev, updatedAssistant];
              }
            });
          }

          // Update selectedAssistant and chatSettings if this is the currently selected assistant
          if (
            selectedAssistant &&
            selectedAssistant.id === updatedAssistant.id
          ) {
            setSelectedAssistant(updatedAssistant as Tables<"assistants">);

            // Also update chat settings to reflect the new assistant settings
            if (chatSettings) {
              setChatSettings({
                ...chatSettings,
                model: updatedAssistant.model as LLMID,
                imageModel: updatedAssistant.image_model as LLMID,
                prompt: updatedAssistant.prompt,
                temperature: updatedAssistant.temperature,
                contextLength: updatedAssistant.context_length,
                includeProfileContext: updatedAssistant.include_profile_context,
                includeWorkspaceInstructions:
                  updatedAssistant.include_workspace_instructions,
                embeddingsProvider: updatedAssistant.embeddings_provider as
                  | "openai"
                  | "local",
              });
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "assistants" },
        payload => {
          const deletedAssistantId = payload.old.id;
          const deletedAssistantGroupId = payload.old.group_id;
          if (groupIds.includes(deletedAssistantGroupId)) {
            setGroupAssistantsData((prev = []) => {
              const updatedState = prev.filter(
                assistant => assistant.id !== deletedAssistantId,
              );
              return updatedState;
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const items = [
      ...presets.map(preset => ({ ...preset, contentType: "presets" })),
      ...[...assistants, ...groupassistants, ...groupAssistantsdata]
        .filter(assistant => assistant != null)
        .reduce((acc, current) => {
          if (!acc.find(item => item.id === current.id)) {
            acc.push({ ...current, contentType: "assistants" });
          } else {
            const existingItem = acc.find(item => item.id === current.id);
            if (existingItem) {
              existingItem.name = current.name;
            }
          }
          return acc;
        }, []),
    ];
    setItems(items);
  }, [assistants, groupassistants, presets, groupAssistantsdata]);

  const selectedAssistantImage = selectedPreset
    ? ""
    : assistantImages.find(
        image => image.path === selectedAssistant?.image_path,
      )?.base64 || "";

  const groupSelectedAssistantImage = selectedPreset
    ? ""
    : groupassistantImages.find(
        image => image.path === selectedAssistant?.image_path,
      )?.base64 || "";

  const modelDetails = LLM_LIST.find(
    model => model.modelId === selectedPreset?.model,
  );

  const selectedImage = selectedPreset
    ? ""
    : selectedAssistantImage || groupSelectedAssistantImage;

  useEffect(() => {
    const channel = supabase
      .channel("group-assistants-deletes")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "assistants" },
        payload => {
          const deletedAssistantId = payload.old.id;
          setItems(prevItems =>
            prevItems.filter(item => item.id !== deletedAssistantId),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={isOpen => {
        setIsOpen(isOpen);
        setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild className="max-w-[400px]" disabled={loading}>
        <Button variant="ghost" className="flex space-x-3 text-lg">
          {selectedPreset && (
            <ModelIcon
              provider={modelDetails?.provider || "custom"}
              width={32}
              height={32}
            />
          )}

          {selectedAssistant &&
            (selectedImage ? (
              <Image
                className="rounded"
                src={selectedImage}
                alt="Assistant"
                width={28}
                height={28}
              />
            ) : (
              <IconRobotFace
                className="bg-primary text-secondary border-primary rounded border-DEFAULT p-1"
                size={28}
              />
            ))}

          {loading ? (
            <div className="animate-pulse">{t("Loading assistant...")}</div>
          ) : (
            <>
              <div className="overflow-hidden text-ellipsis">
                {/* {isModified &&
                  (selectedPreset || selectedAssistant) &&
                  "Modified "} */}
                {selectedPreset?.name ||
                  selectedAssistant?.name ||
                  t("Quick Settings")}
              </div>
              <IconChevronDown className="ml-1" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="min-w-[300px] max-w-[500px] space-y-4"
        align="start"
      >
        {presets.length === 0 && items.length === 0 ? (
          <div className="p-8 text-center">{t("No items found.")}</div>
        ) : (
          <>
            <Input
              ref={inputRef}
              className="w-full"
              placeholder={t("Search...")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
            />

            <div className="max-h-64 overflow-auto">
              {!!(selectedPreset || selectedAssistant) && (
                <QuickSettingOption
                  contentType={selectedPreset ? "presets" : "assistants"}
                  isSelected={true}
                  item={
                    selectedPreset ||
                    (selectedAssistant as
                      | Tables<"presets">
                      | Tables<"assistants">)
                  }
                  onSelect={() => {
                    handleSelectQuickSetting(null, "remove");
                  }}
                  image={selectedImage}
                />
              )}

              {items
                .filter(
                  item =>
                    item.name.toLowerCase().includes(search.toLowerCase()) &&
                    item.id !== selectedPreset?.id &&
                    item.id !== selectedAssistant?.id,
                )
                .map(({ contentType, ...item }) => (
                  <QuickSettingOption
                    key={item.id}
                    contentType={contentType as "presets" | "assistants"}
                    isSelected={false}
                    item={item}
                    onSelect={() =>
                      handleSelectQuickSetting(
                        item,
                        contentType as "presets" | "assistants",
                      )
                    }
                    image={
                      contentType === "assistants"
                        ? assistantImages.find(
                            image =>
                              image.path ===
                              (item as Tables<"assistants">).image_path,
                          )?.base64 ||
                          groupassistantImages.find(
                            image =>
                              image.path ===
                              (item as Tables<"assistants">).image_path,
                          )?.base64 ||
                          ""
                        : ""
                    }
                  />
                ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
