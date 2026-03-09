"use client";

import { FC, useState } from "react";
import { Eye, EyeOff, Shield, ShieldAlert, Loader2 } from "lucide-react";
import { WithTooltip } from "@/components/ui/with-tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface PiiEntity {
  text: string;
  category: string;
  subcategory?: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

interface MessagePiiIndicatorProps {
  messageId: string;
  originalContent: string;
  redactedContent: string | null;
  piiEntities: PiiEntity[] | null;
  role: "user" | "assistant";
  isProcessing?: boolean;
}

export const MessagePiiIndicator: FC<MessagePiiIndicatorProps> = ({
  messageId: _messageId,
  originalContent,
  redactedContent,
  piiEntities,
  role,
  isProcessing = false,
}) => {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);

  const hasPii = piiEntities && piiEntities.length > 0;

  // Show loading state when processing
  if (isProcessing) {
    return (
      <Badge variant="outline" className="gap-1.5 rounded-full px-2.5 py-1">
        <Loader2 className="size-3 animate-spin text-blue-500" />
        <span className="text-xs">
          {t("Checking for sensitive information...")}
        </span>
      </Badge>
    );
  }

  if (!hasPii || !redactedContent) {
    return null;
  }

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

  return (
    <>
      {/* PII Protected Badge */}
      <WithTooltip
        delayDuration={0}
        side="top"
        display={
          <div className="text-sm">
            {role === "user"
              ? t("This message contains PII. AI received masked version.")
              : t("This response was re-identified from AI's masked output.")}
          </div>
        }
        trigger={
          <Badge
            variant="outline"
            className="hover:bg-muted cursor-pointer gap-1.5 rounded-full px-2.5 py-1"
            onClick={() => setShowDialog(true)}
          >
            <Shield className="size-3 text-green-500" />
            <span className="text-xs">
              {t("PII Protected")} ({piiEntities.length})
            </span>
          </Badge>
        }
      />

      {/* PII Details Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-yellow-500" />
              {t("PII Protection Details")}
            </DialogTitle>
            <DialogDescription>
              {role === "user"
                ? t(
                    "Your message contained personally identifiable information. The AI received a masked version.",
                  )
                : t(
                    "This AI response has been re-identified with your original information.",
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Detected PII Categories */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {t("Detected PII Categories")}:
              </h3>
              <div className="flex flex-wrap gap-2">
                {piiEntities.map((entity, idx) => (
                  <Badge
                    key={idx}
                    className={`${getCategoryColor(entity.category)} text-white`}
                  >
                    {entity.category}
                    {entity.subcategory && ` - ${entity.subcategory}`}
                    <span className="ml-1 text-xs opacity-75">
                      ({Math.round(entity.confidenceScore * 100)}%)
                    </span>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Original Content */}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4" />
                {role === "user"
                  ? t("Your Original Message")
                  : t("Re-identified Response")}
                :
              </h3>
              <div className="whitespace-pre-wrap rounded-lg border-l-4 border-red-500 bg-red-500/10 p-3 text-sm">
                {originalContent}
              </div>
            </div>

            {/* Masked Content */}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <EyeOff className="size-4" />
                {role === "user"
                  ? t("What AI Received (Masked)")
                  : t("Original AI Response (Masked)")}
                :
              </h3>
              <div className="whitespace-pre-wrap rounded-lg border-l-4 border-green-500 bg-green-500/10 p-3 text-sm">
                {redactedContent}
              </div>
            </div>

            {/* Entity Details */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {t("Detected Entities")}:
              </h3>
              <div className="space-y-2">
                {piiEntities.map((entity, idx) => (
                  <div
                    key={idx}
                    className="bg-muted/30 flex items-start gap-2 rounded p-2 text-sm"
                  >
                    <Badge variant="outline" className="mt-0.5 shrink-0">
                      {idx + 1}
                    </Badge>
                    <div className="flex-1">
                      <span className="rounded bg-yellow-200 px-1 font-mono dark:bg-yellow-900">
                        &apos;{entity.text}&apos;
                      </span>
                      <div className="text-muted-foreground mt-1 text-xs">
                        Category: {entity.category}
                        {entity.subcategory && ` (${entity.subcategory})`} |
                        Confidence: {Math.round(entity.confidenceScore * 100)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
