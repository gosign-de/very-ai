import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { AzureOpenAI } from "openai";

/**
 * Main POST handler.
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();

    const { messages } = json;

    // Extract the last user's message content as a query
    const userMessage = messages
      .filter((message: any) => message.role === "user")
      .at(-1)?.content;

    let query = userMessage?.trim() || "";

    if (!query) {
      return new Response(
        JSON.stringify({ output: "", length: 0, tooLong: false }),
        { status: 200 },
      );
    }

    const searchClient = initializeSearchClient();

    const selectedFields = ["content"];
    const searchResults = await searchClient.search(query, {
      searchFields: ["content"],
      select: selectedFields,
      top: 1,
    });

    let doc = "";

    const _MAX_CHARACTERS = 4000;

    for await (const result of searchResults.results) {
      const document = result.document as { content: string };
      let formattedContent = formatDocument(`${document.content}.`);

      // If the formatted content exceeds the max characters, truncate it

      // if (formattedContent.length > MAX_CHARACTERS) {
      //     formattedContent = formattedContent.substring(0, MAX_CHARACTERS);
      // }

      doc += formattedContent;
    }

    const aiResponse = await generateAIResponse(doc, query);

    return new Response(JSON.stringify({ message: aiResponse }), {
      status: 200,
    });
  } catch (error) {
    let errorMessage = error.message || "An unexpected error occurred";
    const errorCode = error.status || 500;

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings.";
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings.";
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}

/**
 * Generates a response using Azure OpenAI based on the context of the retrieved documents.
 */
async function generateAIResponse(doc: string, query: string) {
  const azureApiKey = process.env["AZURE_OPENAI_API_KEY"];
  const deployment = process.env["AZURE_OPENAI_DEPLOYMENT_NAME"];
  const apiVersion = process.env["AZURE_OPENAI_API_VERSION"];
  const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
  const maxTokens = Number(process.env["MAX_TOKENS"]);

  // Initialize Azure OpenAI Client
  const azureOpenAIClient = new AzureOpenAI({
    endpoint: endpoint,
    apiKey: azureApiKey,
    deployment,
    apiVersion,
  });

  // Call the Azure OpenAI API
  const events = await azureOpenAIClient.chat.completions.create({
    model: deployment,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You are a SharePoint assistant. You must only answer questions based on the provided SharePoint documents. Do not use any external knowledge or your own pre-trained information.",
      },
      { role: "user", content: `Here is the query: ${query}` },
      { role: "assistant", content: `Context: ${doc}` }, // Provide the SharePoint docs as context
    ],
    max_tokens: maxTokens,
  });

  let aiResponse = "";

  // Process the stream of responses
  for await (const event of events) {
    for (const choice of event.choices) {
      aiResponse += choice.delta?.content;
    }
  }

  // Clean up the response to remove trailing "undefined"
  aiResponse = aiResponse.trim(); // Remove extra spaces
  if (aiResponse.endsWith("undefined")) {
    aiResponse = aiResponse.slice(0, -9);
  }

  return aiResponse;
}

/**
 * Initialize the Azure Cognitive Search Client.
 */
function initializeSearchClient() {
  const azureSearchEndpoint = process.env["AZURE_SEARCH_ENDPOINT"];
  const azureSearchIndexName = process.env["AZURE_SEARCH_INDEX"];
  const azureSearchKey = process.env["SECRET_AZURE_SEARCH_KEY"];

  if (!azureSearchEndpoint || !azureSearchIndexName || !azureSearchKey) {
    throw new Error(
      "Missing required Azure Search credentials in environment variables.",
    );
  }

  return new SearchClient(
    azureSearchEndpoint,
    azureSearchIndexName,
    new AzureKeyCredential(azureSearchKey),
  );
}

/**
 * Formats the result string.
 */
function formatDocument(result) {
  return `<context>${result}</context>`;
}
