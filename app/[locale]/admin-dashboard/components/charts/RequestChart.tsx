"use client";

import { useState, useEffect } from "react";
import { useModelFilter } from "../../context/ModelFilterContext";
import {
  getModelDisplayName,
  groupModelsWithMiscellaneous,
} from "../../../../../lib/model-names";
import {
  getModelColor,
  preAssignModelColors,
} from "../../../../../lib/chart-colors";
import { useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslation } from "react-i18next";

interface ModelStat {
  date_key: string;
  model: string;
  count: number;
}

interface RequestChartProps {
  modelStats: ModelStat[];
}

const RequestChart = ({ modelStats }: RequestChartProps) => {
  const { selectedModelId } = useModelFilter();
  const searchParams = useSearchParams();
  const period = searchParams.get("last") || "this_month";
  const { t } = useTranslation();

  // Group model stats with miscellaneous for non-analytics models
  const groupedModelStats = groupModelsWithMiscellaneous(modelStats || []);

  // State to manage which models are visible
  const [visibleModels, setVisibleModels] = useState<{
    [key: string]: boolean;
  }>({});

  // Get all unique model IDs and pre-assign colors for consistency
  const uniqueModelIds = Array.from(
    new Set(groupedModelStats?.map(stat => stat.model) || []),
  );
  preAssignModelColors(uniqueModelIds);

  // Initialize visibility state for all models (all visible by default)
  useEffect(() => {
    setVisibleModels(prev => {
      const initialVisibility: { [key: string]: boolean } = {};
      let hasNewModels = false;

      uniqueModelIds.forEach(modelId => {
        if (!(modelId in prev)) {
          initialVisibility[modelId] = true;
          hasNewModels = true;
        }
      });

      return hasNewModels ? { ...prev, ...initialVisibility } : prev;
    });
  }, [uniqueModelIds]);

  if (!modelStats) {
    return (
      <div className="bg-muted col-span-full flex flex-col gap-6 rounded-md border px-8 py-6">
        <p className="text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Activity Analytics")
            : `${getModelDisplayName(selectedModelId)} ${t("Analytics")}`}
        </p>
        <div className="flex h-72 items-center justify-center text-gray-500">
          {t("No data available")}
        </div>
      </div>
    );
  }

  if (!Array.isArray(modelStats)) {
    return (
      <div className="bg-muted col-span-full flex flex-col gap-6 rounded-md border px-8 py-6">
        <p className="text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Activity Analytics")
            : `${getModelDisplayName(selectedModelId)} ${t("Analytics")}`}
        </p>
        <div className="flex h-72 items-center justify-center text-gray-500">
          {t("Invalid data format")}
        </div>
      </div>
    );
  }

  if (groupedModelStats.length === 0) {
    return (
      <div className="bg-muted col-span-full flex flex-col gap-6 rounded-md border px-8 py-6">
        <p className="text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Activity Analytics")
            : `${getModelDisplayName(selectedModelId)} ${t("Analytics")}`}
        </p>
        <div className="flex h-72 items-center justify-center text-gray-500">
          {t("No data found for selected period")}
        </div>
      </div>
    );
  }

  const processData = (stats: ModelStat[]) => {
    const modelCount: { [date: string]: { [model: string]: number } } = {};

    // Process aggregated data from the database
    stats?.forEach(({ date_key, model, count }) => {
      if (!modelCount[date_key]) {
        modelCount[date_key] = {};
      }
      modelCount[date_key][model] = count;
    });

    // Generate complete date range for all periods
    if (period === "today") {
      const allHoursData: { [key: string]: number | string }[] = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourKey = hour.toString().padStart(2, "0") + ":00";
        const dataEntry: { [key: string]: number | string } = { date: hourKey };

        // Add data for each model, or 0 if no data exists
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[hourKey]?.[model] || 0;
        });

        allHoursData.push(dataEntry);
      }

      return allHoursData;
    }

    if (period === "this_month") {
      const now = new Date();
      const currentDay = now.getDate();
      const allDaysData: { [key: string]: number | string }[] = [];

      for (let day = 1; day <= currentDay; day++) {
        const dateKey = day.toString().padStart(2, "0");
        const dataEntry: { [key: string]: number | string } = { date: dateKey };

        // Add data for each model, or 0 if no data exists
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[dateKey]?.[model] || 0;
        });

        allDaysData.push(dataEntry);
      }

      return allDaysData;
    }

    if (period === "last_month") {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const daysInLastMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
      ).getDate();
      const monthNames = [
        t("Jan"),
        t("Feb"),
        t("Mar"),
        t("Apr"),
        t("May"),
        t("Jun"),
        t("Jul"),
        t("Aug"),
        t("Sep"),
        t("Oct"),
        t("Nov"),
        t("Dec"),
      ];
      const lastMonthName = monthNames[lastMonth.getMonth()];

      const allDaysData: { [key: string]: number | string }[] = [];

      for (let day = 1; day <= daysInLastMonth; day++) {
        const dayPadded = day.toString().padStart(2, "0");
        const dateKey = `${dayPadded} ${lastMonthName}`;
        const dataEntry: { [key: string]: number | string } = {
          date: dayPadded,
        };

        // Add data for each model, or 0 if no data exists
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[dateKey]?.[model] || 0;
        });

        allDaysData.push(dataEntry);
      }

      return allDaysData;
    }

    if (period === "this_year") {
      const now = new Date();
      const currentMonth = now.getMonth();
      const monthNames = [
        t("Jan"),
        t("Feb"),
        t("Mar"),
        t("Apr"),
        t("May"),
        t("Jun"),
        t("Jul"),
        t("Aug"),
        t("Sep"),
        t("Oct"),
        t("Nov"),
        t("Dec"),
      ];

      const allMonthsData: { [key: string]: number | string }[] = [];

      for (let month = 0; month <= currentMonth; month++) {
        const monthName = monthNames[month];
        const dataEntry: { [key: string]: number | string } = {
          date: monthName,
        };

        // Add data for each model, or 0 if no data exists
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[monthName]?.[model] || 0;
        });

        allMonthsData.push(dataEntry);
      }

      return allMonthsData;
    }

    if (period === "last_year") {
      const now = new Date();
      const lastYear = now.getFullYear() - 1;
      const monthNames = [
        t("Jan"),
        t("Feb"),
        t("Mar"),
        t("Apr"),
        t("May"),
        t("Jun"),
        t("Jul"),
        t("Aug"),
        t("Sep"),
        t("Oct"),
        t("Nov"),
        t("Dec"),
      ];

      const allMonthsData: { [key: string]: number | string }[] = [];

      for (let month = 0; month < 12; month++) {
        const monthName = monthNames[month];
        const dateKey = `${monthName} ${lastYear}`;
        const dataEntry: { [key: string]: number | string } = {
          date: monthName,
        };

        // Add data for each model, or 0 if no data exists
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[dateKey]?.[model] || 0;
        });

        allMonthsData.push(dataEntry);
      }

      return allMonthsData;
    }

    // Convert to chart data and sort appropriately for other periods
    const chartData = Object.keys(modelCount)
      .sort((a, b) => {
        // Custom sorting based on period
        switch (period) {
          case "today":
            // Sort by hour (numeric)
            return parseInt(a.split(":")[0]) - parseInt(b.split(":")[0]);
          case "this_year":
            // Sort by month order
            const months = [
              t("Jan"),
              t("Feb"),
              t("Mar"),
              t("Apr"),
              t("May"),
              t("Jun"),
              t("Jul"),
              t("Aug"),
              t("Sep"),
              t("Oct"),
              t("Nov"),
              t("Dec"),
            ];
            return months.indexOf(a) - months.indexOf(b);
          case "last_year":
            // Sort by month order for "Jan 2024", "Feb 2024" format
            const months2 = [
              t("Jan"),
              t("Feb"),
              t("Mar"),
              t("Apr"),
              t("May"),
              t("Jun"),
              t("Jul"),
              t("Aug"),
              t("Sep"),
              t("Oct"),
              t("Nov"),
              t("Dec"),
            ];
            const monthA = a.split(" ")[0];
            const monthB = b.split(" ")[0];
            return months2.indexOf(monthA) - months2.indexOf(monthB);
          default:
            // Default to numeric sort
            return parseInt(a) - parseInt(b);
        }
      })
      .map(dateKey => {
        const dataEntry: { [key: string]: number | string } = { date: dateKey };

        // Ensure ALL models are included in each data point, even with 0 values
        uniqueModelIds.forEach(model => {
          dataEntry[model] = modelCount[dateKey][model] || 0;
        });

        return dataEntry;
      });

    return chartData;
  };

  const chartData = processData(groupedModelStats);

  // Toggle model visibility
  const toggleModelVisibility = (modelId: string) => {
    setVisibleModels(prev => ({
      ...prev,
      [modelId]: !prev[modelId],
    }));
  };

  // Custom Legend Component
  const CustomLegend = () => (
    <div className="mb-4 flex flex-wrap justify-center gap-4">
      {uniqueModelIds.map(modelId => (
        <div
          key={modelId}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 transition-all duration-200 ${
            visibleModels[modelId] !== false
              ? "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              : "bg-gray-50 opacity-50 hover:opacity-75 dark:bg-gray-900"
          }`}
          onClick={() => toggleModelVisibility(modelId)}
        >
          <div
            className="size-3 rounded-full"
            style={{ backgroundColor: getModelColor(modelId) }}
          />
          <span
            className={`text-sm font-medium ${
              visibleModels[modelId] !== false
                ? "text-gray-900 dark:text-gray-100"
                : "text-gray-500 line-through dark:text-gray-400"
            }`}
          >
            {getModelDisplayName(modelId)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-muted col-span-full flex flex-col gap-6 rounded-md border px-8 py-6">
      <p className="text-xl font-bold">
        {selectedModelId === "all_models"
          ? t("Activity Analytics")
          : `${getModelDisplayName(selectedModelId)} ${t("Analytics")}`}
      </p>

      <ResponsiveContainer height={300} width="100%">
        <AreaChart data={chartData} width={600} height={400}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />

          {/* Render areas dynamically based on ALL unique models and visibility */}
          {uniqueModelIds
            .filter(modelId => visibleModels[modelId] !== false)
            .map(modelId => (
              <Area
                key={modelId}
                type="monotone"
                dataKey={modelId}
                stroke={getModelColor(modelId)}
                fill={getModelColor(modelId)}
                strokeWidth={2}
                fillOpacity={0.3}
                name={getModelDisplayName(modelId)}
              />
            ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Custom Legend - moved below the chart */}
      <CustomLegend />
    </div>
  );
};

export default RequestChart;
