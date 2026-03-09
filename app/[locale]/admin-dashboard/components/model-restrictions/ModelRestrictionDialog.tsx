"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect, useMemo } from "react";

const logger = createClientLogger({ component: "ModelRestrictionDialog" });
import { useTranslation } from "react-i18next";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  IconCheck,
  IconSearch,
  IconX,
  IconAlertCircle,
} from "@tabler/icons-react";
import { ModelIcon } from "@/components/models/model-icon";
import { toast } from "sonner";

interface ModelRestriction {
  modelId: string;
  isAllowed: boolean;
}

interface GroupWithStats {
  id: string;
  display_name: string;
  description?: string;
}

interface ModelRestrictionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  group: GroupWithStats;
  onSave: (groupId: string, restrictions: ModelRestriction[]) => Promise<void>;
}

export function ModelRestrictionDialog({
  isOpen,
  onClose,
  group,
  onSave,
}: ModelRestrictionDialogProps) {
  const { t } = useTranslation();

  // Use active models from LLM_LIST (automatically filters deprecated models)
  const ACTIVE_MODELS = useMemo(() => LLM_LIST, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCurrentRestrictions();
    }
  }, [isOpen, group.id]);

  const loadCurrentRestrictions = async () => {
    try {
      setIsLoading(true);

      // Add cache-busting to force fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(
        `/api/admin/model-restrictions?groupId=${group.id}&_t=${timestamp}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load restrictions");
      }

      const { data } = await response.json();

      // Filter to only include active models
      const activeModelIds = new Set(ACTIVE_MODELS.map(m => m.modelId));

      // Database now only contains RESTRICTED models (is_allowed: false)
      // If there are restrictions, set selected models to all EXCEPT restricted ones
      // If no restrictions, all active models are selected by default
      if (data && data.length > 0) {
        const restrictedModels = new Set(
          data
            .filter((r: any) => !r.is_allowed && activeModelIds.has(r.model_id))
            .map((r: any) => r.model_id),
        );

        // Select all models EXCEPT the restricted ones
        const allowedModels = ACTIVE_MODELS.filter(
          m => !restrictedModels.has(m.modelId),
        ).map(m => m.modelId);

        setSelectedModels(new Set(allowedModels));
      } else {
        // Default: all active models selected (no restrictions)
        setSelectedModels(new Set(ACTIVE_MODELS.map(m => m.modelId)));
      }
    } catch (error) {
      logger.error("Error loading restrictions", { error: String(error) });
      toast.error(t("Failed to load current restrictions"));
      // Default to all active models on error
      setSelectedModels(new Set(ACTIVE_MODELS.map(m => m.modelId)));
    } finally {
      setIsLoading(false);
    }
  };

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof ACTIVE_MODELS> = {};

    ACTIVE_MODELS.forEach(model => {
      const provider = model.provider;
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(model);
    });

    return groups;
  }, [ACTIVE_MODELS]);

  // Filter models based on search
  const filteredGroupedModels = useMemo(() => {
    if (!searchQuery) return groupedModels;

    const filtered: Record<string, typeof ACTIVE_MODELS> = {};
    const query = searchQuery.toLowerCase();

    Object.entries(groupedModels).forEach(([provider, models]) => {
      const matchingModels = models.filter(
        model =>
          model.modelName.toLowerCase().includes(query) ||
          model.modelId.toLowerCase().includes(query) ||
          provider.toLowerCase().includes(query),
      );

      if (matchingModels.length > 0) {
        filtered[provider] = matchingModels;
      }
    });

    return filtered;
  }, [groupedModels, searchQuery]);

  const handleToggleModel = (modelId: string) => {
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId);
    } else {
      newSelected.add(modelId);
    }
    setSelectedModels(newSelected);
  };

  const handleToggleProvider = (provider: string) => {
    const providerModels = groupedModels[provider] || [];
    const providerModelIds = providerModels.map(m => m.modelId);

    const allSelected = providerModelIds.every(id => selectedModels.has(id));

    const newSelected = new Set(selectedModels);
    if (allSelected) {
      // Deselect all
      providerModelIds.forEach(id => newSelected.delete(id));
    } else {
      // Select all
      providerModelIds.forEach(id => newSelected.add(id));
    }

    setSelectedModels(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedModels(new Set(ACTIVE_MODELS.map(m => m.modelId)));
  };

  const handleDeselectAll = () => {
    setSelectedModels(new Set());
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // ONLY save RESTRICTED models (unchecked ones) to eliminate redundancy
      // Allowed models don't need entries - absence means allowed
      // Empty database = unrestricted (all models allowed)
      const restrictions: ModelRestriction[] = ACTIVE_MODELS.filter(
        model => !selectedModels.has(model.modelId),
      ) // Only unchecked/restricted models
        .map(model => ({
          modelId: model.modelId,
          isAllowed: false, // Only save restricted models
        }));

      // Save restrictions (empty array if no restrictions = unrestricted group)
      await onSave(group.id, restrictions);
    } catch (error) {
      logger.error("Error saving", { error: String(error) });
      toast.error(t("Failed to save restrictions"));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = selectedModels.size;
  const totalCount = ACTIVE_MODELS.length;
  const restrictedCount = totalCount - selectedCount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("Configure Models for")} &quot;{group.display_name}&quot;
          </DialogTitle>
          <DialogDescription>
            {t(
              "Select which AI models should be available for this group. By default, all models are allowed.",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground text-sm">{t("Loading")}...</p>
          </div>
        ) : (
          <>
            {/* Stats & Search */}
            <div className="shrink-0 space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="gap-1">
                  <IconCheck className="size-3" />
                  {selectedCount} {t("Allowed")}
                </Badge>
                <Badge variant="destructive" className="gap-1">
                  <IconX className="size-3" />
                  {restrictedCount} {t("Restricted")}
                </Badge>
                <div className="ml-auto flex gap-2">
                  <Button onClick={handleSelectAll} size="sm" variant="outline">
                    {t("Select All")}
                  </Button>
                  <Button
                    onClick={handleDeselectAll}
                    size="sm"
                    variant="outline"
                  >
                    {t("Deselect All")}
                  </Button>
                </div>
              </div>

              <div className="relative">
                <IconSearch className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  placeholder={t("Search models...")}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Models List */}
            <div
              className="overflow-auto rounded-md border"
              style={{ maxHeight: "400px" }}
            >
              <div className="space-y-4 p-4">
                {Object.entries(filteredGroupedModels).map(
                  ([provider, models]) => {
                    const providerModelIds = models.map(m => m.modelId);
                    const allSelected = providerModelIds.every(id =>
                      selectedModels.has(id),
                    );
                    const someSelected = providerModelIds.some(id =>
                      selectedModels.has(id),
                    );

                    return (
                      <div key={provider} className="space-y-2">
                        {/* Provider Header */}
                        <div className="bg-muted flex items-center gap-3 rounded-lg p-3">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() =>
                              handleToggleProvider(provider)
                            }
                            className="data-[state=indeterminate]:bg-primary"
                            {...(someSelected &&
                              !allSelected && {
                                "data-state": "indeterminate",
                              })}
                          />
                          <ModelIcon
                            provider={provider as any}
                            width={24}
                            height={24}
                          />
                          <span className="text-sm font-semibold capitalize">
                            {provider}
                          </span>
                          <Badge variant="outline" className="ml-auto">
                            {models.length} {t("models")}
                          </Badge>
                        </div>

                        {/* Provider Models */}
                        <div className="ml-4 space-y-1">
                          {models.map(model => (
                            <div
                              key={model.modelId}
                              className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2"
                            >
                              <Checkbox
                                checked={selectedModels.has(model.modelId)}
                                onCheckedChange={() =>
                                  handleToggleModel(model.modelId)
                                }
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {model.modelName}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {model.modelId}
                                </p>
                              </div>
                              {model.imageInput && (
                                <Badge variant="secondary" className="text-xs">
                                  {t("Image")}
                                </Badge>
                              )}
                              {model.pricing && (
                                <span className="text-muted-foreground text-xs">
                                  ${model.pricing.inputCost}/
                                  {model.pricing.unit}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  },
                )}

                {Object.keys(filteredGroupedModels).length === 0 && (
                  <div className="text-muted-foreground py-8 text-center">
                    <IconAlertCircle className="mx-auto size-8" />
                    <p className="mt-2 text-sm">{t("No models found")}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="mt-4 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? t("Saving...") : t("Save Changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
