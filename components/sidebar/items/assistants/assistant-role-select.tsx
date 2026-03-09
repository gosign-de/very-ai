"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FC, useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { IconChevronDown, IconCircleCheckFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface AssistantRoleSelectProps {
  selectedAssistantRole: string;
  onAssistantRoleSelect: (role: string) => void;
}

const roles = [
  {
    name: "sharepoint-proj-crm-system-ext",
    groupId: "501e0055-b31f-4d59-85c7-ea1c1f2f2e88",
  },
  {
    name: "pdf_merger",
    groupId: null,
  },
  {
    name: "signature-assistant",
    groupId: null,
  },
];

export const AssistantRoleSelect: FC<AssistantRoleSelectProps> = ({
  selectedAssistantRole,
  onAssistantRoleSelect,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [userGroupIds, setUserGroupIds] = useState<string[]>([]);

  // Fetch session using useSession
  const { data: session } = useSession();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // Focus on input when dropdown opens
    }
  }, [isOpen]);

  useEffect(() => {
    if (session && session.user.groups) {
      const userGroupIds = session.user.groups.map((group: any) => group.id);
      // console.log("User group ids: ", userGroupIds)
      setUserGroupIds(userGroupIds); // Store all group IDs
    }
  }, [session]);

  const handleRoleSelect = (role: string) => {
    onAssistantRoleSelect(role);
    setIsOpen(false);
  };

  const filteredRoles = roles.filter(role => {
    const matchesGroup = !role.groupId || userGroupIds.includes(role.groupId); // Allow roles without groupId for everyone

    return (
      matchesGroup && role.name.toLowerCase().includes(search.toLowerCase()) // Apply search filter
    );
  });

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={isOpen => {
        setIsOpen(isOpen);
        setSearch("");
      }}
    >
      <DropdownMenuTrigger
        className="bg-background w-full justify-start border-2 px-3 py-5"
        asChild
      >
        <Button
          ref={triggerRef}
          className="flex items-center justify-between"
          variant="ghost"
        >
          <div className="flex items-center">
            <div className="ml-2 flex items-center capitalize">
              {selectedAssistantRole
                ? t(selectedAssistantRole)
                : t("Select a role")}
            </div>
          </div>
          <IconChevronDown />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        style={{ width: triggerRef.current?.offsetWidth }}
        className="space-y-2 overflow-auto p-2"
        align="start"
      >
        <Input
          ref={inputRef}
          placeholder={t("Search roles...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
        />

        {filteredRoles.map(role => (
          <AssistantRoleItem
            key={role.name}
            role={role.name}
            selected={selectedAssistantRole === role.name}
            onSelect={handleRoleSelect}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface AssistantRoleItemProps {
  role: string;
  selected: boolean;
  onSelect: (role: string) => void;
}

const AssistantRoleItem: FC<AssistantRoleItemProps> = ({
  role,
  selected,
  onSelect,
}) => {
  const handleSelect = () => {
    onSelect(role);
  };

  return (
    <div
      className="flex cursor-pointer items-center justify-between py-0.5 hover:opacity-50"
      onClick={handleSelect}
    >
      <div className="truncate capitalize">{role}</div>
      {selected && (
        <IconCircleCheckFilled size={20} className="min-w-[30px] flex-none" />
      )}
    </div>
  );
};
