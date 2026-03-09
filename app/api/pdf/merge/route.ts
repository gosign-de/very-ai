import { NextRequest, NextResponse } from "next/server";
import { mergePdfBuffers } from "@/lib/pdf/merge-pdfs";
import { getServerProfile } from "@/lib/server/server-chat-helpers";
import { getServiceClient } from "@/lib/supabase/service-client";

export async function POST(req: NextRequest) {
  try {
    await getServerProfile();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("user_id") as string | null;

    const pdfFiles = files.filter(
      f => f && f.type === "application/pdf",
    ) as File[];

    if (!pdfFiles || pdfFiles.length < 2) {
      return NextResponse.json(
        { error: "At least two PDF files are required to merge." },
        { status: 400 },
      );
    }

    const filesWithBuffers = [];
    for (const file of pdfFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const header = buffer.slice(0, 4);
      const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const isPdf =
        header.length === 4 &&
        header[0] === pdfHeader[0] &&
        header[1] === pdfHeader[1] &&
        header[2] === pdfHeader[2] &&
        header[3] === pdfHeader[3];

      if (!isPdf) {
        return NextResponse.json(
          {
            error: `File "${file.name}" is not a valid PDF file. It may have been converted to text format. Please upload the original PDF.`,
          },
          { status: 400 },
        );
      }

      filesWithBuffers.push({
        buffer,
        name: file.name,
      });
    }
    const mergedBytes = await mergePdfBuffers(filesWithBuffers);
    const ownerId = userId || "anonymous";
    const fileId = `merged_${Date.now()}`;
    const encodedFileId = Buffer.from(fileId).toString("base64");
    const filePath = `${ownerId}/${encodedFileId}`;

    const { error: uploadError } = await getServiceClient()
      .storage.from("files")
      .upload(filePath, mergedBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Failed to upload merged PDF." },
        { status: 500 },
      );
    }

    const { data: signedUrlData, error: signedUrlError } =
      await getServiceClient()
        .storage.from("files")
        .createSignedUrl(filePath, 60 * 60 * 24);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to create download URL for merged PDF." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        url: signedUrlData.signedUrl,
        filePath,
        fileCount: pdfFiles.length,
        outputSize: mergedBytes.length,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    let errorMessage = "Failed to merge PDFs";
    if ((error as any)?.message) {
      const msg = (error as any).message;
      if (msg.includes("encrypted")) {
        errorMessage =
          "One or more PDFs are password-protected and could not be processed. Please remove password protection and try again.";
      } else if (msg.includes("Failed to process PDF")) {
        errorMessage = msg;
      } else {
        errorMessage = `Failed to merge PDFs: ${msg}`;
      }
    }

    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
