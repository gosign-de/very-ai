// Mock variables prefixed with "mock" are auto-hoisted by Jest
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockOrder = jest.fn();
const mockRpc = jest.fn();

// We build the chain object lazily inside mockFrom so that
// the mock fns are already initialised when the factory runs.
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/browser-client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  getChatById,
  createChat,
  deleteChat,
  updateChatModel,
  getCurrentModel,
} from "@/db/chats";

/**
 * Helper: build a fresh chain where every method returns the chain itself
 * except the terminal methods (single, maybeSingle, order) which must be
 * configured per-test.
 */
function buildChain(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "not",
    "in",
  ]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = mockSingle;
  chain.maybeSingle = mockMaybeSingle;
  chain.order = mockOrder;
  Object.assign(chain, overrides);
  return chain;
}

describe("db/chats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: mockFrom returns a fresh chain
    mockFrom.mockImplementation(() => buildChain());
  });

  // ----------------------------------------------------------------
  // getCurrentModel -- pure function, no DB
  // ----------------------------------------------------------------
  describe("getCurrentModel", () => {
    it("returns empty string for null", () => {
      expect(getCurrentModel(null)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(getCurrentModel("")).toBe("");
    });

    it("returns the model when given a single model", () => {
      expect(getCurrentModel("gpt-4")).toBe("gpt-4");
    });

    it("returns the last model from a comma-separated string", () => {
      expect(getCurrentModel("gpt-3.5,gpt-4,claude-3")).toBe("claude-3");
    });

    it("trims whitespace around models", () => {
      expect(getCurrentModel("gpt-3.5 , gpt-4 , claude-3 ")).toBe("claude-3");
    });
  });

  // ----------------------------------------------------------------
  // getChatById
  // ----------------------------------------------------------------
  describe("getChatById", () => {
    it("returns a chat when found", async () => {
      const fakeChat = { id: "chat-1", name: "Test Chat" };
      mockMaybeSingle.mockResolvedValue({ data: fakeChat });

      const result = await getChatById("chat-1");

      expect(mockFrom).toHaveBeenCalledWith("chats");
      expect(result).toEqual(fakeChat);
    });

    it("returns null when chat is not found", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null });

      const result = await getChatById("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // createChat
  // ----------------------------------------------------------------
  describe("createChat", () => {
    it("returns the created chat on success", async () => {
      const newChat = { name: "New Chat", workspace_id: "ws-1" } as any;
      const createdChat = { id: "chat-2", ...newChat };
      mockSingle.mockResolvedValue({ data: createdChat, error: null });

      const result = await createChat(newChat);

      expect(mockFrom).toHaveBeenCalledWith("chats");
      expect(result).toEqual(createdChat);
    });

    it("throws on error", async () => {
      const newChat = { name: "Fail Chat" } as any;
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: "insert failed" },
      });

      await expect(createChat(newChat)).rejects.toThrow("insert failed");
    });
  });

  // ----------------------------------------------------------------
  // deleteChat
  // ----------------------------------------------------------------
  describe("deleteChat", () => {
    it("returns true on success", async () => {
      // delete().eq() is the terminal call -- make eq resolve
      const chain = buildChain();
      chain.eq.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(chain);

      const result = await deleteChat("chat-1");

      expect(mockFrom).toHaveBeenCalledWith("chats");
      expect(result).toBe(true);
    });

    it("throws on error", async () => {
      const chain = buildChain();
      chain.eq.mockResolvedValue({ error: { message: "delete failed" } });
      mockFrom.mockReturnValue(chain);

      await expect(deleteChat("chat-1")).rejects.toThrow("delete failed");
    });
  });

  // ----------------------------------------------------------------
  // updateChatModel
  // ----------------------------------------------------------------
  describe("updateChatModel", () => {
    it("appends a new model to the model history", async () => {
      mockSingle
        .mockResolvedValueOnce({
          data: { model: "gpt-3.5" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: "chat-1", model: "gpt-3.5,gpt-4" },
          error: null,
        });

      const result = await updateChatModel("chat-1", "gpt-4");

      expect(result).toEqual({ id: "chat-1", model: "gpt-3.5,gpt-4" });
    });

    it("does not duplicate the last model", async () => {
      mockSingle
        .mockResolvedValueOnce({
          data: { model: "gpt-3.5,gpt-4" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: "chat-1", model: "gpt-3.5,gpt-4" },
          error: null,
        });

      const result = await updateChatModel("chat-1", "gpt-4");

      expect(result).toEqual({ id: "chat-1", model: "gpt-3.5,gpt-4" });
    });

    it("returns undefined when fetch fails", async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "fetch error", name: "FetchError" },
      });

      const result = await updateChatModel("chat-1", "gpt-4");

      expect(result).toBeUndefined();
    });

    it("returns undefined when update fails", async () => {
      mockSingle
        .mockResolvedValueOnce({
          data: { model: "gpt-3.5" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: "update error", name: "UpdateError" },
        });

      const result = await updateChatModel("chat-1", "gpt-4");

      expect(result).toBeUndefined();
    });
  });
});
