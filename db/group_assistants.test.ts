// --- Mocks (must be set up before imports due to jest.mock hoisting) ---

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/browser-client", () => ({
  supabase: {
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

jest.mock("@/db/storage/assistant-images", () => ({
  getAssistantImageFromStorage: jest.fn(),
}));

const mockLoggerError = jest.fn();

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: any[]) => mockLoggerError(...args),
  })),
}));

// --- Imports (after mocks) ---

import { getAssistantImageFromStorage } from "@/db/storage/assistant-images";
import {
  getAllGroupsAssistants,
  getAllGroupsAssistantsImages,
  getGroupAssistantByUserId,
} from "@/db/group_assistants";

// --- Helpers ---

/**
 * Creates a chainable mock that mimics the Supabase query builder.
 * The chain is both callable (via .select/.eq/.in/.single) and thenable,
 * so it resolves when awaited after the last chained method.
 */
const createChain = (result: { data: any; error: any }) => {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(result);
  // Make the chain thenable so `await supabase.from(...).select(...).eq(...).eq(...)` resolves
  const finalPromise = Promise.resolve(result);
  Object.assign(chain, {
    then: finalPromise.then.bind(finalPromise),
    catch: finalPromise.catch.bind(finalPromise),
  });
  return chain;
};

// --- Tests ---

describe("db/group_assistants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // getAllGroupsAssistants
  // =========================================================================
  describe("getAllGroupsAssistants", () => {
    it("should return an empty array when groupIds is empty", async () => {
      const result = await getAllGroupsAssistants([]);

      expect(result).toEqual([]);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("should return an empty array when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
      });

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("should return an empty array when user object has no id", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: undefined } },
      });

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("should return an empty array when selected groups query returns an error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: null,
        error: { message: "DB connection failed", name: "PostgrestError" },
      });
      mockFrom.mockReturnValue(groupChain);

      const result = await getAllGroupsAssistants(["group-1", "group-2"]);

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Error fetching selected groups",
        expect.objectContaining({ error: expect.any(Object) }),
      );
    });

    it("should return an empty array when no groups are selected", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: [],
        error: null,
      });
      mockFrom.mockReturnValue(groupChain);

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockFrom).toHaveBeenCalledWith("managed_user_groups");
    });

    it("should return an empty array when selectedGroups is null", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: null,
        error: null,
      });
      mockFrom.mockReturnValue(groupChain);

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
    });

    it("should fetch assistants only from selected groups", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const selectedGroups = [{ group_id: "group-1" }, { group_id: "group-3" }];
      const assistants = [
        { id: "a1", name: "Assistant 1", group_id: "group-1" },
        { id: "a2", name: "Assistant 2", group_id: "group-3" },
      ];

      // First call: managed_user_groups query
      const groupChain = createChain({
        data: selectedGroups,
        error: null,
      });
      // Second call: assistants query
      const assistantChain = createChain({
        data: assistants,
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      const result = await getAllGroupsAssistants([
        "group-1",
        "group-2",
        "group-3",
      ]);

      expect(result).toEqual(assistants);
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(mockFrom).toHaveBeenNthCalledWith(1, "managed_user_groups");
      expect(mockFrom).toHaveBeenNthCalledWith(2, "assistants");
    });

    it("should pass correct filters to managed_user_groups query", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-456" } },
      });

      const groupChain = createChain({
        data: [{ group_id: "group-1" }],
        error: null,
      });
      const assistantChain = createChain({
        data: [{ id: "a1", name: "Test" }],
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      await getAllGroupsAssistants(["group-1"]);

      // Verify the group query chain was called with correct parameters
      expect(groupChain.select).toHaveBeenCalledWith("group_id");
      expect(groupChain.eq).toHaveBeenCalledWith("user_id", "user-456");
      expect(groupChain.eq).toHaveBeenCalledWith("is_selected", true);
    });

    it("should pass selected group IDs to the assistants .in() filter", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: [{ group_id: "g-a" }, { group_id: "g-b" }],
        error: null,
      });
      const assistantChain = createChain({
        data: [],
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      await getAllGroupsAssistants(["g-a", "g-b", "g-c"]);

      expect(assistantChain.select).toHaveBeenCalledWith("*");
      expect(assistantChain.in).toHaveBeenCalledWith("group_id", [
        "g-a",
        "g-b",
      ]);
    });

    it("should return an empty array when assistants query throws an error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: [{ group_id: "group-1" }],
        error: null,
      });

      // The assistants query returns an error, which causes `throw error` in source
      const assistantChain = createChain({
        data: null,
        error: { message: "Query failed" },
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Error fetching group assistants",
        expect.objectContaining({ error: expect.any(Object) }),
      );
    });

    it("should return an empty array when assistants data is null but no error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const groupChain = createChain({
        data: [{ group_id: "group-1" }],
        error: null,
      });

      const assistantChain = createChain({
        data: null,
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      const result = await getAllGroupsAssistants(["group-1"]);

      // data is null, error is falsy, so `data || []` returns []
      expect(result).toEqual([]);
    });

    it("should return an empty array on unexpected exception", async () => {
      mockGetUser.mockRejectedValue(new Error("Network failure"));

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Error fetching group assistants",
        expect.objectContaining({
          error: { message: "Network failure", name: "Error" },
        }),
      );
    });

    it("should log a non-Error exception correctly", async () => {
      mockGetUser.mockRejectedValue("string error");

      const result = await getAllGroupsAssistants(["group-1"]);

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Error fetching group assistants",
        { error: "string error" },
      );
    });

    it("should return assistants data on success", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });

      const expectedAssistants = [
        {
          id: "a1",
          name: "Research Bot",
          group_id: "group-1",
          model: "gpt-4",
        },
        {
          id: "a2",
          name: "Code Helper",
          group_id: "group-2",
          model: "claude-3",
        },
      ];

      const groupChain = createChain({
        data: [{ group_id: "group-1" }, { group_id: "group-2" }],
        error: null,
      });

      const assistantChain = createChain({
        data: expectedAssistants,
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(groupChain)
        .mockReturnValueOnce(assistantChain);

      const result = await getAllGroupsAssistants(["group-1", "group-2"]);

      expect(result).toEqual(expectedAssistants);
      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // getAllGroupsAssistantsImages
  // =========================================================================
  describe("getAllGroupsAssistantsImages", () => {
    it("should return an empty array for empty imagePaths", async () => {
      const result = await getAllGroupsAssistantsImages([]);

      expect(result).toEqual([]);
      expect(getAssistantImageFromStorage).not.toHaveBeenCalled();
    });

    it("should call getAssistantImageFromStorage for each path", async () => {
      (getAssistantImageFromStorage as jest.Mock).mockResolvedValue(
        "https://storage.example.com/image.png",
      );

      const paths = ["path/img1.png", "path/img2.png", "path/img3.png"];
      await getAllGroupsAssistantsImages(paths);

      expect(getAssistantImageFromStorage).toHaveBeenCalledTimes(3);
      expect(getAssistantImageFromStorage).toHaveBeenCalledWith(
        "path/img1.png",
      );
      expect(getAssistantImageFromStorage).toHaveBeenCalledWith(
        "path/img2.png",
      );
      expect(getAssistantImageFromStorage).toHaveBeenCalledWith(
        "path/img3.png",
      );
    });

    it("should fetch all images in parallel and return URLs", async () => {
      const mockUrls = [
        "https://cdn.example.com/a.png",
        "https://cdn.example.com/b.png",
      ];

      (getAssistantImageFromStorage as jest.Mock)
        .mockResolvedValueOnce(mockUrls[0])
        .mockResolvedValueOnce(mockUrls[1]);

      const result = await getAllGroupsAssistantsImages([
        "bucket/a.png",
        "bucket/b.png",
      ]);

      expect(result).toEqual(mockUrls);
      expect(result).toHaveLength(2);
    });

    it("should propagate errors from getAssistantImageFromStorage", async () => {
      (getAssistantImageFromStorage as jest.Mock).mockRejectedValue(
        new Error("Storage unavailable"),
      );

      await expect(
        getAllGroupsAssistantsImages(["path/broken.png"]),
      ).rejects.toThrow("Storage unavailable");
    });

    it("should handle a single image path", async () => {
      (getAssistantImageFromStorage as jest.Mock).mockResolvedValue(
        "https://cdn.example.com/single.png",
      );

      const result = await getAllGroupsAssistantsImages(["single/path.png"]);

      expect(result).toEqual(["https://cdn.example.com/single.png"]);
      expect(getAssistantImageFromStorage).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getGroupAssistantByUserId
  // =========================================================================
  describe("getGroupAssistantByUserId", () => {
    it("should return the assistant when found", async () => {
      const expectedAssistant = {
        id: "assistant-1",
        name: "My Assistant",
        model: "gpt-4",
        group_id: "group-1",
      };

      const chain = createChain({
        data: expectedAssistant,
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await getGroupAssistantByUserId("assistant-1");

      expect(result).toEqual(expectedAssistant);
      expect(mockFrom).toHaveBeenCalledWith("assistants");
      expect(chain.select).toHaveBeenCalledWith("*");
      expect(chain.eq).toHaveBeenCalledWith("id", "assistant-1");
      expect(chain.single).toHaveBeenCalled();
    });

    it("should throw an error when assistant is not found", async () => {
      const chain = createChain({
        data: null,
        error: { message: "Row not found" },
      });
      mockFrom.mockReturnValue(chain);

      await expect(getGroupAssistantByUserId("nonexistent")).rejects.toThrow(
        "Row not found",
      );
    });

    it("should query the correct table with the correct ID", async () => {
      const chain = createChain({
        data: { id: "xyz-789", name: "Test" },
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      await getGroupAssistantByUserId("xyz-789");

      expect(mockFrom).toHaveBeenCalledWith("assistants");
      expect(chain.eq).toHaveBeenCalledWith("id", "xyz-789");
    });

    it("should throw when data is null even if error is also null", async () => {
      const chain = createChain({
        data: null,
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      // When assistant is null and error is null, accessing error.message throws TypeError
      await expect(getGroupAssistantByUserId("missing")).rejects.toThrow();
    });
  });
});
