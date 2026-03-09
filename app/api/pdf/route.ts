import { NextResponse } from "next/server";
import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ feature: "api/pdf" });

export async function POST(req: Request) {
  try {
    await getServerProfile();
  } catch (_error) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const endpoint = process.env.PDF_ENDPOINT;
    const key = process.env.PDF_API_KEY;

    if (!endpoint || !key) {
      return NextResponse.json(
        { error: "Missing environment variables" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get("file") as Blob;

    if (!pdfFile) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 },
      );
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    const client = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(key),
    );

    const poller = await client.beginAnalyzeDocument(
      "prebuilt-read",
      pdfBuffer,
    );
    const data = await poller.pollUntilDone();

    if (!data || !data.pages || data.pages.length === 0) {
      return NextResponse.json(
        { error: "No pages were extracted" },
        { status: 400 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    logger.error("Error processing PDF", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 },
    );
  }
}
