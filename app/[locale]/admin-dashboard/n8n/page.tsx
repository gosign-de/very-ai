"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WebhooksTab from "./components/webhooks-tab";
import AssignmentsTab from "./components/assignments-tab";
import StatisticsTab from "./components/statistics-tab";
import SettingsTab from "./components/settings-tab";
import LogsTab from "./components/logs-tab";
import { useTranslation } from "react-i18next";

export default function N8NIntegration() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("n8n Integration")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("Connect your AI models with n8n workflows via webhooks")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="webhooks" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="webhooks">{t("Webhooks")}</TabsTrigger>
          <TabsTrigger value="assignments">{t("Assignments")}</TabsTrigger>
          <TabsTrigger value="logs">{t("Logs")}</TabsTrigger>
          <TabsTrigger value="statistics">{t("Statistics")}</TabsTrigger>
          <TabsTrigger value="settings">{t("Settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-4">
          <WebhooksTab />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <AssignmentsTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab />
        </TabsContent>

        <TabsContent value="statistics" className="space-y-4">
          <StatisticsTab />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
