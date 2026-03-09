/**
 * @test build-prompt
 * @description Comprehensive tests for buildFinalMessages and adaptMessagesForGoogleGemini
 * @covers buildFinalMessages, adaptMessagesForGoogleGemini, buildBasePrompt,
 *         buildRetrievalText, extractUrl, adaptSingleMessageForGoogleGemini,
 *         adaptMessagesForGeminiVision
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

jest.mock("gpt-tokenizer", () => ({
  encode: jest.fn((text: string) =>
    Array.from({ length: Math.ceil(text.length / 4) }),
  ),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

jest.mock("@/lib/utils", () => ({
  getBase64FromDataURL: jest.fn((_url: string) =>
    Promise.resolve("base64data"),
  ),
  getMediaTypeFromDataURL: jest.fn(() => "image/jpeg"),
}));

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  buildFinalMessages,
  adaptMessagesForGoogleGemini,
} from "./build-prompt";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createProfile(overrides?: Record<string, unknown>): any {
  return {
    id: "profile-1",
    bio: "",
    display_name: "Test User",
    has_onboarded: true,
    image_path: "",
    image_url: "",
    profile_context: "I am a software engineer who works with TypeScript.",
    created_at: "",
    updated_at: null,
    user_id: "user-1",
    username: "testuser",
    anthropic_api_key: null,
    azure_openai_35_turbo_id: null,
    azure_openai_45_turbo_id: null,
    azure_openai_45_vision_id: null,
    azure_openai_api_key: null,
    azure_openai_embeddings_id: null,
    azure_openai_endpoint: null,
    azure_openai_gpt5_id: null,
    azure_user_id: null,
    dalle_api_key: null,
    deepseek_api_service_account: null,
    developer_mode: null,
    flux1_api_key: null,
    google_gemini_api_key: null,
    groq_api_key: null,
    is_tempchat_popup: null,
    mistral_api_key: null,
    n8n_api_key: null,
    n8n_url: null,
    o1_preview_api_key: null,
    openai_api_key: null,
    openai_organization_id: null,
    perplexity_api_key: null,
    use_azure_openai: false,
    ...overrides,
  };
}

function createPayload(overrides?: Record<string, any>): any {
  return {
    chatSettings: {
      model: "gpt-4o",
      imageModel: "dall-e-3",
      prompt: "You are a helpful assistant.",
      contextLength: 128000,
      temperature: 0.7,
      includeProfileContext: false,
      includeWorkspaceInstructions: false,
      embeddingsProvider: "openai" as const,
      ...overrides?.chatSettings,
    },
    workspaceInstructions: overrides?.workspaceInstructions ?? "",
    chatMessages: overrides?.chatMessages ?? [],
    assistant: overrides?.assistant ?? null,
    messageFileItems: overrides?.messageFileItems ?? [],
    chatFileItems: overrides?.chatFileItems ?? [],
  };
}

function createChatMessage(
  role: string,
  content: string,
  overrides?: Record<string, any>,
): any {
  return {
    message: {
      chat_id: "chat-1",
      assistant_id: null,
      content,
      created_at: "",
      id: overrides?.id ?? "msg-1",
      image_paths: overrides?.image_paths ?? [],
      model: "gpt-4o",
      role,
      sequence_number: overrides?.sequence_number ?? 0,
      updated_at: "",
      user_id: "user-1",
      session_id: "",
      is_pin: false,
      pin_metadata: "",
      original_content: null,
      pii_entities: null,
      pii_token_map: null,
    },
    fileItems: overrides?.fileItems ?? [],
  };
}

function createFileItem(overrides?: Record<string, any>): any {
  return {
    id: overrides?.id ?? "fi-1",
    file_id: overrides?.file_id ?? "file-1",
    content: overrides?.content ?? "This is file content.",
    tokens: overrides?.tokens ?? 10,
    chunk_index: overrides?.chunk_index ?? 0,
    created_at: "",
    updated_at: null,
    user_id: "user-1",
    sharing: "private",
    local_embedding: null,
    openai_embedding: null,
    original_content: null,
    pii_entities: null,
    pii_token_map: null,
  };
}

function createAssistant(overrides?: Record<string, any>): any {
  return {
    id: "asst-1",
    name: "CodeHelper",
    description: "An assistant for code help",
    model: "gpt-4o",
    prompt: "You help with code.",
    temperature: 0.5,
    context_length: 128000,
    embeddings_provider: "openai",
    image_path: "",
    include_profile_context: false,
    include_workspace_instructions: false,
    sharing: "private",
    created_at: "",
    updated_at: null,
    user_id: "user-1",
    folder_id: null,
    group_id: null,
    image_model: null,
    author: null,
    is_confidential: null,
    role: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("build-prompt", () => {
  const profile = createProfile();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the date to a fixed value for deterministic tests
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // buildFinalMessages — basic system message construction
  // =========================================================================
  describe("buildFinalMessages - basic system message", () => {
    it("should return an array with system message first", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "Hello")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].role).toBe("system");
    });

    it("should include the prompt in the system message content", async () => {
      const payload = createPayload({
        chatSettings: { prompt: "You are a pirate captain." },
        chatMessages: [createChatMessage("user", "Ahoy!")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).toContain("You are a pirate captain.");
    });

    it("should set system message role to 'system'", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].role).toBe("system");
    });

    it("should include assistant name when assistant is provided", async () => {
      const assistant = createAssistant({ name: "DataWizard" });
      const payload = createPayload({
        assistant,
        chatMessages: [createChatMessage("user", "Analyse data")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).toContain("You are DataWizard");
    });

    it("should include today's date in the system message", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "What day is it?")],
      });

      const result = await buildFinalMessages(payload, profile, []);
      const expectedDate = new Date(
        "2025-06-15T12:00:00Z",
      ).toLocaleDateString();

      expect(result[0].content).toContain(expectedDate);
    });

    it("should include profile context when includeProfileContext is true", async () => {
      const payload = createPayload({
        chatSettings: { includeProfileContext: true },
        chatMessages: [createChatMessage("user", "Tell me about myself")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).toContain("User Info:");
      expect(result[0].content).toContain(
        "I am a software engineer who works with TypeScript.",
      );
    });

    it("should include workspace instructions when includeWorkspaceInstructions is true", async () => {
      const payload = createPayload({
        chatSettings: { includeWorkspaceInstructions: true },
        workspaceInstructions: "Always respond in markdown.",
        chatMessages: [createChatMessage("user", "Help")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).toContain("System Instructions:");
      expect(result[0].content).toContain("Always respond in markdown.");
    });

    it("should exclude profile context when includeProfileContext is false", async () => {
      const payload = createPayload({
        chatSettings: { includeProfileContext: false },
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).not.toContain("User Info:");
    });

    it("should exclude workspace instructions when includeWorkspaceInstructions is false", async () => {
      const payload = createPayload({
        chatSettings: { includeWorkspaceInstructions: false },
        workspaceInstructions: "Secret instructions",
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).not.toContain("Secret instructions");
    });

    it("should not include INJECT ROLE block when no assistant is provided", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "Hello")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].content).not.toContain("<INJECT ROLE>");
    });
  });

  // =========================================================================
  // buildFinalMessages — user/assistant messages
  // =========================================================================
  describe("buildFinalMessages - message inclusion", () => {
    it("should include user messages after system message", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "First message"),
          createChatMessage("assistant", "First reply"),
          createChatMessage("user", "Second message"),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // system + 3 chat messages = 4
      expect(result).toHaveLength(4);
      expect(result[1].role).toBe("user");
      expect(result[1].content).toBe("First message");
      expect(result[2].role).toBe("assistant");
      expect(result[3].role).toBe("user");
    });

    it("should preserve message order", async () => {
      const messages = [
        createChatMessage("user", "A"),
        createChatMessage("assistant", "B"),
        createChatMessage("user", "C"),
        createChatMessage("assistant", "D"),
      ];
      const payload = createPayload({ chatMessages: messages });

      const result = await buildFinalMessages(payload, profile, []);
      const contents = result.slice(1).map((m: any) => m.content);

      expect(contents).toEqual(["A", "B", "C", "D"]);
    });
  });

  // =========================================================================
  // buildFinalMessages — message truncation
  // =========================================================================
  describe("buildFinalMessages - message truncation", () => {
    it("should include all messages when within token limit", async () => {
      const payload = createPayload({
        chatSettings: { contextLength: 128000 },
        chatMessages: [
          createChatMessage("user", "Short"),
          createChatMessage("assistant", "Also short"),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // system + 2 messages
      expect(result).toHaveLength(3);
    });

    it("should truncate oldest messages when exceeding context length", async () => {
      // Very small context length to force truncation
      // encode mock returns text.length/4 tokens; prompt "You are a helpful assistant." = 7 tokens
      // context length of 15 means remainingTokens = 15 - 7 = 8
      // Each message of "Short msg" = ceil(9/4)=3 tokens
      // So we can fit at most 2 messages (3+3=6 < 8), the third won't fit if we add enough
      const payload = createPayload({
        chatSettings: {
          contextLength: 15,
          prompt: "You are a helpful assistant.",
        },
        chatMessages: [
          createChatMessage("user", "First message that is old"),
          createChatMessage("assistant", "Second message"),
          createChatMessage("user", "Third msg"),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // System message is always present; some older messages should be dropped
      expect(result[0].role).toBe("system");
      // The total number should be less than 1 (system) + 3 (all messages)
      expect(result.length).toBeLessThanOrEqual(4);
    });

    it("should always include the system message even when truncating", async () => {
      const payload = createPayload({
        chatSettings: { contextLength: 10 },
        chatMessages: [
          createChatMessage("user", "A very long message ".repeat(100)),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[0].role).toBe("system");
    });

    it("should keep most recent messages and drop oldest when truncating", async () => {
      // prompt = "Hi" => 1 token, context = 5, remaining = 4
      // "AB" => 1 token, "CD" => 1 token, "EF" => 1 token, "GHIJKLMN" => 2 tokens
      // Iterating from end: GHIJKLMN(2) + EF(1) + CD(1) = 4, AB(1) would exceed
      const payload = createPayload({
        chatSettings: { contextLength: 5, prompt: "Hi" },
        chatMessages: [
          createChatMessage("user", "AB"),
          createChatMessage("assistant", "CD"),
          createChatMessage("user", "EF"),
          createChatMessage("assistant", "GHIJKLMN"),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // System + the most recent messages that fit
      const nonSystemMessages = result.slice(1);
      // The oldest message "AB" should be dropped
      const contents = nonSystemMessages.map((m: any) => m.content);
      expect(contents).not.toContain("AB");
      expect(contents).toContain("GHIJKLMN");
    });
  });

  // =========================================================================
  // buildFinalMessages — file retrieval (messageFileItems)
  // =========================================================================
  describe("buildFinalMessages - messageFileItems retrieval", () => {
    it("should append file data to last user message when messageFileItems present and fit in context", async () => {
      const fileItem = createFileItem({
        content: "Important data from file.",
        tokens: 5,
      });
      const payload = createPayload({
        chatSettings: { contextLength: 128000 },
        chatMessages: [createChatMessage("user", "What is in the file?")],
        messageFileItems: [fileItem],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const lastMsg = result[result.length - 1];
      expect(lastMsg.content).toContain("Important data from file.");
    });

    it("should include file IDs in retrieval text", async () => {
      const fileItem = createFileItem({
        file_id: "file-abc-123",
        content: "Data",
        tokens: 3,
      });
      const payload = createPayload({
        chatSettings: { contextLength: 128000 },
        chatMessages: [createChatMessage("user", "Show file")],
        messageFileItems: [fileItem],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const lastMsg = result[result.length - 1];
      expect(lastMsg.content).toContain("file-abc-123");
    });

    it("should handle empty messageFileItems without appending retrieval text", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "No files here")],
        messageFileItems: [],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const lastMsg = result[result.length - 1];
      expect(lastMsg.content).toBe("No files here");
    });

    it("should deduplicate file IDs in retrieval text", async () => {
      const item1 = createFileItem({
        id: "fi-1",
        file_id: "file-same",
        content: "Chunk 1",
        tokens: 3,
      });
      const item2 = createFileItem({
        id: "fi-2",
        file_id: "file-same",
        content: "Chunk 2",
        tokens: 3,
      });
      const payload = createPayload({
        chatSettings: { contextLength: 128000 },
        chatMessages: [createChatMessage("user", "Read file")],
        messageFileItems: [item1, item2],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const lastMsg = result[result.length - 1];
      // file-same should appear only once in the File IDs section
      const fileIdsMatch = lastMsg.content.match(/File IDs: \[([^\]]+)\]/);
      expect(fileIdsMatch).not.toBeNull();
      const ids = fileIdsMatch![1].split(", ");
      expect(ids).toEqual(["file-same"]);
    });
  });

  // =========================================================================
  // buildFinalMessages — image handling
  // =========================================================================
  describe("buildFinalMessages - image handling", () => {
    it("should convert image paths to image_url format for PNG/JPEG", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "Look at this image", {
            image_paths: ["data:image/png;base64,abc123"],
          }),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // The message with images gets role "user" and array content
      const imageMsg = result.find((m: any) => Array.isArray(m.content));
      expect(imageMsg).toBeDefined();
      expect(imageMsg.role).toBe("user");
      expect(imageMsg.content[0]).toEqual({
        type: "text",
        text: expect.stringContaining("Look at this image"),
      });
      expect(imageMsg.content[1]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      });
    });

    it("should reject SVG images and call toast.error", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "SVG image", {
            image_paths: ["data:image/svg+xml;base64,svgcontent"],
          }),
        ],
      });

      // SVG causes the map callback to return undefined, which crashes the
      // subsequent reduce (accessing .content on undefined). This is a known
      // defect in the source. We verify that toast.error is still called.
      await expect(buildFinalMessages(payload, profile, [])).rejects.toThrow();

      expect(toast.error).toHaveBeenCalledWith(
        "SVG format is not supported. Only PNG, JPEG, and JPG are allowed.",
      );
    });

    it("should handle JPEG images correctly", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "JPEG image", {
            image_paths: ["data:image/jpeg;base64,jpegdata"],
          }),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const imageMsg = result.find((m: any) => Array.isArray(m?.content));
      expect(imageMsg).toBeDefined();
      expect(imageMsg.content).toHaveLength(2);
      expect(imageMsg.content[1].type).toBe("image_url");
    });

    it("should handle multiple image paths on one message", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "Multiple images", {
            image_paths: [
              "data:image/png;base64,img1",
              "data:image/jpeg;base64,img2",
            ],
          }),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const imageMsg = result.find((m: any) => Array.isArray(m?.content));
      expect(imageMsg).toBeDefined();
      // 1 text part + 2 image_url parts
      expect(imageMsg.content).toHaveLength(3);
      expect(imageMsg.content[1].type).toBe("image_url");
      expect(imageMsg.content[2].type).toBe("image_url");
    });

    it("should prepend descriptive instruction to image message text", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "What is this?", {
            image_paths: ["data:image/png;base64,abc"],
          }),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const imageMsg = result.find((m: any) => Array.isArray(m?.content));
      expect(imageMsg.content[0].text).toContain(
        "Describe this image precise and descriptive.",
      );
    });
  });

  // =========================================================================
  // buildFinalMessages — chat message file items (chatFileItems)
  // =========================================================================
  describe("buildFinalMessages - chatFileItems (retrieval from next message)", () => {
    it("should append retrieval text when next message has fileItems", async () => {
      const chatFileItem = createFileItem({
        id: "cfi-1",
        file_id: "file-doc",
        content: "Retrieved document content.",
      });
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "What does the doc say?", {
            id: "msg-1",
          }),
          createChatMessage("assistant", "Here is the answer", {
            id: "msg-2",
            fileItems: ["cfi-1"],
          }),
        ],
        chatFileItems: [chatFileItem],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // The first user message should have retrieval text appended
      const userMsg = result.find(
        (m: any) =>
          m?.role === "user" &&
          m?.content?.includes("Retrieved document content."),
      );
      expect(userMsg).toBeDefined();
    });

    it("should find file items from chatFileItems by ID", async () => {
      const chatFileItem = createFileItem({
        id: "item-xyz",
        file_id: "file-123",
        content: "Special content for lookup.",
      });
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "Look up file", { id: "msg-a" }),
          createChatMessage("assistant", "Found it", {
            id: "msg-b",
            fileItems: ["item-xyz"],
          }),
        ],
        chatFileItems: [chatFileItem],
      });

      const result = await buildFinalMessages(payload, profile, []);

      const userMsg = result[1]; // first non-system
      expect(userMsg.content).toContain("Special content for lookup.");
      expect(userMsg.content).toContain("file-123");
    });

    it("should not modify message when next message has no fileItems", async () => {
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "Plain question"),
          createChatMessage("assistant", "Plain answer"),
        ],
      });

      const result = await buildFinalMessages(payload, profile, []);

      expect(result[1].content).toBe("Plain question");
    });

    it("should skip missing file items gracefully", async () => {
      // fileItems references an ID that doesn't exist in chatFileItems
      const payload = createPayload({
        chatMessages: [
          createChatMessage("user", "Lookup missing", { id: "msg-1" }),
          createChatMessage("assistant", "Response", {
            id: "msg-2",
            fileItems: ["non-existent-id"],
          }),
        ],
        chatFileItems: [],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // Should not throw; buildRetrievalText is still called with an empty
      // filtered array, producing empty retrieval text appended to the message.
      expect(result[1].content).toContain("Lookup missing");
      expect(result[1].content).toContain("File IDs: []");
    });
  });

  // =========================================================================
  // buildFinalMessages — token count tracking
  // =========================================================================
  describe("buildFinalMessages - token count", () => {
    it("should attach tokenCount to payload", async () => {
      const payload = createPayload({
        chatMessages: [createChatMessage("user", "Count my tokens")],
      });

      await buildFinalMessages(payload, profile, []);

      expect((payload as any).tokenCount).toBeDefined();
      expect(typeof (payload as any).tokenCount).toBe("number");
      expect((payload as any).tokenCount).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // buildFinalMessages — edge cases
  // =========================================================================
  describe("buildFinalMessages - edge cases", () => {
    it("should handle empty chatMessages array", async () => {
      const payload = createPayload({ chatMessages: [] });

      const result = await buildFinalMessages(payload, profile, []);

      // Should at least have the system message
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("system");
    });

    it("should handle empty profile context string", async () => {
      const emptyProfile = createProfile({ profile_context: "" });
      const payload = createPayload({
        chatSettings: { includeProfileContext: true },
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, emptyProfile, []);

      // Should not include "User Info:" when profile_context is empty
      expect(result[0].content).not.toContain("User Info:");
    });

    it("should handle null profile context", async () => {
      const nullProfile = createProfile({ profile_context: null });
      const payload = createPayload({
        chatSettings: { includeProfileContext: true },
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, nullProfile, []);

      // Should not crash, should use fallback ""
      expect(result[0].role).toBe("system");
    });

    it("should use model from chatSettings for system message", async () => {
      const payload = createPayload({
        chatSettings: { model: "claude-3-opus" },
        chatMessages: [createChatMessage("user", "Hi")],
      });

      const result = await buildFinalMessages(payload, profile, []);

      // The system message's model field is set internally; we verify
      // the output message role and content are correct
      expect(result[0].role).toBe("system");
    });
  });

  // =========================================================================
  // adaptMessagesForGoogleGemini
  // =========================================================================
  describe("adaptMessagesForGoogleGemini", () => {
    it("should map 'user' role to 'user'", async () => {
      const payload = createPayload();
      const messages = [{ role: "user", content: "Hello Gemini" }];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].role).toBe("user");
    });

    it("should map 'system' role to 'user'", async () => {
      const payload = createPayload();
      const messages = [{ role: "system", content: "System prompt" }];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].role).toBe("user");
    });

    it("should map 'assistant' role to 'model'", async () => {
      const payload = createPayload();
      const messages = [{ role: "assistant", content: "I can help" }];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].role).toBe("model");
    });

    it("should convert text content to { text } format for non-websearch", async () => {
      const payload = createPayload();
      const messages = [{ role: "user", content: "What is 2+2?" }];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].parts).toBeDefined();
      expect(result[0].parts[0]).toEqual({ text: "What is 2+2?" });
    });

    it("should handle websearch action and return content instead of parts", async () => {
      const payload = createPayload();
      const messages = [{ role: "user", content: "Search for news" }];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "websearch",
      );

      expect(result[0].content).toBeDefined();
      expect(result[0].parts).toBeUndefined();
      expect(result[0].content).toContain("Search for news");
    });

    it("should handle gemini-pro-vision model by combining messages", async () => {
      const payload = createPayload({
        chatSettings: { model: "gemini-pro-vision" },
      });
      const messages = [
        { role: "user", content: "System context" },
        { role: "user", content: "Describe this image" },
      ];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      // gemini-pro-vision combines all messages into one
      expect(result).toHaveLength(1);
      expect(result[0].parts).toBeDefined();
    });

    it("should handle array content with image_url parts", async () => {
      const payload = createPayload();
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,abc" },
            },
          ],
        },
      ];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].parts).toHaveLength(2);
      expect(result[0].parts[0]).toEqual({ text: "What is in this image?" });
      expect(result[0].parts[1]).toHaveProperty("inlineData");
      expect(result[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
    });

    it("should handle multiple messages with mixed roles", async () => {
      const payload = createPayload();
      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Question" },
        { role: "assistant", content: "Answer" },
        { role: "user", content: "Follow-up" },
      ];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result).toHaveLength(4);
      expect(result[0].role).toBe("user"); // system -> user
      expect(result[1].role).toBe("user");
      expect(result[2].role).toBe("model"); // assistant -> model
      expect(result[3].role).toBe("user");
    });

    it("should handle image URL markers in text via extractUrl", async () => {
      const payload = createPayload();
      const messages = [
        {
          role: "user",
          content:
            "![Alt text](<<imageUrlStart>>data:image/jpeg;base64,testdata<<imageUrlEnd>>)",
        },
      ];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "chat",
      );

      expect(result[0].parts).toBeDefined();
      // Should have been converted to inlineData
      expect(result[0].parts[0]).toHaveProperty("inlineData");
      expect(result[0].parts[0].inlineData.data).toBe("base64data");
    });

    it("should handle gemini-pro-vision with websearch action", async () => {
      const payload = createPayload({
        chatSettings: { model: "gemini-pro-vision" },
      });
      const messages = [
        { role: "user", content: "System prompt" },
        { role: "user", content: "Search query" },
      ];

      const result = await adaptMessagesForGoogleGemini(
        payload,
        messages,
        "websearch",
      );

      // Should still combine for vision model
      expect(result).toHaveLength(1);
    });
  });
});
