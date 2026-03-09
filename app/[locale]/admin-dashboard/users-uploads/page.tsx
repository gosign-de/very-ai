"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import AnalyticsDashboard from "./components/analytics-dashboard";
import Filters from "./components/filters";
import FileList from "./components/file-list";
import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface FileData {
  id: string;
  name: string;
  type: string;
  original_type?: string;
  size: number;
  created_at: string;
  user_id: string;
  profiles: {
    display_name: string;
    username: string;
  };
}

interface AnalyticsData {
  totalFiles: number;
  totalSize: number;
  uniqueUsers: number;
  fileTypeDistribution: { [key: string]: number };
  timeDistribution: { [key: string]: number };
  userDistribution: { [key: string]: number };
}

interface ApiResponse {
  success: boolean;
  data: {
    files: FileData[];
    analytics: AnalyticsData;
    users: Array<{ user_id: string; display_name: string; username: string }>;
    filters: {
      timeFilter: string;
      fileType: string;
      userId: string;
    };
  };
}

export default function Page() {
  const { t } = useTranslation();
  const [data, setData] = useState<ApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [timeFilter, setTimeFilter] = useState("month");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const fetchData = async (showRefreshLoader = false) => {
    try {
      if (showRefreshLoader) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams({
        timeFilter,
        fileType: fileTypeFilter,
        userId: userFilter,
      });

      const response = await fetch(`/api/admin/user-uploads?${params}`);

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const result: ApiResponse = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        throw new Error("Failed to fetch data");
      }
    } catch (_error) {
      toast.error(t("Failed to load user upload data"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeFilter, fileTypeFilter, userFilter]);

  const handleTimeFilterChange = (value: string) => {
    setTimeFilter(value);
  };

  const handleFileTypeFilterChange = (value: string) => {
    setFileTypeFilter(value);
  };

  const handleUserFilterChange = (value: string) => {
    setUserFilter(value);
  };

  const handleResetFilters = () => {
    setTimeFilter("month");
    setFileTypeFilter("all");
    setUserFilter("all");
  };

  const handleRefresh = () => {
    fetchData(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("User Uploads")}</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <IconLoader2 className="size-6 animate-spin" />
            <span>{t("Loading user upload data")}...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("User Uploads")}</h1>
        </div>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            {t("Failed to load data. Please try again.")}
          </p>
          <Button onClick={handleRefresh} className="mt-4">
            <IconRefresh className="mr-2 size-4" />
            {t("Retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("User Uploads")}</h1>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          {refreshing ? (
            <IconLoader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <IconRefresh className="mr-2 size-4" />
          )}
          {t("Refresh")}
        </Button>
      </div>

      <Filters
        timeFilter={timeFilter}
        fileTypeFilter={fileTypeFilter}
        userFilter={userFilter}
        users={data.users}
        onTimeFilterChange={handleTimeFilterChange}
        onFileTypeFilterChange={handleFileTypeFilterChange}
        onUserFilterChange={handleUserFilterChange}
        onResetFilters={handleResetFilters}
      />

      <AnalyticsDashboard analytics={data.analytics} timeFilter={timeFilter} />

      <FileList files={data.files} loading={refreshing} />
    </div>
  );
}
