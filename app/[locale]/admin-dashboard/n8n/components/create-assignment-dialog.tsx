"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "CreateAssignmentDialog" });
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type Webhook = {
  id: string;
  name: string;
  status: string;
  thinking_steps_enabled?: boolean;
};

type Model = {
  id: string;
  name: string;
  provider?: string;
};

type Assistant = {
  id: string;
  name: string;
  model: string;
};

export default function CreateAssignmentDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState("");
  const [entityType, setEntityType] = useState<"model" | "assistant">("model");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch webhooks
      const webhooksRes = await fetch("/api/n8n/webhooks");
      const webhooksData = await webhooksRes.json();

      // Fetch entities (models and assistants)
      const entitiesRes = await fetch("/api/n8n/entities");
      const entitiesData = await entitiesRes.json();

      if (webhooksData.success) {
        setWebhooks(
          webhooksData.data.filter((w: Webhook) => w.status === "active"),
        );
      }

      if (entitiesData.success) {
        setModels(entitiesData.data.models);
        setAssistants(entitiesData.data.assistants);
      }
    } catch (error) {
      logger.error("Error fetching data", { error: String(error) });
      toast.error(t("Error loading data"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWebhook || selectedEntities.length === 0) {
      toast.error(t("Please select a webhook and at least one entity"));
      return;
    }

    // Check if webhook has thinking_steps_enabled
    const webhook = webhooks.find(w => w.id === selectedWebhook);
    const isDirectModeWebhook = webhook?.thinking_steps_enabled;

    // If assigning to assistants and webhook has direct mode, validate
    if (isDirectModeWebhook && entityType === "assistant") {
      try {
        // Check each selected assistant for existing direct mode webhooks
        for (const assistantId of selectedEntities) {
          const response = await fetch(
            `/api/n8n/assignments?entity_type=assistant&entity_id=${assistantId}`,
          );
          const data = await response.json();

          if (data.success && data.data) {
            // Check if any existing assignment has thinking_steps_enabled
            const hasDirectModeWebhook = data.data.some(
              (assignment: any) =>
                assignment.n8n_webhooks?.thinking_steps_enabled === true,
            );

            if (hasDirectModeWebhook) {
              const assistant = assistants.find(a => a.id === assistantId);
              const existingWebhook = data.data.find(
                (a: any) => a.n8n_webhooks?.thinking_steps_enabled,
              );
              toast.error(
                `Cannot assign: "${assistant?.name}" already has a webhook with ` +
                  `Thinking Steps enabled ("${existingWebhook?.n8n_webhooks?.name}"). ` +
                  `Only one webhook with Thinking Steps is allowed per assistant.`,
              );
              return;
            }
          }
        }
      } catch (error) {
        logger.error("Error checking existing assignments", {
          error: String(error),
        });
        toast.error(t("Error validating assignment"));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Create multiple assignments in parallel
      const promises = selectedEntities.map(entityId =>
        fetch("/api/n8n/assignments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook_id: selectedWebhook,
            entity_type: entityType,
            entity_id: entityId,
          }),
        }).then(res => res.json()),
      );

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        toast.success(
          `${successCount} ${t("assignment")}${successCount > 1 ? "s" : ""} ${t("created successfully")}${failureCount > 0 ? ` (${failureCount} ${t("failed")})` : ""}`,
        );
        resetForm();
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(t("Failed to create assignments"));
      }
    } catch (error) {
      logger.error("Error creating assignments", { error: String(error) });
      toast.error(t("Error creating assignments"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedWebhook("");
    setEntityType("model");
    setSelectedEntities([]);
  };

  const handleEntityToggle = (entityId: string) => {
    setSelectedEntities(prev =>
      prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId],
    );
  };

  const handleSelectAll = () => {
    const entities = entityType === "model" ? models : assistants;
    if (selectedEntities.length === entities.length) {
      setSelectedEntities([]);
    } else {
      setSelectedEntities(entities.map(e => e.id));
    }
  };

  const entities = entityType === "model" ? models : assistants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Create New Assignment")}</DialogTitle>
          <DialogDescription>
            {t(
              "Assign a webhook to a model or assistant to enable automatic tool calling",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground py-8 text-center">
            {t("Loading...")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook">{t("Webhook")}</Label>
              <Select
                value={selectedWebhook}
                onValueChange={setSelectedWebhook}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Select a webhook")} />
                </SelectTrigger>
                <SelectContent>
                  {webhooks.length === 0 ? (
                    <div className="text-muted-foreground p-2 text-sm">
                      {t("No active webhooks available")}
                    </div>
                  ) : (
                    webhooks.map(webhook => (
                      <SelectItem key={webhook.id} value={webhook.id}>
                        {webhook.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entityType">{t("Entity Type")}</Label>
              <Select
                value={entityType}
                onValueChange={value => {
                  setEntityType(value as "model" | "assistant");
                  setSelectedEntities([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="model">{t("Models")}</SelectItem>
                  <SelectItem value="assistant">{t("Assistants")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {t("Select")}{" "}
                  {entityType === "model" ? t("Models") : t("Assistants")}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({selectedEntities.length} {t("selected")})
                  </span>
                </Label>
                {entities.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedEntities.length === entities.length
                      ? t("Deselect All")
                      : t("Select All")}
                  </Button>
                )}
              </div>

              {entities.length === 0 ? (
                <div className="text-muted-foreground rounded-md border p-4 text-center text-sm">
                  {t("No")}{" "}
                  {entityType === "model" ? t("models") : t("assistants")}{" "}
                  {t("available")}
                </div>
              ) : (
                <ScrollArea className="h-[250px] rounded-md border">
                  <div className="space-y-3 p-4">
                    {entityType === "model"
                      ? // Group models by provider
                        (() => {
                          const groupedModels = (entities as Model[]).reduce(
                            (acc, model) => {
                              const provider = model.provider || t("Other");
                              if (!acc[provider]) acc[provider] = [];
                              acc[provider].push(model);
                              return acc;
                            },
                            {} as Record<string, Model[]>,
                          );

                          return Object.entries(groupedModels).map(
                            ([provider, providerModels]) => (
                              <div key={provider} className="space-y-2">
                                <div className="text-muted-foreground text-xs font-semibold uppercase">
                                  {provider}
                                </div>
                                {providerModels.map(model => (
                                  <div
                                    key={model.id}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={model.id}
                                      checked={selectedEntities.includes(
                                        model.id,
                                      )}
                                      onCheckedChange={() =>
                                        handleEntityToggle(model.id)
                                      }
                                    />
                                    <label
                                      htmlFor={model.id}
                                      className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {model.name}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            ),
                          );
                        })()
                      : // Assistants list
                        entities.map(entity => (
                          <div
                            key={entity.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={entity.id}
                              checked={selectedEntities.includes(entity.id)}
                              onCheckedChange={() =>
                                handleEntityToggle(entity.id)
                              }
                            />
                            <label
                              htmlFor={entity.id}
                              className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {entity.name}
                            </label>
                          </div>
                        ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || webhooks.length === 0}
              >
                {isSubmitting ? t("Creating...") : t("Create Assignment")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
