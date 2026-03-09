"use client";
import { useTranslation } from "react-i18next";

function NoAccess() {
  const { t } = useTranslation();

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="mb-3 mt-2 text-4xl font-bold text-red-500">
        {t("You do not have access to this resource")}
      </div>
    </div>
  );
}

export default NoAccess;
