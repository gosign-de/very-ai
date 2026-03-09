import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { ChatSettings } from "@/types";
import { sanitizeTextForPdf } from "@/lib/unicode-characters";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

const logger = createLogger({ feature: "api/chat/azure/pdf" });

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

// Function to fetch letterhead file paths
// async function getLetterheadFilesPaths(assistantData: {
//   letterhead_file_id: string;
//   letterhead_sub_file_id: string;
// }): Promise<{ letterheadFilePath: string; letterheadSubFilePath: string }> {
//   const { letterhead_file_id, letterhead_sub_file_id } = assistantData;

//   const { data: filesData, error: filesError } = await getServiceClient()
//     .from("files")
//     .select("id, file_path")
//     .in("id", [letterhead_file_id, letterhead_sub_file_id]);

//   if (filesError || !filesData) {
//     console.error(
//       `Error fetching file paths: ${filesError?.message || "Data not found"}`
//     );
//     throw new Error(
//       `Error fetching file paths: ${filesError?.message || "Data not found"}`
//     );
//   }

//   const letterheadFile = filesData.find(
//     (file) => file.id === letterhead_file_id
//   )?.file_path;
//   const letterheadSubFile = filesData.find(
//     (file) => file.id === letterhead_sub_file_id
//   )?.file_path;

//   if (!letterheadFile || !letterheadSubFile) {
//     console.error("Missing file paths:", { letterheadFile, letterheadSubFile });
//     throw new Error("Missing file paths");
//   }

//   return {
//     letterheadFilePath: letterheadFile,
//     letterheadSubFilePath: letterheadSubFile,
//   };
// }

// // Function to fetch dynamic dimensions
// async function getDynamicDimensions(fileId: string): Promise<{
//   pageWidth: number;
//   pageHeight: number;
//   x: number;
//   y: number;
// }> {
//   const { data, error } = await getServiceClient()
//     .from("files")
//     .select("page_width, page_height, x1, y4")
//     .eq("id", fileId)
//     .single();

//   if (error || !data) {
//     console.error(`Error fetching dimensions: ${error?.message || "Data not found"}`);
//     throw new Error(`Error fetching dimensions: ${error?.message || "Data not found"}`);
//   }
//   return {
//     pageWidth: (data.page_width) * 72,
//     pageHeight: (data.page_height) * 72,
//     x: (data.x1) * 72,
//     y: (data.y4 + 0.3) * 72,
//   };
// }

// API route handler
export async function POST(request: Request) {
  const json = await request.json();

  const {
    chatSettings: _chatSettings,
    pdfData: { pdfContent, userId, tableData },
  } = json as {
    chatSettings: ChatSettings;
    pdfData: {
      pdfContent: string;
      userId: string;
      tableData?: {
        headers: string[];
        rows: string[][];
      };
    };
  };

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const sanitizedPdfContent = sanitizeTextForPdf(pdfContent);
    const fontSize = 12;
    const lineHeight = 14;

    // A4 page dimensions in points
    const a4Width = 595.28;
    const a4Height = 841.89;

    // Margins in points (1 inch = 72 points)
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
      const { headers, rows } = tableData;
      const cellPadding = 5;
      const rowHeight = 20;
      const columnWidths = maxWidth / headers.length;

      // Draw table headers
      y -= lineHeight; // Add some spacing before the table
      if (y < marginY + rowHeight) {
        currentPage = pdfDoc.addPage([a4Width, a4Height]);
        y = height - marginY;
      }

      headers.forEach((header, index) => {
        const cellX = x + index * columnWidths;
        currentPage.drawText(header, {
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
          currentPage.drawText(cell, {
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

      return { currentPage, y }; // Return updated currentPage and y
    };

    // Split content by {{TABLE}} placeholder if it exists
    const contentParts = sanitizedPdfContent.includes("{{TABLE}}")
      ? sanitizedPdfContent.split("{{TABLE}}")
      : [sanitizedPdfContent];

    // Render text content and table
    for (let i = 0; i < contentParts.length; i++) {
      const part = contentParts[i];

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

      // Render table only if this is the placeholder's position and tableData exists
      if (i < contentParts.length - 1 && tableData) {
        const result = drawTable(currentPage, x, y); // Get updated page and y
        currentPage = result.currentPage; // Update currentPage
        y = result.y; // Update y

        // Add spacing after the table
        y -= lineHeight * 2;

        // Check for page break after the table
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
