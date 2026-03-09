"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const logger = createClientLogger({ component: "StatisticsTab" });
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Statistics = {
  overall: {
    total_webhooks: number;
    active_webhooks: number;
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    success_rate: number;
    avg_execution_time_ms: number;
  };
  by_model: Array<{
    model_id: string;
    webhook_calls: number;
    success_rate: number;
  }>;
};

export default function StatisticsTab() {
  const { t } = useTranslation();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState("30");

  const fetchStatistics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/n8n/statistics?days=${days}`);
      const data = await response.json();

      if (data.success) {
        setStatistics(data.data);
      } else {
        toast.error(t("Failed to fetch statistics"));
      }
    } catch (error) {
      logger.error("Error fetching statistics", { error: String(error) });
      toast.error(t("Error fetching statistics"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [days]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t("Loading statistics...")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!statistics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t("No statistics available")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { overall, by_model } = statistics;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("Webhook Statistics")}</CardTitle>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("Last 7 days")}</SelectItem>
                <SelectItem value="30">{t("Last 30 days")}</SelectItem>
                <SelectItem value="90">{t("Last 90 days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Active Webhooks")}
            </CardTitle>
            <Activity className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overall.active_webhooks}</div>
            <p className="text-muted-foreground text-xs">
              {t("of")} {overall.total_webhooks} {t("total")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Total Calls")}
            </CardTitle>
            <TrendingUp className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall.total_calls.toLocaleString()}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("in the last")} {days} {t("days")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Success Rate")}
            </CardTitle>
            <CheckCircle2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall.success_rate.toFixed(1)}%
            </div>
            <p className="text-muted-foreground text-xs">
              {overall.successful_calls} {t("successful")},{" "}
              {overall.failed_calls} {t("failed")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Avg. Response Time")}
            </CardTitle>
            <Clock className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overall.avg_execution_time_ms.toFixed(0)}ms
            </div>
            <p className="text-muted-foreground text-xs">
              {t("average execution")}
            </p>
          </CardContent>
        </Card>
      </div>

      {by_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Usage by Model")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Model")}</TableHead>
                  <TableHead className="text-right">
                    {t("Webhook Calls")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("Success Rate")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {by_model.map(model => (
                  <TableRow key={model.model_id}>
                    <TableCell className="font-medium">
                      {model.model_id}
                    </TableCell>
                    <TableCell className="text-right">
                      {model.webhook_calls.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          model.success_rate >= 80
                            ? "default"
                            : model.success_rate >= 50
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {model.success_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {by_model.length === 0 && overall.total_calls === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              {t("No webhook calls recorded in the selected time period")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
