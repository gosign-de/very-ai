/**
 * @jest-environment node
 */

const mockGetSession = jest.fn();
const mockAuthFrom = jest.fn();
const mockCreateClient = jest.fn();

jest.mock("@/lib/supabase/middleware", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { NextRequest } from "next/server";
import { routeAuthentication } from "@/db/authentication";

/**
 * Build a chain where every method (.select, .eq, .not, etc.) returns the chain
 * so that arbitrary chaining like .select(...).eq(...).eq(...) works.
 * The terminal result is controlled by `terminalResult` -- the last .eq() call
 * will resolve to it since the chain itself is a thenable-like mock.
 */
function buildAuthChain(terminalResult: { data: unknown; error: unknown }) {
  // We need .eq() to keep returning the chain, but the whole thing
  // must be awaitable (the source does `const { data, error } = await supabase.from(...).select(...).eq(...).eq(...)`).
  // The trick: make the chain a Promise-like by making .eq() on the last call return a resolved promise.
  // Simpler approach: track call count and resolve on the 2nd .eq().
  let eqCallCount = 0;
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => {
    eqCallCount++;
    // The source chains exactly 2 .eq() calls; the 2nd is terminal
    if (eqCallCount >= 2) {
      return Promise.resolve(terminalResult);
    }
    return chain;
  });
  return chain;
}

function setupSupabaseClient(
  terminalResult: { data: unknown; error: unknown } = {
    data: [],
    error: null,
  },
) {
  const chain = buildAuthChain(terminalResult);
  const client = {
    auth: { getSession: mockGetSession },
    from: mockAuthFrom.mockReturnValue(chain),
  };
  mockCreateClient.mockReturnValue({ supabase: client });
  return client;
}

function createMockRequest(url = "http://localhost/api/test"): NextRequest {
  return new NextRequest(new URL(url));
}

describe("db/authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when user is admin", async () => {
    setupSupabaseClient({
      data: [{ user_id: "user-admin", azure_groups: { role: "admin" } }],
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-admin" } } },
      error: null,
    });

    const result = await routeAuthentication(createMockRequest());

    expect(mockCreateClient).toHaveBeenCalled();
    expect(mockGetSession).toHaveBeenCalled();
    expect(mockAuthFrom).toHaveBeenCalledWith("user_groups");
    expect(result).toBe(true);
  });

  it("returns false when session has an error", async () => {
    setupSupabaseClient();
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "session error" },
    });

    const result = await routeAuthentication(createMockRequest());

    expect(result).toBe(false);
  });

  it("returns false when there is no session", async () => {
    setupSupabaseClient();
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await routeAuthentication(createMockRequest());

    expect(result).toBe(false);
  });

  it("returns false when user is not admin (empty result)", async () => {
    setupSupabaseClient({ data: [], error: null });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-regular" } } },
      error: null,
    });

    const result = await routeAuthentication(createMockRequest());

    expect(result).toBe(false);
  });

  it("returns false when auth query returns an error", async () => {
    setupSupabaseClient({
      data: null,
      error: { message: "auth query error" },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });

    const result = await routeAuthentication(createMockRequest());

    expect(result).toBe(false);
  });

  it("returns the error object on exception", async () => {
    const thrownError = new Error("unexpected crash");
    mockCreateClient.mockImplementation(() => {
      throw thrownError;
    });

    const result = await routeAuthentication(createMockRequest());

    expect(result).toBe(thrownError);
  });
});
