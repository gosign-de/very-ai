"use client";

import { ContentType } from "@/types";
import { FC } from "react";
import { TabsTrigger } from "../ui/tabs";
import { WithTooltip } from "../ui/with-tooltip";
import { useTranslation } from "react-i18next";

interface SidebarSwitchItemProps {
  contentType: ContentType;
  icon: React.ReactNode;
  onContentTypeChange: (contentType: ContentType) => void;
}

export const SidebarSwitchItem: FC<SidebarSwitchItemProps> = ({
  contentType,
  icon,
  onContentTypeChange,
}) => {
  const { t } = useTranslation();

  const contentTypeDescriptions: Record<ContentType, string> = {
    chats: t(
      "Conversations where users interact directly with assistants for personalized responses.",
    ),
    presets: t(
      "Predefined configurations or settings that can be applied quickly for ease of use.",
    ),
    prompts: t(
      "Instructions or guidance provided to the assistant for specific tasks or responses.",
    ),
    files: t(
      "Uploaded documents, images, or media files shared within the app for various purposes.",
    ),
    collections: t(
      "Organized groups of related content or data, curated for easy access and management.",
    ),
    assistants: t(
      "Virtual assistants designed to help users complete tasks or provide valuable insights.",
    ),
    "group-assistants": t(
      "Collaborative assistants that help multiple users or teams within a group environment.",
    ),
    tools: t(
      "Specialized utilities or functionalities built to perform specific tasks efficiently.",
    ),
    models: t(
      "AI or machine learning models powering features and services within the application.",
    ),
  };

  const contentTypeDisplayNames: Record<ContentType, string> = {
    chats: t("Chats"),
    presets: t("Presets"),
    prompts: t("Prompts"),
    files: t("Files"),
    collections: t("Collections"),
    assistants: t("Assistants"),
    "group-assistants": t("Group Assistants"),
    tools: t("Tools"),
    models: t("Models"),
  };

  const displayName = contentTypeDisplayNames[contentType];

  const description = contentTypeDescriptions[contentType];

  return (
    <WithTooltip
      display={
        <div className="flex max-w-[220px] flex-col items-start space-y-1 sm:max-w-[260px]">
          <span className="font-semibold">{displayName}</span>
          <span className="text-xs sm:text-sm">{description}</span>
        </div>
      }
      trigger={
        <TabsTrigger
          className="hover:opacity-50"
          value={contentType}
          onClick={() => onContentTypeChange(contentType as ContentType)}
        >
          {icon}
        </TabsTrigger>
      }
    />
  );
};
