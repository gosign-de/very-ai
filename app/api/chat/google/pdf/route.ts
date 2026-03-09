import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
// import { ChatSettings } from "@/types";
import { sanitizeTextForPdf } from "@/lib/unicode-characters";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

const logger = createLogger({ feature: "api/chat/google/pdf" });

function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(" ");
  let lines = [];
  let currentLine = "";

  for (let word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (lineWidth > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

// API route handler
export async function POST(request: Request) {
  try {
    const json = await request.json();

    // FIXED: Extract parameters from multiple possible sources
    let pdfContent;
    let userId;
    let tableData;
    let _chatSettings;

    // Extract chatSettings
    _chatSettings = json.chatSettings || {};

    // Get userId from the most reliable source
    if (json.profile?.user_id) {
      userId = json.profile.user_id;
    } else if (json.pdfData?.userId) {
      userId = json.pdfData.userId;
    }

    // FIXED: Extract PDF content from multiple sources
    if (json.pdfData?.pdfContent) {
      pdfContent = json.pdfData.pdfContent;
      tableData = json.pdfData.tableData;
    } else if (json.pdf_content) {
      pdfContent = json.pdf_content;
      tableData = json.table_data;
    } else if (json.messages && Array.isArray(json.messages)) {
      const lastAssistantMessage = json.messages
        .filter(msg => msg.role === "assistant")
        .pop();

      if (lastAssistantMessage?.content) {
        pdfContent = lastAssistantMessage.content;
      }
    }

    // Ensure pdfContent is a string
    if (typeof pdfContent !== "string") {
      if (Array.isArray(pdfContent)) {
        pdfContent = pdfContent.join("\n");
      } else {
        pdfContent = String(pdfContent || "");
      }
    }

    // Validate required parameters
    if (!userId) {
      logger.error("Missing userId in PDF request");
      return new Response(JSON.stringify({ message: "User ID is required." }), {
        status: 400,
      });
    }

    if (!pdfContent || pdfContent.length === 0) {
      logger.error("Missing PDF content");
      return new Response(
        JSON.stringify({ message: "PDF content is required." }),
        { status: 400 },
      );
    }
    const sanitizedPdfContent = sanitizeTextForPdf(pdfContent);
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 12;
    const lineHeight = 14;

    // A4 page dimensions in points
    const a4Width = 595.28;
    const a4Height = 841.89;
    const marginX = 56;
    const marginY = 72;

    let currentPage = pdfDoc.addPage([a4Width, a4Height]);
    if (tableData) {
      tableData.headers = tableData.headers.map(sanitizeTextForPdf);
      tableData.rows = tableData.rows.map(row => row.map(sanitizeTextForPdf));
    }
    pdfDoc.setSubject(
      `pdfContent:${sanitizedPdfContent} tableData:${JSON.stringify(tableData)}`,
    );
    const { width, height } = currentPage.getSize();

    let x = marginX;
    let y = height - marginY;
    const maxWidth = width - 2 * marginX;

    // Function to draw a table
    const drawTable = (currentPage, x, y) => {
      if (!tableData || !tableData.headers || !tableData.rows) {
        logger.warn("Invalid table data, skipping table drawing");
        return { currentPage, y };
      }

      const { headers, rows } = tableData;
      const cellPadding = 5;
      const rowHeight = 20;
      const columnWidths = maxWidth / headers.length;

      // Draw table headers
      y -= lineHeight;
      if (y < marginY + rowHeight) {
        currentPage = pdfDoc.addPage([a4Width, a4Height]);
        y = height - marginY;
      }

      headers.forEach((header, index) => {
        const cellX = x + index * columnWidths;
        currentPage.drawText(String(header || ""), {
          x: cellX + cellPadding,
          y: y - rowHeight + cellPadding,
          font: fontBold,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
        currentPage.drawRectangle({
          x: cellX,
          y: y - rowHeight,
          width: columnWidths,
          height: rowHeight,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
      });

      y -= rowHeight;

      // Draw table rows
      for (const row of rows) {
        if (y < marginY + rowHeight) {
          currentPage = pdfDoc.addPage([a4Width, a4Height]);
          y = height - marginY;
        }

        row.forEach((cell, index) => {
          const cellX = x + index * columnWidths;
          currentPage.drawText(String(cell || ""), {
            x: cellX + cellPadding,
            y: y - rowHeight + cellPadding,
            font,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          currentPage.drawRectangle({
            x: cellX,
            y: y - rowHeight,
            width: columnWidths,
            height: rowHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });
        });

        y -= rowHeight;
      }

      return { currentPage, y };
    };

    const contentParts =
      sanitizedPdfContent &&
      typeof sanitizedPdfContent === "string" &&
      sanitizedPdfContent.includes("{{TABLE}}")
        ? sanitizedPdfContent.split("{{TABLE}}")
        : [sanitizedPdfContent || ""];

    // Render text content and table
    for (let i = 0; i < contentParts.length; i++) {
      const part = contentParts[i] || "";

      // Render text paragraphs
      const paragraphs = part.split("\n");
      for (const paragraph of paragraphs) {
        const wrappedLines = wrapText(paragraph, font, fontSize, maxWidth);

        for (const line of wrappedLines) {
          if (y < marginY + lineHeight) {
            currentPage = pdfDoc.addPage([a4Width, a4Height]);
            y = height - marginY;
          }

          currentPage.drawText(line, {
            x: x,
            y: y,
            font,
            size: fontSize,
          });

          y -= lineHeight;
        }

        y -= lineHeight * 0.75;
      }

      // Render table if needed
      if (i < contentParts.length - 1 && tableData) {
        const result = drawTable(currentPage, x, y);
        currentPage = result.currentPage;
        y = result.y;

        y -= lineHeight * 2;

        if (y < marginY) {
          currentPage = pdfDoc.addPage([a4Width, a4Height]);
          y = height - marginY;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Insert file metadata into Supabase
    const fileRecord = {
      user_id: userId,
      description: "",
      file_path: "",
      name: `generated-pdf.pdf`,
      size: pdfBytes.length,
      tokens: 0,
      type: "pdf",
    };

    const { data: fileData, error: insertError } = await getServiceClient()
      .from("files")
      .insert(fileRecord)
      .select()
      .single();

    if (insertError) {
      logger.error("Error inserting file record", { error: insertError });
      throw new Error("Error inserting file record");
    }

    const pdfBlob = new Blob([new Uint8Array(pdfBytes)], {
      type: "application/pdf",
    });

    // Upload the Blob to Supabase Storage
    const { data: filePath, error: uploadError } = await getServiceClient()
      .storage.from("files")
      .upload(`${userId}/${fileData.id}.pdf`, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      logger.error("Error uploading file to storage", { error: uploadError });
      throw new Error("Error uploading file to storage");
    }

    const { data: _updatedFile, error: updatePathError } =
      await getServiceClient()
        .from("files")
        .update({
          file_path: filePath.path,
        })
        .eq("id", fileData.id)
        .select("*")
        .single();

    if (updatePathError) {
      throw new Error(updatePathError.message);
    }

    return new Response(
      JSON.stringify({
        message: `pdfFileId:${fileData.id}<<END>><<pdfContentStart>>${sanitizedPdfContent} tableData:${JSON.stringify(tableData)}<<pdfContentEnd>>`,
      }),
      {
        status: 200,
      },
    );
  } catch (error) {
    logger.error("Error generating pdf", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return new Response(
      JSON.stringify({
        message: "Failed to generate pdf",
        error: error.message,
      }),
      {
        status: 500,
      },
    );
  }
}
