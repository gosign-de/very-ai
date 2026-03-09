"use client";

import { createClientLogger } from "@/lib/logger/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const logger = createClientLogger({ component: "PiiViewerDialog" });
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, AlertCircle, ShieldCheck } from "lucide-react";
import { FC, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "react-i18next";

interface PiiEntity {
  text: string;
  category: string;
  subcategory?: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

interface FileItem {
  id: string;
  content: string;
  original_content: string | null;
  pii_entities: PiiEntity[] | null;
}

interface PiiViewerDialogProps {
  fileId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export const PiiViewerDialog: FC<PiiViewerDialogProps> = ({
  fileId,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}) => {
  const { t } = useTranslation();
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const supabase = createClient();

  // Use controlled or internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    if (!open || !fileId) return;

    const loadFileItems = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("file_items")
          .select("id, content, original_content, pii_entities")
          .eq("file_id", fileId);

        if (error) throw error;
        setFileItems(data || []);
      } catch (error) {
        logger.error("Error loading file items", { error: String(error) });
      } finally {
        setLoading(false);
      }
    };

    loadFileItems();
  }, [open, fileId]);

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      Person: "bg-blue-500",
      Email: "bg-purple-500",
      PhoneNumber: "bg-green-500",
      Address: "bg-yellow-500",
      SSN: "bg-red-500",
      CreditCard: "bg-orange-500",
      Organization: "bg-cyan-500",
      DateTime: "bg-pink-500",
      URL: "bg-indigo-500",
      IPAddress: "bg-teal-500",
    };
    return colors[category] || "bg-gray-500";
  };

  const hasPiiData = fileItems.some(
    item => item.pii_entities && item.pii_entities.length > 0,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Eye className="size-4" />
            {t("View PII")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[80vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-green-500" />
            {t("PII Detection Results")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "This shows personally identifiable information detected in your file and the redacted version.",
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="border-primary size-8 animate-spin rounded-full border-b-2"></div>
          </div>
        ) : !hasPiiData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShieldCheck className="mb-4 size-12 text-green-500" />
            <p className="text-lg font-medium">{t("No PII Detected")}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {t(
                "This file appears to be free of personally identifiable information.",
              )}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {fileItems.map((item, index) => {
                const entities = item.pii_entities || [];
                if (entities.length === 0) return null;

                return (
                  <div
                    key={item.id}
                    className="space-y-4 rounded-lg border p-4"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-5 text-yellow-500" />
                      <div className="flex-1">
                        <h3 className="mb-2 font-semibold">
                          {t("Chunk")} {index + 1}
                        </h3>

                        {/* Detected Entities */}
                        <div className="mb-4">
                          <p className="mb-2 text-sm font-medium">
                            {t("Detected PII Categories")}:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {entities.map((entity, idx) => (
                              <Badge
                                key={idx}
                                className={`${getCategoryColor(entity.category)} text-white`}
                              >
                                {entity.category}
                                {entity.subcategory &&
                                  ` - ${entity.subcategory}`}
                                <span className="ml-1 text-xs opacity-75">
                                  ({Math.round(entity.confidenceScore * 100)}%)
                                </span>
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Original Content */}
                        <div className="space-y-2">
                          <p className="text-muted-foreground text-sm font-medium">
                            {t("Original Content")}:
                          </p>
                          <div className="bg-muted/50 whitespace-pre-wrap rounded border-l-4 border-red-500 p-3 text-sm">
                            {item.original_content || item.content}
                          </div>
                        </div>

                        {/* Redacted Content */}
                        {item.content && (
                          <div className="mt-4 space-y-2">
                            <p className="text-muted-foreground text-sm font-medium">
                              {t("Redacted Content")}:
                            </p>
                            <div className="whitespace-pre-wrap rounded border-l-4 border-green-500 bg-green-500/10 p-3 text-sm">
                              {item.content}
                            </div>
                          </div>
                        )}

                        {/* Entity Details */}
                        <div className="mt-4">
                          <p className="mb-2 text-sm font-medium">
                            {t("Detected Entities")}:
                          </p>
                          <div className="space-y-2">
                            {entities.map((entity, idx) => (
                              <div
                                key={idx}
                                className="bg-muted/30 flex items-start gap-2 rounded p-2 text-sm"
                              >
                                <Badge
                                  variant="outline"
                                  className="mt-0.5 shrink-0"
                                >
                                  {idx + 1}
                                </Badge>
                                <div className="flex-1">
                                  <span className="rounded bg-yellow-200 px-1 font-mono dark:bg-yellow-900">
                                    &apos;{entity.text}&apos;
                                  </span>
                                  <div className="text-muted-foreground mt-1 text-xs">
                                    Category: {entity.category}
                                    {entity.subcategory &&
                                      ` (${entity.subcategory})`}{" "}
                                    | Confidence:{" "}
                                    {Math.round(entity.confidenceScore * 100)}%
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
