"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useModelFilter } from "../../context/ModelFilterContext";
import {
  getModelDisplayName,
  groupModelCountsWithMiscellaneous,
} from "../../../../../lib/model-names";
import {
  getModelColor,
  preAssignModelColors,
} from "../../../../../lib/chart-colors";
import { useTranslation } from "react-i18next";

function ModelChart({ modelCountStats }) {
  const { selectedModelId } = useModelFilter();
  const { t } = useTranslation();
  // Check if modelCountStats is defined and is an object
  if (!modelCountStats) {
    return (
      <div className="bg-muted -xl:col-span-full -xl:row-start-3 -xl:row-end-4 col-span-2 row-start-2 row-end-3 rounded-md border px-8 py-6">
        <p className="mb-4 text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Model Usage Distribution")
            : `${getModelDisplayName(selectedModelId)} ${t("Usage Distribution")}`}
        </p>
        <div className="flex h-60 items-center justify-center text-gray-500">
          {t("No data available")}
        </div>
      </div>
    );
  }

  if (typeof modelCountStats !== "object") {
    return (
      <div className="bg-muted -xl:col-span-full -xl:row-start-3 -xl:row-end-4 col-span-2 row-start-2 row-end-3 rounded-md border px-8 py-6">
        <p className="mb-4 text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Model Usage Distribution")
            : `${getModelDisplayName(selectedModelId)} ${t("Usage Distribution")}`}
        </p>
        <div className="flex h-60 items-center justify-center text-gray-500">
          {t("Invalid data format")}
        </div>
      </div>
    );
  }

  // Group model count stats with miscellaneous for non-analytics models
  const groupedModelCountStats =
    groupModelCountsWithMiscellaneous(modelCountStats);

  // Convert to array of objects for the chart
  const chartData = Object.entries(groupedModelCountStats)
    .map(([modelId, value]) => ({
      name: getModelDisplayName(modelId), // Use full display name for legend
      originalId: modelId, // Keep original ID for reference
      value,
    }))
    .sort((a, b) => (b.value as number) - (a.value as number));

  // Pre-assign colors for all models to ensure consistency across charts
  const modelIds = chartData.map(item => item.originalId);
  preAssignModelColors(modelIds);

  if (chartData.length === 0) {
    return (
      <div className="bg-muted -xl:col-span-full -xl:row-start-3 -xl:row-end-4 col-span-2 row-start-2 row-end-3 rounded-md border px-8 py-6">
        <p className="mb-4 text-xl font-bold">
          {selectedModelId === "all_models"
            ? t("Model Usage Distribution")
            : `${getModelDisplayName(selectedModelId)} ${t("Usage Distribution")}`}
        </p>
        <div className="flex h-60 items-center justify-center text-gray-500">
          {t("No data available for selected model")}
        </div>
      </div>
    );
  }

  // Define colors for each slice - removed old COLORS array and use getModelColor

  return (
    <div className="bg-muted -xl:col-span-full -xl:row-start-3 -xl:row-end-4 col-span-2 row-start-2 row-end-3 rounded-md border px-8 py-6">
      <p className="mb-4 text-xl font-bold">
        {selectedModelId === "all_models"
          ? t("Model Usage Distribution")
          : `${getModelDisplayName(selectedModelId)} ${t("Usage Distribution")}`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                innerRadius={85}
                outerRadius={110}
                cx="50%"
                cy="50%"
                paddingAngle={3}
              >
                {chartData.map(entry => (
                  <Cell
                    fill={getModelColor(entry.originalId)}
                    stroke={getModelColor(entry.originalId)}
                    key={`cell-${entry.originalId}`}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Custom Legend on the right */}
        <div className="flex min-w-[140px] flex-col gap-2">
          {chartData.map(entry => (
            <div
              key={entry.originalId}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: getModelColor(entry.originalId) }}
              ></div>
              <span className="truncate" title={entry.name}>
                {entry.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModelChart;
