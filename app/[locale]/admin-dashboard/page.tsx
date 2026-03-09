"use client";

import DashboardFilter from "./ui/DashboardFilter";
import DashboardLayout from "./ui/DashboardLayout";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between">
        <h1 className="-xl:basis-full -xl:mb-6 text-3xl font-bold">
          {t("Dashboard")}
        </h1>
        <DashboardFilter />
      </div>
      <DashboardLayout />
    </>
  );
}
