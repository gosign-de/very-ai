"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "EditWebhookDialog" });
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { IconInfoCircle } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Webhook = {
  id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  http_method: string;
  schema: any;
  custom_headers: any;
  status: string;
  thinking_steps_enabled?: boolean;
  timeout_minutes?: number;
};

type Props = {
  webhook: Webhook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function EditWebhookDialog({
  webhook,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState("POST");
  const [schema, setSchema] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");
  const [status, setStatus] = useState("active");
  const [thinkingStepsEnabled, setThinkingStepsEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (webhook) {
      setName(webhook.name);
      setDescription(webhook.description || "");
      setWebhookUrl(webhook.webhook_url);
      setHttpMethod(webhook.http_method);
      setSchema(
        typeof webhook.schema === "string"
          ? webhook.schema
          : JSON.stringify(webhook.schema, null, 2),
      );
      setCustomHeaders(
        webhook.custom_headers
          ? typeof webhook.custom_headers === "string"
            ? webhook.custom_headers
            : JSON.stringify(webhook.custom_headers, null, 2)
          : "",
      );
      setStatus(webhook.status);
      setThinkingStepsEnabled(webhook.thinking_steps_enabled ?? false);
      setTimeoutMinutes(webhook.timeout_minutes ?? 15);
    }
  }, [webhook]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !webhookUrl || !schema) {
      toast.error(t("Please fill in all required fields"));
      return;
    }

    // Validate JSON
    try {
      JSON.parse(schema);
    } catch (_error) {
      toast.error(t("Invalid schema JSON format"));
      return;
    }

    if (customHeaders) {
      try {
        JSON.parse(customHeaders);
      } catch (_error) {
        toast.error(t("Invalid custom headers JSON format"));
        return;
      }
    }

    // NEW: Validate thinking_steps_enabled change
    const wasThinkingStepsEnabled = webhook.thinking_steps_enabled ?? false;
    const isEnablingThinkingSteps =
      thinkingStepsEnabled && !wasThinkingStepsEnabled;

    if (isEnablingThinkingSteps) {
      setIsValidating(true);
      try {
        // Check all assistant assignments for this webhook
        const assignmentsResponse = await fetch(
          `/api/n8n/assignments?webhook_id=${webhook.id}`,
        );
        const assignmentsData = await assignmentsResponse.json();

        if (assignmentsData.success && assignmentsData.data) {
          // Filter assistant assignments
          const assistantAssignments = assignmentsData.data.filter(
            (a: any) => a.entity_type === "assistant",
          );

          // Check each assistant for conflicts
          for (const assignment of assistantAssignments) {
            const assistantId = assignment.entity_id;

            // Get all assignments for this assistant
            const allAssignmentsResponse = await fetch(
              `/api/n8n/assignments?entity_type=assistant&entity_id=${assistantId}`,
            );
            const allAssignmentsData = await allAssignmentsResponse.json();

            if (allAssignmentsData.success && allAssignmentsData.data) {
              // Check if assistant has other direct mode webhooks
              const hasOtherDirectModeWebhook = allAssignmentsData.data.some(
                (a: any) =>
                  a.webhook_id !== webhook.id &&
                  a.n8n_webhooks?.thinking_steps_enabled === true,
              );

              if (hasOtherDirectModeWebhook) {
                const conflictingWebhook = allAssignmentsData.data.find(
                  (a: any) =>
                    a.webhook_id !== webhook.id &&
                    a.n8n_webhooks?.thinking_steps_enabled === true,
                );
                toast.error(
                  `Cannot enable Thinking Steps: This webhook is assigned to an ` +
                    `assistant that already has another webhook with Thinking Steps ` +
                    `enabled ("${conflictingWebhook?.n8n_webhooks?.name}"). ` +
                    `Only one direct mode webhook is allowed per assistant.`,
                );
                setIsValidating(false);
                return;
              }
            }
          }
        }
      } catch (error) {
        logger.error("Error validating thinking steps", {
          error: String(error),
        });
        toast.error(t("Error validating thinking steps configuration"));
        setIsValidating(false);
        return;
      } finally {
        setIsValidating(false);
      }
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/n8n/webhooks/${webhook.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description || null,
          webhook_url: webhookUrl,
          http_method: httpMethod,
          schema,
          custom_headers: customHeaders || null,
          status,
          thinking_steps_enabled: thinkingStepsEnabled,
          timeout_minutes: timeoutMinutes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("Webhook updated successfully"));
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(data.error || t("Failed to update webhook"));
      }
    } catch (error) {
      logger.error("Error updating webhook", { error: String(error) });
      toast.error(t("Error updating webhook"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Edit Webhook")}</DialogTitle>
          <DialogDescription>
            {t("Update webhook configuration for")} &quot;{webhook.name}&quot;
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" key={webhook.id}>
          <div className="space-y-2">
            <Label htmlFor="name">
              {t("Name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("e.g., Customer Search API")}
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("Description")}</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t("Brief description of what this webhook does")}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhookUrl">
              {t("Webhook URL")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="webhookUrl"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-instance.com/webhook/your-webhook-id"
              maxLength={2000}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="httpMethod">{t("HTTP Method")}</Label>
            <Select value={httpMethod} onValueChange={setHttpMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{t("Status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder={t("Select status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("Active")}</SelectItem>
                <SelectItem value="inactive">{t("Inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schema">
              {t("OpenAPI Schema")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="schema"
              value={schema}
              onChange={e => setSchema(e.target.value)}
              className="font-mono text-sm"
              rows={15}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customHeaders">{t("Custom Headers (JSON)")}</Label>
            <Textarea
              id="customHeaders"
              value={customHeaders}
              onChange={e => setCustomHeaders(e.target.value)}
              placeholder='{"Authorization": "Bearer YOUR_TOKEN"}'
              className="font-mono text-sm"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="thinkingSteps" className="text-base">
                {t("Enable Thinking Steps")}
              </Label>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <IconInfoCircle className="size-4 cursor-help text-muted-foreground" />
                </HoverCardTrigger>
                <HoverCardContent className="w-[420px] text-sm" side="top">
                  <div className="space-y-3">
                    <p className="font-medium">
                      {t("How to use Thinking Steps in n8n:")}
                    </p>
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        {t("Use the callback URL in your HTTP Request node:")}
                      </p>
                      <code className="block rounded bg-muted p-2 text-xs">
                        {"{{ $('Webhook1').item.json.body._callback_url }}"}
                      </code>
                      <p className="text-muted-foreground mt-2">
                        {t("Add Authorization header:")}
                      </p>
                      <code className="block rounded bg-muted p-2 text-xs">
                        {
                          "Bearer {{ $('Webhook1').item.json.body._callback_secret }}"
                        }
                      </code>
                      <p className="text-muted-foreground mt-2">
                        {t(
                          "For detailed logging, you can include: in respond to webhook node",
                        )}
                      </p>
                      <code className="block rounded bg-muted p-2 text-xs whitespace-pre">
                        {`{
  "executionId": "{{ $execution.id }}",
  "workflowId": "{{ $workflow.id }}",
  "timestamp": "{{ $now }}"
}`}
                      </code>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium">{t("Example Payloads:")}</p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>{t("Step running:")}</p>
                        <code className="block rounded bg-muted p-2">
                          {`{"status": "running", "thinkingcallback": { "value": "Processing data" }}`}
                        </code>
                        <p>{t("Step update:")}</p>
                        <code className="block rounded bg-muted p-2">
                          {`{"thinkingcallback": { "value": "data processed" }}`}
                        </code>
                        <p className="mt-2">{t("Completed:")}</p>
                        <code className="block rounded bg-muted p-2">
                          {`{"status": "completed", "thinkingcallback": { "value": "Processing completed" }}`}
                        </code>
                        <p className="mt-2">{t("Error:")}</p>
                        <code className="block rounded bg-muted p-2">
                          {`{ "status": "error", "error_message": "What went wrong" }`}
                        </code>
                      </div>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Switch
              id="thinkingSteps"
              checked={thinkingStepsEnabled}
              onCheckedChange={setThinkingStepsEnabled}
            />
          </div>

          {thinkingStepsEnabled && (
            <div className="space-y-2">
              <Label htmlFor="timeout">{t("Timeout (minutes)")}</Label>
              <Input
                id="timeout"
                type="number"
                min={1}
                max={120}
                value={timeoutMinutes}
                onChange={e =>
                  setTimeoutMinutes(parseInt(e.target.value) || 15)
                }
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Maximum time to wait for workflow completion (1-120 minutes)",
                )}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || isValidating}>
              {isValidating
                ? t("Validating...")
                : isSubmitting
                  ? t("Updating...")
                  : t("Update Webhook")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
