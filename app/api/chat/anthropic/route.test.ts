/** @jest-environment node */
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks – must be declared before importing the module under test
// ---------------------------------------------------------------------------

jest.mock("@/lib/logger/edge", () => ({
  createEdgeLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockStreamText = jest.fn();
jest.mock("ai", () => ({
  streamText: (...args: any) => mockStreamText(...args),
}));

const mockCreateAnthropic = jest.fn();
jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (...args: any) => mockCreateAnthropic(...args),
}));

const mockGetServerProfile = jest.fn();
const mockCheckApiKey = jest.fn();
jest.mock("@/lib/server/server-chat-helpers", () => ({
  getServerProfile: (...args: any) => mockGetServerProfile(...args),
  checkApiKey: (...args: any) => mockCheckApiKey(...args),
}));

const mockGetBase64FromDataURL = jest.fn((_url: string) => "base64data");
const mockGetMediaTypeFromDataURL = jest.fn((_url: string) => "image/jpeg");
jest.mock("@/lib/utils", () => ({
  getBase64FromDataURL: (url: string) => mockGetBase64FromDataURL(url),
  getMediaTypeFromDataURL: (url: string) => mockGetMediaTypeFromDataURL(url),
}));

jest.mock("@/lib/chat-setting-limits", () => ({
  CHAT_SETTING_LIMITS: {
    "claude-3-opus": { MAX_TOKEN_OUTPUT_LENGTH: 4096 },
    "claude-3-sonnet": { MAX_TOKEN_OUTPUT_LENGTH: 4096 },
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are in place
// ---------------------------------------------------------------------------

import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createChatRequest(body: any): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/chat/anthropic"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const DEFAULT_PROFILE = {
  anthropic_api_key: "sk-ant-test-key-123",
};

const DEFAULT_CHAT_SETTINGS = {
  model: "claude-3-opus",
  temperature: 0.7,
};

function buildMessages(overrides?: any[]) {
  return (
    overrides ?? [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]
  );
}

function defaultBody(overrides?: Record<string, any>) {
  return {
    chatSettings: DEFAULT_CHAT_SETTINGS,
    messages: buildMessages(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/chat/anthropic", () => {
  const mockModelFn = jest.fn().mockReturnValue("anthropic-model-ref");
  const mockToTextStreamResponse = jest
    .fn()
    .mockReturnValue(new Response("streamed", { status: 200 }));

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerProfile.mockResolvedValue(DEFAULT_PROFILE);
    mockCheckApiKey.mockImplementation(() => {});
    mockCreateAnthropic.mockReturnValue(mockModelFn);
    mockStreamText.mockResolvedValue({
      toTextStreamResponse: mockToTextStreamResponse,
    });
  });

  // -------------------------------------------------------------------------
  // Successful flow
  // -------------------------------------------------------------------------

  describe("successful flow", () => {
    it("should call getServerProfile", async () => {
      const req = createChatRequest(defaultBody());
      await POST(req);
      expect(mockGetServerProfile).toHaveBeenCalledTimes(1);
    });

    it("should call checkApiKey with the profile's anthropic_api_key", async () => {
      const req = createChatRequest(defaultBody());
      await POST(req);
      expect(mockCheckApiKey).toHaveBeenCalledWith(
        "sk-ant-test-key-123",
        "Anthropic",
      );
    });

    it("should create Anthropic client with the API key from profile", async () => {
      const req = createChatRequest(defaultBody());
      await POST(req);
      expect(mockCreateAnthropic).toHaveBeenCalledWith({
        apiKey: "sk-ant-test-key-123",
      });
    });

    it("should create Anthropic client with empty string when API key is falsy", async () => {
      mockGetServerProfile.mockResolvedValue({ anthropic_api_key: null });
      const req = createChatRequest(defaultBody());
      await POST(req);
      expect(mockCreateAnthropic).toHaveBeenCalledWith({ apiKey: "" });
    });

    it("should call streamText with correct parameters", async () => {
      const req = createChatRequest(defaultBody());
      await POST(req);

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        model: "anthropic-model-ref",
        temperature: 0.7,
        system: "You are a helpful assistant.",
        maxOutputTokens: 4096,
      });
    });

    it("should invoke the model function with chatSettings.model", async () => {
      const req = createChatRequest(defaultBody());
      await POST(req);
      expect(mockModelFn).toHaveBeenCalledWith("claude-3-opus");
    });

    it("should return the streaming response from toTextStreamResponse", async () => {
      const req = createChatRequest(defaultBody());
      const response = await POST(req);
      expect(mockToTextStreamResponse).toHaveBeenCalledTimes(1);
      expect(response).toBeInstanceOf(Response);
      const text = await response.text();
      expect(text).toBe("streamed");
    });

    it("should use MAX_TOKEN_OUTPUT_LENGTH from CHAT_SETTING_LIMITS for the model", async () => {
      const body = defaultBody({
        chatSettings: { model: "claude-3-sonnet", temperature: 0.5 },
      });
      const req = createChatRequest(body);
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.maxOutputTokens).toBe(4096);
    });
  });

  // -------------------------------------------------------------------------
  // Message formatting
  // -------------------------------------------------------------------------

  describe("message formatting", () => {
    it("should slice off the first message as the system prompt", async () => {
      const messages = [
        { role: "system", content: "System prompt here" },
        { role: "user", content: "User message" },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.system).toBe("System prompt here");
      expect(callArgs.messages).toHaveLength(1);
    });

    it("should convert string content to array with text object", async () => {
      const messages = [
        { role: "system", content: "sys" },
        { role: "user", content: "Hello world" },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: "text", text: "Hello world" },
      ]);
    });

    it("should handle array content with string entries", async () => {
      const messages = [
        { role: "system", content: "sys" },
        { role: "user", content: ["First part", "Second part"] },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: "text", text: "First part" },
        { type: "text", text: "Second part" },
      ]);
    });

    it("should convert image_url content to base64 source format", async () => {
      const messages = [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
          ],
        },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: "base64data",
          },
        },
      ]);
      expect(mockGetMediaTypeFromDataURL).toHaveBeenCalledWith(
        "data:image/jpeg;base64,abc123",
      );
      expect(mockGetBase64FromDataURL).toHaveBeenCalledWith(
        "data:image/jpeg;base64,abc123",
      );
    });

    it("should pass through content that is neither string nor image_url", async () => {
      const customContent = { type: "tool_result", content: "result data" };
      const messages = [
        { role: "system", content: "sys" },
        { role: "user", content: [customContent] },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([customContent]);
    });

    it("should not convert image_url when url is empty", async () => {
      const imageContent = {
        type: "image_url",
        image_url: { url: "" },
      };
      const messages = [
        { role: "system", content: "sys" },
        { role: "user", content: [imageContent] },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      // Empty url has falsy length, so it falls through to the else branch
      expect(callArgs.messages[0].content).toEqual([imageContent]);
    });

    it("should preserve message role and other properties", async () => {
      const messages = [
        { role: "system", content: "sys" },
        { role: "user", content: "Hello", name: "TestUser" },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe("user");
      expect(callArgs.messages[0].name).toBe("TestUser");
    });

    it("should handle mixed content types in a single message", async () => {
      const messages = [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: [
            "Some text",
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,xyz" },
            },
            { type: "custom", data: "arbitrary" },
          ],
        },
      ];
      const req = createChatRequest(defaultBody({ messages }));
      await POST(req);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: "text", text: "Some text" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: "base64data",
          },
        },
        { type: "custom", data: "arbitrary" },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("should return 500 when Anthropic API (streamText) fails", async () => {
      mockStreamText.mockRejectedValue(new Error("Anthropic API failure"));
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe(
        "An error occurred while calling the Anthropic API",
      );
    });

    it("should return custom message when error contains 'API key not found'", async () => {
      mockGetServerProfile.mockRejectedValue(
        new Error("Anthropic API key not found in profile"),
      );
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      const body = await response.json();
      expect(body.message).toBe(
        "Anthropic API Key not found. Please set it in your profile settings.",
      );
    });

    it("should return 401 message when error status is 401", async () => {
      const error: any = new Error("Unauthorized");
      error.status = 401;
      mockGetServerProfile.mockRejectedValue(error);
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.message).toBe(
        "Anthropic API Key is incorrect. Please fix it in your profile settings.",
      );
    });

    it("should return the error's status code when present", async () => {
      const error: any = new Error("Rate limited");
      error.status = 429;
      mockGetServerProfile.mockRejectedValue(error);
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.message).toBe("Rate limited");
    });

    it("should default to 500 when error has no status code", async () => {
      mockGetServerProfile.mockRejectedValue(new Error("Something broke"));
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Something broke");
    });

    it("should handle non-Error thrown values", async () => {
      mockGetServerProfile.mockRejectedValue("string error");
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("string error");
    });

    it("should return fallback message when error has no message", async () => {
      mockGetServerProfile.mockRejectedValue(new Error(""));
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("An unexpected error occurred");
    });

    it("should handle checkApiKey throwing an error", async () => {
      mockCheckApiKey.mockImplementation(() => {
        throw new Error("Anthropic API key not found");
      });
      const req = createChatRequest(defaultBody());
      const response = await POST(req);

      const body = await response.json();
      expect(body.message).toBe(
        "Anthropic API Key not found. Please set it in your profile settings.",
      );
    });
  });
});
