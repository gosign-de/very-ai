"use client";

import {
  IconSettings,
  IconArrowLeft,
  IconShieldLock,
} from "@tabler/icons-react";
import {
  IconHome,
  IconRobotFace,
  IconUsers,
  IconUsersGroup,
  IconWebhook,
  IconFileUpload,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
function MainNav() {
  const currentPath = usePathname();
  const { t } = useTranslation();
  return (
    <nav>
      <ul className="flex flex-col gap-[8px]">
        <li>
          <Link
            href="/admin-dashboard"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard" ? "bg-accent" : ""}`}
          >
            <IconHome />
            <span>{t("Home")}</span>
          </Link>
        </li>

        <li>
          <Link
            href="/admin-dashboard/users"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/users" ? "bg-accent" : ""}`}
          >
            <IconUsers />
            <span>{t("Users")}</span>
          </Link>
        </li>

        <li>
          <Link
            href="/admin-dashboard/users-uploads"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/users-uploads" ? "bg-accent" : ""}`}
          >
            <IconFileUpload />
            <span>{t("Users Uploads")}</span>
          </Link>
        </li>

        <li>
          <Link
            href="/admin-dashboard/user-groups"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/user-groups" ? "bg-accent" : ""}`}
          >
            <IconUsersGroup />
            <span>{t("Groups")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/assistants"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/assistants" ? "bg-accent" : ""}`}
          >
            <IconRobotFace />
            <span>{t("Assistants")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/group-assistants"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/group-assistants" ? "bg-accent" : ""}`}
          >
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
            <span>{t("Group Assistants")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/n8n"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/n8n" ? "bg-accent" : ""}`}
          >
            <IconWebhook />
            <span>{t("n8n Integration")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/model-restrictions"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/model-restrictions" ? "bg-accent" : ""}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 3v18" />
              <path d="M15 9h6" />
              <path d="M15 15h6" />
            </svg>
            <span>{t("Model Restrictions")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/settings"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/settings" ? "bg-accent" : ""}`}
          >
            <IconSettings />
            <span>{t("Settings")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin-dashboard/data-loss-prevention"
            className={`hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none ${currentPath === "/admin-dashboard/data-loss-prevention" ? "bg-accent" : ""}`}
          >
            <IconShieldLock />
            <span>{t("Data Loss Prevention & PII")}</span>
          </Link>
        </li>
        <li>
          <Link
            href="/"
            className="hover:bg-accent focus:bg-accent group flex w-full cursor-pointer items-center gap-[8px] rounded p-2 hover:opacity-50 focus:outline-none"
          >
            <IconArrowLeft />
            <span>{t("Back to AI Interface")}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default MainNav;
