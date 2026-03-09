import { FileItemChunk } from "@/types";
import { encode } from "gpt-tokenizer";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CHUNK_OVERLAP, CHUNK_SIZE } from ".";

function extractJsonValues(obj: unknown): string[] {
  const values: string[] = [];
  if (obj === null || obj === undefined) return values;
  if (typeof obj === "string") {
    values.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) values.push(...extractJsonValues(item));
  } else if (typeof obj === "object") {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      values.push(...extractJsonValues(val));
    }
  }
  return values;
}

export const processJSON = async (json: Blob): Promise<FileItemChunk[]> => {
  const text = await json.text();
  const parsed = JSON.parse(text);
  let completeText = extractJsonValues(parsed).join(" ");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const splitDocs = await splitter.createDocuments([completeText]);

  let chunks: FileItemChunk[] = [];

  for (let i = 0; i < splitDocs.length; i++) {
    const doc = splitDocs[i];

    chunks.push({
      content: doc.pageContent,
      tokens: encode(doc.pageContent).length,
    });
  }

  return chunks;
};
