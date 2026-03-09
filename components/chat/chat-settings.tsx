import { ChatbotUIContext } from "@/context/context";
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits";
import useHotkey from "@/lib/hooks/use-hotkey";
import { LLMID, ModelProvider } from "@/types";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { FC, useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { ChatSettingsForm } from "../ui/chat-settings-form";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ChatSettingsProps {}

export const ChatSettings: FC<ChatSettingsProps> = ({}) => {
  useHotkey("i", () => handleClick());
  const { t: _t } = useTranslation();

  const {
    chatSettings,
    setChatSettings,
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels,
  } = useContext(ChatbotUIContext);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousModelRef = useRef<LLMID | null>(null);

  const handleClick = () => {
    if (buttonRef.current) {
      buttonRef.current.click();
    }
  };

  useEffect(() => {
    if (!chatSettings) return;

    // Only update temperature and context length to stay within model limits
    if (previousModelRef.current !== chatSettings.model) {
      const modelLimits = CHAT_SETTING_LIMITS[chatSettings.model];
      if (modelLimits) {
        setChatSettings(prev => ({
          ...prev,
          temperature: Math.min(
            prev.temperature,
            modelLimits.MAX_TEMPERATURE || 1,
          ),
          // Cap context length at model's maximum, but preserve user's choice if it fits
          contextLength: Math.min(
            prev.contextLength,
            modelLimits.MAX_CONTEXT_LENGTH || 4096,
          ),
          // contextLength: Math.min(prev.contextLength, modelLimits.MAX_CONTEXT_LENGTH || 4096),
        }));
      }
      previousModelRef.current = chatSettings.model;
    }
  }, [chatSettings, setChatSettings]);

  if (!chatSettings) {
    return null;
  }

  const allModels = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name,
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false,
    })),
    ...availableHostedModels,
    ...availableLocalModels,
    ...availableOpenRouterModels,
  ];

  // Filter for text models only (non-image models)
  const availableTextModels = allModels.filter(model => !model.imageInput);

  // Check if current model is available
  const isCurrentModelAvailable = availableTextModels.some(
    m => m.modelId === chatSettings.model,
  );

  const fullModel = isCurrentModelAvailable
    ? allModels.find(llm => llm.modelId === chatSettings.model)
    : undefined;

  // Determine display text - if no text models, show empty string (means all restricted)
  const displayText = !availableTextModels.length
    ? ""
    : fullModel?.modelName || "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ref={buttonRef}
          className="flex items-center space-x-2"
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
        <ChatSettingsForm
          chatSettings={chatSettings}
          onChangeChatSettings={setChatSettings}
        />
      </PopoverContent>
    </Popover>
  );
};
