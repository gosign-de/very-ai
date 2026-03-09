"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  IconFileUpload,
  IconUsers,
  IconDatabase,
  IconTrendingUp,
} from "@tabler/icons-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { useTranslation } from "react-i18next";

interface AnalyticsData {
  totalFiles: number;
  totalSize: number;
  uniqueUsers: number;
  fileTypeDistribution: { [key: string]: number };
  timeDistribution: { [key: string]: number };
  userDistribution: { [key: string]: number };
}

interface AnalyticsDashboardProps {
  analytics: AnalyticsData;
  timeFilter: string;
}

export default function AnalyticsDashboard({
  analytics,
  timeFilter,
}: AnalyticsDashboardProps) {
  const { t } = useTranslation();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t("Bytes")}`;
    const k = 1024;
    const sizes = [t("Bytes"), t("KB"), t("MB"), t("GB")];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getTimeFilterLabel = (filter: string) => {
    switch (filter) {
      case "day":
        return t("Today");
      case "week":
        return t("This Week");
      case "month":
        return t("This Month");
      case "year":
        return t("This Year");
      default:
        return t("This Month");
    }
  };

  const maskUsername = (username: string): string => {
    if (username.length <= 5) return username;
    return username.substring(0, username.length - 5) + "xxxxx";
  };

  const translateTimeLabel = (time: string): string => {
    // Map of English to translation keys
    const translations: { [key: string]: string } = {
      Sun: "Sun",
      Mon: "Mon",
      Tue: "Tue",
      Wed: "Wed",
      Thu: "Thu",
      Fri: "Fri",
      Sat: "Sat",
      Sunday: "Sun",
      Monday: "Mon",
      Tuesday: "Tue",
      Wednesday: "Wed",
      Thursday: "Thu",
      Friday: "Fri",
      Saturday: "Sat",
      Jan: "Jan",
      Feb: "Feb",
      Mar: "Mar",
      Apr: "Apr",
      May: "May",
      Jun: "Jun",
      Jul: "Jul",
      Aug: "Aug",
      Sep: "Sep",
      Oct: "Oct",
      Nov: "Nov",
      Dec: "Dec",
      January: "Jan",
      February: "Feb",
      March: "Mar",
      April: "Apr",
      June: "Jun",
      July: "Jul",
      August: "Aug",
      September: "Sep",
      October: "Oct",
      November: "Nov",
      December: "Dec",
    };

    return translations[time] ? t(translations[time]) : time;
  };

  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#8884D8",
    "#82CA9D",
    "#FFC658",
    "#FF7C7C",
  ];

  const fileTypeData = Object.entries(analytics.fileTypeDistribution)
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  const timeData = Object.entries(analytics.timeDistribution)
    .map(([time, count]) => ({
      time: translateTimeLabel(time),
      originalTime: time,
      count,
    }))
    .sort((a, b) => {
      if (timeFilter === "day") {
        return parseInt(a.originalTime) - parseInt(b.originalTime);
      } else if (timeFilter === "week") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return days.indexOf(a.originalTime) - days.indexOf(b.originalTime);
      } else if (timeFilter === "month") {
        return parseInt(a.originalTime) - parseInt(b.originalTime);
      } else if (timeFilter === "year") {
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        return months.indexOf(a.originalTime) - months.indexOf(b.originalTime);
      }
      return 0;
    });

  const topUsersData = Object.entries(analytics.userDistribution)
    .map(([user, count]) => ({
      user: maskUsername(user),
      fullUser: user,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="border-border bg-popover rounded-lg border p-3 shadow-xl backdrop-blur-sm">
          <p className="text-foreground mb-1 text-sm font-semibold">
            {payload[0].payload.fullUser}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("Files uploaded")}:{" "}
            <span className="text-primary font-semibold">
              {payload[0].value}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomTimelineTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="border-border bg-popover rounded-lg border p-3 shadow-xl backdrop-blur-sm">
          <p className="text-foreground mb-1 text-sm font-semibold">{label}</p>
          <p className="text-muted-foreground text-xs">
            {t("count")}:{" "}
            <span className="text-primary font-semibold">
              {payload[0].value}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Total Files")}
            </CardTitle>
            <IconFileUpload className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalFiles}</div>
            <p className="text-muted-foreground text-xs">
              {getTimeFilterLabel(timeFilter)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Total Size")}
            </CardTitle>
            <IconDatabase className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatFileSize(analytics.totalSize)}
            </div>
            <p className="text-muted-foreground text-xs">{t("Storage used")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Active Users")}
            </CardTitle>
            <IconUsers className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.uniqueUsers}</div>
            <p className="text-muted-foreground text-xs">
              {t("Users with uploads")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("Avg per User")}
            </CardTitle>
            <IconTrendingUp className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.uniqueUsers > 0
                ? Math.round(analytics.totalFiles / analytics.uniqueUsers)
                : 0}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("Files per user")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* File Type Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t("File Type Distribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            {fileTypeData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={fileTypeData}
                        dataKey="value"
                        innerRadius={60}
                        outerRadius={100}
                        cx="50%"
                        cy="50%"
                        paddingAngle={3}
                      >
                        {fileTypeData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex min-w-[120px] flex-col gap-2">
                  {fileTypeData.map((entry, index) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className="size-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                      <span className="truncate">{entry.name}</span>
                      <span className="text-muted-foreground">
                        ({entry.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground flex h-60 items-center justify-center">
                {t("No file type data available")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Timeline Area Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Upload Timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            {timeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip content={<CustomTimelineTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground flex h-60 items-center justify-center">
                {t("No timeline data available")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Users Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Top Uploaders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {topUsersData.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height={Math.max(300, topUsersData.length * 50)}
            >
              <BarChart
                data={topUsersData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  dataKey="user"
                  type="category"
                  width={140}
                  tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "hsl(var(--accent))", opacity: 0.1 }}
                />
                <Bar
                  dataKey="count"
                  fill="#8884d8"
                  radius={[0, 8, 8, 0]}
                  maxBarSize={35}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-muted-foreground flex h-60 items-center justify-center">
              {t("No user data available")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
