import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/consume-stream" });

export async function consumeReadableStream(
  stream: ReadableStream<Uint8Array>,
  callback: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  signal.addEventListener("abort", () => reader.cancel(), { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        callback(decoder.decode(value, { stream: true }));
      }
    }
  } catch (error) {
    if (signal.aborted) {
      logger.error("Stream reading was aborted", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    } else {
      logger.error("Error consuming stream", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    }
  } finally {
    reader.releaseLock();
  }
}
