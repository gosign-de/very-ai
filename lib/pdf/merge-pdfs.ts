import { PDFDocument, StandardFonts } from "pdf-lib";

export const mergePdfBuffers = async (
  files: { buffer: Uint8Array | Buffer; name?: string }[],
): Promise<Uint8Array> => {
  if (!files || files.length === 0) {
    throw new Error("No PDF buffers provided for merge.");
  }

  const mergedPdf = await PDFDocument.create();
  const font = await mergedPdf.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < files.length; i++) {
    const { buffer, name } = files[i];
    const fileLabel = name || `File ${i + 1}`;

    try {
      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(buffer);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("encrypted")) {
          pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        } else {
          throw error;
        }
      }

      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      if (copiedPages.length > 0) {
        const firstPage = copiedPages[0];
        const { width, height } = firstPage.getSize();
        const fontSize = 14;
        const textWidth = font.widthOfTextAtSize(fileLabel, fontSize);
        const x = (width - textWidth) / 2;
        const y = height - 30;
        firstPage.drawText(fileLabel, {
          x,
          y,
          size: fontSize,
          font,
        });
      }
      copiedPages.forEach(page => mergedPdf.addPage(page));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process PDF "${fileLabel}": ${errorMessage}`);
    }
  }
  const mergedBytes = await mergedPdf.save();
  return mergedBytes;
};
