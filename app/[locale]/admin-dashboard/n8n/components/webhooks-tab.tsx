"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const logger = createClientLogger({ component: "WebhooksTab" });
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import CreateWebhookDialog from "./create-webhook-dialog";
import EditWebhookDialog from "./edit-webhook-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  created_at: string;
  updated_at: string;
};

export default function WebhooksTab() {
  const { t } = useTranslation();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [filteredWebhooks, setFilteredWebhooks] = useState<Webhook[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null);

  const fetchWebhooks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/n8n/webhooks");
      const data = await response.json();

      if (data.success) {
        setWebhooks(data.data);
        setFilteredWebhooks(data.data);
      } else {
        toast.error(t("Failed to fetch webhooks"));
      }
    } catch (error) {
      logger.error("Error fetching webhooks", { error: String(error) });
      toast.error(t("Error fetching webhooks"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  useEffect(() => {
    const filtered = webhooks.filter(
      webhook =>
        webhook.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        webhook.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    setFilteredWebhooks(filtered);
  }, [searchQuery, webhooks]);

  const handleDelete = async (webhook: Webhook) => {
    try {
      const response = await fetch(`/api/n8n/webhooks/${webhook.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("Webhook deleted successfully"));
        fetchWebhooks();
      } else {
        toast.error(data.error || t("Failed to delete webhook"));
      }
    } catch (error) {
      logger.error("Error deleting webhook", { error: String(error) });
      toast.error(t("Error deleting webhook"));
    } finally {
      setDeleteWebhook(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t("Loading webhooks...")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("Webhooks")}</CardTitle>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t("Create Webhook")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-2.5 size-4" />
              <Input
                placeholder={t("Search webhooks...")}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {filteredWebhooks.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              {searchQuery
                ? t("No webhooks match your search")
                : t(
                    "No webhooks created yet. Create your first webhook to get started.",
                  )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{"Name"}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead>{t("Method")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Mode")}</TableHead>
                  <TableHead>{t("Created")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWebhooks.map(webhook => (
                  <TableRow key={webhook.id}>
                    <TableCell className="font-medium">
                      {webhook.name}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {webhook.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{webhook.http_method}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          webhook.status === "active" ? "default" : "secondary"
                        }
                      >
                        {webhook.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {webhook.thinking_steps_enabled ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="gap-1 border-primary text-primary cursor-help"
                              >
                                <IconInfoCircle className="size-3" />
                                Direct Mode
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-sm">
                                {t(
                                  "This webhook uses Direct Mode with thinking steps. " +
                                    "Only one Direct Mode webhook can be assigned per assistant.",
                                )}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(webhook.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditWebhook(webhook)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteWebhook(webhook)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateWebhookDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={fetchWebhooks}
      />

      {editWebhook && (
        <EditWebhookDialog
          webhook={editWebhook}
          open={!!editWebhook}
          onOpenChange={open => !open && setEditWebhook(null)}
          onSuccess={fetchWebhooks}
        />
      )}

      <AlertDialog
        open={!!deleteWebhook}
        onOpenChange={open => !open && setDeleteWebhook(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Webhook")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Are you sure you want to delete")} &quot;{deleteWebhook?.name}
              &quot;?{" "}
              {t(
                "This action cannot be undone and will also remove all assignments and logs associated with this webhook.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWebhook && handleDelete(deleteWebhook)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
