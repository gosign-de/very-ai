import { Blob } from "buffer";
import crypto from "crypto";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { createLogger } from "@/lib/logger";
import {
  isInternalUrl,
  crawl,
  updateFile,
  getSupabase,
  URL_REGEX,
  type FileRecord,
} from "@/lib/crawler/crawler-utils";

const logger = createLogger({ feature: "api/chat/deepseek/crawler" });

// Enhanced POST handler
export async function POST(req: Request) {
  try {
    const _profile = await getServerProfile();

    const body = await req.json();
    const {
      url,
      maxPages = 2,
      maxDepth = 1,
      extractTextOption = true,
      userId,
    } = body.crawlerData;

    // Validate inputs
    if (!userId) {
      return Response.json({ error: "User ID is required." }, { status: 400 });
    }

    if (!url || !URL_REGEX.test(url)) {
      return Response.json({ error: "Invalid URL format." }, { status: 400 });
    }

    // SSRF protection: block requests to internal network addresses
    if (isInternalUrl(url)) {
      return Response.json(
        { error: "Requests to internal network addresses are not allowed." },
        { status: 400 },
      );
    }

    // Crawl website
    const { pages, metadata } = await crawl(
      url,
      maxPages,
      maxDepth,
      extractTextOption,
      logger,
    );

    if (!pages.length) {
      return Response.json({ error: "No pages found." }, { status: 404 });
    }

    // Prepare file data
    const fileId = crypto.randomUUID();
    const fileName = `${fileId}-crawled-data.txt`;
    const fileContent = JSON.stringify({ pages, metadata }, null, 2);
    const fileBlob = new Blob([fileContent], { type: "text/plain" });
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    // Create file record
    const fileRecord: FileRecord = {
      id: fileId,
      user_id: userId,
      description: `Crawled data from ${url}`,
      file_path: "",
      name: fileName,
      size: fileBuffer.length,
      tokens: 0,
      type: "text/plain",
    };

    // Insert file record
    const { data: fileData, error: insertError } = await getSupabase()
      .from("files")
      .insert(fileRecord)
      .select()
      .single();

    if (insertError) {
      logger.error("Error inserting file record", { error: insertError });
      return Response.json(
        { error: "Failed to save file metadata." },
        { status: 500 },
      );
    }

    // Upload file content
    const { data: filePath, error: uploadError } = await getSupabase()
      .storage.from("files")
      .upload(`${userId}/${fileData.id}.txt`, fileBuffer, {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadError) {
      logger.error("Error uploading file to storage", { error: uploadError });
      return Response.json(
        { error: "Failed to upload file content." },
        { status: 500 },
      );
    }

    // Update file path
    await updateFile(fileData.id, { file_path: filePath.path }, logger);

    return Response.json({
      success: true,
      file: {
        id: fileData.id,
      },
    });
  } catch (error) {
    logger.error("Crawler API error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
