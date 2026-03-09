"use client";

import { createClientLogger } from "@/lib/logger/client";
import { cn } from "@/lib/utils";
import { ContentType, DataItemType } from "@/types";
import { FC, useEffect, useRef, useState } from "react";
import { SidebarUpdateItem, CustomSidebarUpdate } from "./sidebar-update-item";

import { getAllAzureGroups } from "@/db/azure_groups";
import { useSession } from "next-auth/react";
import GroupState from "@/components/GroupState";
import { differenceInDays } from "date-fns";
import { useTranslation } from "react-i18next";

const logger = createClientLogger({ component: "SidebarDisplayItem" });

interface SidebarItemProps {
  item: DataItemType;
  isTyping: boolean;
  contentType: ContentType;
  icon: React.ReactNode;
  updateState: any;
  renderInputs: (renderState: any) => React.ReactNode;
}

export const SidebarItem: FC<SidebarItemProps> = ({
  item,
  contentType,
  updateState,
  renderInputs,
  icon,
  isTyping,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  const [_isHovering, setIsHovering] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      itemRef.current?.click();
    }
  };

  return (
    <>
      {
        <SidebarUpdateItem
          item={item}
          isTyping={isTyping}
          contentType={contentType}
          updateState={updateState}
          renderInputs={renderInputs}
        >
          <div
            ref={itemRef}
            className={cn(
              "hover:bg-accent cb-space flex w-full cursor-pointer items-center rounded hover:opacity-50 focus:outline-none",
            )}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {icon}

            <div className="ml-3 max-w-[120px] flex-1 truncate text-sm font-semibold sm:max-w-[160px]">
              {item.name}
            </div>
          </div>
        </SidebarUpdateItem>
      }
    </>
  );
};
interface CustomSidebarItemProps {
  item: DataItemType;
  isTyping: boolean;
  contentType: ContentType;
  icon: React.ReactNode;
  updateState: any;
  userId: string;
  groupIds: string[];
  acceptGroup?: string | null;
  renderInputs: (renderState: any) => React.ReactNode;
}
export const CustomSidebarItem: FC<CustomSidebarItemProps> = ({
  item,
  contentType,
  updateState,
  renderInputs,
  icon,
  acceptGroup,
  isTyping,
}) => {
  const { t } = useTranslation();

  const category = getCategoryFromDate(item.created_at);
  const [lastCategory, setLastCategory] = useState(null);
  const [lastGroupName, setLastGroupName] = useState(null);

  const { data: session } = useSession();

  const itemRef = useRef<HTMLDivElement>(null);

  const [_isHovering, setIsHovering] = useState(false);
  const [azureGroups, setAzureGroups] = useState<any[]>([]);
  const [_loadingGroups, setLoadingGroups] = useState(true);
  const [_errorGroups, setErrorGroups] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    GroupState.getSelectedGroup(),
  );
  acceptGroup = selectedGroup;

  const groupName =
    azureGroups.length > 0
      ? azureGroups.find(group => group.group_id === acceptGroup)?.name
      : t("Group has No Prompts");

  useEffect(() => {
    if (lastCategory !== category) {
      setLastCategory(category);
    }
    if (lastGroupName !== groupName) {
      setLastGroupName(groupName);
    }
  }, [category, groupName]);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const azureGroups = await getAllAzureGroups();
        const sessionGroupIds =
          session?.user?.groups.map(group => group.id) || [];
        const filteredGroups = azureGroups.filter(
          (group: { group_id: string }) =>
            sessionGroupIds.includes(group.group_id),
        );
        setAzureGroups(filteredGroups);
        setLoadingGroups(false);
      } catch (error) {
        logger.error("Error fetching Azure groups", { error: String(error) });
        setErrorGroups(t("Failed to fetch groups"));
        setLoadingGroups(false);
      }
    };

    if (session) {
      fetchGroups();
    }
  }, [session]);

  useEffect(() => {
    const updateSelectedGroup = (group: string | null) => {
      setSelectedGroup(group);
    };

    GroupState.subscribe(updateSelectedGroup);

    return () => {
      GroupState.unsubscribe(updateSelectedGroup);
    };
  }, []);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      itemRef.current?.click();
    }
  };

  function getCategoryFromDate(created_at) {
    const today = new Date();
    const created = new Date(created_at);
    const diffDays = differenceInDays(today, created);

    if (diffDays === 0) {
      return t("Today");
    } else if (diffDays === 1) {
      return t("Yesterday");
    } else if (diffDays <= 7) {
      return t("Previous Week");
    } else {
      return t("Older");
    }
  }

  return (
    <CustomSidebarUpdate
      item={item}
      isTyping={isTyping}
      contentType={contentType}
      updateState={updateState}
      renderInputs={renderInputs}
    >
      {(item as any).group_id === acceptGroup && (
        <div
          ref={itemRef}
          className={cn(
            "hover:bg-accent flex w-full cursor-pointer flex-col rounded p-2 hover:opacity-50 focus:outline-none",
          )}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div className="text-sm font-semibold text-gray-500">
            {azureGroups.length > 0 ? (
              azureGroups
                .filter(group => group.group_id === acceptGroup)
                .map((group, index) => <div key={index}>{group.name}</div>)
            ) : (
              <div className="text-sm text-gray-500">
                {t("Group has No Prompts")}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {icon}
            <div className="ml-3 max-w-[120px] flex-1 truncate text-sm font-semibold sm:max-w-[160px]">
              {item.name}
            </div>
          </div>
        </div>
      )}
    </CustomSidebarUpdate>
  );
};

export default CustomSidebarItem;
