"use client";

import { FC } from "react";
import { useTranslation } from "react-i18next";

interface FinishStepProps {
  displayName: string;
}

export const FinishStep: FC<FinishStepProps> = ({ displayName }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        {t("Welcome to Gosign AI Chatbot")}
        {displayName.length > 0 ? `, ${displayName.split(" ")[0]}` : null}!
      </div>

      <div>{t("Click next to start chatting.")}</div>
    </div>
  );
};
