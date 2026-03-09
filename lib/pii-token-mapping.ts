/**
 * PII Token Mapping Service
 * Handles creation and management of PII token mappings using short deterministic hashes
 * for easy re-identification of masked content
 */

import type { PiiEntity } from "./pii-detection";
import crypto from "crypto";

export interface TokenMapping {
  [token: string]: string; // e.g., "[Person_f57]" -> "Max Mustermann"
}

export interface TokenMetadata {
  token: string;
  originalValue: string;
  category: string;
  subcategory?: string;
  confidenceScore: number;
  position: number; // Position in text for ordering
}

/**
 * Generate a short deterministic hash for a value
 * Same value always produces same hash (4 characters for better collision resistance)
 */
function generateShortHash(value: string, category: string): string {
  const combined = `${category}:${value.toLowerCase().trim()}`;
  const hash = crypto
    .createHash("sha256")
    .update(combined)
    .digest("hex")
    .substring(0, 4);
  return hash;
}

/**
 * Create token mappings from PII entities
 * Uses short deterministic hashes (e.g., [Person_f57], [Email_a3c])
 * Same value always gets same token across entire conversation
 */
export function createTokenMapping(entities: PiiEntity[]): {
  tokenMap: TokenMapping;
  metadata: TokenMetadata[];
} {
  const tokenMap: TokenMapping = {};
  const metadata: TokenMetadata[] = [];
  const processedHashes = new Set<string>(); // Track which hashes we've already added

  // Sort entities by offset to maintain order
  const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);

  sortedEntities.forEach(entity => {
    const category = entity.category;
    const value = entity.text;

    // Generate deterministic short hash for this value
    const hash = generateShortHash(value, category);
    const token = `[${category}_${hash}]`;

    // Only add to tokenMap once per unique hash
    if (!processedHashes.has(hash)) {
      tokenMap[token] = value;
      processedHashes.add(hash);
    }

    // Always add metadata for each occurrence
    metadata.push({
      token,
      originalValue: value,
      category: entity.category,
      subcategory: entity.subcategory,
      confidenceScore: entity.confidenceScore,
      position: entity.offset,
    });
  });

  return { tokenMap, metadata };
}

/**
 * Replace PII in text with tokens
 */
export function maskTextWithTokens(
  text: string,
  entities: PiiEntity[],
  tokenMap: TokenMapping,
): string {
  let maskedText = text;
  const reverseMap: { [value: string]: string } = {};

  // Create reverse mapping (originalValue -> token)
  Object.entries(tokenMap).forEach(([token, value]) => {
    reverseMap[value] = token;
  });

  // Sort entities by offset (descending) to replace from end to start
  // This prevents offset shifts when replacing
  const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);

  sortedEntities.forEach(entity => {
    const token = reverseMap[entity.text];
    if (token) {
      const start = entity.offset;
      const end = start + entity.length;
      maskedText =
        maskedText.substring(0, start) + token + maskedText.substring(end);
    }
  });

  return maskedText;
}

/**
 * Serialize token mapping for storage
 * Simple JSON serialization
 */
export function serializeTokenMap(tokenMap: TokenMapping): string {
  return JSON.stringify(tokenMap);
}
