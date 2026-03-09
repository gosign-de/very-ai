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

const logger = createLogger({ feature: "api/chat/google/crawler" });

export async function POST(req: Request) {
  try {
    const _profile = await getServerProfile();

    const body = await req.json();
    let crawlerParams;
    let userId;

    // First, try to get userId from the most reliable source
    if (body.profile?.user_id) {
      userId = body.profile.user_id;
    } else if (body.crawlerData?.userId) {
      userId = body.crawlerData.userId;
    }

    // Extract crawler parameters from the tool call arguments
    if (body.messages && Array.isArray(body.messages)) {
      // Look for the latest user message that contains a URL
      const lastUserMessage = body.messages
        .filter((msg: any) => msg.role === "user")
        .pop();

      if (lastUserMessage?.content) {
        const urlMatch = lastUserMessage.content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          crawlerParams = {
            url: [urlMatch[0]], // Convert to array format
            userId: userId,
            maxDepth: 2,
            maxPages: 10,
            extractTextOption: true,
          };
        }
      }
    }

    // Fallback: try to extract from crawlerData if available
    if (!crawlerParams && body.crawlerData) {
      crawlerParams = {
        ...body.crawlerData,
        userId: userId || body.crawlerData.userId,
      };
    }

    // Final fallback: try to extract from function call arguments in tool_calls
    if (
      !crawlerParams &&
      body.tool_calls &&
      body.tool_calls[0]?.function?.arguments
    ) {
      try {
        const functionArgs = JSON.parse(body.tool_calls[0].function.arguments);
        if (functionArgs.crawlerData) {
          crawlerParams = {
            ...functionArgs.crawlerData,
            userId: userId || functionArgs.crawlerData.userId,
          };
        }
      } catch (e) {
        logger.warn("Failed to parse tool call arguments", {
          error: e instanceof Error ? { message: e.message, name: e.name } : e,
        });
      }
    }

    if (!crawlerParams) {
      logger.error("No crawler parameters found");
      return Response.json(
        { error: "Crawler parameters not found." },
        { status: 400 },
      );
    }

    const {
      url,
      maxPages = 2,
      maxDepth = 1,
      extractTextOption = true,
    } = crawlerParams;

    // Enhanced validation
    if (!userId) {
      logger.error("Missing userId in crawler request");
      return Response.json({ error: "User ID is required." }, { status: 400 });
    }

    if (!url) {
      logger.error("Missing url in crawler request");
      return Response.json({ error: "URL is required." }, { status: 400 });
    }

    // Handle URL array or single URL
    let targetUrl: string;
    if (Array.isArray(url)) {
      if (url.length === 0) {
        logger.error("Empty URL array provided");
        return Response.json(
          { error: "At least one URL is required." },
          { status: 400 },
        );
      }
      targetUrl = url[0];
    } else {
      targetUrl = url;
    }

    if (!URL_REGEX.test(targetUrl)) {
      logger.error("Invalid URL format", { url: targetUrl });
      return Response.json({ error: "Invalid URL format." }, { status: 400 });
    }

    // SSRF protection: block requests to internal network addresses
    if (isInternalUrl(targetUrl)) {
      return Response.json(
        { error: "Requests to internal network addresses are not allowed." },
        { status: 400 },
      );
    }

    // Crawl website
    const { pages, metadata } = await crawl(
      targetUrl,
      maxPages,
      maxDepth,
      extractTextOption,
      logger,
    );

    if (!pages.length) {
      logger.warn("No pages found during crawl");
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
      description: `Crawled data from ${targetUrl}`,
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
        name: fileName,
        size: fileBuffer.length,
        pagesCount: pages.length,
        url: targetUrl,
      },
      metadata: {
        totalPages: metadata.totalPages,
        totalPagesQueued: metadata.totalPagesQueued,
        rootUrl: metadata.rootUrl,
      },
    });
  } catch (error) {
    logger.error("Crawler API error", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return Response.json(
      {
        error: "Internal server error.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
