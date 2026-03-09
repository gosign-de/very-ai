"use client";
import { ChatbotUIContext } from "@/context/context";
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconRepeat,
  IconPin,
  IconPinned,
} from "@tabler/icons-react";
import { FC, useContext, useEffect, useState } from "react";
import { WithTooltip } from "../ui/with-tooltip";
import { useTranslation } from "react-i18next";

export const MESSAGE_ICON_SIZE = 18;

interface MessageActionsProps {
  isAssistant: boolean;
  isLast: boolean;
  isEditing: boolean;
  isHovering: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onPin: () => void;
  isPinned: boolean;
}

export const MessageActions: FC<MessageActionsProps> = ({
  isAssistant,
  isLast,
  isEditing,
  isHovering,
  onCopy,
  onEdit,
  onRegenerate,
  onPin,
  isPinned,
}) => {
  const { t } = useTranslation();

  const { isGenerating } = useContext(ChatbotUIContext);

  const [showCheckmark, setShowCheckmark] = useState(false);

  const handleCopy = () => {
    onCopy();
    setShowCheckmark(true);
  };

  const _handleForkChat = async () => {};

  useEffect(() => {
    if (showCheckmark) {
      const timer = setTimeout(() => {
        setShowCheckmark(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [showCheckmark]);

  return (isLast && isGenerating) || isEditing ? null : (
    <div className="text-muted-foreground flex items-center space-x-2">
      {/* {((isAssistant && isHovering) || isLast) && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>Fork Chat</div>}
          trigger={
            <IconGitFork
              className="cursor-pointer hover:opacity-50"
              size={MESSAGE_ICON_SIZE}
              onClick={handleForkChat}
            />
          }
        />
      )} */}

      {!isAssistant && isHovering && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>{t("Edit")}</div>}
          trigger={
            <IconEdit
              className="cursor-pointer hover:opacity-50"
              size={MESSAGE_ICON_SIZE}
              onClick={onEdit}
            />
          }
        />
      )}

      {(isHovering || isLast) && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>{t("Copy")}</div>}
          trigger={
            showCheckmark ? (
              <IconCheck size={MESSAGE_ICON_SIZE} />
            ) : (
              <IconCopy
                className="cursor-pointer hover:opacity-50"
                size={MESSAGE_ICON_SIZE}
                onClick={handleCopy}
              />
            )
          }
        />
      )}

      {isLast && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>{t("Regenerate")}</div>}
          trigger={
            <IconRepeat
              className="cursor-pointer hover:opacity-50"
              size={MESSAGE_ICON_SIZE}
              onClick={onRegenerate}
            />
          }
        />
      )}

      {/* {(isHovering || isLast) && (
        <WithTooltip
          delayDuration={1000}
          side="bottom"
          display={<div>{t("Pin")}</div>}
          trigger={
            <IconPin
              className="cursor-pointer hover:opacity-50"
              size={MESSAGE_ICON_SIZE}
              onClick={onPin}
            />
          }
        />
      )} */}

      {(isLast && isGenerating) || isEditing ? null : (
        <div className="text-muted-foreground flex items-center space-x-2">
          {/* Pin/Unpin Message */}
          {(isHovering || isLast) && (
            <WithTooltip
              delayDuration={1000}
              side="bottom"
              display={<div>{isPinned ? t("Unpin") : t("Pin")}</div>}
              trigger={
                isPinned ? (
                  <IconPinned
                    className="cursor-pointer hover:opacity-50"
                    size={MESSAGE_ICON_SIZE}
                    onClick={onPin}
                  />
                ) : (
                  <IconPin
                    className="cursor-pointer hover:opacity-50"
                    size={MESSAGE_ICON_SIZE}
                    onClick={onPin}
                  />
                )
              }
            />
          )}
        </div>
      )}
    </div>
  );
};
