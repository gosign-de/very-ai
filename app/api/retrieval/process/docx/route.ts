import { processDocX } from "@/lib/retrieval/processing";
import {
  checkApiKey,
  getServerProfile,
  getUser,
} from "@/lib/server/server-chat-helpers";
import { Database } from "@/supabase/types";
import { FileItemChunk, ChatSettings } from "@/types";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getPIISettingsServer } from "@/lib/config/pii-protection-settings";
import {
  createTokenMapping,
  maskTextWithTokens,
  serializeTokenMap,
} from "@/lib/pii-token-mapping";
import { detectPiiBatch, isPiiEngineConfigured } from "@/lib/pii-detection";
import { logPiiAudit } from "@/lib/azure-pii-detection";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/retrieval/process/docx" });

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
  _context: string = "",
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const isRateLimit =
        (error as any)?.status === 429 ||
        (error as any)?.code === "429" ||
        (error as any)?.message?.toLowerCase().includes("rate limit") ||
        (error as any)?.message?.includes("429");
      const retryAfter =
        (error as any)?.headers?.["retry-after"] ||
        (error as any)?.response?.headers?.["retry-after"];
      const isLastAttempt = attempt === maxRetries - 1;
      if (!isRateLimit || isLastAttempt) {
        throw error;
      }

      let delayTime: number;

      if (retryAfter) {
        delayTime = parseInt(retryAfter) * 1000;
      } else {
        delayTime = baseDelay * Math.pow(2, attempt);
      }
      await delay(delayTime);
    }
  }

  throw lastError;
};

async function shouldContinueProcessing(
  supabaseAdmin: any,
  file_id: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("files")
      .select("processing_status")
      .eq("id", file_id)
      .single();

    if (error || !data) {
      logger.info("File no longer exists, stopping processing", {
        fileId: file_id,
      });
      return false;
    }

    if (
      data.processing_status === "cancelled" ||
      data.processing_status === "error"
    ) {
      logger.info("Processing cancelled", {
        fileId: file_id,
        status: data.processing_status,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error checking file status", {
      fileId: file_id,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return false;
  }
}

export async function POST(req: Request) {
  const json = await req.json();
  const { text, fileId, embeddingsProvider, fileExtension, chatSettings } =
    json as {
      text: string;
      fileId: string;
      embeddingsProvider: "openai" | "local";
      fileExtension: string;
      chatSettings: ChatSettings;
    };

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profile = await getServerProfile();
    const user = await getUser();

    // Update file status to processing
    await supabaseAdmin
      .from("files")
      .update({
        processing_status: "processing",
        processing_progress: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    logger.info("Processing DOCX retrieval", {
      fileId,
      embeddingsProvider,
      model: chatSettings?.model,
      userId: user?.id,
    });

    if (embeddingsProvider === "openai") {
      if (profile.use_azure_openai) {
        checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");
      } else {
        checkApiKey(profile.openai_api_key, "OpenAI");
      }
    }

    let chunks: FileItemChunk[] = [];

    switch (fileExtension) {
      case "docx":
        chunks = await processDocX(text);
        break;
      default:
        await supabaseAdmin
          .from("files")
          .update({ processing_status: "error" })
          .eq("id", fileId);
        return new NextResponse("Unsupported file type", {
          status: 400,
        });
    }

    //removing null characters
    chunks = chunks.map(chunk => ({
      ...chunk,
      content: chunk.content.replace(/\u0000/g, ""),
    }));

    // Check if PII protection is enabled in admin settings

    const piiSettings = await getPIISettingsServer(
      supabaseAdmin,
      chatSettings.model,
    );
    let piiResults: any[] = [];

    if (piiSettings && piiSettings.enabled && piiSettings.doc_processing) {
      const detectionEngine =
        piiSettings.detection_engine === "presidio" ? "presidio" : "azure";

      if (!isPiiEngineConfigured(detectionEngine)) {
        logger.warn("PII engine not configured, skipping detection", {
          detectionEngine,
        });
        piiResults = chunks.map(chunk => ({
          originalText: chunk.content,
          maskedText: chunk.content,
          entities: [],
          tokenMap: "{}",
          metadata: [],
        }));
      } else {
        const piiCategories = Array.isArray(piiSettings.categories)
          ? (piiSettings.categories as string[])
          : [];

        try {
          const chunkTexts = chunks.map(chunk => chunk.content);

          const detectionResults = await detectPiiBatch(
            detectionEngine,
            chunkTexts,
            null,
            piiCategories,
          );

          // Process each result to create token maps and masked content
          piiResults = detectionResults.map(result => {
            if (result.entities && result.entities.length > 0) {
              const { tokenMap, metadata } = createTokenMapping(
                result.entities,
              );
              const maskedContent = maskTextWithTokens(
                result.originalText,
                result.entities,
                tokenMap,
              );
              const serializedTokenMap = serializeTokenMap(tokenMap);

              return {
                originalText: result.originalText,
                maskedText: maskedContent,
                entities: result.entities,
                tokenMap: serializedTokenMap,
                metadata,
              };
            }

            return {
              originalText: result.originalText,
              maskedText: result.originalText,
              entities: [],
              tokenMap: "{}",
              metadata: [],
            };
          });

          // Log PII audit entries
          if (piiSettings.audit_log_enabled) {
            const allEntities = piiResults.flatMap(result => result.entities);
            await logPiiAudit(
              supabaseAdmin,
              allEntities.map(entity => ({
                userId: user.id,
                userEmail: user.email,
                modelId: chatSettings.model,
                piiType: entity.category,
                piiAction: "Anonymized",
                detectionEngine,
              })),
            );
          }
        } catch (error: unknown) {
          logger.error("PII detection failed", {
            error: (error as any)?.message || String(error),
          });

          piiResults = chunks.map(chunk => ({
            originalText: chunk.content,
            maskedText: chunk.content,
            entities: [],
            tokenMap: "{}",
            metadata: [],
          }));
        }
      }
    } else {
      logger.info("PII protection disabled, skipping detection");
      piiResults = chunks.map(chunk => ({
        originalText: chunk.content,
        maskedText: chunk.content,
        entities: [],
        tokenMap: "{}",
        metadata: [],
      }));
    }

    // For large files (>15 chunks), process in background
    const CHUNK_LIMIT = 15;
    const shouldProcessAsync = chunks.length > CHUNK_LIMIT;

    if (shouldProcessAsync) {
      processEmbeddingsInBackground(
        fileId,
        chunks,
        piiResults,
        embeddingsProvider,
        profile,
        supabaseAdmin,
      );

      return new NextResponse(
        JSON.stringify({
          message: "Processing started in background",
          fileId: fileId,
          status: "processing",
          totalChunks: chunks.length,
        }),
        {
          status: 202,
        },
      );
    }

    let embeddings: any = [];

    let openai;
    if (profile.use_azure_openai) {
      openai = new OpenAI({
        apiKey: profile.azure_openai_api_key || "",
        baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
        defaultQuery: { "api-version": "2023-12-01-preview" },
        defaultHeaders: { "api-key": profile.azure_openai_api_key },
      });
    } else {
      openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id,
      });
    }

    if (embeddingsProvider === "openai") {
      embeddings = await processOpenAIEmbeddings(
        openai,
        piiResults,
        fileId,
        null, // No progress updates for sync
        supabaseAdmin,
      );
    } else if (embeddingsProvider === "local") {
      embeddings = await processLocalEmbeddings(chunks, fileId, null);
    }

    const file_items = chunks.map((chunk, index) => ({
      file_id: fileId,
      user_id: profile.user_id,
      content: piiResults[index]?.maskedText || chunk.content,
      original_content: piiResults[index]?.originalText || chunk.content,
      pii_entities: piiResults[index]?.entities || [],
      pii_token_map: piiResults[index]?.tokenMap || "{}",
      tokens: chunk.tokens,
      openai_embedding:
        embeddingsProvider === "openai"
          ? ((embeddings[index] || null) as any)
          : null,
      local_embedding:
        embeddingsProvider === "local"
          ? ((embeddings[index] || null) as any)
          : null,
      chunk_index: index,
    }));

    await supabaseAdmin.from("file_items").upsert(file_items);

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0);

    await supabaseAdmin
      .from("files")
      .update({
        tokens: totalTokens,
        processing_status: "completed",
        processing_progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    return new NextResponse(
      JSON.stringify({
        message: "Embed Successful",
        fileId: fileId,
        status: "completed",
      }),
      {
        status: 200,
      },
    );
  } catch (error: unknown) {
    logger.error(`[DOCX] Error:`, {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    try {
      const supabaseAdmin = createClient<Database>(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      if (fileId) {
        await supabaseAdmin
          .from("files")
          .update({
            processing_status: "error",
            error_message:
              (error as any)?.message || "An unexpected error occurred",
          })
          .eq("id", fileId);
      }
    } catch (updateError) {
      logger.error("[DOCX] Failed to update error status:", updateError);
    }

    const errorMessage =
      (error as any)?.error?.message ||
      (error as any)?.message ||
      "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
// Buffered OpenAI embedding processing with smart retry
async function processOpenAIEmbeddings(
  openai: OpenAI,
  piiResults: any[],
  fileId: string,
  updateProgress: ((progress: number) => Promise<void>) | null,
  supabaseAdmin?: any,
): Promise<any[]> {
  const BATCH_SIZE = 5;
  const INTER_BATCH_DELAY = 1000;

  const embeddings: any[] = [];
  const totalChunks = piiResults.length;
  const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    if (supabaseAdmin) {
      const shouldContinue = await shouldContinueProcessing(
        supabaseAdmin,
        fileId,
      );
      if (!shouldContinue) {
        logger.info("Processing aborted", {
          fileId,
          batch: batchIndex + 1,
          totalBatches,
        });
        throw new Error("Processing cancelled - file deleted or cancelled");
      }
    }

    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalChunks);
    const batchPiiResults = piiResults.slice(start, end);

    try {
      const batchEmbeddings = await retryWithBackoff(
        async () => {
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: batchPiiResults.map(result => result.maskedText),
          });
          return response.data.map((item: any) => item.embedding);
        },
        5,
        1000,
        `DOCX ${fileId} Batch ${batchIndex + 1}/${totalBatches}`,
      );

      embeddings.push(...batchEmbeddings);

      const processed = embeddings.length;
      const progress = (processed / totalChunks) * 100;

      if (updateProgress) {
        await updateProgress(progress);
      }

      if (batchIndex < totalBatches - 1) {
        await delay(INTER_BATCH_DELAY);
      }
    } catch (_error: unknown) {
      const batch = piiResults.slice(start, end);
      embeddings.push(...new Array(batch.length).fill(null));
      if (updateProgress) {
        const progress = (embeddings.length / totalChunks) * 100;
        await updateProgress(progress);
      }
    }
  }

  const _successCount = embeddings.filter(e => e !== null).length;
  const _failCount = embeddings.filter(e => e === null).length;
  return embeddings;
}

// Local embedding processing
async function processLocalEmbeddings(
  chunks: FileItemChunk[],
  fileId: string,
  updateProgress: ((progress: number) => Promise<void>) | null,
  supabaseAdmin?: any,
): Promise<any[]> {
  const CONCURRENCY_LIMIT = 5;
  const EMBEDDING_TIMEOUT = 30000;

  const processWithTimeout = async (chunk: FileItemChunk) => {
    return Promise.race([
      import("@/lib/generate-local-embedding").then(m =>
        m.generateLocalEmbedding(chunk.content),
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Embedding timeout")),
          EMBEDDING_TIMEOUT,
        ),
      ),
    ]);
  };

  const embeddings = [];
  const totalChunks = chunks.length;
  for (let i = 0; i < totalChunks; i += CONCURRENCY_LIMIT) {
    if (supabaseAdmin && i % (CONCURRENCY_LIMIT * 10) === 0) {
      const shouldContinue = await shouldContinueProcessing(
        supabaseAdmin,
        fileId,
      );
      if (!shouldContinue) {
        throw new Error("Processing cancelled - file deleted or cancelled");
      }
    }
    const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batch.map(async (chunk, index) => {
      try {
        return await processWithTimeout(chunk);
      } catch (error) {
        logger.error("Error generating embedding for chunk", {
          fileId,
          chunkIndex: i + index,
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
        return null;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    embeddings.push(
      ...batchResults.map(result =>
        result.status === "fulfilled" ? result.value : null,
      ),
    );

    if (updateProgress) {
      const progress = (embeddings.length / totalChunks) * 100;
      await updateProgress(progress);
    }
  }

  const _successCount = embeddings.filter(e => e !== null).length;
  return embeddings;
}

async function processEmbeddingsInBackground(
  fileId: string,
  chunks: FileItemChunk[],
  piiResults: any[],
  embeddingsProvider: string,
  profile: any,
  supabaseAdmin: any,
) {
  try {
    const shouldStart = await shouldContinueProcessing(supabaseAdmin, fileId);
    if (!shouldStart) {
      logger.info("File deleted before processing started", { fileId });
      return;
    }

    const updateProgress = async (progress: number) => {
      try {
        await supabaseAdmin
          .from("files")
          .update({
            processing_progress: Math.min(Math.round(progress), 100),
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileId);
      } catch (error) {
        logger.error("Error updating progress", {
          fileId,
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
      }
    };

    if (embeddingsProvider === "openai") {
      let openai;
      if (profile.use_azure_openai) {
        openai = new OpenAI({
          apiKey: profile.azure_openai_api_key || "",
          baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
          defaultQuery: { "api-version": "2023-12-01-preview" },
          defaultHeaders: { "api-key": profile.azure_openai_api_key },
        });
      } else {
        openai = new OpenAI({
          apiKey: profile.openai_api_key || "",
          organization: profile.openai_organization_id,
        });
      }

      await processOpenAIEmbeddingsIncremental(
        openai,
        chunks,
        piiResults,
        fileId,
        profile.user_id,
        updateProgress,
        supabaseAdmin,
      );
    } else if (embeddingsProvider === "local") {
      await processLocalEmbeddingsIncremental(
        chunks,
        piiResults,
        fileId,
        profile.user_id,
        updateProgress,
        supabaseAdmin,
      );
    }

    const { data: fileItems } = await supabaseAdmin
      .from("file_items")
      .select("tokens")
      .eq("file_id", fileId);

    const totalTokens =
      fileItems?.reduce((acc, item) => acc + item.tokens, 0) || 0;

    await supabaseAdmin
      .from("files")
      .update({
        tokens: totalTokens,
        processing_status: "completed",
        processing_progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Background processing error", {
      fileId,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });

    if (
      !err.message?.includes("cancelled") &&
      !err.message?.includes("deleted")
    ) {
      try {
        await supabaseAdmin
          .from("files")
          .update({
            processing_status: "error",
            error_message: err.message || "Background processing failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileId);
      } catch (updateError) {
        logger.error("Failed to update error status", {
          fileId,
          error:
            updateError instanceof Error
              ? { message: updateError.message, name: updateError.name }
              : updateError,
        });
      }
    } else {
      logger.info("Processing stopped due to cancellation", { fileId });
    }
  }
}

async function processOpenAIEmbeddingsIncremental(
  openai: OpenAI,
  chunks: FileItemChunk[],
  piiResults: any[],
  fileId: string,
  userId: string,
  updateProgress: ((progress: number) => Promise<void>) | null,
  supabaseAdmin?: any,
): Promise<void> {
  const BATCH_SIZE = 5;
  const INTER_BATCH_DELAY = 1000;

  const totalChunks = piiResults.length;
  const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
  let processedCount = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    if (supabaseAdmin) {
      const shouldContinue = await shouldContinueProcessing(
        supabaseAdmin,
        fileId,
      );
      if (!shouldContinue) {
        throw new Error("Processing cancelled");
      }
    }

    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalChunks);
    const batchPiiResults = piiResults.slice(start, end);
    const batchChunks = chunks.slice(start, end);

    try {
      const batchEmbeddings = await retryWithBackoff(
        async () => {
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: batchPiiResults.map(result => result.maskedText),
          });
          return response.data.map((item: any) => item.embedding);
        },
        5,
        1000,
        `DOCX ${fileId} Batch ${batchIndex + 1}/${totalBatches}`,
      );

      const file_items = batchChunks.map((chunk, index) => ({
        file_id: fileId,
        user_id: userId,
        content: batchPiiResults[index]?.maskedText || chunk.content,
        original_content: batchPiiResults[index]?.originalText || chunk.content,
        pii_entities: batchPiiResults[index]?.entities || [],
        pii_token_map: batchPiiResults[index]?.tokenMap || "{}",
        tokens: chunk.tokens,
        openai_embedding: batchEmbeddings[index] || null,
        local_embedding: null,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("file_items")
        .upsert(file_items);

      if (insertError) {
        logger.error("Failed to save batch", {
          fileId,
          batch: batchIndex + 1,
          error: insertError,
        });
      } else {
        processedCount += file_items.length;
        logger.info("Saved batch", {
          fileId,
          batch: batchIndex + 1,
          totalBatches,
          processedCount,
          totalChunks,
        });
      }

      if (updateProgress) {
        await updateProgress((processedCount / totalChunks) * 100);
      }

      if (batchIndex < totalBatches - 1) {
        await delay(INTER_BATCH_DELAY);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Batch failed", {
        fileId,
        batch: batchIndex + 1,
        totalBatches,
        error: { message: err.message },
      });

      const file_items = batchChunks.map((chunk, index) => ({
        file_id: fileId,
        user_id: userId,
        content: batchPiiResults[index]?.maskedText || chunk.content,
        original_content: batchPiiResults[index]?.originalText || chunk.content,
        pii_entities: batchPiiResults[index]?.entities || [],
        pii_token_map: batchPiiResults[index]?.tokenMap || "{}",
        tokens: chunk.tokens,
        openai_embedding: null,
        local_embedding: null,
      }));

      await supabaseAdmin.from("file_items").upsert(file_items);
      processedCount += file_items.length;

      if (updateProgress) {
        await updateProgress((processedCount / totalChunks) * 100);
      }
    }
  }
}

async function processLocalEmbeddingsIncremental(
  chunks: FileItemChunk[],
  piiResults: any[],
  fileId: string,
  userId: string,
  updateProgress: ((progress: number) => Promise<void>) | null,
  supabaseAdmin?: any,
): Promise<void> {
  const BATCH_SIZE = 5;
  const EMBEDDING_TIMEOUT = 30000;

  const totalChunks = chunks.length;
  const totalBatches = Math.ceil(totalChunks / BATCH_SIZE);
  let processedCount = 0;

  logger.info("Processing local embeddings incrementally", {
    fileId,
    totalChunks,
  });

  const processWithTimeout = async (chunk: FileItemChunk) => {
    return Promise.race([
      import("@/lib/generate-local-embedding").then(m =>
        m.generateLocalEmbedding(chunk.content),
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Embedding timeout")),
          EMBEDDING_TIMEOUT,
        ),
      ),
    ]);
  };

  for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
    if (supabaseAdmin) {
      const shouldContinue = await shouldContinueProcessing(
        supabaseAdmin,
        fileId,
      );
      if (!shouldContinue) {
        logger.info("Processing aborted", { fileId, chunk: i, totalChunks });
        throw new Error("Processing cancelled");
      }
    }

    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const batchPiiResults = piiResults.slice(i, i + BATCH_SIZE);

    const batchPromises = batchChunks.map(chunk => processWithTimeout(chunk));
    const batchResults = await Promise.allSettled(batchPromises);

    const embeddings = batchResults.map(result =>
      result.status === "fulfilled" ? result.value : null,
    );

    const file_items = batchChunks.map((chunk, index) => ({
      file_id: fileId,
      user_id: userId,
      content: batchPiiResults[index]?.maskedText || chunk.content,
      original_content: batchPiiResults[index]?.originalText || chunk.content,
      pii_entities: batchPiiResults[index]?.entities || [],
      pii_token_map: batchPiiResults[index]?.tokenMap || "{}",
      tokens: chunk.tokens,
      openai_embedding: null,
      local_embedding: embeddings[index] || null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("file_items")
      .upsert(file_items);

    if (insertError) {
      logger.error("Failed to save batch", { fileId, error: insertError });
    } else {
      processedCount += file_items.length;
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      logger.info("Saved batch", {
        fileId,
        batch: batchNum,
        totalBatches,
        processedCount,
        totalChunks,
      });
    }

    if (updateProgress) {
      await updateProgress((processedCount / totalChunks) * 100);
    }
  }
}
