"use client";

import { useTranslation } from "react-i18next";
import UserAnalyticsDashboard from "./components/dashboard-widgets";
import UserList from "./components/user-list";

export default function Users() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("User Analytics")}</h1>
      </div>
      <UserAnalyticsDashboard />
      <UserList />
    </div>
  );
}
