"use client";
import { ContentType } from "@/types";
import { FC } from "react";
import { Input } from "../ui/input";
import { useTranslation } from "react-i18next";

interface SidebarSearchProps {
  contentType: ContentType;
  searchTerm: string;
  setSearchTerm: Function;
}

export const SidebarSearch: FC<SidebarSearchProps> = ({
  contentType: _contentType,
  searchTerm,
  setSearchTerm,
}) => {
  const { t } = useTranslation();

  // Determine the placeholder text based on the content type
  // const placeholderText =
  //   contentType === "custom_prompts" ? t("Search Group-prompts...") : `${t("Search")} ${contentType}...`

  return (
    <Input
      placeholder={t("Search...")}
      value={searchTerm}
      onChange={e => setSearchTerm(e.target.value)}
    />
  );
};
