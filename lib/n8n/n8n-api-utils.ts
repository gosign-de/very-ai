/**
 * Utility functions for interacting with the n8n API
 * Used for fetching execution details and parsing error logs
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/n8n/n8n-api-utils" });

export interface N8nExecutionDetails {
  id: string;
  finished: boolean;
  mode: string;
  status: "running" | "success" | "error" | "waiting" | "canceled";
  createdAt: string;
  startedAt: string;
  stoppedAt: string | null;
  workflowId: string;
  data?: {
    resultData?: {
      runData?: Record<string, N8nNodeExecution[]>;
      lastNodeExecuted?: string;
      error?: {
        message: string;
        stack?: string;
      };
    };
  };
}

export interface N8nNodeExecution {
  startTime: number;
  executionIndex: number;
  executionTime: number;
  executionStatus: "success" | "error" | "waiting";
  source?: Array<{ previousNode: string }>;
  hints?: any[];
  data?: any;
  error?: {
    message: string;
    stack?: string;
  };
  metadata?: any;
}

export interface FailedNodeInfo {
  nodeName: string;
  errorMessage: string;
  fullNodeLog: N8nNodeExecution[];
}

/**
 * Fetch full execution details from the n8n API
 * @param n8nExecutionId - The execution ID returned by n8n
 * @param apiKey - The n8n API key
 * @param baseUrl - The n8n instance base URL
 * @returns The full execution details or null if not found
 */
export async function fetchN8nExecutionDetails(
  n8nExecutionId: string,
  apiKey: string,
  baseUrl: string,
): Promise<N8nExecutionDetails | null> {
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");

  const url = `${cleanBaseUrl}/api/v1/executions/${n8nExecutionId}?includeData=true`;

  logger.info("Fetching execution details", { url });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-N8N-API-KEY": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn("Execution not found (404)", { n8nExecutionId });
        return null;
      }
      const errorText = await response.text();
      throw new Error(
        `n8n API request failed: ${response.status} ${errorText}`,
      );
    }

    return (await response.json()) as N8nExecutionDetails;
  } catch (error: unknown) {
    logger.error("Fetch execution details error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}

/**
 * Extract the failed node's log from n8n execution data
 * @param executionData - The full execution details from n8n API
 * @returns The failed node info or null if no error found
 */
export function extractFailedNodeLog(
  executionData: N8nExecutionDetails,
): FailedNodeInfo | null {
  // Check if execution status is error
  if (executionData.status !== "error") {
    return null;
  }

  const resultData = executionData.data?.resultData;
  if (!resultData) {
    logger.warn("No resultData in execution");
    return null;
  }

  const lastNodeExecuted = resultData.lastNodeExecuted;
  const runData = resultData.runData;

  if (!lastNodeExecuted || !runData) {
    // Fallback to top-level error if available
    if (resultData.error) {
      return {
        nodeName: "Unknown",
        errorMessage: resultData.error.message || "Unknown error occurred",
        fullNodeLog: [],
      };
    }
    return null;
  }

  // Get the node execution data
  const nodeExecutions = runData[lastNodeExecuted];
  if (!nodeExecutions || nodeExecutions.length === 0) {
    logger.warn("No execution data found for node", { lastNodeExecuted });
    return null;
  }

  // Find the execution with error status
  const failedExecution = nodeExecutions.find(
    exec => exec.executionStatus === "error",
  );

  if (!failedExecution) {
    // Node exists but no error status - use top-level error
    if (resultData.error) {
      return {
        nodeName: lastNodeExecuted,
        errorMessage: resultData.error.message || "Unknown error occurred",
        fullNodeLog: nodeExecutions,
      };
    }
    return null;
  }

  return {
    nodeName: lastNodeExecuted,
    errorMessage:
      failedExecution.error?.message || "Unknown error in node execution",
    fullNodeLog: nodeExecutions,
  };
}

/**
 * Poll for n8n execution completion with exponential backoff
 * @param n8nExecutionId - The execution ID to poll
 * @param apiKey - The n8n API key
 * @param baseUrl - The n8n instance base URL
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 15 minutes)
 * @param onProgress - Optional callback for progress updates
 * @returns The final execution details
 */
export async function pollExecutionUntilComplete(
  n8nExecutionId: string,
  apiKey: string,
  baseUrl: string,
  maxWaitMs: number = 15 * 60 * 1000,
  onProgress?: (execution: N8nExecutionDetails) => void,
): Promise<N8nExecutionDetails | null> {
  const startTime = Date.now();
  let pollInterval = 2000; // Start with 2 seconds
  const maxPollInterval = 10000; // Max 10 seconds between polls

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const execution = await fetchN8nExecutionDetails(
        n8nExecutionId,
        apiKey,
        baseUrl,
      );

      if (!execution) {
        logger.warn("Execution not found during polling", { n8nExecutionId });
        return null;
      }

      // Call progress callback if provided
      if (onProgress) {
        onProgress(execution);
      }

      // Check if execution is finished
      // Note: 'waiting' status means a Wait node is active - keep polling
      const isRunning =
        execution.status === "running" || execution.status === "waiting";
      if (execution.finished || !isRunning) {
        logger.info("Execution completed", {
          n8nExecutionId,
          status: execution.status,
        });
        return execution;
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
    } catch (error) {
      logger.error("Polling error", {
        n8nExecutionId,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      // Continue polling on error, but increase interval
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 2, maxPollInterval);
    }
  }

  logger.warn("Polling timeout for execution", { n8nExecutionId });
  return null;
}
