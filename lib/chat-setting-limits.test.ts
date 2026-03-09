import {
  CHAT_SETTING_LIMITS,
  getDefaultContextLength,
  getMaxContextLength,
  getWorkspaceContextLength,
  getMaxTokenOutputLength,
} from "./chat-setting-limits";

describe("CHAT_SETTING_LIMITS", () => {
  it("should contain gpt-4o with correct limits", () => {
    const limits = CHAT_SETTING_LIMITS["gpt-4o" as any];
    expect(limits).toBeDefined();
    expect(limits.MIN_TEMPERATURE).toBe(0.0);
    expect(limits.MAX_TEMPERATURE).toBe(2.0);
    expect(limits.MAX_TOKEN_OUTPUT_LENGTH).toBe(16384);
    expect(limits.MAX_CONTEXT_LENGTH).toBe(128000);
    expect(limits.DEFAULT_CONTEXT_LENGTH).toBe(128000);
  });

  it("should contain claude-3-opus-20240229 with correct limits", () => {
    const limits = CHAT_SETTING_LIMITS["claude-3-opus-20240229" as any];
    expect(limits).toBeDefined();
    expect(limits.MIN_TEMPERATURE).toBe(0.0);
    expect(limits.MAX_TEMPERATURE).toBe(1.0);
    expect(limits.MAX_TOKEN_OUTPUT_LENGTH).toBe(4096);
    expect(limits.MAX_CONTEXT_LENGTH).toBe(200000);
    expect(limits.DEFAULT_CONTEXT_LENGTH).toBe(200000);
  });

  it("should contain gemini-2.5-pro with correct limits", () => {
    const limits = CHAT_SETTING_LIMITS["gemini-2.5-pro" as any];
    expect(limits).toBeDefined();
    expect(limits.MIN_TEMPERATURE).toBe(0.0);
    expect(limits.MAX_TEMPERATURE).toBe(1.0);
    expect(limits.MAX_TOKEN_OUTPUT_LENGTH).toBe(65535);
    expect(limits.MAX_CONTEXT_LENGTH).toBe(1048576);
    expect(limits.DEFAULT_CONTEXT_LENGTH).toBe(1048576);
  });

  it("should have all required properties for every model entry", () => {
    const requiredKeys = [
      "MIN_TEMPERATURE",
      "MAX_TEMPERATURE",
      "MAX_TOKEN_OUTPUT_LENGTH",
      "MAX_CONTEXT_LENGTH",
      "DEFAULT_CONTEXT_LENGTH",
    ];
    for (const [_modelId, limits] of Object.entries(CHAT_SETTING_LIMITS)) {
      for (const key of requiredKeys) {
        expect(limits).toHaveProperty(key);
        expect(typeof (limits as any)[key]).toBe("number");
      }
    }
  });
});

describe("getDefaultContextLength", () => {
  it("should return the DEFAULT_CONTEXT_LENGTH for a known model", () => {
    expect(getDefaultContextLength("gpt-4o" as any)).toBe(128000);
  });

  it("should return the correct default for claude-3-opus-20240229", () => {
    expect(getDefaultContextLength("claude-3-opus-20240229" as any)).toBe(
      200000,
    );
  });

  it("should return the correct default for gemini-2.5-pro", () => {
    expect(getDefaultContextLength("gemini-2.5-pro" as any)).toBe(1048576);
  });

  it("should return 4096 fallback for an unknown model", () => {
    expect(getDefaultContextLength("nonexistent-model-xyz" as any)).toBe(4096);
  });
});

describe("getMaxContextLength", () => {
  it("should return the MAX_CONTEXT_LENGTH for a known model", () => {
    expect(getMaxContextLength("gpt-4o" as any)).toBe(128000);
  });

  it("should return the correct max for claude-3-opus-20240229", () => {
    expect(getMaxContextLength("claude-3-opus-20240229" as any)).toBe(200000);
  });

  it("should return the correct max for gemini-2.5-flash", () => {
    expect(getMaxContextLength("gemini-2.5-flash" as any)).toBe(1048576);
  });

  it("should return 4096 fallback for an unknown model", () => {
    expect(getMaxContextLength("nonexistent-model-xyz" as any)).toBe(4096);
  });
});

describe("getWorkspaceContextLength", () => {
  const knownModel = "gpt-4o" as any; // DEFAULT_CONTEXT_LENGTH = 128000

  it("should return model default when workspace default is null", () => {
    expect(getWorkspaceContextLength(null, knownModel)).toBe(128000);
  });

  it("should return model default when workspace default is undefined", () => {
    expect(getWorkspaceContextLength(undefined, knownModel)).toBe(128000);
  });

  it("should return model default when workspace default is 0", () => {
    expect(getWorkspaceContextLength(0, knownModel)).toBe(128000);
  });

  it("should return model default when workspace default is the old generic 4096", () => {
    expect(getWorkspaceContextLength(4096, knownModel)).toBe(128000);
  });

  it("should return workspace default when it is within model limits", () => {
    expect(getWorkspaceContextLength(64000, knownModel)).toBe(64000);
  });

  it("should cap at model default when workspace default exceeds model limits", () => {
    expect(getWorkspaceContextLength(999999, knownModel)).toBe(128000);
  });

  it("should return model default for unknown model when workspace is null", () => {
    expect(getWorkspaceContextLength(null, "nonexistent-model" as any)).toBe(
      4096,
    );
  });

  it("should return model fallback default when workspace is 4096 and model is unknown", () => {
    // Unknown model has fallback default of 4096; workspace is 4096 (old default)
    // The 4096 check triggers, so it returns model default which is also 4096
    expect(getWorkspaceContextLength(4096, "nonexistent-model" as any)).toBe(
      4096,
    );
  });

  it("should return min of workspace and model default for a small model", () => {
    // gpt-3.5-turbo has DEFAULT_CONTEXT_LENGTH = 4096
    // workspace = 8000 exceeds model default, so it should be capped at 4096
    // But workspace 8000 !== 4096 so the 4096 bypass doesn't trigger
    expect(getWorkspaceContextLength(8000, "gpt-3.5-turbo" as any)).toBe(4096);
  });

  it("should use workspace default when less than model default and not 4096", () => {
    // claude-3-opus has DEFAULT_CONTEXT_LENGTH = 200000
    const result = getWorkspaceContextLength(
      50000,
      "claude-3-opus-20240229" as any,
    );
    expect(result).toBe(50000);
  });
});

describe("getMaxTokenOutputLength", () => {
  it("should return the MAX_TOKEN_OUTPUT_LENGTH for gpt-4o", () => {
    expect(getMaxTokenOutputLength("gpt-4o" as any)).toBe(16384);
  });

  it("should return the correct value for claude-3-opus-20240229", () => {
    expect(getMaxTokenOutputLength("claude-3-opus-20240229" as any)).toBe(4096);
  });

  it("should return the correct value for gemini-2.5-pro", () => {
    expect(getMaxTokenOutputLength("gemini-2.5-pro" as any)).toBe(65535);
  });

  it("should return the correct value for o3-mini", () => {
    expect(getMaxTokenOutputLength("o3-mini" as any)).toBe(100000);
  });

  it("should return 4096 fallback for an unknown model", () => {
    expect(getMaxTokenOutputLength("nonexistent-model-xyz" as any)).toBe(4096);
  });
});
