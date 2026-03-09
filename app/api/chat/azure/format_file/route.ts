import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { processChunksInBatches } from "@/lib/format-file-utils";
import { createLogger } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/service-client";

const logger = createLogger({ feature: "api/chat/azure/format_file" });

const SYSTEM_PROMPT = `You are a helpful assistant that reformats or corrects the user's text file based on their instructions. You will receive the file chunk by chunk. For each chunk, apply the following transformations without altering any substantive content or stylistic markers:
1. Remove only end-of-line word-break hyphens and correctly rejoin split words.
2. Eliminate unnecessary line breaks within paragraphs so that sentences flow continuously.
3. Collapse any run of multiple spaces into a single space.
4. Preserve every original character, including Umlauts (ä, ö, ü, Ä, Ö, Ü), ß, valid hyphens (e.g. in Klaus-Bungert-Straße), acronyms (e.g. ÜSQ), and all punctuation and quotation marks exactly as in the source (for example German-style quotes „…", decorative dashes – –, straight quotes '…', etc.).
5. Keep the exact order, numbering, and wording of all sections, headings, and tables of contents.
6. Do not duplicate or omit any lines or headings: if the same heading appears twice in succession, remove the redundant copy, and always retain decorative markers such as the enclosing dashes around "Vermieter" and "Mieter".
After processing each chunk, output the cleaned text exactly as it should appear in the final document, without introducing any other changes or reordering.`;

export async function POST(request: Request) {
  const { format_FileData } = (await request.json()) as any;
  const prompt: string | undefined = format_FileData?.prompt;
  const fileIds: string[] = format_FileData?.file_ids ?? [];

  if (!prompt || fileIds.length === 0) {
    return new Response(
      JSON.stringify({ message: "Missing prompt or file_ids" }),
      { status: 400 },
    );
  }

  // 1) Fetch all chunks from Supabase
  const { data: fileItems, error: dbError } = await getServiceClient()
    .from("file_items")
    .select("content")
    .eq("file_id", fileIds[0])
    .order("chunk_index", { ascending: true });

  if (dbError) {
    logger.error("Supabase error fetching file chunks", { error: dbError });
    return new Response(
      JSON.stringify({ message: "Error fetching file chunks" }),
      { status: 500 },
    );
  }

  // 2) Prepare Azure credentials
  const profile = await getServerProfile();
  checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const deploymentId = profile.azure_openai_45_vision_id!;
  const apiVersion = "2023-12-01-preview";

  // 3) Process chunks based on model context window
  const chunks = fileItems ?? [];
  try {
    const formattedOutput = await processChunksInBatches(
      chunks,
      "gpt-4o", // Azure GPT-4 Vision model
      SYSTEM_PROMPT,
      prompt,
      async (batch, batchIndex) => {
        // Build one user message containing the batch chunks
        const combined = batch
          .map(
            (c, idx) =>
              `File Chunk ${batchIndex * batch.length + idx + 1}:\n${c.content}`,
          )
          .join("\n\n");

        const azurePayload = {
          model: deploymentId,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Instruction:\n${prompt}\n\n${combined}`,
            },
          ],
          temperature: 0.0,
        };

        const aiRes = await fetch(
          `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": apiKey,
            },
            body: JSON.stringify(azurePayload),
          },
        );

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          logger.error("Azure OpenAI error on batch", { errorText: errText });
          throw new Error(`Azure call failed: ${errText}`);
        }

        const aiJson = await aiRes.json();
        const formattedText =
          aiJson.choices?.[0]?.message?.content?.trim() ||
          "No formatted output returned";

        return formattedText;
      },
    );

    // 4) Upload the concatenated result to Supabase Storage
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

    if (uploadError) {
      logger.error("Supabase Storage upload error", { error: uploadError });
      throw uploadError;
    }

    const { data: signedData, error: signedError } = await getServiceClient()
      .storage.from("files")
      .createSignedUrl(filePath, 3600, { download: true });

    if (signedError) {
      logger.error("Error creating signed URL", { error: signedError });
      throw signedError;
    }

    const linkHtml = `<a href="${signedData.signedUrl}" download>Download the file</a>`;
    return new Response(JSON.stringify({ message: linkHtml }), { status: 200 });
  } catch (err: unknown) {
    logger.error("Formatting request failed", {
      error:
        err instanceof Error ? { message: err.message, name: err.name } : err,
    });
    const errObj = err instanceof Error ? err : new Error(String(err));
    return new Response(
      JSON.stringify({ message: errObj.message || "Formatting failed" }),
      { status: 500 },
    );
  }
}
