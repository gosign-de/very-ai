import {
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt,
} from "@/lib/retrieval/processing";
import {
  checkApiKey,
  getServerProfile,
  getUser,
} from "@/lib/server/server-chat-helpers";
import { Database } from "@/supabase/types";
import { FileItemChunk } from "@/types";
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

const logger = createLogger({ feature: "api/retrieval/process" });

// Add timeout configuration
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

async function insertFileItemsInBatches(
  supabaseAdmin: any,
  file_items: any[],
  file_id: string,
  batchSize: number = 500,
): Promise<void> {
  const totalBatches = Math.ceil(file_items.length / batchSize);

  for (let i = 0; i < file_items.length; i += batchSize) {
    const batch = file_items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    const { error: insertError } = await supabaseAdmin
      .from("file_items")
      .upsert(batch);

    if (insertError) {
      throw new Error(
        `Failed to insert batch ${batchNum}/${totalBatches}: ${insertError.message}`,
      );
    }
    if (i + batchSize < file_items.length) {
      await delay(100);
    }
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const profile = await getServerProfile();
    const user = await getUser();

    const formData = await req.formData();

    const file_id = formData.get("file_id") as string;
    const action = formData.get("action") as string;
    const embeddingsProvider = (formData.get("embeddingsProvider") ||
      "local") as string;
    const chatSettingsJsonString = formData.get("chatSettings") as string;
    const chatSettings = JSON.parse(chatSettingsJsonString);
    // Update file status to processing
    await supabaseAdmin
      .from("files")
      .update({
        processing_status: "processing",
        processing_progress: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", file_id);

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single();

    if (metadataError) {
      await supabaseAdmin
        .from("files")
        .update({ processing_status: "error" })
        .eq("id", file_id);
      throw new Error(
        `Failed to retrieve file metadata: ${metadataError.message}`,
      );
    }

    if (!fileMetadata) {
      throw new Error("File not found");
    }

    if (fileMetadata.user_id !== profile.user_id) {
      throw new Error("Unauthorized");
    }

    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from("files")
      .download(fileMetadata.file_path);

    if (fileError) {
      await supabaseAdmin
        .from("files")
        .update({ processing_status: "error" })
        .eq("id", file_id);
      throw new Error(`Failed to retrieve file: ${fileError.message}`);
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const blob = new Blob([fileBuffer]);
    const fileExtension = fileMetadata.name.split(".").pop()?.toLowerCase();

    if (embeddingsProvider === "openai") {
      try {
        if (profile.use_azure_openai) {
          checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");
        } else {
          checkApiKey(profile.openai_api_key, "OpenAI");
        }
      } catch (error: unknown) {
        await supabaseAdmin
          .from("files")
          .update({ processing_status: "error" })
          .eq("id", file_id);
        const err = error instanceof Error ? error : new Error(String(error));
        err.message =
          err.message +
          ", make sure it is configured or else use local embeddings";
        throw err;
      }
    }

    let chunks: FileItemChunk[] = [];

    switch (fileExtension) {
      case "csv":
        chunks = await processCSV(blob);
        break;
      case "json":
        chunks = await processJSON(blob);
        break;
      case "md":
        chunks = await processMarkdown(blob);
        break;
      case "pdf":
        chunks = await processPdf(blob);
        break;
      case "txt":
        chunks = await processTxt(blob);
        break;
      default:
        await supabaseAdmin
          .from("files")
          .update({ processing_status: "error" })
          .eq("id", file_id);
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

    if (
      piiSettings &&
      piiSettings.enabled &&
      piiSettings.doc_processing &&
      action !== "crawl"
    ) {
      const detectionEngine =
        piiSettings.detection_engine === "presidio" ? "presidio" : "azure";
      const piiCategories = Array.isArray(piiSettings.categories)
        ? piiSettings.categories
        : [];

      if (!isPiiEngineConfigured(detectionEngine)) {
        logger.warn("PII engine missing configuration, skipping detection", {
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
              // Create token mapping from detected entities
              const { tokenMap, metadata } = createTokenMapping(
                result.entities,
              );

              const maskedContent = maskTextWithTokens(
                result.originalText,
                result.entities,
                tokenMap,
              );
              // Serialize token map for storage
              const serializedTokenMap = serializeTokenMap(tokenMap);

              return {
                originalText: result.originalText,
                maskedText: maskedContent,
                entities: result.entities,
                tokenMap: serializedTokenMap,
                metadata,
              };
            }

            // No PII detected
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
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error("PII detection failed", {
            error: { message: err.message },
          });

          // If PII detection fails, continue without redaction
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

    // Determine if we should process in background
    // For large files (>15 chunks), process in background
    const CHUNK_LIMIT = 15;
    const shouldProcessAsync = chunks.length > CHUNK_LIMIT;

    if (shouldProcessAsync) {
      // Start background processing
      processEmbeddingsInBackground(
        file_id,
        chunks,
        piiResults,
        embeddingsProvider,
        profile,
        supabaseAdmin,
      );

      // Return immediately with processing status
      return new NextResponse(
        JSON.stringify({
          message: "Processing started",
          fileId: file_id,
          status: "processing",
          totalChunks: chunks.length,
        }),
        {
          status: 202, // Accepted
        },
      );
    }

    // Process all other actions synchronously (including non-crawl actions with many chunks)
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
        file_id,
        null,
        supabaseAdmin,
      );
    } else if (embeddingsProvider === "local") {
      embeddings = await processLocalEmbeddings(
        chunks,
        file_id,
        null,
        supabaseAdmin,
      );
    }

    const file_items = chunks.map((chunk, index) => ({
      file_id,
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

    await insertFileItemsInBatches(supabaseAdmin, file_items, file_id);

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0);

    await supabaseAdmin
      .from("files")
      .update({
        tokens: totalTokens,
        processing_status: "completed",
        processing_progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", file_id);

    return new NextResponse(
      JSON.stringify({
        message: "Embed Successful",
        fileId: file_id,
        status: "completed",
      }),
      {
        status: 200,
      },
    );
  } catch (error: unknown) {
    const formData = await req.formData();
    const file_id = formData.get("file_id") as string;

    logger.error("Error in retrieval/process", {
      error: {
        message: (error as any)?.message,
        stack: (error as any)?.stack,
        name: (error as any)?.name,
      },
      fileId: file_id,
      feature: "api/retrieval/process",
    });

    // Update file status to error
    try {
      const supabaseAdmin = createClient<Database>(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      if (file_id) {
        await supabaseAdmin
          .from("files")
          .update({
            processing_status: "error",
            error_message:
              (error as any)?.message || "An unexpected error occurred",
          })
          .eq("id", file_id);

        logger.info("File status updated to error", {
          fileId: file_id,
          feature: "api/retrieval/process",
        });
      }
    } catch (updateError) {
      logger.error("Failed to update error status in database", {
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
        fileId: file_id,
        feature: "api/retrieval/process",
      });
    }

    const errorMessage =
      (error as any)?.message || "An unexpected error occurred";
    const errorCode = (error as any)?.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}

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

  logger.info("Processing chunks", {
    fileId,
    totalChunks,
    totalBatches,
    batchSize: BATCH_SIZE,
  });

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
        `FILE ${fileId} Batch ${batchIndex + 1}/${totalBatches}`,
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

// Local embedding processing with cancellation checks
async function processLocalEmbeddings(
  chunks: FileItemChunk[],
  fileId: string,
  updateProgress: ((progress: number) => Promise<void>) | null,
  supabaseAdmin?: any,
): Promise<any[]> {
  const CONCURRENCY_LIMIT = 5;
  const EMBEDDING_TIMEOUT = 30000;
  const CHECK_INTERVAL = 10;

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
    if (supabaseAdmin && i % (CONCURRENCY_LIMIT * CHECK_INTERVAL) === 0) {
      const shouldContinue = await shouldContinueProcessing(
        supabaseAdmin,
        fileId,
      );
      if (!shouldContinue) {
        throw new Error("Processing cancelled - file deleted or cancelled");
      }
    }

    const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batch.map(async (chunk, _index) => {
      try {
        return await processWithTimeout(chunk);
      } catch (_error) {
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

// Background processing function with cancellation support
async function processEmbeddingsInBackground(
  file_id: string,
  chunks: FileItemChunk[],
  piiResults: any[],
  embeddingsProvider: string,
  profile: any,
  supabaseAdmin: any,
) {
  try {
    const shouldStart = await shouldContinueProcessing(supabaseAdmin, file_id);
    if (!shouldStart) {
      logger.info("File deleted before processing started", {
        fileId: file_id,
      });
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
          .eq("id", file_id);
      } catch (error) {
        logger.error("Error updating progress", {
          fileId: file_id,
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : error,
        });
      }
    };

    if (embeddingsProvider === "openai") {
      // Initialize OpenAI client for background processing
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
        file_id,
        profile.user_id,
        updateProgress,
        supabaseAdmin,
      );
    } else if (embeddingsProvider === "local") {
      await processLocalEmbeddingsIncremental(
        chunks,
        piiResults,
        file_id,
        profile.user_id,
        updateProgress,
        supabaseAdmin,
      );
    }

    // Calculate total tokens
    const { data: fileItems } = await supabaseAdmin
      .from("file_items")
      .select("tokens")
      .eq("file_id", file_id);

    const totalTokens =
      fileItems?.reduce((acc, item) => acc + item.tokens, 0) || 0;

    const { error: finalUpdateError } = await supabaseAdmin
      .from("files")
      .update({
        tokens: totalTokens,
        processing_status: "completed",
        processing_progress: 100,
        updated_at: new Date().toISOString(),
      })
      .eq("id", file_id);

    if (finalUpdateError) {
      throw new Error(
        `Failed to update file completion status: ${finalUpdateError.message}`,
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Background processing error", {
      fileId: file_id,
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
          .eq("id", file_id);
      } catch (updateError) {
        logger.error("Failed to update error status", {
          fileId: file_id,
          error:
            updateError instanceof Error
              ? { message: updateError.message, name: updateError.name }
              : updateError,
        });
      }
    } else {
      logger.info("Processing stopped due to cancellation", {
        fileId: file_id,
      });
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
        logger.info("Processing aborted", {
          fileId,
          batch: batchIndex + 1,
          totalBatches,
        });
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
        `FILE ${fileId} Batch ${batchIndex + 1}/${totalBatches}`,
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

      const progress = (processedCount / totalChunks) * 100;
      if (updateProgress) {
        await updateProgress(progress);
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
        const progress = (processedCount / totalChunks) * 100;
        await updateProgress(progress);
      }
    }
  }
}

// INCREMENTAL Local embedding processing
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

    // Insert file items
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
      const progress = (processedCount / totalChunks) * 100;
      await updateProgress(progress);
    }
  }
}
