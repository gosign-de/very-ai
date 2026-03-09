jest.mock("@/lib/envs", () => ({
  isUsingEnvironmentKey: jest.fn(),
}));

jest.mock("@/types/valid-keys", () => ({
  VALID_ENV_KEYS: {
    AZURE_OPENAI_API_KEY: "AZURE_OPENAI_API_KEY",
    OPENAI_API_KEY: "OPENAI_API_KEY",
    GOOGLE_GEMINI_API_KEY: "GOOGLE_GEMINI_API_KEY",
    ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
    MISTRAL_API_KEY: "MISTRAL_API_KEY",
    GROQ_API_KEY: "GROQ_API_KEY",
    PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY",
    OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
    DALLE_API_KEY: "DALLE_API_KEY",
    FLUX1_API_KEY: "FLUX1_API_KEY",
    DEEPSEEK_API_SERVICE_ACCOUNT: "DEEPSEEK_API_SERVICE_ACCOUNT",
    OPENAI_ORGANIZATION_ID: "OPENAI_ORGANIZATION_ID",
    AZURE_OPENAI_ENDPOINT: "AZURE_OPENAI_ENDPOINT",
    AZURE_GPT_35_TURBO_NAME: "AZURE_GPT_35_TURBO_NAME",
    AZURE_GPT_45_VISION_NAME: "AZURE_GPT_45_VISION_NAME",
    AZURE_GPT_45_TURBO_NAME: "AZURE_GPT_45_TURBO_NAME",
    AZURE_GPT_5_NAME: "AZURE_GPT_5_NAME",
    AZURE_O3_MINI_NAME: "AZURE_O3_MINI_NAME",
    AZURE_EMBEDDINGS_NAME: "AZURE_EMBEDDINGS_NAME",
  },
}));

jest.mock("@/types/key-type", () => ({
  EnvKey: {},
}));

import { getEnvKeyMap } from "./env-key-helper";
import { isUsingEnvironmentKey } from "@/lib/envs";

const mockIsUsingEnvironmentKey = isUsingEnvironmentKey as jest.MockedFunction<
  typeof isUsingEnvironmentKey
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getEnvKeyMap", () => {
  it("returns object with provider keys", () => {
    mockIsUsingEnvironmentKey.mockReturnValue(false);

    const result = getEnvKeyMap();
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("calls isUsingEnvironmentKey for each provider", () => {
    mockIsUsingEnvironmentKey.mockReturnValue(false);

    getEnvKeyMap();

    // There are 19 providers in the envKeyMap
    expect(mockIsUsingEnvironmentKey).toHaveBeenCalledTimes(19);
  });

  it("returns boolean values", () => {
    mockIsUsingEnvironmentKey.mockReturnValue(true);

    const result = getEnvKeyMap();
    for (const value of Object.values(result)) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("contains expected provider keys", () => {
    mockIsUsingEnvironmentKey.mockReturnValue(false);

    const result = getEnvKeyMap();
    const expectedKeys = [
      "azure",
      "openai",
      "google",
      "anthropic",
      "mistral",
      "groq",
      "perplexity",
      "openrouter",
      "dalle",
      "flux1",
      "deepseek",
      "openai_organization_id",
      "azure_openai_endpoint",
      "azure_gpt_35_turbo_name",
      "azure_gpt_45_vision_name",
      "azure_gpt_45_turbo_name",
      "azure_gpt_5_name",
      "azure_o3_mini_name",
      "azure_embeddings_name",
    ];

    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});
