/** @jest-environment node */

// ---------------------------------------------------------------------------
// Mocks — jest.mock calls are hoisted above imports by Jest's transform.
// We must NOT reference `const` variables declared in this file inside
// jest.mock factory functions (temporal dead zone). Instead we create the
// mock fns inline and retrieve them from the mocked modules after import.
// ---------------------------------------------------------------------------

// Mock server-only (it just throws if imported on client)
jest.mock("server-only", () => ({}));

// Mock auth
jest.mock("@/app/_lib/auth", () => ({
  auth: jest.fn(),
}));

// Mock logger — store the error spy on a shared object so we can reach it.
jest.mock("@/lib/logger", () => {
  const errorFn = jest.fn();
  return {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: errorFn,
    })),
    __mockErrorFn: errorFn,
  };
});

// Mock @supabase/supabase-js — same pattern for rpc spy.
jest.mock("@supabase/supabase-js", () => {
  const rpcFn = jest.fn();
  return {
    createClient: jest.fn(() => ({
      rpc: rpcFn,
    })),
    __mockRpcFn: rpcFn,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { userGroupIsValid } from "./azure_groups-server";
import { auth } from "@/app/_lib/auth";
import { createLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Retrieve spy references from mocked modules
// ---------------------------------------------------------------------------

const { __mockRpcFn: mockRpc } = require("@supabase/supabase-js");

const { __mockErrorFn: mockError } = require("@/lib/logger");

const mockAuth = auth as jest.Mock;
const mockCreateClient = createClient as jest.Mock;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("azure_groups-server", () => {
  const originalEnv = process.env;

  // createLogger is invoked at module load time (top-level in the source file).
  // We capture its call arguments before beforeEach clears mock history.
  const createLoggerMock = createLogger as jest.Mock;
  const createLoggerCallArgs = [...createLoggerMock.mock.calls];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env to a clean copy with required vars
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // -----------------------------------------------------------------------
  // 1. Returns false when no valid session / groups
  // -----------------------------------------------------------------------

  describe("returns false when session is invalid", () => {
    it("returns false when auth() resolves to null", async () => {
      mockAuth.mockResolvedValue(null as any);

      const result = await userGroupIsValid();

      expect(result).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("returns false when session has no user property", async () => {
      mockAuth.mockResolvedValue({} as any);

      const result = await userGroupIsValid();

      expect(result).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("returns false when user has no groups property", async () => {
      mockAuth.mockResolvedValue({ user: {} } as any);

      const result = await userGroupIsValid();

      expect(result).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("returns false when user.groups is null", async () => {
      mockAuth.mockResolvedValue({ user: { groups: null } } as any);

      const result = await userGroupIsValid();

      expect(result).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("returns false when user.groups is undefined", async () => {
      mockAuth.mockResolvedValue({ user: { groups: undefined } } as any);

      const result = await userGroupIsValid();

      expect(result).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Checks groups via Supabase RPC
  // -----------------------------------------------------------------------

  describe("checks groups via RPC", () => {
    const sessionWithGroups = {
      user: {
        groups: [
          { id: "group-1", name: "Engineering" },
          { id: "group-2", name: "Design" },
          { id: "group-3", name: "Product" },
        ],
      },
    };

    it("extracts group IDs from session and passes them to RPC", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      expect(mockRpc).toHaveBeenCalledWith("check_azure_groups_exists", {
        group_ids: ["group-1", "group-2", "group-3"],
      });
    });

    it("creates Supabase client with service role key", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "http://localhost:54321",
        "test-service-role-key",
      );
    });

    it("returns true when RPC returns true", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      const result = await userGroupIsValid();

      expect(result).toBe(true);
    });

    it("returns false when RPC returns false", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: false, error: null });

      const result = await userGroupIsValid();

      expect(result).toBe(false);
    });

    it("returns the data value directly from RPC (truthy check)", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: 5, error: null });

      const result = await userGroupIsValid();

      // The function returns `data` directly, not a boolean coercion
      expect(result).toBe(5);
    });

    it("handles a session with a single group", async () => {
      const singleGroupSession = {
        user: {
          groups: [{ id: "only-group" }],
        },
      };
      mockAuth.mockResolvedValue(singleGroupSession as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      expect(mockRpc).toHaveBeenCalledWith("check_azure_groups_exists", {
        group_ids: ["only-group"],
      });
    });

    it("handles a session with an empty groups array", async () => {
      // An empty array is truthy, so the guard `!azureUserSession?.user?.groups`
      // will NOT catch it — the code proceeds and sends an empty array to RPC.
      const emptyGroupsSession = {
        user: {
          groups: [],
        },
      };
      mockAuth.mockResolvedValue(emptyGroupsSession as any);
      mockRpc.mockResolvedValue({ data: false, error: null });

      const result = await userGroupIsValid();

      expect(mockRpc).toHaveBeenCalledWith("check_azure_groups_exists", {
        group_ids: [],
      });
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    const sessionWithGroups = {
      user: {
        groups: [{ id: "group-1" }],
      },
    };

    it("returns false when RPC returns an error", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "RPC failed", name: "PostgrestError" },
      });

      const result = await userGroupIsValid();

      expect(result).toBe(false);
    });

    it("logs the error when RPC fails with a plain object error", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      const rpcError = {
        message: "connection refused",
        code: "ECONNREFUSED",
      };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await userGroupIsValid();

      expect(mockError).toHaveBeenCalledWith("Error checking groups", {
        error: rpcError,
      });
    });

    it("logs message and name when RPC fails with an Error instance", async () => {
      mockAuth.mockResolvedValue(sessionWithGroups as any);
      const errorInstance = new Error("timeout exceeded");
      errorInstance.name = "TimeoutError";
      mockRpc.mockResolvedValue({ data: null, error: errorInstance });

      await userGroupIsValid();

      expect(mockError).toHaveBeenCalledWith("Error checking groups", {
        error: { message: "timeout exceeded", name: "TimeoutError" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Environment variable handling
  // -----------------------------------------------------------------------

  describe("environment variable handling", () => {
    const sessionWithGroups = {
      user: {
        groups: [{ id: "group-1" }],
      },
    };

    it("uses SUPABASE_URL when it is set", async () => {
      process.env.SUPABASE_URL = "http://supabase-internal:54321";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase-public:54321";

      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "http://supabase-internal:54321",
        "test-service-role-key",
      );
    });

    it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is not set", async () => {
      delete process.env.SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase-public:54321";

      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "http://supabase-public:54321",
        "test-service-role-key",
      );
    });

    it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is empty string", async () => {
      process.env.SUPABASE_URL = "";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase-public:54321";

      mockAuth.mockResolvedValue(sessionWithGroups as any);
      mockRpc.mockResolvedValue({ data: true, error: null });

      await userGroupIsValid();

      // Empty string is falsy, so the || operator falls through
      expect(mockCreateClient).toHaveBeenCalledWith(
        "http://supabase-public:54321",
        "test-service-role-key",
      );
    });
  });

  // -----------------------------------------------------------------------
  // 5. Logger initialization
  // -----------------------------------------------------------------------

  describe("logger initialization", () => {
    it("creates logger with the correct feature name", () => {
      // createLogger is called once at module load time (top-level).
      // We captured the call args before beforeEach cleared mock history.
      expect(createLoggerCallArgs).toHaveLength(1);
      expect(createLoggerCallArgs[0][0]).toEqual({
        feature: "db/azure_groups-server",
      });
    });
  });
});
