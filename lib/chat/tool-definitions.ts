/**
 * Shared tool/function definitions for chat routes.
 *
 * Each provider (OpenAI/Azure/Deepseek vs Google Vertex AI) requires a
 * different JSON structure, but the semantic definitions are identical.
 * This module is the single source of truth for those definitions.
 */

import { SchemaType, Tool } from "@google-cloud/vertexai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";

// ---------------------------------------------------------------------------
// Provider-agnostic tool metadata
// ---------------------------------------------------------------------------

export const TOOL_DESCRIPTIONS = {
  generateImage: {
    name: "generateImage",
    description:
      "Generate an image if the user is trying to create an image or edit or change something in the image, whether it's detailed or minimal.",
    googleDescription:
      "Generate an image ONLY when the user explicitly asks to create, generate, or edit an image. Do NOT use this for simple descriptions or when the user is asking for code, text, or other non-image content.",
  },
  create_pdf: {
    name: "create_pdf",
    description:
      "Creates a PDF document with optional plain text and table data. Inserts a placeholder '{{TABLE}}' for the table data if it exists. If table data exists its content is always returned separately in content and tableData properties",
    googleDescription:
      "Creates a PDF document with optional plain text and table data. Inserts a placeholder '{{TABLE}}' for the table data if it exists.",
  },
  crawlWebsite: {
    name: "crawlWebsite",
    description:
      "Crawls one or more websites to collect data, with options for depth, filtering, and saving the data. Use when the user wants to extract information from one or more websites or to analyze their structure.",
    googleDescription:
      "Crawls one or more websites to collect data, with options for depth, filtering, and saving the data.",
  },
  searchWeb: {
    name: "searchWeb",
    description:
      "Search for information on the web if user is asking for current information like weather or news or current affairs.",
    googleDescription:
      "Search for information on the web ONLY when user is specifically asking for current/real-time information like weather, news, current affairs, or recent events. Do NOT use this for general knowledge questions that can be answered directly.",
  },
} as const;

export const PARAM_DESCRIPTIONS = {
  generateImage: {
    prompt:
      "A description of the image to be generated or edited. Can be a detailed or minimal prompt.",
  },
  create_pdf: {
    content:
      "Plain text content for the PDF. Use '{{TABLE}}' as a placeholder to specify where the table should be inserted. The placeholder '{{TABLE}}' could be at the start of document, at the end, or anywhere in the middle. If not provided, the placeholder will be appended at the end of the content. This will not include any table content.",
    contentGoogle:
      "Plain text content for the PDF. Use '{{TABLE}}' as a placeholder to specify where the table should be inserted.",
    tableData: "Structured table data to include in the PDF.",
    headers: "Column headers for the table.",
    rows: "Rows of data for the table. Each row is an array of strings.",
  },
  crawlWebsite: {
    url: "The list of the starting URLs to begin crawling from.",
    content: "The crawled data (optional).",
    maxPages: "Maximum number of pages to crawl.",
    maxDepth: "How many levels deep to crawl from the starting URL.",
    extractTextOption:
      "Whether to extract the text content from the crawled pages.",
  },
  searchWeb: {
    query:
      "The search query or keywords that describe the information the user wants to find on the web.",
    numResults: "The number of search results to retrieve.",
  },
} as const;

// ---------------------------------------------------------------------------
// OpenAI / Azure / Deepseek format
// ---------------------------------------------------------------------------

type OpenAITool = ChatCompletionCreateParamsBase["tools"][number];

const generateImageToolOpenAI: OpenAITool = {
  type: "function",
  function: {
    name: TOOL_DESCRIPTIONS.generateImage.name,
    description: TOOL_DESCRIPTIONS.generateImage.description,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: PARAM_DESCRIPTIONS.generateImage.prompt,
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
};

const createPdfToolOpenAI: OpenAITool = {
  type: "function",
  function: {
    name: TOOL_DESCRIPTIONS.create_pdf.name,
    description: TOOL_DESCRIPTIONS.create_pdf.description,
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: PARAM_DESCRIPTIONS.create_pdf.content,
        },
        tableData: {
          type: "object",
          description: PARAM_DESCRIPTIONS.create_pdf.tableData,
          properties: {
            headers: {
              type: "array",
              items: { type: "string" },
              description: PARAM_DESCRIPTIONS.create_pdf.headers,
            },
            rows: {
              type: "array",
              items: {
                type: "array",
                items: { type: "string" },
              },
              description: PARAM_DESCRIPTIONS.create_pdf.rows,
            },
          },
          required: ["headers", "rows"],
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
};

const crawlWebsiteToolOpenAI: OpenAITool = {
  type: "function",
  function: {
    name: TOOL_DESCRIPTIONS.crawlWebsite.name,
    description: TOOL_DESCRIPTIONS.crawlWebsite.description,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "array",
          items: { type: "string" },
          description: PARAM_DESCRIPTIONS.crawlWebsite.url,
        },
        Content: {
          type: "string",
          description: PARAM_DESCRIPTIONS.crawlWebsite.content,
        },
        maxPages: {
          type: "integer",
          description: PARAM_DESCRIPTIONS.crawlWebsite.maxPages,
          default: 5,
          minimum: 1,
          maximum: 5,
        },
        maxDepth: {
          type: "integer",
          description: PARAM_DESCRIPTIONS.crawlWebsite.maxDepth,
          default: 1,
          minimum: 1,
          maximum: 3,
        },
        extractTextOption: {
          type: "boolean",
          description: PARAM_DESCRIPTIONS.crawlWebsite.extractTextOption,
          default: true,
        },
      },
    },
  },
};

const searchWebToolOpenAI: OpenAITool = {
  type: "function",
  function: {
    name: TOOL_DESCRIPTIONS.searchWeb.name,
    description: TOOL_DESCRIPTIONS.searchWeb.description,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: PARAM_DESCRIPTIONS.searchWeb.query,
        },
        numResults: {
          type: "integer",
          description: PARAM_DESCRIPTIONS.searchWeb.numResults,
          default: 1,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

/**
 * Returns the four shared tool definitions in OpenAI/Azure/Deepseek format.
 *
 * These are the tools common to all providers:
 * generateImage, create_pdf, crawlWebsite, searchWeb.
 *
 * Provider-specific tools (e.g. format_file in Deepseek) should be added
 * inline in the respective route file.
 */
export function getOpenAITools(): ChatCompletionCreateParamsBase["tools"] {
  return [
    generateImageToolOpenAI,
    createPdfToolOpenAI,
    crawlWebsiteToolOpenAI,
    searchWebToolOpenAI,
  ];
}

// ---------------------------------------------------------------------------
// Google Vertex AI format (uses SchemaType enum)
// ---------------------------------------------------------------------------

/**
 * Returns the four shared tool definitions in Google Vertex AI format.
 *
 * Google uses the SchemaType enum and a single `functionDeclarations` array
 * wrapped in a Tool object, rather than individual tool entries.
 */
export function getGoogleTools(): Tool[] {
  return [
    {
      functionDeclarations: [
        {
          name: TOOL_DESCRIPTIONS.generateImage.name,
          description: TOOL_DESCRIPTIONS.generateImage.googleDescription,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              prompt: {
                type: SchemaType.STRING,
                description: PARAM_DESCRIPTIONS.generateImage.prompt,
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: TOOL_DESCRIPTIONS.create_pdf.name,
          description: TOOL_DESCRIPTIONS.create_pdf.googleDescription,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              content: {
                type: SchemaType.STRING,
                description: PARAM_DESCRIPTIONS.create_pdf.contentGoogle,
              },
              tableData: {
                type: SchemaType.OBJECT,
                properties: {
                  headers: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: PARAM_DESCRIPTIONS.create_pdf.headers,
                  },
                  rows: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.ARRAY,
                      items: { type: SchemaType.STRING },
                    },
                    description: PARAM_DESCRIPTIONS.create_pdf.rows,
                  },
                },
                required: ["headers", "rows"],
                description: PARAM_DESCRIPTIONS.create_pdf.tableData,
              },
            },
            required: ["content"],
          },
        },
        {
          name: TOOL_DESCRIPTIONS.crawlWebsite.name,
          description: TOOL_DESCRIPTIONS.crawlWebsite.googleDescription,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              url: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: PARAM_DESCRIPTIONS.crawlWebsite.url,
              },
              content: {
                type: SchemaType.STRING,
                description: PARAM_DESCRIPTIONS.crawlWebsite.content,
              },
              maxPages: {
                type: SchemaType.INTEGER,
                description: PARAM_DESCRIPTIONS.crawlWebsite.maxPages,
              },
              maxDepth: {
                type: SchemaType.INTEGER,
                description: PARAM_DESCRIPTIONS.crawlWebsite.maxDepth,
              },
              extractTextOption: {
                type: SchemaType.BOOLEAN,
                description: PARAM_DESCRIPTIONS.crawlWebsite.extractTextOption,
              },
            },
            required: ["url"],
          },
        },
        {
          name: TOOL_DESCRIPTIONS.searchWeb.name,
          description: TOOL_DESCRIPTIONS.searchWeb.googleDescription,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              query: {
                type: SchemaType.STRING,
                description: PARAM_DESCRIPTIONS.searchWeb.query,
              },
              numResults: {
                type: SchemaType.INTEGER,
                description: PARAM_DESCRIPTIONS.searchWeb.numResults,
              },
            },
            required: ["query"],
          },
        },
      ],
    },
  ];
}
