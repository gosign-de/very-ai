"use client";
import Stat from "./Stat";
import { IconSend } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

function Stats({ totalRequests }) {
  const searchParams = useSearchParams();
  const period = searchParams.get("last") || "this_month";
  const { t } = useTranslation();

  // Define period labels
  const periodLabels = {
    today: t("Today's Requests"),
    this_month: t("This Month's Requests"),
    last_month: t("Last Month's Requests"),
    this_year: t("This Year's Requests"),
    last_year: t("Last Year's Requests"),
  };

  const title = periodLabels[period] || t("Requests");

  return (
    <>
      <Stat title={title} icon={<IconSend />} value={totalRequests} />
    </>
  );
}

export default Stats;
