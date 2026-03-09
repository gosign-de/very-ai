/**
 * @jest-environment node
 */
import {
  checkApiKey,
  getServerProfile,
} from "@/lib/server/server-chat-helpers";
import { createStreamingResponse } from "@/lib/server/server-utils";

jest.mock("@/lib/logger/edge", () => ({
  createEdgeLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}));

jest.mock("@/lib/server/server-chat-helpers", () => ({
  checkApiKey: jest.fn(),
  getServerProfile: jest.fn(),
}));

jest.mock("@/lib/server/server-utils", () => ({
  createStreamingResponse: jest
    .fn()
    .mockResolvedValue(new Response("streamed")),
}));

const mockOpenAICreate = jest.fn().mockResolvedValue({ id: "test" });

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    })),
  };
});

const mockGetServerProfile = getServerProfile as jest.MockedFunction<
  typeof getServerProfile
>;
const mockCheckApiKey = checkApiKey as jest.MockedFunction<typeof checkApiKey>;
const mockCreateStreamingResponse =
  createStreamingResponse as jest.MockedFunction<
    typeof createStreamingResponse
  >;

function createRequest(body: object): Request {
  return new Request("http://localhost/api/chat/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultBody = {
  chatSettings: {
    model: "gpt-4o",
    temperature: 0.7,
  },
  messages: [{ role: "user", content: "Hello" }],
};

describe("POST /api/chat/openai", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerProfile.mockResolvedValue({
      openai_api_key: "sk-test-key",
      openai_organization_id: "org-test",
    } as any);
    mockOpenAICreate.mockResolvedValue({ id: "test" });
  });

  it("returns sequential processing response when sequentialProcessing.enabled", async () => {
    const body = {
      ...defaultBody,
      sequentialProcessing: {
        enabled: true,
        fileId: "file-123",
        totalChunks: 10,
        totalTokens: 50000,
        chunksPerBatch: 3,
        currentBatchStart: 0,
        userQuery: "summarize",
        queryType: "summary",
        maxBatchTokens: 4096,
      },
    };

    // Import after mocks are set up
    const { POST } = require("./route");
    const response = await POST(createRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.type).toBe("sequential_processing");
    expect(json.fileId).toBe("file-123");
    expect(json.totalChunks).toBe(10);
    expect(json.chunksPerBatch).toBe(3);
    expect(json.totalBatches).toBe(4); // Math.ceil(10 / 3)
    expect(json.model).toBe("gpt-4o");
    expect(json.provider).toBe("openai");
    expect(json.maxBatchTokens).toBe(4096);
  });

  it("calls getServerProfile and checkApiKey", async () => {
    const { POST } = require("./route");
    await POST(createRequest(defaultBody));

    expect(mockGetServerProfile).toHaveBeenCalledTimes(1);
    expect(mockCheckApiKey).toHaveBeenCalledWith("sk-test-key", "OpenAI");
  });

  it("creates OpenAI client with profile API key", async () => {
    const OpenAI = require("openai").default;

    const { POST } = require("./route");
    await POST(createRequest(defaultBody));

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test-key",
      organization: "org-test",
    });
  });

  it("returns streaming response on success", async () => {
    const { POST } = require("./route");
    const response = await POST(createRequest(defaultBody));

    expect(mockCreateStreamingResponse).toHaveBeenCalledWith({ id: "test" });
    const text = await response.text();
    expect(text).toBe("streamed");
  });

  it("returns error response with correct status code on failure", async () => {
    const error = new Error("Something went wrong") as any;
    error.status = 429;
    mockGetServerProfile.mockRejectedValue(error);

    const { POST } = require("./route");
    const response = await POST(createRequest(defaultBody));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.message).toBe("Something went wrong");
  });

  it('returns user-friendly message for "api key not found" error', async () => {
    mockCheckApiKey.mockImplementation(() => {
      throw new Error("OpenAI API Key not found");
    });

    const { POST } = require("./route");
    const response = await POST(createRequest(defaultBody));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe(
      "OpenAI API Key not found. Please set it in your profile settings.",
    );
  });

  it('returns user-friendly message for "incorrect api key" error', async () => {
    const error = new Error("Incorrect API key provided") as any;
    error.status = 401;
    mockGetServerProfile.mockRejectedValue(error);

    const { POST } = require("./route");
    const response = await POST(createRequest(defaultBody));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe(
      "OpenAI API Key is incorrect. Please fix it in your profile settings.",
    );
  });
});
