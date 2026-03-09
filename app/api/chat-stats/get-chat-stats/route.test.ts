/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { routeAuthentication } from "@/db/authentication";
import { POST } from "./route";

const mockRpc = jest.fn();
const mockSupabase = { rpc: mockRpc };

jest.mock("@/db/authentication", () => ({
  routeAuthentication: jest.fn(),
}));

jest.mock("@/lib/supabase/middleware", () => ({
  createClient: jest.fn(() => ({ supabase: mockSupabase })),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

const mockRouteAuthentication = routeAuthentication as jest.MockedFunction<
  typeof routeAuthentication
>;

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/chat-stats/get-chat-stats"),
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("POST /api/chat-stats/get-chat-stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects to /no-access when authentication fails", async () => {
    mockRouteAuthentication.mockResolvedValue(null as any);

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/no-access");
  });

  it("calls get_request_count RPC with correct parameters", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "week",
      modelName: "gpt-4",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_request_count", {
      role_param: "assistant",
      time_period: "week",
      model_param: "gpt-4",
    });
  });

  it('converts "all_models" modelName to null for model_param', async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "month",
      modelName: "all_models",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_request_count", {
      role_param: "assistant",
      time_period: "month",
      model_param: null,
    });
  });

  it("converts null modelName to null for model_param", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({ period: "day", modelName: null });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_request_count", {
      role_param: "assistant",
      time_period: "day",
      model_param: null,
    });
  });

  it("converts undefined modelName to null for model_param", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    // When modelName is omitted from JSON body, request.json() yields undefined
    const request = createPostRequest({ period: "day" });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_request_count", {
      role_param: "assistant",
      time_period: "day",
      model_param: null,
    });
  });

  it("passes a specific model name through unchanged", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "year",
      modelName: "claude-3-opus",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_request_count", {
      role_param: "assistant",
      time_period: "year",
      model_param: "claude-3-opus",
    });
  });

  it("returns success: true with data on successful RPC call", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const mockData = [
      { date: "2026-03-01", count: 42 },
      { date: "2026-03-02", count: 17 },
    ];
    mockRpc.mockResolvedValue({ data: mockData, error: null });

    const request = createPostRequest({ period: "week", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(mockData);
  });

  it("logs error but still returns success: true when RPC returns an error", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const rpcError = { message: "RPC failed", code: "42000" };
    mockRpc.mockResolvedValue({ data: null, error: rpcError });

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    // The route logs the error but does NOT return 500 — it returns 200 with data: null
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it("returns 500 with success: false on unexpected thrown error", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockRejectedValue(new Error("Network failure"));

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to fetch assistants");
  });

  it("returns 500 when request.json() throws (malformed body)", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);

    // Create a request with an invalid JSON body
    const request = new NextRequest(
      new URL("http://localhost:3000/api/chat-stats/get-chat-stats"),
      {
        method: "POST",
        body: "not-valid-json",
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to fetch assistants");
  });

  it("always passes role_param as 'assistant'", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "month",
      modelName: "gpt-4",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith(
      "get_request_count",
      expect.objectContaining({ role_param: "assistant" }),
    );
  });
});
