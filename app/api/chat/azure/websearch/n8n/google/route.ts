import { ChatSettings } from "@/types";
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import {
  VertexAI,
  GenerateContentRequest,
  Content,
  Part,
} from "@google-cloud/vertexai";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import { getDeepseekOAuthToken } from "../../../../deepseek/fetch-oauth-token";

export const runtime = "nodejs";

// Function to format search results into a readable context
function formatSearchResults(responseData: any[]): string {
  if (!responseData || responseData.length === 0) {
    return "No search results found.";
  }

  let formattedResults = "Here are the search results:\n\n";

  responseData.forEach((result, index) => {
    if (result.items && Array.isArray(result.items)) {
      result.items.forEach((item, itemIndex) => {
        formattedResults += `${index + 1}.${itemIndex + 1} **${item.title}**\n`;
        formattedResults += `URL: ${item.link}\n`;
        formattedResults += `Summary: ${item.snippet}\n\n`;
      });
    }
  });

  return formattedResults;
}

// Function to handle Gemini results
async function geminiResults(
  chatSettings: ChatSettings,
  responseData: any[],
  messages: any[],
) {
  try {
    // Initialize Vertex AI with service account credentials
    let serviceAccountCredentials;
    try {
      serviceAccountCredentials = JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || "{}",
      );
      if (!Object.keys(serviceAccountCredentials).length) {
        throw new Error("Service account credentials not found");
      }
    } catch {
      throw new Error("Invalid service account credentials format");
    }

    // Ensure required environment variables are available
    if (
      !process.env.VERTEX_AI_GEMINI_PROJECT_ID ||
      !process.env.VERTEX_AI_GEMINI_LOCATION
    ) {
      throw new Error("Missing required Vertex AI configuration");
    }

    const vertexAI = new VertexAI({
      project: process.env.VERTEX_AI_GEMINI_PROJECT_ID,
      location: process.env.VERTEX_AI_GEMINI_LOCATION,
      googleAuthOptions: {
        credentials: serviceAccountCredentials,
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      },
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: chatSettings.model.includes("gemini")
        ? chatSettings.model
        : "gemini-2.5-flash",
    });

    // Get the user's query from the last message
    const userQuery = messages.at(-1)?.content || "";

    // Format the search results
    const searchContext = formatSearchResults(responseData);

    // Create the prompt with search context
    const systemPrompt = `You are a helpful AI assistant. You have been provided with web search results to help answer the user's question. Use the search results to provide a comprehensive and accurate answer. If the search results don't contain relevant information, mention that and provide the best answer you can based on your general knowledge.

IMPORTANT: At the end of your response, always include 2-3 of the most valid and reliable links from the search results that directly relate to the user's question. Format them as:

**Relevant Sources:**
1. [Title](URL) - Brief description
2. [Title](URL) - Brief description
3. [Title](URL) - Brief description

Search Results:
${searchContext}

User Question: ${userQuery}

Please provide a detailed answer based on the search results and your knowledge, followed by the most relevant source links:`;

    const messageContents: Content[] = [
      {
        role: "user",
        parts: [{ text: systemPrompt } as Part],
      },
    ];

    // Configure generation parameters with thinking support for 2.5 models
    const generationConfig: any = {
      temperature: chatSettings.temperature || 0.7,
      maxOutputTokens: 4096,
    };

    // Add thinking configuration for Gemini 2.5 Pro and Flash models
    if (
      chatSettings.model === "gemini-2.5-pro" ||
      chatSettings.model === "gemini-2.5-flash"
    ) {
      generationConfig.thinkingConfig = {
        thinkingBudget: -1, // Unlimited thinking budget
        includeThoughts: true, // Enable thinking output in response
      };
    }

    // Prepare the request payload
    const requestPayload: GenerateContentRequest = {
      contents: messageContents,
      generationConfig,
    };

    // Stream the response - collect content and stream properly
    const response_stream =
      await generativeModel.generateContentStream(requestPayload);

    const encoder = new TextEncoder();

    // Create a readable stream with proper real-time streaming
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Stream content immediately as it arrives
          for await (const chunk of response_stream.stream) {
            if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
              const candidateParts = chunk.candidates[0].content.parts;

              for (const part of candidateParts) {
                if (part.text) {
                  const isThoughtPart = (part as any).thought === true;

                  if (isThoughtPart) {
                    // Wrap each thinking chunk in <think></think> tags for proper display
                    controller.enqueue(
                      encoder.encode(`<think>${part.text}</think>`),
                    );
                  } else {
                    // Stream regular content immediately
                    controller.enqueue(encoder.encode(part.text));
                  }
                }
              }
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return new Response(
      JSON.stringify({
        message: `Gemini API error: ${err.message || "An unexpected error occurred"}`,
      }),
      { status: 500 },
    );
  }
}

// Function to handle OpenAI/Azure OpenAI results
async function openAIResults(
  chatSettings: ChatSettings,
  responseData: any[],
  messages: any[],
) {
  try {
    const profile = await getServerProfile();
    checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");

    const ENDPOINT = profile.azure_openai_endpoint;
    const KEY = profile.azure_openai_api_key;

    let DEPLOYMENT_ID = "";
    switch (chatSettings.model) {
      case "gpt-3.5-turbo":
        DEPLOYMENT_ID = profile.azure_openai_35_turbo_id || "";
        break;
      case "gpt-4-turbo-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_turbo_id || "";
        break;
      case "gpt-4-vision-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
        break;
      case "gpt-4o":
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
        break;
      case "o3-mini":
        DEPLOYMENT_ID = (profile as any).azure_openai_o3_mini_id || "o3-mini";
        break;
      default:
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || "";
        break;
    }

    let apiVersion = "2023-12-01-preview";
    if (chatSettings.model === "o3-mini") {
      apiVersion = "2024-12-01-preview";
    }

    if (!ENDPOINT || !KEY || !DEPLOYMENT_ID) {
      return new Response(
        JSON.stringify({ message: "Azure resources not found" }),
        { status: 400 },
      );
    }

    const azureOpenai = new OpenAI({
      apiKey: KEY,
      baseURL: `${ENDPOINT}/openai/deployments/${DEPLOYMENT_ID}`,
      defaultQuery: { "api-version": apiVersion },
      defaultHeaders: { "api-key": KEY },
    });

    // Get the user's query from the last message
    const userQuery = messages.at(-1)?.content || "";

    // Format the search results
    const searchContext = formatSearchResults(responseData);

    // Create the messages for the conversation
    const conversationMessages = [
      {
        role: "system",
        content: `You are a helpful AI assistant. You have been provided with web search results to help answer the user's question. Use the search results to provide a comprehensive and accurate answer. If the search results don't contain relevant information, mention that and provide the best answer you can based on your general knowledge.

IMPORTANT: At the end of your response, always include 2-3 of the most valid and reliable links from the search results that directly relate to the user's question. Format them as:

**Relevant Sources:**
1. [Title](URL) - Brief description
2. [Title](URL) - Brief description
3. [Title](URL) - Brief description

Search Results:
${searchContext}`,
      },
      {
        role: "user",
        content: userQuery,
      },
    ];

    const isO3Mini = chatSettings.model === "o3-mini";

    const response = await azureOpenai.chat.completions.create({
      model: DEPLOYMENT_ID as ChatCompletionCreateParamsBase["model"],
      messages:
        conversationMessages as ChatCompletionCreateParamsBase["messages"],
      stream: true, // Enable streaming
      ...(isO3Mini
        ? {
            max_completion_tokens: 4096,
            reasoning_effort: "medium",
          }
        : {
            max_tokens: 4096,
            temperature: chatSettings.temperature || 0.7,
          }),
    });

    const encoder = new TextEncoder();

    // Create a readable stream to handle the response with real-time streaming
    const readableStream = new ReadableStream({
      async start(controller) {
        let thinkingStarted = false;

        try {
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;

            // Handle o3-mini reasoning content (stream as it arrives)
            if (isO3Mini && (delta as any)?.reasoning) {
              const reasoning = (delta as any).reasoning;

              // Send thinking start tag on first reasoning chunk
              if (!thinkingStarted) {
                controller.enqueue(encoder.encode("<think>"));
                thinkingStarted = true;
              }

              // Stream reasoning content immediately
              controller.enqueue(encoder.encode(reasoning));
            }

            // Handle regular content (stream as it arrives)
            if (delta?.content) {
              // Close thinking tag if we were in thinking mode
              if (thinkingStarted) {
                controller.enqueue(encoder.encode("</think>"));
                thinkingStarted = false;
              }

              // Stream regular content immediately
              controller.enqueue(encoder.encode(delta.content));
            }
          }

          // Close any open thinking tag if stream ends while in thinking mode
          if (thinkingStarted) {
            controller.enqueue(encoder.encode("</think>"));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage =
      (error as any)?.error?.message ||
      err.message ||
      "An unexpected error occurred";
    return new Response(
      JSON.stringify({ message: `OpenAI API error: ${errorMessage}` }),
      { status: (error as any)?.status || 500 },
    );
  }
}

// Function to handle Deepseek results
async function deepseekResults(
  chatSettings: ChatSettings,
  responseData: any[],
  messages: any[],
) {
  try {
    const profile = await getServerProfile();

    // Check if user has deepseek_api_service_account, otherwise use environment variable
    const deepseekServiceAccountToken =
      profile.deepseek_api_service_account ||
      process.env.DEEPSEEK_API_SERVICE_ACCOUNT;
    checkApiKey(deepseekServiceAccountToken, "Deepseek");

    const accessToken = await getDeepseekOAuthToken(
      deepseekServiceAccountToken!,
    );
    const ENDPOINT = process.env.DEEPSEEK_API_ENDPOINT;

    // Get the user's query from the last message
    const userQuery = messages.at(-1)?.content || "";

    // Format the search results
    const searchContext = formatSearchResults(responseData);

    // Create the messages for the conversation with enhanced system prompt
    const conversationMessages = [
      {
        role: "system",
        content: `You are a helpful AI assistant with access to web search results. You have been provided with current web search results to help answer the user's question.

IMPORTANT INSTRUCTIONS:
1. Use the search results to provide a comprehensive and accurate answer
2. If the search results don't contain relevant information, mention that and provide the best answer you can based on your general knowledge
3. Always include 2-3 of the most valid and reliable links from the search results that directly relate to the user's question
4. Format the sources as:

**Relevant Sources:**
1. [Title](URL) - Brief description
2. [Title](URL) - Brief description
3. [Title](URL) - Brief description

Search Results:
${searchContext}`,
      },
      {
        role: "user",
        content: userQuery,
      },
    ];

    // Token Limits for Deepseek R1 (same as main route)
    const MODEL_TOKEN_LIMITS = {
      "deepseek-ai/deepseek-r1-0528-maas": 163840,
      default: 163840,
    };

    // Helper function to estimate the token limit for a given model
    function estimateTokenLimit(text: string) {
      // Rough estimation: 1 token ~= 4 characters
      return Math.ceil(text.length / 4);
    }

    // Calculate total tokens in the conversation
    const totalTokens = conversationMessages.reduce((acc, message) => {
      return acc + (message.content ? estimateTokenLimit(message.content) : 0);
    }, 0);

    const modelTokenLimit =
      MODEL_TOKEN_LIMITS[chatSettings.model] || MODEL_TOKEN_LIMITS.default;

    if (totalTokens > modelTokenLimit) {
      return new Response(
        JSON.stringify({
          message: `Input exceeds the maximum token limit of ${modelTokenLimit} tokens.`,
        }),
        { status: 400 },
      );
    }

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chatSettings.model,
        messages: conversationMessages,
        max_tokens: Math.min(8192, modelTokenLimit - totalTokens),
        temperature: chatSettings.temperature || 0.7,
        stream: true,
        // Add parameters to encourage thinking/reasoning (same as main route)
        thinking: true,
        reasoning: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepseek API error: ${response.status} ${errorText}`);
    }

    const encoder = new TextEncoder();

    // Create a readable stream to handle the response
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.error(new Error("No response body"));
          return;
        }

        let isThinking = false;
        let thinkingStartSent = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // If we were in thinking mode but stream ended, close the thinking block
              if (isThinking && thinkingStartSent) {
                controller.enqueue(encoder.encode("</think>"));
              }

              controller.close();
              break;
            }

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);

                if (data === "[DONE]") {
                  // If we were in thinking mode but stream ended, close the thinking block
                  if (isThinking && thinkingStartSent) {
                    controller.enqueue(encoder.encode("</think>"));
                  }

                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed?.choices?.[0]?.delta;

                  // Handle thinking response (Deepseek R1 specific)
                  if (delta?.content) {
                    const content = delta.content;

                    // Check if this content contains thinking markers
                    if (content.includes("<think>")) {
                      isThinking = true;
                      thinkingStartSent = false;

                      // Check if there's content after <think> in the same chunk
                      const afterThinkStartIndex =
                        content.indexOf("<think>") + 7;
                      const afterThinkStartContent =
                        content.substring(afterThinkStartIndex);
                      if (afterThinkStartContent.trim()) {
                        // Send thinking start marker only when we have content
                        if (!thinkingStartSent) {
                          controller.enqueue(encoder.encode("<think>"));
                          thinkingStartSent = true;
                        }
                        // Stream the thinking content immediately
                        controller.enqueue(
                          encoder.encode(afterThinkStartContent),
                        );
                      }
                      continue;
                    }

                    if (isThinking) {
                      if (content.includes("</think>")) {
                        isThinking = false;

                        // Split content at </think>
                        const thinkEndIndex = content.indexOf("</think>");
                        const beforeThinkEnd = content.substring(
                          0,
                          thinkEndIndex,
                        );
                        const afterThinkEnd = content.substring(
                          thinkEndIndex + 8,
                        );

                        // Stream content before </think>
                        if (beforeThinkEnd.trim()) {
                          // Send thinking start marker if not sent yet
                          if (!thinkingStartSent) {
                            controller.enqueue(encoder.encode("<think>"));
                            thinkingStartSent = true;
                          }
                          // Stream the thinking content immediately
                          controller.enqueue(encoder.encode(beforeThinkEnd));
                        }

                        // End thinking block if we had thinking content
                        if (thinkingStartSent) {
                          controller.enqueue(encoder.encode("</think>"));
                        }

                        // Stream content after </think> immediately
                        if (afterThinkEnd.trim()) {
                          controller.enqueue(encoder.encode(afterThinkEnd));
                        }
                      } else {
                        // Send thinking start marker if not sent yet
                        if (!thinkingStartSent) {
                          controller.enqueue(encoder.encode("<think>"));
                          thinkingStartSent = true;
                        }
                        // Stream the thinking content immediately
                        controller.enqueue(encoder.encode(content));
                      }
                    } else {
                      // Stream regular content immediately
                      controller.enqueue(encoder.encode(content));
                    }
                  }
                } catch (_parseError) {
                  // Silently ignore JSON parsing errors for incomplete chunks
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage =
      (error as any)?.error?.message ||
      err.message ||
      "An unexpected error occurred";
    return new Response(
      JSON.stringify({ message: `Deepseek API error: ${errorMessage}` }),
      { status: (error as any)?.status || 500 },
    );
  }
}

export async function POST(request: Request) {
  const json = await request.json();
  const { chatSettings, messages, provider, searchWeb } = json as {
    chatSettings: ChatSettings;
    messages: any[];
    provider?: string;
    searchWeb: {
      query: string;
    };
  };

  const profile = await getServerProfile();
  checkApiKey(profile.azure_openai_api_key, "Azure OpenAI");

  const _endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY!;
  const _deploymentId = profile.azure_openai_45_vision_id!;
  const _apiVersion = "2023-12-01-preview";

  try {
    const requestUrl = process.env.N8N_GOOGLE_WEBSEARCH_ENDPOINT;
    const websearchApiKey = process.env.N8N_WEBSEARCH_API_KEY;

    // Validate environment and input
    if (!requestUrl) {
      return new Response(
        JSON.stringify({
          message: "Server misconfiguration: API endpoint is missing.",
        }),
        { status: 500 },
      );
    }

    if (!websearchApiKey || !azureApiKey) {
      return new Response(
        JSON.stringify({ message: "Authorization issue: API key is not set." }),
        { status: 401 },
      );
    }
    const query = searchWeb?.query?.trim();
    if (!query) {
      return new Response(
        JSON.stringify({ message: "No search query provided." }),
        { status: 400 },
      );
    }

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: websearchApiKey,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return new Response(
        JSON.stringify({
          message: `API request failed with status ${response.status}: ${errorData}`,
        }),
        { status: 502 },
      );
    }

    const responseData = await response.json();

    if (provider === "google") {
      return await geminiResults(chatSettings, responseData, messages);
    } else if (provider === "azure") {
      return await openAIResults(chatSettings, responseData, messages);
    } else if (provider === "deepseek") {
      return await deepseekResults(chatSettings, responseData, messages);
    }

    // Default response if no provider matches
    return new Response(
      JSON.stringify({ message: "Invalid provider specified" }),
      { status: 400 },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = err.message || "An unexpected error occurred";
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: 500,
    });
  }
}
