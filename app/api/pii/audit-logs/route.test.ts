/** @jest-environment node */

import { NextRequest } from "next/server";

// ── Mocks (use var for hoisting above jest.mock factories) ──────────────────

var mockGetSession = jest.fn();
var mockFrom = jest.fn();
var mockSelect = jest.fn();
var mockOrder = jest.fn();
var mockOr = jest.fn();
var mockRange = jest.fn();

var mockSupabase = {
  auth: {
    getSession: mockGetSession,
  },
  from: mockFrom,
};

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

// ── Import after mocks ─────────────────────────────────────────────────────

import { GET } from "./route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

function mockAuthenticated(userId = "user-123") {
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: { id: userId },
      },
    },
  });
}

function mockUnauthenticated() {
  mockGetSession.mockResolvedValue({
    data: { session: null },
  });
}

function setupQueryChain(result: {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
}) {
  mockRange.mockResolvedValue(result);
  mockOr.mockReturnValue({ range: mockRange });
  mockOrder.mockReturnValue({ or: mockOr, range: mockRange });
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/pii/audit-logs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Authentication ──────────────────────────────────────────────────────

  it("returns 401 when user is not authenticated", async () => {
    mockUnauthenticated();

    const request = createMockRequest("/api/pii/audit-logs");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("User not found");
  });

  // ── Default pagination ─────────────────────────────────────────────────

  it("returns paginated results with default page=1, limit=10", async () => {
    mockAuthenticated();
    const mockData = [
      {
        id: 1,
        user_email: "a@test.com",
        pii_type: "Email",
        created_at: "2025-01-01",
      },
      {
        id: 2,
        user_email: "b@test.com",
        pii_type: "Person",
        created_at: "2025-01-02",
      },
    ];
    setupQueryChain({ data: mockData, error: null, count: 2 });

    const request = createMockRequest("/api/pii/audit-logs");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(mockData);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.pages).toBe(1);

    // Verify range was called with offset=0, limit-1=9
    expect(mockRange).toHaveBeenCalledWith(0, 9);
  });

  // ── Custom pagination ──────────────────────────────────────────────────

  it("supports custom page and limit params", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 50 });

    const request = createMockRequest("/api/pii/audit-logs?page=3&limit=5");
    const response = await GET(request);
    const body = await response.json();

    expect(body.pagination.page).toBe(3);
    expect(body.pagination.limit).toBe(5);
    expect(body.pagination.total).toBe(50);
    expect(body.pagination.pages).toBe(10);

    // offset = (3-1)*5 = 10, range end = 10+5-1 = 14
    expect(mockRange).toHaveBeenCalledWith(10, 14);
  });

  // ── Limit cap ──────────────────────────────────────────────────────────

  it("caps limit at 100", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 500 });

    const request = createMockRequest("/api/pii/audit-logs?limit=200");
    const response = await GET(request);
    const body = await response.json();

    expect(body.pagination.limit).toBe(100);
    // range should use capped limit: 0 to 99
    expect(mockRange).toHaveBeenCalledWith(0, 99);
  });

  // ── Sorting ────────────────────────────────────────────────────────────

  it("supports sorting by sortBy and sortDir params", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest(
      "/api/pii/audit-logs?sortBy=user_email&sortDir=asc",
    );
    await GET(request);

    expect(mockOrder).toHaveBeenCalledWith("user_email", {
      ascending: true,
    });
  });

  it("defaults to created_at desc sorting", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs");
    await GET(request);

    expect(mockOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("treats invalid sortDir as desc", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs?sortDir=invalid");
    await GET(request);

    expect(mockOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────

  it("supports search across user_email, pii_type, model_id", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs?search=example");
    await GET(request);

    expect(mockOr).toHaveBeenCalledWith(
      "user_email.ilike.%example%,pii_type.ilike.%example%,model_id.ilike.%example%",
    );
  });

  it("skips search filter when search is empty", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs?search=");
    await GET(request);

    expect(mockOr).not.toHaveBeenCalled();
    // Should go directly from order to range
    expect(mockRange).toHaveBeenCalled();
  });

  it("skips search filter when search is whitespace only", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs?search=%20%20");
    await GET(request);

    expect(mockOr).not.toHaveBeenCalled();
  });

  // ── Pagination metadata ────────────────────────────────────────────────

  it("returns correct pagination metadata", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 47 });

    const request = createMockRequest("/api/pii/audit-logs?page=2&limit=15");
    const response = await GET(request);
    const body = await response.json();

    expect(body.pagination).toEqual({
      page: 2,
      limit: 15,
      total: 47,
      pages: 4, // Math.ceil(47 / 15)
    });
  });

  it("returns empty data array and zero totals when no results", async () => {
    mockAuthenticated();
    setupQueryChain({ data: null, error: null, count: null });

    const request = createMockRequest("/api/pii/audit-logs");
    const response = await GET(request);
    const body = await response.json();

    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.pages).toBe(0);
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it("returns 500 on Supabase error", async () => {
    mockAuthenticated();
    setupQueryChain({
      data: null,
      error: { message: "relation does not exist", code: "42P01" },
      count: null,
    });

    const request = createMockRequest("/api/pii/audit-logs");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("relation does not exist");
  });

  it("returns 500 on unexpected error", async () => {
    mockAuthenticated();
    mockFrom.mockImplementation(() => {
      throw new Error("Unexpected crash");
    });

    const request = createMockRequest("/api/pii/audit-logs");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Unexpected crash");
  });

  // ── Query construction ─────────────────────────────────────────────────

  it("queries pii_audit_logs table with exact count", async () => {
    mockAuthenticated();
    setupQueryChain({ data: [], error: null, count: 0 });

    const request = createMockRequest("/api/pii/audit-logs");
    await GET(request);

    expect(mockFrom).toHaveBeenCalledWith("pii_audit_logs");
    expect(mockSelect).toHaveBeenCalledWith("*", { count: "exact" });
  });
});
