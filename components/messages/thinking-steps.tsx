"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useEffect, useState, useContext } from "react";

const logger = createClientLogger({ component: "ThinkingSteps" });
import { IconLoader2, IconCheck, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ChatbotUIContext } from "@/context/context";
import { updateMessage } from "@/db/messages";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/browser-client";
import { formatSignatureAnalysisResponse } from "@/lib/formatting/signature-result-formatter";

interface ThinkingStepsProps {
  executionId: string;
  messageId: string;
  showResultInline?: boolean;
  fileName?: string;
}

export const ThinkingSteps = ({
  executionId,
  messageId,
  showResultInline = false,
  fileName: _fileName,
}: ThinkingStepsProps) => {
  const { t } = useTranslation();
  const { setChatMessages } = useContext(ChatbotUIContext);
  const [steps, setSteps] = useState<any[]>([]);
  const [status, setStatus] = useState("running");
  const [isExpanded, setIsExpanded] = useState(true);
  const [_result, setResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [inlineContent, setInlineContent] = useState<string | null>(null);
  const [completionHandled, setCompletionHandled] = useState(false);

  // Scroll to bottom when steps update
  useEffect(() => {
    // Only scroll if status is running and we're not showing inline content
    if (status === "running" && !showResultInline) {
      // Wait a bit for DOM to update, then scroll
      const timer = setTimeout(() => {
        const messagesEnd = document.querySelector("[data-messages-end]");
        if (messagesEnd) {
          messagesEnd.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [steps, currentStep, status, showResultInline]);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expand/collapse toggle
    setIsCancelling(true);

    try {
      await supabase.rpc("update_execution_from_callback", {
        p_execution_id: executionId,
        p_status: "cancelled",
        p_error_message: "Cancelled by user",
      });

      setStatus("cancelled");

      // Update message content
      const newContent = t("Request cancelled by user.");
      await updateMessage(messageId, { content: newContent });

      setChatMessages(prev =>
        prev.map(msg =>
          msg.message.id === messageId
            ? { ...msg, message: { ...msg.message, content: newContent } }
            : msg,
        ),
      );
    } catch (error) {
      logger.error("Failed to cancel", { error: String(error) });
    } finally {
      setIsCancelling(false);
    }
  };

  // Helper to extract content from result (handles various formats from n8n)
  const extractContent = (res: any): string => {
    if (res === null || res === undefined) return "";
    if (typeof res === "string") return res;
    // Detect signature analysis results
    if (
      typeof res === "object" &&
      (res.signatures_report ||
        res.role_estimation ||
        res.total_detected_locations !== undefined)
    ) {
      return formatSignatureAnalysisResponse(res);
    }
    if (typeof res === "object" && res.content)
      return extractContent(res.content);
    if (typeof res === "object" && res.raw_summary)
      return extractContent(res.raw_summary);
    // Handle n8n response format where result might be nested
    if (typeof res === "object" && res.result)
      return extractContent(res.result);
    if (typeof res === "object" && res.data) return extractContent(res.data);
    if (typeof res === "object" && res.output)
      return extractContent(res.output);
    if (typeof res === "object" && res.response)
      return extractContent(res.response);
    if (typeof res === "object" && res.text) return extractContent(res.text);
    if (typeof res === "object" && res.message)
      return extractContent(res.message);
    if (Array.isArray(res)) {
      if (res.length === 0) return "";
      if (res.length === 1) return extractContent(res[0]);
      return res
        .map(item => extractContent(item))
        .filter(Boolean)
        .join("\n\n");
    }
    return JSON.stringify(res, null, 2);
  };

  // Helper to fetch latest steps
  const fetchSteps = async () => {
    const { data: stepsData } = await supabase
      .from("n8n_workflow_steps")
      .select("*")
      .eq("execution_id", executionId)
      .order("step_number", { ascending: true });

    if (stepsData) {
      setSteps(stepsData);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    const fetchInitial = async () => {
      const { data: execution } = await supabase
        .from("n8n_workflow_executions")
        .select("*, n8n_workflow_steps(*)")
        .eq("id", executionId)
        .single();

      if (execution && isMounted) {
        setStatus(execution.status);
        setSteps(execution.n8n_workflow_steps || []);
        setResult(execution.result);
        setErrorMessage(execution.error_message);
        setCurrentStep(execution.current_step || 0);

        // If already completed, handle it immediately
        if (execution.status === "completed" && !completionHandled) {
          const newContent = extractContent(execution.result);

          if (showResultInline && newContent) {
            // For multi-file mode, just show result inline
            setInlineContent(newContent);
            setCompletionHandled(true);
          } else if (!showResultInline) {
            // For single file mode, update the message content
            await updateMessage(messageId, { content: newContent });
            setChatMessages(prev =>
              prev.map(msg =>
                msg.message.id === messageId
                  ? { ...msg, message: { ...msg.message, content: newContent } }
                  : msg,
              ),
            );
          }
        }
      }
    };
    fetchInitial();

    // Subscribe to BOTH execution changes AND step changes
    const channel = supabase
      .channel(`execution-${executionId}`)
      // Listen to execution updates (for status changes)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "n8n_workflow_executions",
          filter: `id=eq.${executionId}`,
        },
        async payload => {
          if (!isMounted) return;
          const execution = payload.new as any;

          setStatus(execution.status);
          setResult(execution.result);
          setErrorMessage(execution.error_message);
          setCurrentStep(execution.current_step || 0);

          // Handle completion
          if (
            ["completed", "error", "timeout", "cancelled"].includes(
              execution.status,
            )
          ) {
            // Final fetch of steps
            await fetchSteps();

            channel.unsubscribe();

            if (execution.status === "completed") {
              const newContent = extractContent(execution.result);

              if (showResultInline && newContent) {
                // For multi-file mode, just show result inline
                setInlineContent(newContent);
                setCompletionHandled(true);
              } else if (!showResultInline) {
                // For single file mode, update the message content and mark as completed
                // We set completed: true in pin_metadata so message.tsx knows not to render ThinkingSteps
                const completedMetadata = JSON.stringify({
                  n8n_direct_mode: true,
                  completed: true,
                });

                await updateMessage(messageId, {
                  content: newContent,
                  pin_metadata: completedMetadata,
                });

                setChatMessages(prev =>
                  prev.map(msg =>
                    msg.message.id === messageId
                      ? {
                          ...msg,
                          message: {
                            ...msg.message,
                            content: newContent,
                            pin_metadata: completedMetadata,
                          },
                        }
                      : msg,
                  ),
                );
                setCompletionHandled(true);
              }
            }
          }
        },
      )
      // Listen to step inserts/updates directly
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "n8n_workflow_steps",
          filter: `execution_id=eq.${executionId}`,
        },
        async _payload => {
          if (!isMounted) return;
          await fetchSteps();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [executionId, messageId, setChatMessages, showResultInline, t]);

  // Fallback: Run if it's still running
  useEffect(() => {
    if (completionHandled) return;
    // If status is err/timeout/cancelled, just show error state
    if (["error", "timeout", "cancelled"].includes(status)) return;

    const intervalId = setInterval(async () => {
      const { data: execution } = await supabase
        .from("n8n_workflow_executions")
        .select("status, result")
        .eq("id", executionId)
        .single();

      if (execution) {
        // Also fetch steps occasionally to ensure sync
        if (
          execution.status === "running" ||
          execution.status === "processing"
        ) {
          await fetchSteps();
        }

        // Sync status immediately
        if (execution.status !== status) setStatus(execution.status);
        if (execution.result) setResult(execution.result);

        if (
          ["completed", "error", "timeout", "cancelled"].includes(
            execution.status,
          )
        ) {
          if (execution.status === "completed") {
            const newContent = extractContent(execution.result);

            if (showResultInline && newContent) {
              setInlineContent(newContent);
              setCompletionHandled(true);
            } else if (!showResultInline) {
              const completedMetadata = JSON.stringify({
                n8n_direct_mode: true,
                completed: true,
              });

              await updateMessage(messageId, {
                content: newContent,
                pin_metadata: completedMetadata,
              });

              setChatMessages(prev =>
                prev.map(msg =>
                  msg.message.id === messageId
                    ? {
                        ...msg,
                        message: {
                          ...msg.message,
                          content: newContent,
                          pin_metadata: completedMetadata,
                        },
                      }
                    : msg,
                ),
              );
              setCompletionHandled(true);
            }
          }
        }
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(intervalId);
  }, [executionId, status, messageId, showResultInline, completionHandled]);

  // For inline mode with result ready, just show the result without the processing box
  if (showResultInline && status === "completed" && inlineContent) {
    return (
      <div className="mt-2 whitespace-pre-wrap" style={{ fontSize: "16px" }}>
        {inlineContent}
      </div>
    );
  }

  // For single file mode, hide the component entirely once the message has been updated
  if (!showResultInline && status === "completed" && completionHandled) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col space-y-2 rounded-md border bg-secondary/30 p-3 text-sm">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2 font-medium">
          {(status === "running" || status === "processing") && (
            <IconLoader2 className="animate-spin text-primary" size={18} />
          )}
          {status === "completed" && (
            <IconCheck className="text-green-500" size={18} />
          )}
          {status === "error" && <IconX className="text-red-500" size={18} />}
          {status === "timeout" && (
            <IconX className="text-orange-500" size={18} />
          )}
          {status === "cancelled" && (
            <IconX className="text-muted-foreground" size={18} />
          )}
          <span>
            {status === "cancelled"
              ? t("Request Cancelled")
              : status === "error"
                ? t("Request Failed")
                : status === "timeout"
                  ? t("Request Timed Out")
                  : status === "completed"
                    ? t("Request Completed")
                    : t("Processing Request")}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {status === "running" && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10"
            >
              {isCancelling ? t("Cancelling...") : t("Cancel")}
            </button>
          )}
          <div className="text-xs text-muted-foreground">
            {steps.length} {t("steps")}
          </div>
        </div>
      </div>

      {isExpanded &&
        (steps.length > 0 ||
          ((status === "running" || status === "processing") &&
            currentStep > 0)) && (
          <div className="mt-2 flex flex-col space-y-2 border-t pt-2 pl-1">
            {/* Render completed steps */}
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <div className="min-w-[16px] flex justify-center">
                  {step.status === "completed" ? (
                    <IconCheck size={14} className="text-green-500" />
                  ) : step.status === "error" ? (
                    <IconX size={14} className="text-red-500" />
                  ) : (
                    <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
                <span
                  className={cn(
                    step.status === "completed" && "text-muted-foreground",
                    step.status === "error" && "text-red-500",
                  )}
                >
                  {step.step_name}
                </span>
                {step.duration_ms && (
                  <span className="ml-auto text-xs text-muted-foreground/50">
                    {(step.duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            ))}

            {/* Show processing indicator for current step if it's not yet in the steps array */}
            {(status === "running" || status === "processing") &&
              currentStep > steps.length && (
                <div className="flex items-center space-x-2 text-xs">
                  <div className="min-w-[16px] flex justify-center">
                    <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                  <span className="font-medium text-primary">
                    {t("Processing step")} {currentStep}...
                  </span>
                </div>
              )}
          </div>
        )}

      {/* Show error message for failed executions */}
      {isExpanded &&
        ["error", "timeout", "cancelled"].includes(status) &&
        errorMessage && (
          <div className="mt-2 border-t pt-2">
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2 break-words">
              {errorMessage}
            </div>
          </div>
        )}

      {/* Show inline result for multi-file direct mode */}
      {showResultInline && status === "completed" && inlineContent && (
        <div className="mt-2 border-t pt-2">
          <div className="text-sm whitespace-pre-wrap">{inlineContent}</div>
        </div>
      )}
    </div>
  );
};
