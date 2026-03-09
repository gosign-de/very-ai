jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  MODEL_TOKEN_LIMITS,
  FALLBACK_MODELS,
  checkTokenLimitAndFallback,
  getModelEndpoint,
} from "./model-fallback";

describe("MODEL_TOKEN_LIMITS", () => {
  it("should define a token limit for gpt-4", () => {
    expect(MODEL_TOKEN_LIMITS["gpt-4"]).toBe(128000);
  });

  it("should define a token limit for gpt-4o", () => {
    expect(MODEL_TOKEN_LIMITS["gpt-4o"]).toBe(128000);
  });

  it("should define a token limit for gpt-4o-mini", () => {
    expect(MODEL_TOKEN_LIMITS["gpt-4o-mini"]).toBe(128000);
  });

  it("should define a token limit for gpt-5", () => {
    expect(MODEL_TOKEN_LIMITS["gpt-5"]).toBe(256000);
  });

  it("should define a token limit for deepseek-r1", () => {
    expect(MODEL_TOKEN_LIMITS["deepseek-r1"]).toBe(128000);
  });

  it("should define a token limit for gemini-2.5-pro", () => {
    expect(MODEL_TOKEN_LIMITS["gemini-2.5-pro"]).toBe(1048576);
  });

  it("should define a token limit for gemini-2.5-flash", () => {
    expect(MODEL_TOKEN_LIMITS["gemini-2.5-flash"]).toBe(1048576);
  });

  it("should define a token limit for o1-preview", () => {
    expect(MODEL_TOKEN_LIMITS["o1-preview"]).toBe(128000);
  });

  it("should define a token limit for o3-mini", () => {
    expect(MODEL_TOKEN_LIMITS["o3-mini"]).toBe(100000);
  });
});

describe("FALLBACK_MODELS", () => {
  it("should map gpt-4 to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["gpt-4"]).toBe("gemini-2.5-pro");
  });

  it("should map gpt-4o to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["gpt-4o"]).toBe("gemini-2.5-pro");
  });

  it("should map gpt-4o-mini to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["gpt-4o-mini"]).toBe("gemini-2.5-pro");
  });

  it("should map gpt-5 to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["gpt-5"]).toBe("gemini-2.5-pro");
  });

  it("should map claude-3-sonnet to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["claude-3-sonnet"]).toBe("gemini-2.5-pro");
  });

  it("should map claude-3-haiku to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["claude-3-haiku"]).toBe("gemini-2.5-pro");
  });

  it("should map deepseek-r1 to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["deepseek-r1"]).toBe("gemini-2.5-pro");
  });

  it("should map o1-preview to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["o1-preview"]).toBe("gemini-2.5-pro");
  });

  it("should map o3-mini to gemini-2.5-pro", () => {
    expect(FALLBACK_MODELS["o3-mini"]).toBe("gemini-2.5-pro");
  });
});

describe("checkTokenLimitAndFallback", () => {
  it("should return shouldFallback false for an unknown model", () => {
    const result = checkTokenLimitAndFallback("unknown-model", 50000);
    expect(result).toEqual({ shouldFallback: false });
  });

  it("should return shouldFallback false when token count is within limit", () => {
    // gpt-4 limit is 128000, 95% threshold is 121600
    const result = checkTokenLimitAndFallback("gpt-4", 100000);
    expect(result.shouldFallback).toBe(false);
    expect(result.fallbackModel).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("should return shouldFallback false when token count is exactly at 95% threshold", () => {
    // gpt-4 limit is 128000, 95% = 121600 exactly
    // The condition is strictly greater than (>), so exactly 121600 should NOT trigger fallback
    const result = checkTokenLimitAndFallback("gpt-4", 128000 * 0.95);
    expect(result.shouldFallback).toBe(false);
  });

  it("should return shouldFallback true when token count exceeds 95% threshold with fallback available", () => {
    // gpt-4 limit is 128000, 95% = 121600
    const result = checkTokenLimitAndFallback("gpt-4", 121601);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackModel).toBe("gemini-2.5-pro");
    expect(result.reason).toContain("Token limit exceeded");
    expect(result.reason).toContain("121601");
    expect(result.reason).toContain("128000");
    expect(result.reason).toContain("gemini-2.5-pro");
  });

  it("should return shouldFallback false with reason when token count exceeds limit but no fallback exists", () => {
    // gemini-2.5-pro has a token limit (1048576) but no entry in FALLBACK_MODELS
    const tokenCount = 1048576; // exceeds 95% threshold
    const result = checkTokenLimitAndFallback("gemini-2.5-pro", tokenCount);
    expect(result.shouldFallback).toBe(false);
    expect(result.reason).toContain("No fallback available");
    expect(result.reason).toContain(String(tokenCount));
  });

  it("should return shouldFallback false when tokenCount is 0", () => {
    const result = checkTokenLimitAndFallback("gpt-4", 0);
    expect(result.shouldFallback).toBe(false);
    expect(result.fallbackModel).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("should trigger fallback for gpt-4o exceeding threshold", () => {
    const result = checkTokenLimitAndFallback("gpt-4o", 125000);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackModel).toBe("gemini-2.5-pro");
  });

  it("should trigger fallback for o3-mini exceeding threshold", () => {
    // o3-mini limit is 100000, 95% = 95000
    const result = checkTokenLimitAndFallback("o3-mini", 95001);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackModel).toBe("gemini-2.5-pro");
  });

  it("should trigger fallback for deepseek-r1 exceeding threshold", () => {
    const result = checkTokenLimitAndFallback("deepseek-r1", 130000);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackModel).toBe("gemini-2.5-pro");
  });

  it("should not trigger fallback for gemini-2.5-flash below threshold", () => {
    // gemini-2.5-flash limit is 1048576, well within limit
    const result = checkTokenLimitAndFallback("gemini-2.5-flash", 500000);
    expect(result.shouldFallback).toBe(false);
  });
});

describe("getModelEndpoint", () => {
  it("should return /api/chat/google for gemini models", () => {
    expect(getModelEndpoint("gemini-2.5-pro")).toBe("/api/chat/google");
  });

  it("should return /api/chat/google for gemini-2.5-flash", () => {
    expect(getModelEndpoint("gemini-2.5-flash")).toBe("/api/chat/google");
  });

  it("should return /api/chat/anthropic for claude models", () => {
    expect(getModelEndpoint("claude-3-sonnet")).toBe("/api/chat/anthropic");
  });

  it("should return /api/chat/anthropic for claude-3-haiku", () => {
    expect(getModelEndpoint("claude-3-haiku")).toBe("/api/chat/anthropic");
  });

  it("should return /api/chat/deepseek for deepseek-r1", () => {
    expect(getModelEndpoint("deepseek-r1")).toBe("/api/chat/deepseek");
  });

  it("should return /api/chat/azure for gpt-4", () => {
    expect(getModelEndpoint("gpt-4")).toBe("/api/chat/azure");
  });

  it("should return /api/chat/azure for gpt-4o", () => {
    expect(getModelEndpoint("gpt-4o")).toBe("/api/chat/azure");
  });

  it("should return /api/chat/azure for an unknown model (default)", () => {
    expect(getModelEndpoint("some-unknown-model")).toBe("/api/chat/azure");
  });

  it("should return /api/chat/azure for o1-preview", () => {
    expect(getModelEndpoint("o1-preview")).toBe("/api/chat/azure");
  });

  it("should return /api/chat/azure for o3-mini", () => {
    expect(getModelEndpoint("o3-mini")).toBe("/api/chat/azure");
  });
});
