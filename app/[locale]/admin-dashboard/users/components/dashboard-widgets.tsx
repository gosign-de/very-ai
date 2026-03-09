"use client";
import { createClientLogger } from "@/lib/logger/client";

import React, { useState, useEffect } from "react";

const logger = createClientLogger({ component: "UserAnalyticsDashboard" });
import { format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { de, enUS } from "date-fns/locale";

const UserAnalyticsDashboard = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "de" ? de : enUS;
  const router = useRouter();
  const [dailyData, setDailyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get date ranges
        const today = new Date();
        const currentYear = new Date(today.getFullYear(), 0, 1);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const todayFormatted = format(today, "yyyy-MM-dd");
        const threeMonthsAgoFormatted = format(threeMonthsAgo, "yyyy-MM-dd");
        const currentYearFormatted = format(currentYear, "yyyy-MM-dd");

        // Fetch daily active users
        setDailyLoading(true);
        const dateRangeResponse = await fetch(
          "/api/chat-stats/get-active-users-by-date-range",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              start_date: threeMonthsAgoFormatted,
              end_date: todayFormatted,
            }),
          },
        );

        if (dateRangeResponse.redirected) {
          router.push(dateRangeResponse.url);
          return;
        }

        const result = await dateRangeResponse.json();
        if (!result.success) {
          throw new Error(
            result.error || t("Failed to fetch daily active users"),
          );
        }

        const dailyActiveUsers = result.data;

        const processedDailyData = dailyActiveUsers
          .map(item => ({
            date: item.chat_date,
            value: item.user_count,
          }))
          .sort((a, b) => +new Date(a.date) - +new Date(b.date));

        setDailyData(processedDailyData);
        setDailyLoading(false);

        // Fetch monthly active users
        setMonthlyLoading(true);

        const response = await fetch(
          "/api/chat-stats/get-monthly-active-users",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              start_date: currentYearFormatted,
              end_date: todayFormatted,
            }),
          },
        );

        if (response.redirected) {
          router.push(response.url);
          return;
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(
            data.error || t("Failed to fetch monthly active users"),
          );
        }

        const monthlyActiveUsers = data.data;

        const processedMonthlyData = monthlyActiveUsers
          .map(item => ({
            date: item.month_start,
            value: item.user_count,
          }))
          .sort((a, b) => +new Date(a.date) - +new Date(b.date));

        setMonthlyData(processedMonthlyData);
        setMonthlyLoading(false);
      } catch (err) {
        logger.error("Error fetching data", { error: String(err) });
        setError(err.message);
        setDailyLoading(false);
        setMonthlyLoading(false);
      }
    };

    fetchData();
  }, [t, router]);

  // Calculate current DAU and percentage change
  const calculateDailyMetrics = () => {
    if (dailyData.length < 2) return { current: 0, change: 0 };

    const current = dailyData[dailyData.length - 1]?.value || 0;
    const previous = dailyData[dailyData.length - 2]?.value || 0;

    const change = previous === 0 ? 0 : ((current - previous) / previous) * 100;

    return { current, change };
  };

  // Calculate current MAU and percentage change
  const calculateMonthlyMetrics = () => {
    if (monthlyData.length < 2) return { current: 0, change: 0 };

    const current = monthlyData[monthlyData.length - 1]?.value || 0;
    const previous = monthlyData[monthlyData.length - 2]?.value || 0;

    const change = previous === 0 ? 0 : ((current - previous) / previous) * 100;

    return { current, change };
  };

  const { current: currentDAU, change: dauChange } = calculateDailyMetrics();
  const { current: currentMAU, change: mauChange } = calculateMonthlyMetrics();

  if (error) {
    return (
      <div className="text-red-500">
        {t("Error loading data")}: {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Daily Active Users Widget */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">
                {t("Daily Active Users")}
              </CardTitle>
              <CardDescription>{t("Users active each day")}</CardDescription>
            </div>
            <div className="rounded-full bg-blue-100 p-2 text-blue-600">
              <Users className="size-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-3xl font-bold">
              {currentDAU.toLocaleString()}
            </div>
            <div
              className={`flex items-center text-sm ${dauChange >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {dauChange >= 0 ? (
                <svg
                  className="mr-1 size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 17L17 7M17 7H7M17 7V17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  className="mr-1 size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 7L17 17M17 17V7M17 17H7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {Math.abs(dauChange).toFixed(1)}%
            </div>
          </div>

          {dailyLoading ? (
            <div className="flex h-64 items-center justify-center">
              {t("Loading data")}...
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorDAU" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.1)"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={value =>
                      format(new Date(value), "dd MMM", { locale })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded border bg-white p-2 text-xs text-gray-800 shadow">
                            <p className="font-medium">
                              {format(new Date(label), "dd MMM yyyy", {
                                locale,
                              })}
                            </p>
                            <p>
                              {t("Daily Active Users")}: {payload[0].value}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorDAU)"
                    name={t("Daily Active Users")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Active Users Widget */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">
                {t("Monthly Active Users")}
              </CardTitle>
              <CardDescription>
                {t("Users active once per month")}
              </CardDescription>
            </div>
            <div className="rounded-full bg-indigo-100 p-2 text-indigo-600">
              <Users className="size-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-3xl font-bold">
              {currentMAU.toLocaleString()}
            </div>
            <div
              className={`flex items-center text-sm ${mauChange >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {mauChange >= 0 ? (
                <svg
                  className="mr-1 size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 17L17 7M17 7H7M17 7V17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  className="mr-1 size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 7L17 17M17 17V7M17 17H7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {Math.abs(mauChange).toFixed(1)}%
            </div>
          </div>

          {monthlyLoading ? (
            <div className="flex h-64 items-center justify-center">
              {t("Loading data")}...
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorMAU" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.1)"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={value =>
                      format(new Date(value), "MMM", { locale })
                    }
                  />
                  <YAxis />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded border bg-white p-2 text-xs text-gray-800 shadow">
                            <p className="font-medium">
                              {format(new Date(label), "MMMM yyyy", { locale })}
                            </p>
                            <p>
                              {t("Monthly Active Users")}: {payload[0].value}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#6366F1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorMAU)"
                    name={t("Monthly Active Users")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserAnalyticsDashboard;
