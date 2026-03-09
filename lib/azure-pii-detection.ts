import {
  TextAnalyticsClient,
  AzureKeyCredential,
} from "@azure/ai-text-analytics";
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/azure-pii-detection" });

export interface PiiEntity {
  text: string;
  category: string;
  subcategory?: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

export interface PiiDetectionResult {
  originalText: string;
  redactedText: string;
  entities: PiiEntity[];
}

export interface PiiDetectionError {
  error: string;
  details?: any;
}

export interface PiiLogs {
  userId: string;
  userEmail: string;
  modelId: string;
  piiType: string;
  piiAction: string;
  detectionEngine: "azure" | "presidio";
}

/**
 * Detects and redacts PII from a single text using Azure AI Language Service (fast version)
 * @param text - Text to analyze for PII
 * @param language - Optional language code ('en', 'de', etc.)
 * @param piiCategories - Optional list of PII categories to detect (e.g., ["Person", "Email"])
 */
export async function detectAndRedactPii(
  text: string,
  language?: string,
  piiCategories?: string[],
): Promise<PiiDetectionResult> {
  const endpoint = process.env.AZURE_PII_ENDPOINT;
  const apiKey = process.env.AZURE_PII_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure PII detection is not configured. Please set AZURE_PII_ENDPOINT and AZURE_PII_API_KEY.",
    );
  }

  // Initialize Azure Text Analytics client
  const client = new TextAnalyticsClient(
    endpoint,
    new AzureKeyCredential(apiKey),
  );

  try {
    // Run PII detection on a single document
    const [result] = await client.recognizePiiEntities([text], language, {
      modelVersion: "latest",
      ...(piiCategories &&
        piiCategories.length > 0 && {
          categoriesFilter: piiCategories,
        }),
    });

    if ("error" in result) {
      throw new Error(`Azure PII detection error: ${result.error.message}`);
    }

    const entities: PiiEntity[] = (result.entities || []).map(entity => ({
      text: entity.text,
      category: entity.category,
      confidenceScore: entity.confidenceScore,
      offset: entity.offset,
      length: entity.length,
    }));

    const redactedText = result.redactedText || text;
    return {
      originalText: text,
      redactedText,
      entities,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in PII detection (simple)", {
      error: { message: err.message, name: err.name },
    });
    throw new Error(`PII detection failed: ${err.message}`);
  }
}

/**
 * Batch process multiple text chunks for PII detection
 * @param texts - Array of text strings to process
 * @param language - Language code (optional, Azure will auto-detect if not provided)
 * @param piiCategories - Optional array of specific PII categories to detect (e.g., ["Person", "Email"]). If empty or not provided, all categories are detected.
 * @returns Promise with array of PII detection results
 */
export async function detectAndRedactPiiBatch(
  texts: string[],
  language?: string,
  piiCategories?: string[],
): Promise<PiiDetectionResult[]> {
  const endpoint = process.env.AZURE_PII_ENDPOINT;
  const apiKey = process.env.AZURE_PII_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure PII detection is not configured. Please set AZURE_PII_ENDPOINT and AZURE_PII_API_KEY environment variables.",
    );
  }

  // Initialize Azure Text Analytics client
  const client = new TextAnalyticsClient(
    endpoint,
    new AzureKeyCredential(apiKey),
  );

  // Define PII recognition action
  const actions = {
    recognizePiiEntitiesActions: [
      {
        modelVersion: "latest",
        disableServiceLogs: true,
        ...(piiCategories &&
          piiCategories.length > 0 && {
            categoriesFilter: piiCategories,
          }),
      },
    ],
  };

  try {
    // Begin the long-running action
    const poller = await client.beginAnalyzeActions(texts, actions, language);

    // Wait for results
    const resultPages = await poller.pollUntilDone();
    const results: PiiDetectionResult[] = [];

    for await (const page of resultPages) {
      const piiAction = page.recognizePiiEntitiesResults?.[0];
      if (!("results" in piiAction)) {
        logger.error("PII Action Error", { error: piiAction.error });
        continue;
      }

      for (const [index, doc] of piiAction.results.entries()) {
        if ("error" in doc) {
          logger.error("Error in document", { index, error: doc.error });
          results.push({
            originalText: texts[index],
            redactedText: texts[index],
            entities: [],
          });
          continue;
        }

        const entities: PiiEntity[] = (doc.entities || []).map(entity => ({
          text: entity.text,
          category: entity.category,
          confidenceScore: entity.confidenceScore,
          offset: entity.offset,
          length: entity.length,
        }));

        let redactedText = doc.redactedText;
        results.push({
          originalText: texts[index],
          redactedText,
          entities,
        });
      }
    }

    return results;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error in batch PII detection (SDK)", {
      error: { message: err.message, name: err.name },
    });
    throw new Error(`Batch PII detection failed: ${err.message}`);
  }
}

export async function logPiiAudit(
  supabase: SupabaseClient,
  entries: PiiLogs[],
) {
  try {
    const payload = entries.map(entry => ({
      user_id: entry.userId,
      user_email: entry.userEmail,
      model_id: entry.modelId,
      pii_type: entry.piiType,
      pii_action: entry.piiAction,
      detection_engine: entry.detectionEngine,
    }));

    const { error } = await supabase.from("pii_audit_logs").insert(payload);

    if (error) throw error;
  } catch (err) {
    logger.error("Error logging PII audit batch", {
      error:
        err instanceof Error ? { message: err.message, name: err.name } : err,
    });
  }
}
