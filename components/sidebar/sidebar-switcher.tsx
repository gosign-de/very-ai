"use client";

import { ContentType } from "@/types";
import {
  IconBolt,
  IconFile,
  IconMessage,
  IconPencil,
  IconRobotFace,
  IconSquaresFilled,
} from "@tabler/icons-react";
import { FC } from "react";
import { TabsList } from "../ui/tabs";
import { WithTooltip } from "../ui/with-tooltip";
import { ProfileSettings } from "../utility/profile-settings";
import { SidebarSwitchItem } from "./sidebar-switch-item";
import { useTranslation } from "react-i18next";
import { useSession } from "next-auth/react";
export const SIDEBAR_ICON_SIZE = 28;

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: ContentType) => void;
}

export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange,
}) => {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const groups = session?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);
  const addToolTab = groupIds.some(
    id =>
      id === "9ec44798-cf1c-49fc-8949-af148876a7ca" ||
      id === "88f1d300-add8-43ab-b94c-cb38506c6dce",
  );

  return (
    <div className="flex flex-col justify-between border-r-2 pb-5">
      <TabsList className="bg-background grid h-[440px] grid-rows-7">
        <SidebarSwitchItem
          icon={<IconMessage size={SIDEBAR_ICON_SIZE} />}
          contentType="chats"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconPencil size={SIDEBAR_ICON_SIZE} />}
          contentType="prompts"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconFile size={SIDEBAR_ICON_SIZE} />}
          contentType="files"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconSquaresFilled size={SIDEBAR_ICON_SIZE} />}
          contentType="collections"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={<IconRobotFace size={SIDEBAR_ICON_SIZE} />}
          contentType="assistants"
          onContentTypeChange={onContentTypeChange}
        />

        <SidebarSwitchItem
          icon={
            <div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5.4,6.7h13.7c1.3,0,2.3,1,2.3,2.3v13.8c0,1.3-1,2.3-2.3,2.3H5.4c-1.3,0-2.3-1-2.3-2.3v-13.8c0-1.3,1-2.3,2.3-2.3Z" />
                <path d="M9.4,18.4c1.1.8,2.3,1.1,3.4,1.1s2.3-.4,3.4-1.1" />
                <path d="M9.2,3.5" />
                <path d="M18.3,3.5" />
                <path d="M9.4,13.8v-1.1" />
                <path d="M16.2,13.8v-1.1" />
                <path d="M6.9,5.3c0-1.3,1-2.3,2.3-2.3h13.7c1.3,0,2.3,1,2.3,2.3v13.8c0,1.3-1,2.3-2.3,2.3" />
              </svg>
            </div>
          }
          contentType="group-assistants"
          onContentTypeChange={onContentTypeChange}
        />

        {addToolTab && (
          <SidebarSwitchItem
            icon={<IconBolt size={SIDEBAR_ICON_SIZE} />}
            contentType="tools"
            onContentTypeChange={onContentTypeChange}
          />
        )}
      </TabsList>

      <div className="flex flex-col items-center space-y-4">
        <WithTooltip
          display={<div>{t("Profile Settings")}</div>}
          trigger={<ProfileSettings />}
        />
      </div>
    </div>
  );
};
