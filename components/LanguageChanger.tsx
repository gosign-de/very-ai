"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { IconChevronDown } from "@tabler/icons-react";
import i18nConfig from "@/i18nConfig";

export default function LanguageChanger() {
  const { i18n } = useTranslation();
  const currentLocale = i18n.language;
  const router = useRouter();
  const currentPathname = usePathname();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;

    // Set cookie for next-i18n-router
    const days = 30;
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = date.toUTCString();
    document.cookie = `NEXT_LOCALE=${newLocale};expires=${expires};path=/`;

    // Redirect to the new locale path
    if (
      currentLocale === i18nConfig.defaultLocale &&
      !i18nConfig.prefixDefault
    ) {
      router.push("/" + newLocale + currentPathname);
    } else {
      router.push(
        currentPathname.replace(`/${currentLocale}`, `/${newLocale}`),
      );
    }

    router.refresh();
  };

  return (
    <div className="relative w-full">
      <select
        onChange={handleChange}
        value={currentLocale}
        className="appearance-none border-input bg-background hover:bg-muted/50 h-10 w-full rounded-md border px-4 pr-10 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
        <IconChevronDown size={18} />
      </span>
    </div>
  );
}
