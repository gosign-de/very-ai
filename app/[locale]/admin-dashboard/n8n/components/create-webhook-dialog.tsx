"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "CreateWebhookDialog" });
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function CreateWebhookDialog({
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
  const [thinkingStepsEnabled, setThinkingStepsEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/n8n/webhooks", {
        method: "POST",
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
          status: "active",
          thinking_steps_enabled: thinkingStepsEnabled,
          timeout_minutes: timeoutMinutes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("Webhook created successfully"));
        resetForm();
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(data.error || t("Failed to create webhook"));
      }
    } catch (error) {
      logger.error("Error creating webhook", { error: String(error) });
      toast.error(t("Error creating webhook"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setWebhookUrl("");
    setHttpMethod("POST");
    setSchema("");
    setCustomHeaders("");
    setThinkingStepsEnabled(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Create New Webhook")}</DialogTitle>
          <DialogDescription>
            {t("Configure a new n8n webhook to connect with your AI models")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="schema">
              {t("OpenAPI Schema")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="schema"
              value={schema}
              onChange={e => setSchema(e.target.value)}
              placeholder={`{
                "openapi": "3.1.0",
                "info": {
                  "title": "API Title",
                  "description": "API Description",
                  "version": "v1.0.0"
                },
                "servers": [{ "url": "https://api.example.com" }],
                "paths": {
                  "/endpoint": {
                    "post": {
                      "description": "Endpoint description",
                      "operationId": "operationName",
                      "requestBody": {
                        "required": true,
                        "content": {
                          "application/json": {
                            "schema": {
                              "type": "object",
                              "properties": {
                                "param": { "type": "string" }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }`}
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
              placeholder='{"Authorization": "Bearer YOUR_TOKEN", "X-API-Key": "your-key"}'
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("Creating...") : t("Create Webhook")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
