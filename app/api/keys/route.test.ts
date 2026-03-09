/**
 * @jest-environment node
 */
import { auth } from "@/app/_lib/auth";
import { isUsingEnvironmentKey } from "@/lib/envs";
import { GET } from "./route";

jest.mock("@/app/_lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/envs", () => ({
  isUsingEnvironmentKey: jest.fn(),
}));

jest.mock("@/lib/server/server-utils", () => ({
  createResponse: jest.fn((data: object, status: number) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }),
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

const mockAuth = auth as jest.Mock;
const mockIsUsingEnvironmentKey = isUsingEnvironmentKey as jest.Mock;

function createRequest(options?: { accept?: string }): Request {
  const headers: Record<string, string> = {};
  if (options?.accept) {
    headers["accept"] = options.accept;
  }
  return new Request("http://localhost/api/keys", {
    method: "GET",
    headers,
  });
}

describe("GET /api/keys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized Request");
  });

  it("returns 400 when Accept header is text/html (browser access)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);

    const response = await GET(
      createRequest({ accept: "text/html,application/json" }),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toBe("This route cannot be accessed directly in browser.");
  });

  it("returns 200 with isUsingEnvKeyMap when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
    mockIsUsingEnvironmentKey.mockReturnValue(false);

    const response = await GET(createRequest({ accept: "application/json" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("isUsingEnvKeyMap");
    expect(typeof body.isUsingEnvKeyMap).toBe("object");
  });

  it("calls isUsingEnvironmentKey for each provider", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
    mockIsUsingEnvironmentKey.mockReturnValue(true);

    await GET(createRequest({ accept: "application/json" }));

    // There are 18 entries in the envKeyMap
    const expectedProviders = [
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

    expect(mockIsUsingEnvironmentKey).toHaveBeenCalledTimes(
      expectedProviders.length,
    );
  });

  it("returns correct boolean values per provider key", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } } as any);
    mockIsUsingEnvironmentKey.mockImplementation(
      key => key === "OPENAI_API_KEY",
    );

    const response = await GET(createRequest({ accept: "application/json" }));
    const body = await response.json();

    expect(body.isUsingEnvKeyMap.openai).toBe(true);
    expect(body.isUsingEnvKeyMap.anthropic).toBe(false);
  });
});
