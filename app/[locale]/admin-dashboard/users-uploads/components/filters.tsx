"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCalendar,
  IconFilter,
  IconUser,
  IconFileDescription,
} from "@tabler/icons-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { useState } from "react";

interface FilterOption {
  value: string;
  label: string;
}

interface FiltersProps {
  timeFilter: string;
  fileTypeFilter: string;
  userFilter: string;
  users: Array<{ user_id: string; display_name: string; username: string }>;
  onTimeFilterChange: (value: string) => void;
  onFileTypeFilterChange: (value: string) => void;
  onUserFilterChange: (value: string) => void;
  onResetFilters: () => void;
}

export default function Filters({
  timeFilter,
  fileTypeFilter,
  userFilter,
  users,
  onTimeFilterChange,
  onFileTypeFilterChange,
  onUserFilterChange,
  onResetFilters,
}: FiltersProps) {
  const { t } = useTranslation();
  const [openUserSelect, setOpenUserSelect] = useState(false);

  const timeFilterOptions: FilterOption[] = [
    { value: "day", label: t("Today") },
    { value: "week", label: t("This Week") },
    { value: "month", label: t("This Month") },
    { value: "year", label: t("This Year") },
  ];

  const fileTypeOptions: FilterOption[] = [
    { value: "all", label: t("All Types") },
    { value: "image", label: t("Images") },
    { value: "pdf", label: t("PDFs") },
    { value: "excel", label: t("Excel Files") },
    { value: "word", label: t("Word Documents") },
    { value: "powerpoint", label: t("PowerPoint") },
    { value: "zip", label: t("ZIP Archives") },
    { value: "text", label: t("Text Files") },
    { value: "other", label: t("Other") },
  ];

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex items-center space-x-2">
        <IconFilter className="size-5" />
        <h3 className="text-lg font-semibold">{t("Filters")}</h3>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Time Filter */}
        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium">
            <IconCalendar className="size-4" />
            <span>{t("Time Period")}</span>
          </label>
          <Select value={timeFilter} onValueChange={onTimeFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("Select time period")} />
            </SelectTrigger>
            <SelectContent>
              {timeFilterOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Type Filter */}
        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium">
            <IconFileDescription className="size-4" />
            <span>{t("File Type")}</span>
          </label>
          <Select value={fileTypeFilter} onValueChange={onFileTypeFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("Select file type")} />
            </SelectTrigger>
            <SelectContent>
              {fileTypeOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User Filter */}
        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium">
            <IconUser className="size-4" />
            <span>{t("User")}</span>
          </label>

          <Popover open={openUserSelect} onOpenChange={setOpenUserSelect}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between"
              >
                {userFilter === "all"
                  ? t("All Users")
                  : users.find(u => u.user_id === userFilter)?.display_name ||
                    users.find(u => u.user_id === userFilter)?.username ||
                    t("Select user")}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t("Search users...")} />
                <CommandList>
                  <CommandEmpty>{t("No users found.")}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        onUserFilterChange("all");
                        setOpenUserSelect(false);
                      }}
                    >
                      {t("All Users")}
                    </CommandItem>
                    {users.map(user => (
                      <CommandItem
                        key={user.user_id}
                        value={user.display_name || user.username}
                        onSelect={() => {
                          onUserFilterChange(user.user_id);
                          setOpenUserSelect(false);
                        }}
                      >
                        {user.display_name || user.username}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Reset Button */}
        <div className="space-y-2">
          <label className="text-sm font-medium opacity-0">{t("Reset")}</label>
          <Button variant="outline" onClick={onResetFilters} className="w-full">
            {t("Reset Filters")}
          </Button>
        </div>
      </div>
    </div>
  );
}
