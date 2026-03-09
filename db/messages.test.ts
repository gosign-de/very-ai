const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockOrder = jest.fn();
const mockRpc = jest.fn();
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

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  getMessageById,
  createMessage,
  deleteMessage,
  deleteMessagesIncludingAndAfter,
} from "@/db/messages";

function buildChain() {
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
  return chain;
}

describe("db/messages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => buildChain());
  });

  // ----------------------------------------------------------------
  // getMessageById
  // ----------------------------------------------------------------
  describe("getMessageById", () => {
    it("returns a message when found", async () => {
      const fakeMessage = { id: "msg-1", content: "Hello" };
      mockSingle.mockResolvedValue({ data: fakeMessage });

      const result = await getMessageById("msg-1");

      expect(mockFrom).toHaveBeenCalledWith("messages");
      expect(result).toEqual(fakeMessage);
    });

    it('throws "Message not found" when not found', async () => {
      mockSingle.mockResolvedValue({ data: null });

      await expect(getMessageById("nonexistent")).rejects.toThrow(
        "Message not found",
      );
    });
  });

  // ----------------------------------------------------------------
  // createMessage
  // ----------------------------------------------------------------
  describe("createMessage", () => {
    it("returns the created message on success", async () => {
      const newMessage = { content: "Hi", chat_id: "chat-1" } as any;
      const createdMessage = { id: "msg-2", ...newMessage };
      mockSingle.mockResolvedValue({ data: createdMessage, error: null });

      const result = await createMessage(newMessage);

      expect(mockFrom).toHaveBeenCalledWith("messages");
      expect(result).toEqual(createdMessage);
    });

    it("throws on error", async () => {
      const newMessage = { content: "Fail" } as any;
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: "insert failed" },
      });

      await expect(createMessage(newMessage)).rejects.toThrow("insert failed");
    });
  });

  // ----------------------------------------------------------------
  // deleteMessage
  // ----------------------------------------------------------------
  describe("deleteMessage", () => {
    it("returns true on success", async () => {
      const chain = buildChain();
      chain.eq.mockResolvedValue({ error: null });
      mockFrom.mockReturnValue(chain);

      const result = await deleteMessage("msg-1");

      expect(mockFrom).toHaveBeenCalledWith("messages");
      expect(result).toBe(true);
    });

    it("throws on error", async () => {
      const chain = buildChain();
      chain.eq.mockResolvedValue({ error: { message: "delete failed" } });
      mockFrom.mockReturnValue(chain);

      await expect(deleteMessage("msg-1")).rejects.toThrow("delete failed");
    });
  });

  // ----------------------------------------------------------------
  // deleteMessagesIncludingAndAfter
  // ----------------------------------------------------------------
  describe("deleteMessagesIncludingAndAfter", () => {
    it("calls rpc with correct parameters and returns true on success", async () => {
      mockRpc.mockResolvedValue({ error: null });

      const result = await deleteMessagesIncludingAndAfter(
        "user-1",
        "chat-1",
        5,
      );

      expect(mockRpc).toHaveBeenCalledWith(
        "delete_messages_including_and_after",
        {
          p_user_id: "user-1",
          p_chat_id: "chat-1",
          p_sequence_number: 5,
        },
      );
      expect(result).toBe(true);
    });

    it("returns an error object when rpc fails", async () => {
      mockRpc.mockResolvedValue({
        error: { message: "rpc error" },
      });

      const result = await deleteMessagesIncludingAndAfter(
        "user-1",
        "chat-1",
        5,
      );

      expect(result).toEqual({ error: "Failed to delete messages." });
    });
  });
});
