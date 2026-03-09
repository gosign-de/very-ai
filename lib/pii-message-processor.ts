/**
 * PII Message Processor
 * Handles PII detection, masking, and re-identification for chat messages
 */

import {
  detectPii,
  type PiiDetectionEngine,
  type PiiEntity,
} from "./pii-detection";
import {
  createTokenMapping,
  maskTextWithTokens,
  serializeTokenMap,
  TokenMetadata,
} from "./pii-token-mapping";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/pii-message-processor" });

export interface ProcessedMessage {
  originalContent: string; // For display to user
  redactedContent: string; // For sending to AI
  piiEntities: PiiEntity[];
  tokenMap: string; // Simplified: just JSON string
  tokenMetadata: TokenMetadata[];
}

/**
 * Process user message: detect PII and create masked version
 * @param content - The message content to process
 * @param language - Optional language code
 * @param piiCategories - Optional array of specific PII categories to detect (e.g., ["Person", "Email"])
 */
export async function processUserMessage(
  content: string,
  language?: string,
  piiCategories?: string[],
  detectionEngine: PiiDetectionEngine = "azure",
): Promise<ProcessedMessage> {
  try {
    // Step 1: Detect PII using the selected engine
    const piiResult = await detectPii(
      detectionEngine,
      content,
      language,
      piiCategories,
    );

    // Step 2: Create token mappings
    const { tokenMap, metadata } = createTokenMapping(piiResult.entities);

    // Step 3: Create masked version with tokens
    const maskedContent = maskTextWithTokens(
      content,
      piiResult.entities,
      tokenMap,
    );

    // Step 4: Serialize token map for storage (simplified - no encryption needed)
    const serializedTokenMap = serializeTokenMap(tokenMap);

    return {
      originalContent: content, // Store original for display
      redactedContent: maskedContent, // Store masked for AI
      piiEntities: piiResult.entities,
      tokenMap: serializedTokenMap,
      tokenMetadata: metadata,
    };
  } catch (error: unknown) {
    logger.error("Error processing user message for PII", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    return {
      originalContent: content,
      redactedContent: content,
      piiEntities: [],
      tokenMap: "{}",
      tokenMetadata: [],
    };
  }
}
