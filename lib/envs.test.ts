jest.mock("@/types/key-type", () => ({ EnvKey: {} }));

import { isUsingEnvironmentKey } from "@/lib/envs";

describe("isUsingEnvironmentKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when env var is set to a non-empty value", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-key-123";

    expect(isUsingEnvironmentKey("OPENAI_API_KEY" as any)).toBe(true);
  });

  it("returns false when env var is not set (undefined)", () => {
    delete process.env["OPENAI_API_KEY"];

    expect(isUsingEnvironmentKey("OPENAI_API_KEY" as any)).toBe(false);
  });

  it("returns false when env var is empty string", () => {
    process.env["ANTHROPIC_API_KEY"] = "";

    expect(isUsingEnvironmentKey("ANTHROPIC_API_KEY" as any)).toBe(false);
  });

  it("works with different key names", () => {
    process.env["GOOGLE_GEMINI_API_KEY"] = "gemini-key";
    process.env["MISTRAL_API_KEY"] = "mistral-key";
    delete process.env["GROQ_API_KEY"];

    expect(isUsingEnvironmentKey("GOOGLE_GEMINI_API_KEY" as any)).toBe(true);
    expect(isUsingEnvironmentKey("MISTRAL_API_KEY" as any)).toBe(true);
    expect(isUsingEnvironmentKey("GROQ_API_KEY" as any)).toBe(false);
  });
});
