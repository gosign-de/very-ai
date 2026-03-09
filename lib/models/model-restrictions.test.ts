jest.mock("@/lib/logger/client", () => ({
  createClientLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

const _mockSingle = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();

jest.mock("@/lib/supabase/browser-client", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: mockSelect,
    })),
  },
}));

import {
  filterModelsByGroupRestrictions,
  isModelAllowedForUser,
  getGroupModelRestrictions,
} from "@/lib/models/model-restrictions";
import { supabase } from "@/lib/supabase/browser-client";

const mockModels = [
  { modelId: "gpt-4o", modelName: "GPT-4o", provider: "openai" },
  {
    modelId: "claude-3-opus",
    modelName: "Claude 3 Opus",
    provider: "anthropic",
  },
  {
    modelId: "gemini-2.5-pro",
    modelName: "Gemini 2.5 Pro",
    provider: "google",
  },
] as any[];

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Helper: set up the Supabase mock chain for .from().select().in()
 */
function setupChainIn(data: any[] | null, error: any = null) {
  mockIn.mockReturnValue({ data, error });
  mockSelect.mockReturnValue({ in: mockIn });
}

/**
 * Helper: set up the Supabase mock chain for .from().select().eq()
 */
function setupChainEq(data: any[] | null, error: any = null) {
  mockEq.mockReturnValue({ data, error });
  mockSelect.mockReturnValue({ eq: mockEq });
}

/**
 * Helper: set up chain for .from().select().in().eq() (used by isModelAllowedForUser)
 */
function setupChainInEq(data: any[] | null, error: any = null) {
  mockEq.mockReturnValue({ data, error });
  mockIn.mockReturnValue({ eq: mockEq });
  mockSelect.mockReturnValue({ in: mockIn });
}

describe("filterModelsByGroupRestrictions", () => {
  it("returns all models when userGroupIds is empty", async () => {
    const result = await filterModelsByGroupRestrictions(mockModels, []);
    expect(result).toEqual(mockModels);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns all models when no restrictions exist", async () => {
    setupChainIn([]);

    const result = await filterModelsByGroupRestrictions(mockModels, [
      "group-1",
    ]);

    expect(supabase.from).toHaveBeenCalledWith("model_restrictions");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockIn).toHaveBeenCalledWith("group_id", ["group-1"]);
    expect(result).toEqual(mockModels);
  });

  it("filters out restricted models", async () => {
    setupChainIn([
      { group_id: "group-1", model_id: "gpt-4o", is_allowed: false },
    ]);

    const result = await filterModelsByGroupRestrictions(mockModels, [
      "group-1",
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((m: any) => m.modelId)).toEqual([
      "claude-3-opus",
      "gemini-2.5-pro",
    ]);
  });

  it("UNION logic: model allowed if ANY group allows it", async () => {
    // group-1 restricts gpt-4o, but group-2 does not restrict it
    setupChainIn([
      { group_id: "group-1", model_id: "gpt-4o", is_allowed: false },
      // group-2 has no restriction entries for gpt-4o -> allowed
    ]);

    const result = await filterModelsByGroupRestrictions(mockModels, [
      "group-1",
      "group-2",
    ]);

    // gpt-4o should still be included because group-2 has no restrictions
    expect(result).toHaveLength(3);
    expect(result.map((m: any) => m.modelId)).toContain("gpt-4o");
  });

  it("returns all models on Supabase error (fail open)", async () => {
    setupChainIn(null, { message: "DB connection failed" });

    const result = await filterModelsByGroupRestrictions(mockModels, [
      "group-1",
    ]);

    expect(result).toEqual(mockModels);
  });
});

describe("isModelAllowedForUser", () => {
  it("returns true when no groups", async () => {
    const result = await isModelAllowedForUser("gpt-4o" as any, []);
    expect(result).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns true when no restrictions for model", async () => {
    setupChainInEq([]);

    const result = await isModelAllowedForUser("gpt-4o" as any, ["group-1"]);

    expect(supabase.from).toHaveBeenCalledWith("model_restrictions");
    expect(result).toBe(true);
  });

  it("returns false when all groups restrict the model", async () => {
    setupChainInEq([
      { group_id: "group-1", model_id: "gpt-4o", is_allowed: false },
      { group_id: "group-2", model_id: "gpt-4o", is_allowed: false },
    ]);

    const result = await isModelAllowedForUser("gpt-4o" as any, [
      "group-1",
      "group-2",
    ]);

    expect(result).toBe(false);
  });

  it("returns true when at least one group allows (UNION logic)", async () => {
    // group-1 restricts, group-2 has no restriction entry for this model
    setupChainInEq([
      { group_id: "group-1", model_id: "gpt-4o", is_allowed: false },
      // no entry for group-2 means it allows the model
    ]);

    const result = await isModelAllowedForUser("gpt-4o" as any, [
      "group-1",
      "group-2",
    ]);

    // group-2 has no restriction in restrictionsByGroup -> allowed
    expect(result).toBe(true);
  });

  it("returns true on error (fail open)", async () => {
    setupChainInEq(null, { message: "DB error" });

    const result = await isModelAllowedForUser("gpt-4o" as any, ["group-1"]);

    expect(result).toBe(true);
  });
});

describe("getGroupModelRestrictions", () => {
  it("returns mapped restrictions", async () => {
    setupChainEq([
      { group_id: "group-1", model_id: "gpt-4o", is_allowed: false },
      { group_id: "group-1", model_id: "claude-3-opus", is_allowed: true },
    ]);

    const result = await getGroupModelRestrictions("group-1");

    expect(supabase.from).toHaveBeenCalledWith("model_restrictions");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("group_id", "group-1");
    expect(result).toEqual([
      { modelId: "gpt-4o", isAllowed: false },
      { modelId: "claude-3-opus", isAllowed: true },
    ]);
  });

  it("returns empty array on error", async () => {
    setupChainEq(null, { message: "DB error" });

    const result = await getGroupModelRestrictions("group-1");

    expect(result).toEqual([]);
  });

  it("returns empty array when no restrictions", async () => {
    setupChainEq([]);

    const result = await getGroupModelRestrictions("group-1");

    expect(result).toEqual([]);
  });
});
