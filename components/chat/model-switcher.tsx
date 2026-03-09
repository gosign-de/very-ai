import { FC, useContext, useRef } from "react";
import { ChatbotUIContext } from "@/context/context";
import { ModelSelect } from "../models/model-select";
import { Label } from "../ui/label";
import { useTranslation } from "react-i18next";
import { getModelInfo } from "@/lib/models/model-availability";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ModelSwitcherProps {
  className?: string;
}

export const ModelSwitcher: FC<ModelSwitcherProps> = ({ className = "" }) => {
  const { t } = useTranslation();
  const {
    chatSettings,
    setChatSettings,
    profile,
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const allModels = [
    ...models.map(model => ({
      modelId: model.model_id,
      modelName: model.name,
      provider: "custom" as any,
      hostedId: model.id,
      platformLink: "",
      imageInput: false,
    })),
    ...availableHostedModels,
    ...availableLocalModels,
    ...availableOpenRouterModels,
  ];

  const currentModel = chatSettings?.model || "gpt-4";

  // Filter text models only for display check
  const availableTextModels = allModels.filter(model => !model.imageInput);
  const hasTextModels = availableTextModels.length > 0;

  // Check if current model is actually in available models
  const isCurrentModelAvailable = availableTextModels.some(
    m => m.modelId === currentModel,
  );

  // Only get model info if it's available
  const fullModel = isCurrentModelAvailable
    ? allModels.find(llm => llm.modelId === currentModel) ||
      getModelInfo(currentModel as any)
    : null;

  // Determine display text - if no text models, show empty string (means all restricted)
  const displayText = !hasTextModels ? "" : fullModel?.modelName || "";

  if (!profile) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ref={buttonRef}
          className={`flex items-center space-x-2 ${className}`}
          variant="ghost"
        >
          <div className="max-w-[120px] truncate text-lg sm:max-w-[300px] lg:max-w-[500px]">
            {displayText}
          </div>

          <IconAdjustmentsHorizontal size={28} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="bg-background border-input relative flex max-h-[calc(100vh-60px)] w-[300px] flex-col space-y-4 overflow-auto rounded-lg border-2 p-6 sm:w-[350px] md:w-[400px] lg:w-[500px] dark:border-none"
        align="end"
      >
        <div className="space-y-3">
          {/* Model Section */}
          <div className="space-y-1">
            <Label>{t("Model")}</Label>
            <ModelSelect
              selectedModelId={chatSettings.model}
              onSelectModel={model => {
                setChatSettings({
                  ...chatSettings,
                  model,
                });
              }}
              imageModels={false}
            />
          </div>

          {/* Image Model Section */}
          <div className="space-y-1">
            <Label>{t("Image Model")}</Label>
            <ModelSelect
              selectedModelId={chatSettings.imageModel}
              onSelectModel={imageModel => {
                setChatSettings({
                  ...chatSettings,
                  imageModel,
                });
              }}
              imageModels={true}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
