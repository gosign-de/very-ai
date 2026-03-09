"use client";

import { ContentType } from "@/types";
import { FC } from "react";
import { TabsTrigger } from "../ui/tabs";
import { useRouter } from "next/navigation";
import { IconLock } from "@tabler/icons-react";
import { WithTooltip } from "../ui/with-tooltip";
import { useTranslation } from "react-i18next";

interface SidebarSwitchSubscriptionProps {
  contentType: ContentType;
  onContentTypeChange: (contentType: ContentType) => void;
}

export const SidebarSwitchSubscription: FC<SidebarSwitchSubscriptionProps> = ({
  contentType,
  onContentTypeChange: _onContentTypeChange,
}) => {
  const router = useRouter();

  const { t } = useTranslation();

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

  const handleSubscriptionRedirect = () => {
    router.push("/subscription");
  };

  return (
    <WithTooltip
      display={
        <div className="flex max-w-[220px] flex-col items-start opacity-50 sm:max-w-[260px]">
          <span className="text-xs sm:text-sm">
            {t("Click to upgrade and unlock")} {displayName}
          </span>
        </div>
      }
      trigger={
        <TabsTrigger
          className="hover:opacity-50"
          value={contentType}
          onClick={handleSubscriptionRedirect}
        >
          <IconLock size={28} />
        </TabsTrigger>
      }
    />
  );
};
