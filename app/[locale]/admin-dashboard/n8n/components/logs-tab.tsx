"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const logger = createClientLogger({ component: "LogsTab" });

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type WebhookLog = {
  id: string;
  webhook_id: string;
  user_id: string;
  model_id: string | null;
  chat_id: string | null;
  status: "success" | "error" | "timeout" | "cancelled" | "pending" | "running";
  error_message: string | null;
  execution_time_ms: number | null;
  http_status_code: number | null;
  request_data: any;
  response_data: any;
  created_at: string;
  n8n_webhooks: {
    id: string;
    name: string;
  } | null;
};

type Pagination = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export default function LogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, _setStatusFilter] = useState<string>("all");
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchLogs = async (offset = 0) => {
    try {
      setIsLoading(true);
      // Only fetch error logs (cancelled, error, timeout) - not success
      const response = await fetch(
        `/api/n8n/logs?limit=${pagination.limit}&offset=${offset}&status=errors_only`,
      );
      const data = await response.json();

      if (data.success) {
        setLogs(data.data);
        setPagination(data.pagination);
      } else {
        toast.error(t("Failed to fetch logs"));
      }
    } catch (error) {
      logger.error("Error fetching logs", { error: String(error) });
      toast.error(t("Error fetching logs"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(0);
  }, [statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="mr-1 size-3" />
            {t("Success")}
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 size-3" />
            {t("Error")}
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="destructive" className="bg-orange-600">
            <AlertCircle className="mr-1 size-3" />
            {t("Cancelled")}
          </Badge>
        );
      case "timeout":
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 size-3" />
            {t("Timeout")}
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline">
            <RefreshCw className="mr-1 size-3 animate-spin" />
            {t("Running")}
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <Clock className="mr-1 size-3" />
            {t("Pending")}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const openLogDetail = (log: WebhookLog) => {
    setSelectedLog(log);
    setIsDetailOpen(true);
  };

  if (isLoading && logs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t("Loading logs...")}
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
            <CardTitle>{t("Execution Logs")}</CardTitle>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(0)}
              disabled={isLoading}
            >
              <RefreshCw
                className={`size-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              {t("No logs found")}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Webhook")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Duration")}</TableHead>
                    <TableHead>{t("Time")}</TableHead>
                    <TableHead>{t("Error")}</TableHead>
                    <TableHead className="text-right">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {log.n8n_webhooks?.name || t("Unknown Webhook")}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>
                        {formatDuration(log.execution_time_ms)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {log.error_message || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openLogDetail(log)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {t("Showing")} {pagination.offset + 1}-
                  {Math.min(pagination.offset + logs.length, pagination.total)}{" "}
                  {t("of")} {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.offset === 0}
                    onClick={() =>
                      fetchLogs(pagination.offset - pagination.limit)
                    }
                  >
                    {t("Previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={() =>
                      fetchLogs(pagination.offset + pagination.limit)
                    }
                  >
                    {t("Next")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("Log Details")}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
              <div className="space-y-6">
                {/* Basic Info Grid */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("Webhook")}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedLog.n8n_webhooks?.name || t("Unknown")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("Status")}
                    </p>
                    <div className="mt-1">
                      {getStatusBadge(selectedLog.status)}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("Execution Time")}
                    </p>
                    <p className="mt-1 font-medium">
                      {formatDuration(selectedLog.execution_time_ms)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("HTTP Status")}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedLog.http_status_code || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("Created At")}
                    </p>
                    <p className="mt-1 font-medium">
                      {formatDate(selectedLog.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      {t("Log ID")}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {selectedLog.id}
                    </p>
                  </div>
                </div>

                {/* Error Message */}
                {selectedLog.error_message && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                      {t("Error Message")}
                    </p>
                    <div className="border-destructive/30 bg-destructive/10 rounded-lg border p-4">
                      <p className="text-destructive break-words text-sm">
                        {selectedLog.error_message}
                      </p>
                    </div>
                  </div>
                )}

                {/* Response Data (Deep Error Log) */}
                {selectedLog.response_data && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                      {t("Detailed Node Log")}
                    </p>
                    <div className="bg-muted max-h-[400px] overflow-auto rounded-lg border p-4">
                      <pre className="whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(selectedLog.response_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
