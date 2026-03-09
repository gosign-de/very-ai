"use client";

import { ChatbotUIContext } from "@/context/context";
import { LLM, LLMID, ModelProvider } from "@/types";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { FC, useContext, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { ModelIcon } from "./model-icon";
import { ModelOption } from "./model-option";
import { useTranslation } from "react-i18next";
import { getModelInfo } from "@/lib/models/model-availability";
import { getAdminSettings } from "@/lib/config/admin-settings";

interface ModelSelectProps {
  selectedModelId: string;
  onSelectModel: (modelId: LLMID) => void;
  imageModels: boolean;
}

export const ModelSelect: FC<ModelSelectProps> = ({
  selectedModelId,
  onSelectModel,
  imageModels,
}) => {
  const { t } = useTranslation();

  const {
    profile,
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
    selectedWorkspace,
  } = useContext(ChatbotUIContext);

  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"hosted" | "local">("hosted");
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // FIX: hacky
    }
  }, [isOpen]);

  // Track when models have been initially loaded
  useEffect(() => {
    if (
      !hasInitialLoad &&
      (availableHostedModels.length > 0 ||
        availableLocalModels.length > 0 ||
        availableOpenRouterModels.length > 0 ||
        models.length > 0)
    ) {
      setHasInitialLoad(true);
    }
  }, [
    availableHostedModels.length,
    availableLocalModels.length,
    availableOpenRouterModels.length,
    models.length,
    hasInitialLoad,
  ]);

  const handleSelectModel = (modelId: LLMID) => {
    onSelectModel(modelId);
    setIsOpen(false);
  };

  let allModels = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name,
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false,
    })),
    ...availableHostedModels,
    ...availableLocalModels,
    ...availableOpenRouterModels,
  ];

  if (imageModels) {
    allModels = allModels.filter(model => model.imageInput);
  } else {
    allModels = allModels.filter(model => !model.imageInput); // Text-based models
  }

  const groupedModels = allModels.reduce<Record<string, LLM[]>>(
    (groups, model) => {
      const key = model.provider;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(model);
      return groups;
    },
    {},
  );

  // First try to find the model in available models
  let selectedModel = allModels.find(
    model => model.modelId === selectedModelId,
  );

  // If not found, check deprecated models for display purposes ONLY after initial load
  if (!selectedModel && selectedModelId && hasInitialLoad) {
    const deprecatedModel = getModelInfo(selectedModelId as LLMID);
    // Only use deprecated model if it matches the imageModels filter
    if (deprecatedModel) {
      const matchesFilter = imageModels
        ? deprecatedModel.imageInput
        : !deprecatedModel.imageInput;
      if (matchesFilter) {
        selectedModel = deprecatedModel;
      }
    }
  }

  // Auto-select default model when needed
  useEffect(() => {
    const selectDefaultModel = async () => {
      // Only auto-select when:
      // 1. No model is selected, OR
      // 2. The selected model is not in the available models list (restricted or deprecated)
      const isSelectedModelAvailable = allModels.some(
        model => model.modelId === selectedModelId,
      );

      if (
        allModels.length > 0 &&
        (!selectedModelId || !isSelectedModelAvailable)
      ) {
        let defaultModelToSelect: LLMID | null = null;

        if (imageModels) {
          // For image models: Workspace default > Admin default > First available
          if (selectedWorkspace?.default_image_model) {
            const workspaceImageModel = allModels.find(
              model => model.modelId === selectedWorkspace.default_image_model,
            );
            if (workspaceImageModel) {
              defaultModelToSelect = workspaceImageModel.modelId;
            }
          }

          if (!defaultModelToSelect) {
            const adminSettings = await getAdminSettings();
            const adminImageModel = allModels.find(
              model => model.modelId === adminSettings.default_image_model,
            );
            if (adminImageModel) {
              defaultModelToSelect = adminImageModel.modelId;
            }
          }
        } else {
          // For text models: Workspace default > Admin default > First available
          if (selectedWorkspace?.default_model) {
            const workspaceTextModel = allModels.find(
              model => model.modelId === selectedWorkspace.default_model,
            );
            if (workspaceTextModel) {
              defaultModelToSelect = workspaceTextModel.modelId;
            }
          }

          if (!defaultModelToSelect) {
            const adminSettings = await getAdminSettings();
            const adminTextModel = allModels.find(
              model => model.modelId === adminSettings.default_model,
            );
            if (adminTextModel) {
              defaultModelToSelect = adminTextModel.modelId;
            }
          }
        }

        // Fallback to first available model if no defaults found
        if (!defaultModelToSelect && allModels.length > 0) {
          defaultModelToSelect = allModels[0].modelId;
        }

        if (defaultModelToSelect) {
          onSelectModel(defaultModelToSelect);
        }
      }
    };

    selectDefaultModel();
  }, [
    selectedModelId,
    imageModels,
    allModels.length,
    selectedWorkspace?.default_model,
    selectedWorkspace?.default_image_model,
  ]);

  if (!profile) return null;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={isOpen => {
        setIsOpen(isOpen);
        setSearch("");
      }}
    >
      <DropdownMenuTrigger
        className="bg-background w-full justify-start border-2 px-3 py-5"
        asChild
        disabled={allModels.length === 0 && hasInitialLoad}
      >
        {allModels.length === 0 && hasInitialLoad ? (
          <div className="rounded text-sm font-bold">
            {t("Unlock models by entering API keys in your profile settings.")}
          </div>
        ) : (
          <Button
            ref={triggerRef}
            className="flex items-center justify-between"
            variant="ghost"
          >
            <div className="flex items-center">
              {selectedModel ? (
                <>
                  <ModelIcon
                    provider={selectedModel?.provider}
                    width={26}
                    height={26}
                  />
                  <div className="ml-2 flex items-center">
                    {selectedModel?.modelName}
                    {/* Show if model is deprecated - only after initial load */}
                    {hasInitialLoad &&
                      !allModels.find(m => m.modelId === selectedModelId) && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({t("Deprecated")})
                        </span>
                      )}
                  </div>
                </>
              ) : (
                <div className="flex items-center">
                  {allModels.length === 0 ? "" : t("Select a model")}
                </div>
              )}
            </div>

            <IconChevronDown />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="space-y-2 p-2"
        style={{ width: triggerRef.current?.offsetWidth }}
        align="start"
      >
        <Tabs value={tab} onValueChange={(value: any) => setTab(value)}>
          {availableLocalModels.length > 0 && (
            <TabsList defaultValue="hosted" className="grid grid-cols-2">
              <TabsTrigger value="hosted">{t("Hosted")}</TabsTrigger>
              <TabsTrigger value="local">{t("Local")}</TabsTrigger>
            </TabsList>
          )}
        </Tabs>

        <Input
          ref={inputRef}
          className="w-full"
          placeholder={t("Search models...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-64 overflow-auto">
          {Object.entries(groupedModels).map(([provider, models]) => {
            const filteredModels = models
              .filter(model => {
                if (tab === "hosted") return model.provider !== "ollama";
                if (tab === "local") return model.provider === "ollama";
                if (tab === "openrouter")
                  return model.provider === "openrouter";
              })
              .filter(model =>
                model.modelName.toLowerCase().includes(search.toLowerCase()),
              )
              .sort((a, b) => a.provider.localeCompare(b.provider));

            if (filteredModels.length === 0) return null;

            return (
              <div key={provider}>
                <div className="mb-1 ml-2 text-xs font-bold tracking-wide opacity-50">
                  {provider === "openai" && profile.use_azure_openai
                    ? t("AZURE OPENAI")
                    : provider.toLocaleUpperCase()}
                </div>

                <div className="mb-4">
                  {filteredModels.map(model => {
                    return (
                      <div
                        key={model.modelId}
                        className="flex items-center space-x-1"
                      >
                        {selectedModelId === model.modelId && (
                          <IconCheck className="ml-2" size={32} />
                        )}

                        <ModelOption
                          key={model.modelId}
                          model={model}
                          onSelect={() => handleSelectModel(model.modelId)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
