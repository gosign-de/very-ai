"use client";

import Filter from "../components/filters/TimeFilter";
import ModelFilter from "../components/filters/ModelFilter";
import { ChatbotUIContext } from "@/context/context";
import { useContext } from "react";
import { LLMID, ModelProvider } from "@/types";
import {
  getModelDisplayName,
  isModelIncludedInAnalytics,
} from "../../../../lib/model-names";
import { useTranslation } from "react-i18next";

function DashboardFilter() {
  const {
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
  } = useContext(ChatbotUIContext);
  const { t } = useTranslation();

  const allModels = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name, // Use custom model name as is
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false,
    })),
    ...availableHostedModels.map(model => ({
      ...model,
      modelName: getModelDisplayName(model.modelId), // Use proper display name for hosted models
    })),
    ...availableLocalModels.map(model => ({
      ...model,
      modelName: getModelDisplayName(model.modelId), // Use proper display name for local models
    })),
    ...availableOpenRouterModels.map(model => ({
      ...model,
      modelName: getModelDisplayName(model.modelId), // Use proper display name for OpenRouter models
    })),
  ].filter(model => isModelIncludedInAnalytics(model.modelId)); // Filter to only include analytics models

  const allModelsOption = { modelId: "all_models", modelName: t("All Models") };
  const allOptions = [allModelsOption, ...allModels];

  return (
    <>
      <ModelFilter options={allOptions} />
      <Filter
        filterField="last"
        options={[
          { value: "today", label: t("Today") },
          { value: "this_month", label: t("This Month") },
          { value: "last_month", label: t("Last Month") },
          { value: "this_year", label: t("This Year") },
          { value: "last_year", label: t("Last Year") },
        ]}
      />
    </>
  );
}

export default DashboardFilter;
