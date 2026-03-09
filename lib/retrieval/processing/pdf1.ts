import JSZip, { JSZipObject } from "jszip";
import { parseStringPromise } from "xml2js";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { createClientLogger } from "@/lib/logger/client";

const logger = createClientLogger({ feature: "lib/retrieval/processing/pdf1" });

export const analyzeWithFormRecognizer = async pdf => {
  try {
    const formData = new FormData();
    formData.append("file", pdf);

    const response = await fetch("/api/pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to analyze the document");
    }

    const data = await response.json();
    const { pages, languages } = data;

    if (!pages || pages.length === 0) {
      return null;
    }

    let fullContent = "";

    for (const page of pages) {
      for (const line of page.lines) {
        fullContent += line.content + "\n";
      }
    }

    let filename = pdf.name.replace(/\.[^/.]+$/, "");
    filename = `${filename}.txt`;
    const metadataContent = `Metadata:\n- Original File Name: ${pdf.name}\n- Generated File Name: ${filename}\n- File Type: text/plain\n- Page Count: ${pages.length}\n- Languages: ${
      languages?.length > 0
        ? languages.map(lang => lang.locale).join(", ")
        : "None"
    }\n- Extracted On: ${new Date().toISOString()}\n\n`;

    const combinedContent = `${metadataContent}Content:\n\n${fullContent}`;
    const blob = new Blob([combinedContent], { type: "text/plain" });

    return new File([blob], filename, {
      type: "text/plain",
      lastModified: new Date().getTime(),
    });
  } catch (error) {
    logger.error("Error fetching analyzed file", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    return null;
  }
};

export const extractExcelImages = async (excel: File): Promise<File | null> => {
  let zipFile: File | null = null;
  let imageCount = 0; // To track how many images are found

  try {
    const fileExtension = excel.name.split(".").pop()?.toLowerCase();
    if (
      !["xlsx"].includes(fileExtension) ||
      excel.type !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return null;
    }

    const buffer = await excel.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch (_error) {
      throw new Error("The file could not be processed as a valid Excel file.");
    }

    const zip = new JSZip();

    for (const image of workbook.model.media) {
      if (image && image.buffer && image.extension) {
        const imageBuffer = image.buffer;
        const imageExtension = image.extension;
        const imageName = `${image.name}.${imageExtension}`;
        zip.file(imageName, imageBuffer);
        imageCount++;
      } else {
      }
    }
    if (imageCount === 0) {
      return null;
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    zipFile = new File([zipBlob], "images.zip", {
      type: "application/zip",
      lastModified: new Date().getTime(),
    });
  } catch (error) {
    logger.error(
      "An error occurred while extracting images from the Excel file",
      {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      },
    );
  }
  return zipFile;
};

export const extractPowerPointImages = async (
  pptFile: File,
): Promise<File | null> => {
  let zipFile: File | null = null;
  let _imageCount = 0;

  try {
    // Validate the file type
    const fileExtension = pptFile.name.split(".").pop()?.toLowerCase();
    if (
      !["pptx"].includes(fileExtension) ||
      pptFile.type !==
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      return null;
    }

    // Read the PPTX file as a binary
    const buffer = await pptFile.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }

    // Load the file using JSZip
    const zip = await JSZip.loadAsync(buffer);
    const imageFiles: { name: string; content: any }[] = [];
    // Extract all images from the pptx file
    const mediaFolder = "ppt/media"; // Folder inside pptx file where images are stored
    const imageFileNames = Object.keys(zip.files).filter(file =>
      file.startsWith(mediaFolder),
    );

    for (const imageFile of imageFileNames) {
      const fileContent = await (zip.file(imageFile) as JSZipObject).async(
        "nodebuffer",
      );
      const fileName = imageFile.split("/").pop();

      // Ensure the file is an image
      if (
        fileContent &&
        fileName.match(/\.(png|jpe?g|gif|bmp|tiff|webp|jpg|svg)$/i)
      ) {
        // Validation: Check if the image has valid content (e.g., buffer, extension)
        imageFiles.push({ name: fileName, content: fileContent });
        _imageCount++;
      }
    }
    // If no images were found, return null
    if (imageFiles.length === 0) {
      return null;
    }
    const outputZip = new JSZip();
    imageFiles.forEach(({ name, content }) => {
      outputZip.file(name, content);
    });

    const zipBlob = await outputZip.generateAsync({ type: "blob" });
    zipFile = new File([zipBlob], "images.zip", {
      type: "application/zip",
      lastModified: new Date().getTime(),
    });
  } catch (error) {
    logger.error(
      "An error occurred while extracting images from the PowerPoint file",
      {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      },
    );
  }

  return zipFile;
};

// Function to create a PDF from images in a ZIP file
export const createPdfFromZip = async (zipFile: File): Promise<File> => {
  // Read the ZIP file as an ArrayBuffer
  const zipBuffer = await zipFile.arrayBuffer();

  // Load the ZIP file using JSZip
  const zip = await JSZip.loadAsync(zipBuffer);

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();

  // Iterate through the files in the ZIP
  for (const fileName of Object.keys(zip.files)) {
    const file = zip.files[fileName];

    if (!file.dir) {
      // Read the file as a Uint8Array
      const imageBuffer = await file.async("uint8array");

      // Embed the image in the PDF
      let pdfImage;
      if (fileName.endsWith(".png")) {
        pdfImage = await pdfDoc.embedPng(imageBuffer);
      } else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
        pdfImage = await pdfDoc.embedJpg(imageBuffer);
      } else {
        logger.warn("Unsupported file format", { fileName });
        continue;
      }

      // Get image dimensions
      const { width, height } = pdfImage;

      // Add a new page to the PDF with the same dimensions as the image
      const page = pdfDoc.addPage([width, height]);

      // Draw the image on the page
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }
  }

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();

  // Create a File object from the PDF bytes
  const pdfBlob = new Blob([new Uint8Array(pdfBytes)], {
    type: "application/pdf",
  });
  const pdfFile = new File([pdfBlob], "images.pdf", {
    type: "application/pdf",
    lastModified: new Date().getTime(),
  });

  return pdfFile;
};

export const analyzeExcelFile = async (excel: File): Promise<File> => {
  const fileBuffer = await excel.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  let fullContent = "";
  let statisticsContent = "";
  let crossFieldAnalysis = "";

  const sheetNames: string[] = [];
  workbook.eachSheet(ws => sheetNames.push(ws.name));

  sheetNames.forEach(sheetName => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;

    // Convert ExcelJS worksheet to JSON array (same shape as old XLSX.utils.sheet_to_json)
    const rows = sheet.getSheetValues() as any[][];
    const headerRow = rows[1]; // ExcelJS is 1-indexed, first data row is headers
    if (!headerRow || headerRow.length === 0) return;
    const headers: string[] = headerRow.filter(h => h != null).map(String);
    const jsonData: Record<string, any>[] = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const obj: Record<string, any> = {};
      headers.forEach((header, idx) => {
        const val = row[idx + 1]; // ExcelJS cells are 1-indexed
        if (val !== undefined && val !== null) obj[header] = val;
      });
      if (Object.keys(obj).length > 0) jsonData.push(obj);
    }

    // Add sheet data in JSON format for better AI understanding
    fullContent += `Sheet: ${sheetName}\n\n`;

    // Add headers for context
    if (headers.length > 0) {
      fullContent += `Headers: ${headers.join(", ")}\n\n`;
    }

    // Add data as JSON records (compact format for efficiency)
    fullContent += "Data (JSON format - each line is one record):\n";
    jsonData.forEach((row, _index) => {
      fullContent += JSON.stringify(row) + "\n";
    });
    fullContent += "\n\n";

    // Build comprehensive statistics for summary chunk
    if (headers.length > 0 && jsonData.length > 0) {
      statisticsContent += `\n=== SHEET: ${sheetName} STATISTICS ===\n`;
      statisticsContent += `Rows: ${jsonData.length}, Columns: ${headers.length}\n`;
      statisticsContent += `Headers: ${headers.join(", ")}\n`;

      // Single field statistics
      headers.forEach(header => {
        const values = jsonData
          .map(row => row[header])
          .filter(val => val !== null && val !== undefined && val !== "");
        const uniqueValues = [...new Set(values)];

        if (uniqueValues.length <= 100 && values.length > 0) {
          const valueCounts = values.reduce((acc: any, val) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
          }, {});

          statisticsContent += `\nColumn "${header}" (${values.length} values, ${uniqueValues.length} unique):\n`;

          // Sort by count (descending) and show top 20 for better analysis
          const sortedCounts = Object.entries(valueCounts)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 20);

          sortedCounts.forEach(([value, count]) => {
            statisticsContent += `  ${value}: ${count}\n`;
          });

          // Add numeric range analysis for ALL numeric columns
          const numericValues = values.filter(
            v => typeof v === "number" && !isNaN(v),
          );
          if (numericValues.length > values.length * 0.8) {
            // Mostly numeric column
            const min = Math.min(...numericValues);
            const max = Math.max(...numericValues);
            const range = max - min;

            // Dynamic ranges based on data
            const thresholds = [];
            if (max > 100) {
              // For larger numbers, use percentage-based thresholds
              thresholds.push(
                {
                  value: min + range * 0.25,
                  label: `< ${Math.round(min + range * 0.25)}`,
                },
                {
                  value: min + range * 0.5,
                  label: `${Math.round(min + range * 0.25)}-${Math.round(min + range * 0.5)}`,
                },
                {
                  value: min + range * 0.75,
                  label: `${Math.round(min + range * 0.5)}-${Math.round(min + range * 0.75)}`,
                },
                {
                  value: Infinity,
                  label: `> ${Math.round(min + range * 0.75)}`,
                },
              );
            }

            // Also add common absolute thresholds if applicable
            const commonThresholds = [1000, 5000, 7000, 10000, 50000, 100000];
            const relevantThresholds = commonThresholds.filter(
              t => t > min && t < max,
            );

            if (relevantThresholds.length > 0) {
              statisticsContent += `  Common thresholds:\n`;
              relevantThresholds.forEach(threshold => {
                const above = numericValues.filter(v => v > threshold).length;
                const _below = numericValues.filter(v => v <= threshold).length;
                statisticsContent += `    > ${threshold}: ${above} records (${((above / numericValues.length) * 100).toFixed(1)}%)\n`;
              });
            }

            statisticsContent += `  Min: ${min.toFixed(0)}, Max: ${max.toFixed(0)}, Avg: ${(numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(0)}\n`;
          }

          if (Object.keys(valueCounts).length > 20) {
            statisticsContent += `  ... and ${Object.keys(valueCounts).length - 20} more values\n`;
          }
        } else if (values.length > 0) {
          statisticsContent += `\nColumn "${header}": ${values.length} values, ${uniqueValues.length} unique values (too many to list)\n`;
        }
      });

      // Optimized cross-field analysis for complex queries
      if (headers.length >= 2) {
        crossFieldAnalysis += `\n=== CROSS-FIELD ANALYSIS: ${sheetName} ===\n`;

        // General solution: Analyze categorical vs numeric field combinations
        const categoricalFields = [];
        const numericFields = [];

        // Identify field types
        headers.forEach(header => {
          const values = jsonData
            .map(row => row[header])
            .filter(v => v != null);
          if (values.length > 0) {
            const numericValues = values.filter(v => typeof v === "number");
            if (numericValues.length > values.length * 0.8) {
              // Mostly numeric field
              numericFields.push(header);
            } else {
              // Categorical field
              const uniqueValues = [...new Set(values)];
              if (uniqueValues.length <= 50) {
                // Reasonable number of categories
                categoricalFields.push(header);
              }
            }
          }
        });

        // Analyze each categorical field against each numeric field
        categoricalFields.slice(0, 5).forEach(catField => {
          numericFields.slice(0, 5).forEach(numField => {
            const analysis = {};

            jsonData.forEach(row => {
              const category = row[catField];
              const value = row[numField];

              if (category && typeof value === "number") {
                if (!analysis[category]) {
                  analysis[category] = {
                    count: 0,
                    sum: 0,
                    min: value,
                    max: value,
                    values: [],
                  };
                }
                analysis[category].count++;
                analysis[category].sum += value;
                analysis[category].min = Math.min(
                  analysis[category].min,
                  value,
                );
                analysis[category].max = Math.max(
                  analysis[category].max,
                  value,
                );
                analysis[category].values.push(value);
              }
            });

            // Only show if we have meaningful data
            if (
              Object.keys(analysis).length > 0 &&
              Object.keys(analysis).length <= 20
            ) {
              crossFieldAnalysis += `\n"${catField}" by "${numField}":\n`;

              Object.entries(analysis).forEach(
                ([category, stats]: [string, any]) => {
                  const avg = stats.sum / stats.count;
                  // Calculate common thresholds
                  const above1000 = stats.values.filter(v => v > 1000).length;
                  const above5000 = stats.values.filter(v => v > 5000).length;
                  const above7000 = stats.values.filter(v => v > 7000).length;
                  const above10000 = stats.values.filter(v => v > 10000).length;

                  crossFieldAnalysis += `  ${category}: ${stats.count} records\n`;
                  crossFieldAnalysis += `    Range: ${stats.min.toFixed(0)} - ${stats.max.toFixed(0)}, Avg: ${avg.toFixed(0)}\n`;
                  if (stats.max > 1000) {
                    crossFieldAnalysis += `    Distribution: >1k: ${above1000}, >5k: ${above5000}, >7k: ${above7000}, >10k: ${above10000}\n`;
                  }
                },
              );
            }
          });
        });

        // Only analyze most important field combinations (limit to prevent infinite processing)
        const importantHeaders = headers.slice(0, Math.min(5, headers.length)); // Max 5 fields

        for (let i = 0; i < importantHeaders.length; i++) {
          for (
            let j = i + 1;
            j < Math.min(i + 3, importantHeaders.length);
            j++
          ) {
            const field1 = importantHeaders[i];
            const field2 = importantHeaders[j];

            const combinations = new Map();

            jsonData.forEach((row, _rowIndex) => {
              const val1 = row[field1];
              const val2 = row[field2];

              if (val1 && val2) {
                const key = `${val1}|${val2}`;
                combinations.set(key, (combinations.get(key) || 0) + 1);
              }
            });

            // Only show if reasonable number of combinations
            if (combinations.size > 0 && combinations.size <= 100) {
              crossFieldAnalysis += `\n"${field1}" vs "${field2}" combinations:\n`;

              // Show top 30 combinations
              const sortedCombinations = Array.from(combinations.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30);

              sortedCombinations.forEach(([combination, count]) => {
                const [val1, val2] = combination.split("|");
                crossFieldAnalysis += `  ${val1} + ${val2}: ${count} records\n`;
              });

              if (combinations.size > 30) {
                crossFieldAnalysis += `  ... and ${combinations.size - 30} more combinations\n`;
              }
            }
          }
        }
      }
    }
  });

  if (fullContent.trim() === "") {
    throw new Error("The Excel file appears to be empty.");
  }

  // Prepare metadata
  const filenameWithoutExtension = excel.name.replace(/\.[^/.]+$/, "");
  const generatedFilename = `${filenameWithoutExtension}.txt`;
  const metadataContent = `Metadata:\n- Original File Name: ${excel.name}\n- Generated File Name: ${generatedFilename}\n- File Type: text/plain\n- Sheet Count: ${sheetNames.length}\n- Extracted On: ${new Date().toISOString()}\n\n`;

  // Create ONE file with SUMMARY CHUNK at the beginning, followed by data
  const summaryContent = `SUMMARY CHUNK - STATISTICS & ANALYTICS:\n\n${statisticsContent}${crossFieldAnalysis}\n\n`;
  const combinedContent = `${metadataContent}${summaryContent}Content:\n\n${fullContent}`;

  const blob = new Blob([combinedContent], { type: "text/plain" });
  const file = new File([blob], generatedFilename, {
    type: "text/plain",
    lastModified: new Date().getTime(),
  });

  return file;
};

type _ParsedPPT = {
  slides: Array<{
    text: string[];
  }>;
};

interface embeddedFiles {
  type: string;
  file: Blob;
}

export const analyzePowerPointFile = async (pptFile: File): Promise<File> => {
  try {
    const fileExtension = pptFile.name.split(".").pop()?.toLowerCase();
    const pptxMimeType =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const pptMimeType = "application/vnd.ms-powerpoint";

    // Validate file type
    if (
      !["pptx", "ppt"].includes(fileExtension) ||
      ![pptxMimeType, pptMimeType].includes(pptFile.type)
    ) {
      throw new Error(
        "The file is not a valid PowerPoint file. Only PPTX and PPT files are supported.",
      );
    }

    let fullContent = "";
    let images = [];
    let slideCount = 0;

    if (fileExtension === "pptx") {
      const fileBuffer = await pptFile.arrayBuffer();
      const zip = await JSZip.loadAsync(fileBuffer);

      // Extract text and images from the PowerPoint file
      for (const fileName in zip.files) {
        // Extract text from slide XML files
        if (
          fileName.startsWith("ppt/slides/slide") &&
          fileName.endsWith(".xml")
        ) {
          slideCount++;
          const slideContent = await zip.files[fileName].async("text");
          const parsedXml = await parseStringPromise(slideContent);
          const textElements =
            parsedXml?.["p:sld"]?.["p:cSld"]?.[0]?.["p:spTree"]?.[0]?.[
              "p:sp"
            ] || [];

          const textNodes = textElements
            .filter(
              (node: any) => node["p:txBody"] && node["p:txBody"][0]["a:p"],
            )
            .map((node: any) => {
              try {
                return node["p:txBody"][0]["a:p"]
                  .map((pNode: any) => {
                    return (
                      pNode?.["a:r"]
                        ?.map((rNode: any) => rNode?.["a:t"]?.[0] || "")
                        .join(" ") || ""
                    );
                  })
                  .join("\n");
              } catch {
                return "";
              }
            });

          if (textNodes.length > 0) {
            fullContent += `Slide: ${fileName}\n${textNodes.join("\n")}\n\n`;
          }
        }

        // Extract images from the ppt/media folder
        if (fileName.startsWith("ppt/media/")) {
          const imageBlob = await zip.files[fileName].async("blob");
          images.push({
            filename: fileName.split("/").pop(),
            blob: imageBlob,
          });
        }
      }
    } else {
      throw new Error(
        "Support for PPT files is not implemented in this version.",
      );
    }

    // Ensure content was extracted
    if (fullContent.trim() === "") {
      throw new Error("No readable content found in the PowerPoint file.");
    }

    // Add images to content
    if (images.length > 0) {
      fullContent += "\n\n--- Images ---\n";
      images.forEach((image, index) => {
        fullContent += `Image ${index + 1}: ${image.filename}\n`;
      });
    }

    // Prepare a metadata as a formatted string
    let filename = pptFile.name.replace(/\.[^/.]+$/, "");
    const textFileName = `${filename}.txt`;
    const metadataContent = `Metadata:\n- Original File Name: ${pptFile.name}\n- Generated File Name: ${textFileName}\n- File Type: text/plain\n- Slide Count: ${slideCount}\n- Image Count: ${images.length}\n- Extracted On: ${new Date().toISOString()}\n\n`;
    const combinedContent = `${metadataContent} Content:\n\n${fullContent}`;
    const blob = new Blob([combinedContent], { type: "text/plain" });
    const textFile = new File([blob], textFileName, {
      type: "text/plain",
      lastModified: new Date().getTime(),
    });

    // Optional: Save images as separate files or append them to the same file (e.g., base64-encoded)
    images.forEach(image => {
      const _imageFile = new File([image.blob], image.filename, {
        type: image.blob.type,
        lastModified: new Date().getTime(),
      });
    });

    return textFile;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error processing PowerPoint file", {
      error: { message: err.message, name: err.name },
    });
    throw new Error(`Could not process the PowerPoint file: ${err.message}`);
  }
};

export const extractEmbeddedFilesFromPowerPoint = async (
  pptFile: File,
): Promise<embeddedFiles[]> => {
  try {
    // Load the PowerPoint file as a ZIP
    const zip = await JSZip.loadAsync(pptFile);
    const embeddedFiles: embeddedFiles[] = [];

    // Iterate over the files in the ZIP archive
    for (const [path, fileObject] of Object.entries(zip.files)) {
      // Check for files inside the 'embeddings' directory and match specific extensions
      if (
        path.includes("embeddings") &&
        (path.endsWith(".bin") || path.endsWith(".xlsx"))
      ) {
        const binaryContent = await fileObject.async("nodebuffer");

        // Check if the file is likely an Excel file (looking for PK for ZIP-based formats like .xlsx)
        if (path.endsWith(".xlsx") || binaryContent.includes("PK")) {
          embeddedFiles.push({
            type: "excel",
            file: new Blob([new Uint8Array(binaryContent)], {
              type: "application/vnd.ms-excel",
            }),
          });
        } else {
          logger.warn("Unsupported file format in embedded files", { path });
        }
      }
    }
    return embeddedFiles;
  } catch (error) {
    logger.error("Error extracting embedded files from PowerPoint", {
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : error,
    });
    throw new Error("Failed to extract embedded files.");
  }
};

export const createPdfFromImages = async (
  imageFiles: JSZip.JSZipObject[],
): Promise<File> => {
  const pdfDoc = await PDFDocument.create();

  for (const file of imageFiles) {
    try {
      const imageBuffer = await file.async("uint8array");
      let pdfImage;
      if (file.name.endsWith(".png")) {
        pdfImage = await pdfDoc.embedPng(imageBuffer);
      } else if (file.name.endsWith(".jpg") || file.name.endsWith(".jpeg")) {
        if (imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8) {
          logger.warn("Invalid JPEG file", { fileName: file.name });
          continue;
        }
        pdfImage = await pdfDoc.embedJpg(imageBuffer);
      } else {
        logger.warn("Unsupported file format", { fileName: file.name });
        continue;
      }
      const { width, height } = pdfImage;
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    } catch (error) {
      logger.error("Error processing file", {
        fileName: file.name,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      });
    }
  }
  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([new Uint8Array(pdfBytes)], {
    type: "application/pdf",
  });
  const generatedPdf = new File([pdfBlob], "images.pdf", {
    type: "application/pdf",
    lastModified: new Date().getTime(),
  });
  return generatedPdf;
};

export async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function extractWordImages(file: File): Promise<File | null> {
  // Load the DOCX file as an ArrayBuffer and parse it with JSZip
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const mediaFolder = "word/media/";
  const imageFiles: { name: string; content: Uint8Array }[] = [];

  // Look for images in the media folder
  for (const filename in zip.files) {
    if (filename.startsWith(mediaFolder)) {
      const fileContent = await zip.files[filename].async("uint8array");
      const nameParts = filename.split("/");
      const imageName = nameParts[nameParts.length - 1];
      imageFiles.push({ name: imageName, content: fileContent });
    }
  }

  if (imageFiles.length === 0) return null;

  // Create a new PDF document to embed the images
  const pdfDoc = await PDFDocument.create();

  for (const img of imageFiles) {
    let embeddedImage;
    const lowerName = img.name.toLowerCase();

    if (lowerName.endsWith(".png")) {
      embeddedImage = await pdfDoc.embedPng(img.content);
    } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
      embeddedImage = await pdfDoc.embedJpg(img.content);
    } else {
      // Skip unsupported image formats
      continue;
    }

    const { width, height } = embeddedImage;
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  // Save the PDF and return it as a File
  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([new Uint8Array(pdfBytes)], {
    type: "application/pdf",
  });
  const pdfFile = new File([pdfBlob], "word-images.pdf", {
    type: "application/pdf",
    lastModified: new Date().getTime(),
  });

  return pdfFile;
}
export async function analyzeWordFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const { value: text } = await mammoth.extractRawText({ arrayBuffer });
  const filenameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
  const generatedFilename = `${filenameWithoutExtension}.txt`;
  const metadataContent = `Metadata:\n- Original File Name: ${file.name}\n- Generated File Name: ${generatedFilename}\n- File Type: text/plain\n- Extracted On: ${new Date().toISOString()}\n\n`;
  const combinedContent = `${metadataContent} Content:\n\n${text}`;
  const textBlob = new Blob([combinedContent], { type: "text/plain" });
  const textFile = new File([textBlob], generatedFilename, {
    type: "text/plain",
    lastModified: new Date().getTime(),
  });
  // Extract images from the Word file
  const imagesPdf = await extractWordImages(file);
  let imageAnalysisFile = null;
  if (imagesPdf) {
    imageAnalysisFile = await analyzeWithFormRecognizer(imagesPdf);
  }
  if (imageAnalysisFile) {
    const imageText = await readFileAsText(imageAnalysisFile);
    const fullContent = `${combinedContent}\n\n--- Extracted from Images ---\n${imageText}`;
    const combinedBlob = new Blob([fullContent], { type: "text/plain" });
    const combinedFile = new File([combinedBlob], generatedFilename, {
      type: "text/plain",
      lastModified: new Date().getTime(),
    });
    return combinedFile;
  }

  return textFile;
}
