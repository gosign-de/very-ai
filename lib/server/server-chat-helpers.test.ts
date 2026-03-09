jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

jest.mock("@/types/valid-keys", () => ({
  VALID_ENV_KEYS: {
    OPENAI_API_KEY: "OPENAI_API_KEY",
    ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
    GOOGLE_GEMINI_API_KEY: "GOOGLE_GEMINI_API_KEY",
    MISTRAL_API_KEY: "MISTRAL_API_KEY",
    GROQ_API_KEY: "GROQ_API_KEY",
    PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY",
    AZURE_OPENAI_API_KEY: "AZURE_OPENAI_API_KEY",
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

import { checkApiKey, getServerProfile, getUser } from "./server-chat-helpers";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const mockCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockCreateServerClient = createServerClient as jest.MockedFunction<
  typeof createServerClient
>;

function buildMockSupabase({
  user = null,
  profile = null,
}: {
  user?: { id: string } | null;
  profile?: Record<string, any> | null;
} = {}) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: profile }),
        }),
      }),
    }),
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.mockResolvedValue({
    get: jest.fn().mockReturnValue({ value: "mock-cookie-value" }),
  } as any);
});

describe("checkApiKey", () => {
  it("throws for null API key", () => {
    expect(() => checkApiKey(null, "OPENAI")).toThrow();
  });

  it("throws for empty string API key", () => {
    expect(() => checkApiKey("", "OPENAI")).toThrow();
  });

  it("does NOT throw for valid API key", () => {
    expect(() => checkApiKey("sk-valid-key-123", "OPENAI")).not.toThrow();
  });

  it("error message includes key name", () => {
    expect(() => checkApiKey(null, "ANTHROPIC")).toThrow(
      "ANTHROPIC API Key not found",
    );
  });
});

describe("getServerProfile", () => {
  it('throws "User not found" when auth returns no user', async () => {
    const mockSupabase = buildMockSupabase({ user: null });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    await expect(getServerProfile()).rejects.toThrow("User not found");
  });

  it('throws "Profile not found" when profile query returns null', async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: "user-123" },
      profile: null,
    });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    await expect(getServerProfile()).rejects.toThrow("Profile not found");
  });

  it("returns profile with env API keys merged", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: "env-openai-key",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };

    const baseProfile = {
      user_id: "user-123",
      display_name: "Test User",
      openai_api_key: "",
    };

    const mockSupabase = buildMockSupabase({
      user: { id: "user-123" },
      profile: baseProfile,
    });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    const result = await getServerProfile();
    expect(result.openai_api_key).toBe("env-openai-key");

    process.env = originalEnv;
  });

  it('reads cookies with correct cookie name "sb-veryai-auth-token"', async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: "user-123" },
      profile: { user_id: "user-123" },
    });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    await getServerProfile();

    const callArgs = mockCreateServerClient.mock.calls[0];
    expect(callArgs[2]).toEqual(
      expect.objectContaining({
        cookieOptions: { name: "sb-veryai-auth-token" },
      }),
    );
  });
});

describe("getUser", () => {
  it("returns user when authenticated", async () => {
    const mockUser = { id: "user-456", email: "test@example.com" };
    const mockSupabase = buildMockSupabase({ user: mockUser as any });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    const user = await getUser();
    expect(user).toEqual(mockUser);
  });

  it("throws when no user found", async () => {
    const mockSupabase = buildMockSupabase({ user: null });
    mockCreateServerClient.mockReturnValue(mockSupabase);

    await expect(getUser()).rejects.toThrow("User not found");
  });
});
