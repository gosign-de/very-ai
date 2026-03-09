"use client";

import React, { useContext } from "react";
import {
  IconBolt,
  IconCircleFilled,
  IconFileText,
  IconWriting,
  IconWorld,
  IconWorldSearch,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ImageGenerationPlaceholder from "./ImageGenerationPlaceholder";
import { ChatbotUIContext } from "@/context/context";

const ToolInUse = ({ role, isLast }) => {
  const { toolInUse, isGenerating } = useContext(ChatbotUIContext);
  const { t } = useTranslation();

  // Return null if not generating or role is not "assistant"
  if (!isGenerating || role !== "assistant" || !isLast) return null;

  const renderContent = () => {
    switch (toolInUse) {
      case "none":
        return <IconCircleFilled className="animate-pulse" size={20} />;
      case "retrieval":
        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconFileText size={20} />
            <div>{t("Searching files...")}</div>
          </div>
        );
      case "image":
        return <ImageGenerationPlaceholder />;
      case "pdf":
        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconWriting size={20} />
            <div>{t("Generating your pdf...")}</div>
          </div>
        );
      case "websearch":
        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconWorld size={20} />
            <div>{t("Searching the web...")}</div>
          </div>
        );
      case "crawler":
        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconWorldSearch size={20} />
            <div>{t("Crawling website...")}</div>
          </div>
        );
      case "Format File":
      case "format_file":
        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconFileText size={20} />
            <div>{t("Analyzing file...")}</div>
          </div>
        );
      default:
        // Handle dynamic batch processing messages
        if (toolInUse.startsWith("Processing your file")) {
          return (
            <div className="text-shimmer flex items-center space-x-2">
              <IconFileText size={20} />
              <div>{toolInUse}...</div>
            </div>
          );
        } else if (toolInUse.startsWith("Analyzing batch")) {
          return (
            <div className="text-shimmer flex items-center space-x-2">
              <IconFileText size={20} />
              <div>{toolInUse}...</div>
            </div>
          );
        } else if (toolInUse === "Synthesizing results") {
          return (
            <div className="text-shimmer flex items-center space-x-2">
              <IconBolt size={20} />
              <div>{t("Synthesizing results...")}</div>
            </div>
          );
        }

        return (
          <div className="text-shimmer flex items-center space-x-2">
            <IconBolt size={20} />
            <div>
              {t("Using")} {toolInUse}...
            </div>
          </div>
        );
    }
  };

  return <>{renderContent()}</>;
};

export default ToolInUse;
