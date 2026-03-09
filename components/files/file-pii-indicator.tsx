"use client";

import { createClientLogger } from "@/lib/logger/client";
import { FC, useState, useEffect } from "react";
import { Shield, Loader2 } from "lucide-react";

const logger = createClientLogger({ component: "FilePiiIndicator" });
import { WithTooltip } from "@/components/ui/with-tooltip";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { PiiViewerDialog } from "./pii-viewer-dialog";

interface FilePiiIndicatorProps {
  fileId: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const FilePiiIndicator: FC<FilePiiIndicatorProps> = ({
  fileId,
  onClick,
}) => {
  const { t } = useTranslation();
  const [piiCount, setPiiCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadPiiCount();
  }, [fileId]);

  const loadPiiCount = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("file_items")
        .select("pii_entities")
        .eq("file_id", fileId);

      if (error) throw error;

      // Count total PII entities across all chunks
      const totalEntities = (data || []).reduce((sum, item) => {
        const entities = item.pii_entities || [];
        return sum + entities.length;
      }, 0);

      setPiiCount(totalEntities);
    } catch (error) {
      logger.error("Error loading PII count", { error: String(error) });
      setPiiCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
    setShowDialog(true);
  };

  // Don't show if no PII detected
  if (!loading && piiCount === 0) {
    return null;
  }

  // Show loading state
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin text-blue-500" />
        <span className="text-xs">{t("Checking...")}</span>
      </Badge>
    );
  }

  return (
    <>
      <WithTooltip
        delayDuration={0}
        side="top"
        display={
          <div className="text-sm">
            {t("This file contains PII. AI received masked version.")}
          </div>
        }
        trigger={
          <Badge
            variant="outline"
            className="hover:bg-muted cursor-pointer gap-1"
            onClick={handleClick}
          >
            <Shield className="size-3 text-green-500" />
            <span className="text-xs">
              {t("PII Protected")} ({piiCount})
            </span>
          </Badge>
        }
      />

      <PiiViewerDialog
        fileId={fileId}
        open={showDialog}
        onOpenChange={setShowDialog}
        showTrigger={false}
      />
    </>
  );
};
