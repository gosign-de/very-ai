"use client";

import TopUsersItem from "./TopUsersItem";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

function TopUsers({ usersActivity }) {
  const searchParams = useSearchParams();
  const period = searchParams.get("last") || "this_month";
  const { t } = useTranslation();

  // Define the mapping of values to labels
  const labelMapping = {
    today: t("Today"),
    this_month: t("This Month"),
    last_month: t("Last Month"),
    this_year: t("This Year"),
    last_year: t("Last Year"),
  };

  // Determine the label based on the URL parameter
  const currentLabel = labelMapping[period] || t("This Month");

  // Create appropriate no-activity message based on period
  const getNoActivityMessage = () => {
    switch (period) {
      case "today":
        return t("No activity today...");
      case "this_month":
        return t("No activity this month...");
      case "last_month":
        return t("No activity last month...");
      case "this_year":
        return t("No activity this year...");
      case "last_year":
        return t("No activity last year...");
      default:
        return t("No requests found...");
    }
  };

  return (
    <div className="bg-muted -xl:col-span-full col-span-2 row-start-2 row-end-3 flex flex-col gap-6 rounded-md border px-8 py-6">
      <p className="text-xl font-bold">
        {currentLabel} {t("Requests")}
      </p>
      {usersActivity?.length > 0 ? (
        <ul className="overflow-x-hidden">
          {usersActivity.map(activity => (
            <TopUsersItem activity={activity} key={activity.user_id} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-center text-xl font-medium">
          {getNoActivityMessage()}
        </p>
      )}
    </div>
  );
}

export default TopUsers;
