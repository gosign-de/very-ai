import {
  detectAndRedactPii as detectAzureSingle,
  detectAndRedactPiiBatch as detectAzureBatch,
} from "./azure-pii-detection";
import {
  detectAndRedactPii as detectPresidioSingle,
  detectAndRedactPiiBatch as detectPresidioBatch,
} from "./presidio-pii-detection";

import type { PiiDetectionResult, PiiEntity } from "./azure-pii-detection";

export type { PiiDetectionResult, PiiEntity } from "./azure-pii-detection";

export type PiiDetectionEngine = "azure" | "presidio";

export function isPiiEngineConfigured(engine: PiiDetectionEngine): boolean {
  if (engine === "presidio") {
    return Boolean(
      process.env.PRESIDIO_ANALYZER_ENDPOINT &&
        process.env.PRESIDIO_ANONYMIZER_ENDPOINT,
    );
  }

  return Boolean(
    process.env.AZURE_PII_ENDPOINT && process.env.AZURE_PII_API_KEY,
  );
}

export async function detectPii(
  engine: PiiDetectionEngine,
  text: string,
  language?: string | null,
  piiCategories?: string[],
): Promise<PiiDetectionResult> {
  const result =
    engine === "presidio"
      ? await detectPresidioSingle(text, language, piiCategories)
      : await detectAzureSingle(text, language ?? undefined, piiCategories);

  return {
    ...result,
    entities: filterEntitiesByCategory(result.entities, piiCategories),
  };
}

export async function detectPiiBatch(
  engine: PiiDetectionEngine,
  texts: string[],
  language?: string | null,
  piiCategories?: string[],
): Promise<PiiDetectionResult[]> {
  const results =
    engine === "presidio"
      ? await detectPresidioBatch(texts, language, piiCategories)
      : await detectAzureBatch(texts, language ?? undefined, piiCategories);

  return results.map(result => ({
    ...result,
    entities: filterEntitiesByCategory(result.entities, piiCategories),
  }));
}

function filterEntitiesByCategory(
  entities: PiiEntity[],
  allowedCategories?: string[] | null,
): PiiEntity[] {
  if (!allowedCategories || allowedCategories.length === 0) {
    return entities;
  }

  const allowedSet = new Set(allowedCategories);
  return entities.filter(entity => allowedSet.has(entity.category));
}
