import { LLM_LIST } from "@/lib/models/llm/llm-list";
import { Tables } from "@/supabase/types";
import { IconCircleCheckFilled, IconRobotFace } from "@tabler/icons-react";
import Image from "next/image";
import { FC, useEffect, useState } from "react";
import { ModelIcon } from "../models/model-icon";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { fetchAssistantById, fetchAssistantsByGroupId } from "@/db/assistants";
interface QuickSettingOptionProps {
  contentType: "presets" | "assistants";
  isSelected: boolean;
  item: Tables<"presets"> | Tables<"assistants">;
  onSelect: () => void;
  image: string;
}

export const QuickSettingOption: FC<QuickSettingOptionProps> = ({
  contentType,
  isSelected,
  item,
  onSelect,
  image,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [assistantName, setAssistantName] = useState(item.name);
  const [_assistantDescription, setAssistantDescription] = useState(item.name);

  useEffect(() => {
    const checkAssistant = async () => {
      if (contentType === "assistants") {
        const assistantId = (item as Tables<"assistants">).id;
        const groupId = (item as Tables<"assistants">).group_id;
        if (groupId === null) {
          const assistant = await fetchAssistantById(assistantId);
          setIsVisible(assistant !== null);
          if (assistant) {
            setAssistantName(assistant.name);
            setAssistantDescription(assistant.description);
          }
        } else {
          const assistants = await fetchAssistantsByGroupId(groupId);
          const assistantExists = assistants.some(a => a.id === assistantId);
          setIsVisible(assistantExists);
          if (assistantExists) {
            const assistant = await fetchAssistantById(assistantId);
            if (assistant && assistant.name !== item.name) {
              setAssistantName(assistant.name);
            }
            if (assistant && assistant.description !== item.description) {
              setAssistantDescription(assistant.description);
            }
          }
        }
      } else {
        setIsVisible(true);
      }
    };

    checkAssistant();
  }, [contentType, item]);

  const modelDetails = LLM_LIST.find(model => model.modelId === item.model);
  if (!isVisible) return null;

  return (
    <DropdownMenuItem
      tabIndex={0}
      className="cursor-pointer items-center"
      onSelect={onSelect}
    >
      <div className="w-[32px]">
        {contentType === "presets" ? (
          <ModelIcon
            provider={modelDetails?.provider || "custom"}
            width={32}
            height={32}
          />
        ) : image ? (
          <Image
            style={{ width: "32px", height: "32px" }}
            className="rounded"
            src={image}
            alt="Assistant"
            width={32}
            height={32}
          />
        ) : (
          <IconRobotFace
            className="bg-primary text-secondary border-primary rounded border-DEFAULT p-1"
            size={32}
          />
        )}
      </div>

      <div className="ml-4 flex grow flex-col space-y-1">
        <div className="text-md font-bold">{assistantName}</div>

        {item.description && (
          <div className="text-sm font-light">{item.description}</div>
        )}
      </div>
      <div className="min-w-[40px]">
        {isSelected ? (
          <IconCircleCheckFilled className="ml-4" size={20} />
        ) : null}
      </div>
    </DropdownMenuItem>
  );
};
