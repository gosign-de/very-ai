"use client";

import UserItem from "./UserItem";
import Pagination from "../ui/Pagination";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

function UserStats({ userStats }) {
  const searchParams = useSearchParams();
  const period = searchParams.get("last") || "all_time";
  const { t } = useTranslation();

  // Create appropriate no-activity message based on period
  const getNoActivityMessage = () => {
    switch (period) {
      case "today":
        return t("No activity today...");
      case "last_month":
        return t("No activity in the last 30 days...");
      case "last_year":
        return t("No activity in the last year...");
      case "previous_year":
        return t("No activity in the previous year...");
      case "all_time":
        return t("No activity found...");
      default:
        return t("No activity found...");
    }
  };

  return (
    <div
      className="bg-grey border-table overflow-hidden rounded-[7px] border text-[1.4rem]"
      role="table"
    >
      <header className="grid grid-cols-[2fr_1fr_3fr] gap-6 px-6 py-4 text-sm font-bold uppercase tracking-wide">
        <div>{t("EMAIL")}</div>
        <div>{t("REQUESTS")}</div>
        <div>{t("LAST SIGN IN")}</div>
      </header>

      <section className="bg-background">
        {userStats?.length > 0 ? (
          userStats.map(user => <UserItem user={user} key={user.user_id} />)
        ) : (
          <p className="mt-2 text-center text-xl font-medium">
            {getNoActivityMessage()}
          </p>
        )}
      </section>
      <Pagination count={userStats[0].total_count} />
    </div>
  );
}

export default UserStats;
