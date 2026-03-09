import { Buffer } from "buffer";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";
import { getServiceClient } from "@/lib/supabase/service-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/files/chunk-upload" });

const BUCKET = "files";
const CHUNK_FOLDER = "__chunks";
const DEFAULT_CHUNK_LIMIT = parseInt(
  process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT || "10000000",
  10,
);

const getSupabaseAdmin = () => getServiceClient();

const getChunkPrefix = (userId: string, encodedFileId: string) =>
  `${userId}/${CHUNK_FOLDER}/${encodedFileId}`;

export async function POST(request: NextRequest) {
  try {
    const { supabase } = createClient(request);
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = sessionData.session.user.id;
    const formData = await request.formData();

    const chunk = formData.get("chunk");
    const chunkIndex = Number(formData.get("chunkIndex"));
    const totalChunks = Number(formData.get("totalChunks"));
    const fileId = formData.get("fileId")?.toString();
    const fileName = formData.get("fileName")?.toString();
    const contentType =
      formData.get("contentType")?.toString() || "application/octet-stream";
    const fileSize = Number(formData.get("fileSize"));
    const providedChunkSize = Number(formData.get("chunkSize"));
    const offset = Number(formData.get("offset"));
    const providedUserId = formData.get("userId")?.toString();

    if (providedUserId && providedUserId !== userId) {
      return NextResponse.json(
        { error: "User mismatch for chunk upload" },
        { status: 403 },
      );
    }

    if (
      !(chunk instanceof Blob) ||
      !fileId ||
      Number.isNaN(chunkIndex) ||
      Number.isNaN(totalChunks) ||
      totalChunks <= 0 ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks ||
      Number.isNaN(offset) ||
      offset < 0
    ) {
      return NextResponse.json(
        { error: "Invalid chunk upload payload" },
        { status: 400 },
      );
    }

    if (chunk.size > DEFAULT_CHUNK_LIMIT) {
      return NextResponse.json(
        {
          error: `Chunk exceeds allowed size of ${Math.floor(DEFAULT_CHUNK_LIMIT / 1000000)}MB`,
        },
        { status: 400 },
      );
    }

    if (!Number.isNaN(providedChunkSize) && chunk.size !== providedChunkSize) {
      return NextResponse.json(
        { error: "Chunk size mismatch detected" },
        { status: 400 },
      );
    }

    const encodedFileId = Buffer.from(fileId).toString("base64");
    const chunkPrefix = getChunkPrefix(userId, encodedFileId);
    const paddedOffset = offset.toString().padStart(12, "0");
    const chunkPath = `${chunkPrefix}/${paddedOffset}`;
    const storage = getSupabaseAdmin().storage.from(BUCKET);

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    const { error: chunkUploadError } = await storage.upload(
      chunkPath,
      chunkBuffer,
      {
        upsert: true,
        contentType: "application/octet-stream",
      },
    );

    if (chunkUploadError) {
      logger.error("Failed to upload chunk", { error: chunkUploadError });
      return NextResponse.json(
        { error: "Failed to upload chunk" },
        { status: 500 },
      );
    }

    const isFinalChunk = chunkIndex + 1 === totalChunks;

    if (!isFinalChunk) {
      return NextResponse.json({
        success: true,
        chunkIndex,
        completed: false,
        filePath: null,
      });
    }

    const { data: chunkFiles, error: listError } = await storage.list(
      chunkPrefix,
      {
        limit: totalChunks,
        offset: 0,
      },
    );

    if (listError) {
      logger.error("Failed to list chunk files", { error: listError });
      return NextResponse.json(
        { error: "Failed to load chunk manifest" },
        { status: 500 },
      );
    }

    if (!chunkFiles || chunkFiles.length !== totalChunks) {
      return NextResponse.json(
        {
          error: "Chunk count mismatch during assembly",
        },
        { status: 409 },
      );
    }

    const sortedChunks = [...chunkFiles].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const chunkBuffers: Uint8Array[] = [];

    for (const entry of sortedChunks) {
      const { data, error } = await storage.download(
        `${chunkPrefix}/${entry.name}`,
      );

      if (error || !data) {
        logger.error("Failed to download chunk during assembly", { error });
        return NextResponse.json(
          { error: "Failed to download chunk during assembly" },
          { status: 500 },
        );
      }

      const arrayBuffer = await data.arrayBuffer();
      chunkBuffers.push(new Uint8Array(arrayBuffer));
    }

    const totalLength = chunkBuffers.reduce(
      (sum, current) => sum + current.length,
      0,
    );
    const combinedArray = new Uint8Array(totalLength);
    let writeOffset = 0;
    for (const array of chunkBuffers) {
      combinedArray.set(array, writeOffset);
      writeOffset += array.length;
    }
    const combinedBuffer = Buffer.from(combinedArray.buffer);

    if (
      !Number.isNaN(fileSize) &&
      fileSize > 0 &&
      combinedBuffer.length !== fileSize
    ) {
      logger.warn("Combined file size mismatch", {
        fileName,
        expectedSize: fileSize,
        actualSize: combinedBuffer.length,
      });
    }

    const finalPath = `${userId}/${encodedFileId}`;

    const { error: finalUploadError } = await storage.upload(
      finalPath,
      combinedBuffer,
      {
        upsert: true,
        contentType,
      },
    );

    if (finalUploadError) {
      logger.error("Failed to store combined file", {
        error: finalUploadError,
      });
      return NextResponse.json(
        { error: "Failed to store combined file" },
        { status: 500 },
      );
    }

    const chunkPathsToRemove = sortedChunks.map(
      entry => `${chunkPrefix}/${entry.name}`,
    );

    if (chunkPathsToRemove.length > 0) {
      const { error: cleanupError } = await storage.remove(chunkPathsToRemove);
      if (cleanupError) {
        logger.warn("Failed to clean up chunk files", { error: cleanupError });
      }
    }

    return NextResponse.json({
      success: true,
      chunkIndex,
      completed: true,
      filePath: finalPath,
    });
  } catch (error: unknown) {
    logger.error("Unexpected chunk upload error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: (error as any)?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
