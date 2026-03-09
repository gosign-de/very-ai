// src/routes/google-format-file.ts

import { getServerProfile } from "@/lib/server/server-chat-helpers";
import {
  VertexAI,
  GenerateContentRequest,
  Content,
  Part,
} from "@google-cloud/vertexai";
import { processChunksInBatches } from "@/lib/format-file-utils";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

const logger = createLogger({ feature: "api/chat/deepseek/format_file" });

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a helpful assistant that reformats or corrects the user's file based on their instructions. You will receive the file chunk by chunk. For each chunk, apply the following transformations without altering any substantive content or stylistic markers:
1. Remove only end-of-line word-break hyphens and correctly rejoin split words.
2. Eliminate unnecessary line breaks within paragraphs so that sentences flow continuously.
3. Collapse any run of multiple spaces into a single space.
4. Preserve every original character, including Umlauts (ä, ö, ü, Ä, Ö, Ü), ß, valid hyphens (e.g. in Klaus-Bungert-Straße), acronyms (e.g. ÜSQ), and all punctuation and quotation marks exactly as in the source.
5. Keep the exact order, numbering, and wording of all sections, headings, and tables of contents.
6. Do not duplicate or omit any lines or headings: if the same heading appears twice in succession, remove the redundant copy, and always retain decorative markers such as the enclosing dashes around "Vermieter" and "Mieter".
After processing each chunk, output the cleaned content exactly as it should appear in the final document, without introducing any other changes or reordering.
7.Do not wrap your output in any markdown code fences or language labels output the cleaned content as plain text exactly as it should appear in the final document, without any additional markup.`;

export async function POST(request: Request) {
  const body = (await request.json()) as any;

  // Azure shape: body.action
  if (body.action !== "format_file") {
    return new Response(
      JSON.stringify({ message: `Unsupported function: ${body.action}` }),
      { status: 400 },
    );
  }

  // Extract from your `format_FileData` wrapper
  const fileIds: string[] = body.format_FileData?.file_ids ?? [];
  const prompt: string = body.format_FileData?.prompt;

  if (!prompt || fileIds.length === 0) {
    return new Response(
      JSON.stringify({ message: "Missing prompt or file_ids" }),
      { status: 400 },
    );
  }

  // 2) Fetch all chunks from Supabase
  const { data: fileItems, error: dbError } = await getServiceClient()
    .from("file_items")
    .select("content, chunk_index")
    .eq("file_id", fileIds[0])
    .order("chunk_index", { ascending: true });

  if (dbError) {
    logger.error("Supabase error fetching file chunks", { error: dbError });
    return new Response(
      JSON.stringify({ message: "Error fetching file chunks" }),
      { status: 500 },
    );
  }

  if (!fileItems || fileItems.length === 0) {
    return new Response(JSON.stringify({ message: "No file chunks found" }), {
      status: 404,
    });
  }

  // 3) Initialize Vertex AI / Gemini 2.0
  const profile = await getServerProfile();
  let saCreds: Record<string, any>;
  try {
    saCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS!);
  } catch {
    throw new Error("Invalid or missing GOOGLE_SERVICE_ACCOUNT_CREDENTIALS");
  }
  const vertexAI = new VertexAI({
    project: process.env.VERTEX_AI_GEMINI_PROJECT_ID!,
    location: process.env.VERTEX_AI_GEMINI_LOCATION!,
    googleAuthOptions: {
      credentials: saCreds,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    },
  });

  const gemini = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  // 4) Process chunks based on model context window
  const chunks = fileItems ?? [];

  const formattedOutput = await processChunksInBatches(
    chunks,
    "gemini-2.5-flash", // Using the model from the route
    SYSTEM_PROMPT,
    prompt,
    async (batch, batchIndex) => {
      const combined = batch
        .map(
          (c, idx) =>
            `File Chunk ${batchIndex * batch.length + idx + 1}:\n${c.content}`,
        )
        .join("\n\n");

      // build the VertexAI request
      const contents: Content[] = [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] as Part[] },
        {
          role: "user",
          parts: [
            {
              text: `Instruction:\n${prompt}\n\n${combined}`,
            },
          ] as Part[],
        },
      ];
      const req: GenerateContentRequest = {
        contents,
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 65535, // Explicitly set max output tokens
        },
      };

      // call Gemini
      const result = await gemini.generateContent(req);
      const aiResponse = result.response;
      const candidate = aiResponse.candidates?.[0];

      if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error(`Invalid response from Gemini for batch ${batchIndex}`);
      }

      const text = candidate.content.parts
        .map(p => p.text)
        .join("")
        .trim();

      if (!text) {
        throw new Error(`Empty response from Gemini for batch ${batchIndex}`);
      }

      logger.info("Batch output processed", {
        batchIndex: batchIndex + 1,
        outputLength: text.length,
      });
      return text;
    },
  );

  // 5) Upload to Supabase Storage
  const userId = profile.user_id;
  const fileName = `formatted-${fileIds[0]}-${Date.now()}.txt`;
  const filePath = `${userId}/${fileName}`;
  const fileBuffer = Buffer.from(formattedOutput, "utf-8");

  const { error: uploadError } = await getServiceClient()
    .storage.from("files")
    .upload(filePath, fileBuffer, {
      contentType: "text/plain",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: signedData, error: signedError } = await getServiceClient()
    .storage.from("files")
    .createSignedUrl(filePath, 3600, { download: true });
  if (signedError) throw signedError;

  const linkHtml = `<a href="${signedData.signedUrl}" download>Download the file</a>`;
  // 6) Return the download URL
  return new Response(JSON.stringify({ message: linkHtml }), { status: 200 });
}
