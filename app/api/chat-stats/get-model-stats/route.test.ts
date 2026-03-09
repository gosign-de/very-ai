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
    new URL("http://localhost:3000/api/chat-stats/get-model-stats"),
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("POST /api/chat-stats/get-model-stats", () => {
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

  it("calls get_model_stats_aggregated RPC with correct parameters", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "week",
      modelName: "gpt-4",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_model_stats_aggregated", {
      role_param: "assistant",
      time_period: "week",
      model_name: "gpt-4",
    });
  });

  it('converts "all_models" modelName to null for model_name', async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({
      period: "month",
      modelName: "all_models",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_model_stats_aggregated", {
      role_param: "assistant",
      time_period: "month",
      model_name: null,
    });
  });

  it("converts null modelName to null for model_name", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({ period: "day", modelName: null });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_model_stats_aggregated", {
      role_param: "assistant",
      time_period: "day",
      model_name: null,
    });
  });

  it("converts undefined modelName to null for model_name", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockResolvedValue({ data: [], error: null });

    const request = createPostRequest({ period: "day" });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith("get_model_stats_aggregated", {
      role_param: "assistant",
      time_period: "day",
      model_name: null,
    });
  });

  it("filters data by model when modelParam is a specific model name", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const allData = [
      { model: "gpt-4", count: 10 },
      { model: "claude-3-opus", count: 5 },
      { model: "gpt-4", count: 20 },
    ];
    mockRpc.mockResolvedValue({ data: allData, error: null });

    const request = createPostRequest({
      period: "week",
      modelName: "gpt-4",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { model: "gpt-4", count: 10 },
      { model: "gpt-4", count: 20 },
    ]);
  });

  it("returns all data without filtering when modelParam is null (all_models)", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const allData = [
      { model: "gpt-4", count: 10 },
      { model: "claude-3-opus", count: 5 },
    ];
    mockRpc.mockResolvedValue({ data: allData, error: null });

    const request = createPostRequest({
      period: "month",
      modelName: "all_models",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(allData);
  });

  it("returns all data without filtering when modelName is null", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const allData = [
      { model: "gpt-4", count: 10 },
      { model: "claude-3-opus", count: 5 },
    ];
    mockRpc.mockResolvedValue({ data: allData, error: null });

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(allData);
  });

  it("returns 500 with error message when RPC returns an error", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    const rpcError = { message: "Function not found", code: "42883" };
    mockRpc.mockResolvedValue({ data: null, error: rpcError });

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Function not found");
  });

  it("returns 500 with success: false on unexpected thrown error", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);
    mockRpc.mockRejectedValue(new Error("Connection refused"));

    const request = createPostRequest({ period: "day", modelName: null });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to fetch assistants");
  });

  it("returns 500 when request.json() throws (malformed body)", async () => {
    mockRouteAuthentication.mockResolvedValue({ user: { id: "u1" } } as any);

    const request = new NextRequest(
      new URL("http://localhost:3000/api/chat-stats/get-model-stats"),
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
      period: "year",
      modelName: "claude-3-opus",
    });
    await POST(request);

    expect(mockRpc).toHaveBeenCalledWith(
      "get_model_stats_aggregated",
      expect.objectContaining({ role_param: "assistant" }),
    );
  });
});
