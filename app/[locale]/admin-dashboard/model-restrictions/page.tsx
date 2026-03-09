"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

const logger = createClientLogger({ component: "ModelRestrictionsPage" });
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconAdjustments,
  IconCheck,
  IconLock,
  IconLockOpen,
  IconRefresh,
} from "@tabler/icons-react";
import { ModelRestrictionDialog } from "../components/model-restrictions/ModelRestrictionDialog";
import { useTranslation } from "react-i18next";

interface GroupWithStats {
  id: string;
  display_name: string;
  description?: string;
  hasRestrictions: boolean;
  restrictionCount: number;
  allowedModels: number;
  restrictedModels: number;
}

interface ModelRestriction {
  modelId: string;
  isAllowed: boolean;
}

export default function ModelRestrictionsPage() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<GroupWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithStats | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      // Add cache-busting timestamp to force fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(
        `/api/admin/model-restrictions/groups?_t=${timestamp}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch groups");
      }

      const { data } = await response.json();
      setGroups(data || []);
      setLastUpdated(new Date());
    } catch (error) {
      logger.error("Error loading groups", { error: String(error) });
      if (!silent) {
        toast.error(t("Failed to load groups"));
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleEditGroup = (group: GroupWithStats) => {
    setSelectedGroup(group);
    setIsDialogOpen(true);
  };

  const handleResetGroup = async (groupId: string) => {
    try {
      const response = await fetch(
        `/api/admin/model-restrictions?groupId=${groupId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to reset restrictions");
      }

      toast.success(t("Group reset to default successfully"));

      // Force immediate refresh to show updated counts
      await loadGroups();
    } catch (error) {
      logger.error("Error resetting group", { error: String(error) });
      toast.error(t("Failed to reset group"));
    }
  };

  const handleSaveRestrictions = async (
    groupId: string,
    restrictions: ModelRestriction[],
  ) => {
    try {
      const response = await fetch("/api/admin/model-restrictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId,
          modelRestrictions: restrictions,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save restrictions");
      }

      toast.success(t("Model restrictions updated successfully"));
      setIsDialogOpen(false);

      // Force immediate refresh to show updated counts
      await loadGroups();
    } catch (error) {
      logger.error("Error saving restrictions", { error: String(error) });
      toast.error(t("Failed to save restrictions"));
    }
  };

  // Only count active models that are configured in the system
  const ACTIVE_MODELS = LLM_LIST;
  const totalModels = ACTIVE_MODELS.length;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <IconRefresh className="text-muted-foreground mx-auto size-8 animate-spin" />
          <p className="text-muted-foreground mt-2 text-sm">
            {t("Loading groups...")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("Model Restrictions")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("Control which AI models are available to each user group")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadGroups()}
            disabled={isLoading || isRefreshing}
          >
            <IconRefresh
              className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? t("Refreshing...") : t("Refresh")}
          </Button>
          {lastUpdated && (
            <span className="text-muted-foreground text-xs">
              {t("Updated")}: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <IconAdjustments className="size-5" />
            {t("Default Behavior")}
          </CardTitle>
          <CardDescription>
            <strong>
              {t("By default, all models are visible to all groups.")}
            </strong>{" "}
            {t(
              "Use this page to restrict specific models for certain groups. When you configure restrictions for a group, only the allowed models will be available to users in that group.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {t("Total Available Models")}:
            </span>
            <Badge variant="secondary" className="gap-1">
              <IconCheck className="size-3" />
              {totalModels} {t("models")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Groups List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Groups")}</h2>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{t("No groups found")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {groups.map(group => (
              <Card
                key={group.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {group.display_name}
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1">
                          {group.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleEditGroup(group)}
                        size="sm"
                        variant="outline"
                      >
                        <IconAdjustments className="mr-2 size-4" />
                        {t("Configure")}
                      </Button>
                      {group.hasRestrictions && (
                        <Button
                          onClick={() => handleResetGroup(group.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <IconRefresh className="mr-2 size-4" />
                          {t("Reset")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    {group.hasRestrictions ? (
                      <>
                        <div className="flex items-center gap-2">
                          <IconLockOpen className="size-5 text-green-600 dark:text-green-400" />
                          <span className="text-sm font-medium">
                            {group.allowedModels} {t("allowed")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <IconLock className="size-5 text-red-600 dark:text-red-400" />
                          <span className="text-sm font-medium">
                            {group.restrictedModels} {t("restricted")}
                          </span>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          {t("Custom Restrictions")}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <IconLockOpen className="size-5 text-green-600 dark:text-green-400" />
                          <span className="text-sm font-medium">
                            {t("All")} {totalModels} {t("models allowed")}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="ml-auto border-gray-300"
                        >
                          {t("No Restrictions")}
                        </Badge>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Model Restriction Dialog */}
      {selectedGroup && (
        <ModelRestrictionDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          group={selectedGroup}
          onSave={handleSaveRestrictions}
        />
      )}
    </div>
  );
}
