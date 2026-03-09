import { CHAT_SETTING_LIMITS } from "./chat-setting-limits";
import { LLMID } from "@/types";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/format-file-utils" });

// Token estimation function (conservative)
export function estimateTokenCount(text: string): number {
  // 1 token ~= 3 characters for safety
  return Math.ceil(text.length / 3);
}

// Get context window for a model
export function getModelContextWindow(modelId: string): number {
  const limits = CHAT_SETTING_LIMITS[modelId as LLMID];
  return limits?.MAX_CONTEXT_LENGTH || 128000;
}

// Get output token limit for a model
export function getModelOutputLimit(modelId: string): number {
  const limits = CHAT_SETTING_LIMITS[modelId as LLMID];
  return limits?.MAX_TOKEN_OUTPUT_LENGTH || 4096;
}

// Calculate optimal batch size based on BOTH context window and output limit
export function calculateOptimalBatchSize(
  chunks: any[],
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
): number {
  const contextWindow = getModelContextWindow(modelId);
  const outputLimit = getModelOutputLimit(modelId);

  // Prompt tokens (input)
  const systemPromptTokens = estimateTokenCount(systemPrompt);
  const userPromptTokens = estimateTokenCount(userPrompt);
  const promptTokens = systemPromptTokens + userPromptTokens;

  // Available input tokens for chunks
  const availableInputTokens = contextWindow - promptTokens;
  if (availableInputTokens <= 0) return 1;

  // Calculate per-chunk input and output tokens
  const chunkInputTokens = chunks.map(chunk =>
    estimateTokenCount(chunk.content),
  );
  // For output, assume output is roughly the same size as input chunk (conservative)
  const chunkOutputTokens = chunkInputTokens;

  // Find max batch size that fits BOTH input and output limits
  let maxBatch = 1;
  for (let batchSize = 1; batchSize <= chunks.length; batchSize++) {
    const inputSum = chunkInputTokens
      .slice(0, batchSize)
      .reduce((a, b) => a + b, 0);
    const outputSum = chunkOutputTokens
      .slice(0, batchSize)
      .reduce((a, b) => a + b, 0);
    if (inputSum > availableInputTokens || outputSum > outputLimit) {
      break;
    }
    maxBatch = batchSize;
  }
  return maxBatch;
}

// Process chunks in optimal batches (BOTH input and output limits)
export async function processChunksInBatches(
  chunks: any[],
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  processBatch: (batch: any[], batchIndex: number) => Promise<string>,
): Promise<string> {
  const contextWindow = getModelContextWindow(modelId);
  const outputLimit = getModelOutputLimit(modelId);

  logger.info("Chunk processing started", {
    modelId,
    contextWindow,
    outputLimit,
    totalChunks: chunks.length,
    systemPromptTokens: estimateTokenCount(systemPrompt),
    userPromptTokens: estimateTokenCount(userPrompt),
    totalPromptTokens:
      estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
  });

  let formattedOutput = "";
  let i = 0;
  let batchCount = 0;

  while (i < chunks.length) {
    batchCount++;
    const batchSize = calculateOptimalBatchSize(
      chunks.slice(i),
      modelId,
      systemPrompt,
      userPrompt,
    );
    const batch = chunks.slice(i, i + batchSize);
    const batchIndex = batchCount - 1;

    // Calculate tokens for this batch
    const batchInputTokens = batch.reduce(
      (sum, chunk) => sum + estimateTokenCount(chunk.content),
      0,
    );
    const batchOutputTokens = batchInputTokens; // Conservative estimate

    logger.info("Processing batch", {
      batchNumber: batchCount,
      chunkRange: `${i + 1}-${i + batchSize}`,
      batchSize,
      inputTokens: batchInputTokens,
      estimatedOutputTokens: batchOutputTokens,
      remainingChunks: chunks.length - i - batchSize,
    });

    try {
      const batchResult = await processBatch(batch, batchIndex);
      logger.info("Batch completed successfully", {
        batchNumber: batchCount,
        outputLength: batchResult.length,
      });
      formattedOutput += batchResult;
    } catch (error) {
      logger.error("Error processing batch", {
        batchNumber: batchCount,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
      throw error;
    }
    i += batchSize;
  }

  logger.info("Chunk processing complete", {
    totalBatchesProcessed: batchCount,
    totalOutputLength: formattedOutput.length,
  });

  return formattedOutput;
}
