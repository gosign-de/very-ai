import { pipeline } from "@xenova/transformers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "lib/generate-local-embedding" });

export async function generateLocalEmbedding(content: string) {
  try {
    const generateEmbedding = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );

    const output = await generateEmbedding(content, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data);

    return embedding;
  } catch (error) {
    logger.error("Error generating local embedding", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw error;
  }
}
