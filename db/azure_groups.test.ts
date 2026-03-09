/**
 * @jest-environment jsdom
 */

// ---------------------------------------------------------------------------
// Mocks – jest.mock factories are hoisted above all variable declarations,
// so we cannot reference module-scope `const`/`let` inside them. We use
// simple inline factories and then obtain the mock references via require()
// after the mocks are installed.
// ---------------------------------------------------------------------------

jest.mock("@/lib/supabase/browser-client", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("@supabase/supabase-js", () => {
  const adminSb = {
    from: jest.fn(),
  };
  return { createClient: jest.fn(() => adminSb) };
});

jest.mock("@/lib/logger/client", () => ({
  createClientLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Obtain mock references after jest.mock has installed them
const { supabase: mockSupabaseRef } =
  require("@/lib/supabase/browser-client") as any;
const { createClient: mockCreateClient } =
  require("@supabase/supabase-js") as any;
// The admin client is the return value of createClient()
const mockAdminSupabaseRef = mockCreateClient();

// Mock global fetch for Graph API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that mimics Supabase's PostgREST query builder.
 * Every chain method returns the chain itself so calls can be composed freely.
 * The *terminal* method is the last one in the real chain (.order, .limit,
 * .select after .insert/.update, or the chain itself when awaited).
 *
 * Pass `resolveWith` to set the value the terminal awaited promise resolves to.
 */
const createChainableMock = (result: { data: any; error: any }) => {
  const chain: any = {};
  // Builder methods – return chain for further chaining
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  // Terminal methods – resolve the promise
  chain.order = jest.fn().mockResolvedValue(result);
  chain.limit = jest.fn().mockResolvedValue(result);
  // Make the chain itself thenable so that `await supabase.from(…).select(…).eq(…).in(…)` resolves
  chain.then = jest.fn((resolve: any) => resolve(result));
  return chain;
};

// ---------------------------------------------------------------------------
// System under test
// ---------------------------------------------------------------------------

import {
  getAllAzureGroups,
  getUserEffectiveGroups,
  getGroups,
  getIsAdminGroups,
  getUserManagedGroups,
  updateManagedGroupSelection,
  getUserSelectedGroups,
  getIsAdminGroupsServer,
} from "./azure_groups";

// ---------------------------------------------------------------------------
// Reset all mocks between tests
// ---------------------------------------------------------------------------

// Convenience aliases
const mockSupabase: any = mockSupabaseRef;
const mockAdminSupabase: any = mockAdminSupabaseRef;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  // Default: authenticated user
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-123" } },
  });
});

// ===================================================================
// getAllAzureGroups
// ===================================================================

describe("getAllAzureGroups", () => {
  it("returns formatted groups (maps azure_groups, filters nulls)", async () => {
    const chain = createChainableMock({
      data: [
        { azure_groups: { group_id: "g1", name: "Group 1" } },
        { azure_groups: null },
        { azure_groups: { group_id: "g2", name: "Group 2" } },
      ],
      error: null,
    });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getAllAzureGroups();

    expect(mockSupabase.auth.getUser).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("user_groups");
    expect(chain.select).toHaveBeenCalledWith("azure_groups(*)");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(result).toEqual([
      { group_id: "g1", name: "Group 1" },
      { group_id: "g2", name: "Group 2" },
    ]);
  });

  it("returns empty array on query error", async () => {
    const chain = createChainableMock({
      data: null,
      error: new Error("DB error"),
    });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getAllAzureGroups();

    expect(result).toEqual([]);
  });

  it("returns empty array when data is empty", async () => {
    const chain = createChainableMock({ data: [], error: null });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getAllAzureGroups();

    expect(result).toEqual([]);
  });

  it("returns empty array when getUser throws", async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error("Auth failure"));

    const result = await getAllAzureGroups();

    expect(result).toEqual([]);
  });
});

// ===================================================================
// getUserEffectiveGroups
// ===================================================================

describe("getUserEffectiveGroups", () => {
  it("delegates to getUserSelectedGroups (deprecated)", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ group_id: "g1" }],
      error: null,
    });

    const result = await getUserEffectiveGroups();

    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_user_selected_groups", {
      p_user_id: "user-123",
    });
    expect(result).toEqual([{ group_id: "g1" }]);
  });
});

// ===================================================================
// getGroups
// ===================================================================

describe("getGroups", () => {
  it("returns groups matching group IDs", async () => {
    const groups = [
      { group_id: "g1", name: "Group 1" },
      { group_id: "g2", name: "Group 2" },
    ];
    const chain = createChainableMock({ data: groups, error: null });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getGroups(["g1", "g2"]);

    expect(mockSupabase.from).toHaveBeenCalledWith("azure_groups");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.in).toHaveBeenCalledWith("group_id", ["g1", "g2"]);
    expect(result).toEqual(groups);
  });

  it("returns empty array on error", async () => {
    const chain = createChainableMock({
      data: null,
      error: new Error("Query error"),
    });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getGroups(["g1"]);

    expect(result).toEqual([]);
  });

  it("returns empty array when no matches (null data)", async () => {
    const chain = createChainableMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getGroups(["nonexistent"]);

    expect(result).toEqual([]);
  });

  it("returns empty array when data is empty array", async () => {
    const chain = createChainableMock({ data: [], error: null });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getGroups(["nonexistent"]);

    expect(result).toEqual([]);
  });
});

// ===================================================================
// getIsAdminGroups
// ===================================================================

describe("getIsAdminGroups", () => {
  it("returns true when admin groups found", async () => {
    const chain = createChainableMock({
      data: [{ group_id: "g1" }],
      error: null,
    });
    // The chain: .from().select().in().eq()
    // .eq is the terminal call here (last in chain, awaited)
    // We need the chain to resolve when .eq() is called after .in()
    // Since our chainable mock makes .eq return chain and chain.then resolves,
    // this should work.
    mockSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroups(["g1", "g2"]);

    expect(mockSupabase.from).toHaveBeenCalledWith("azure_groups");
    expect(chain.select).toHaveBeenCalledWith("group_id");
    expect(chain.in).toHaveBeenCalledWith("group_id", ["g1", "g2"]);
    expect(chain.eq).toHaveBeenCalledWith("role", "admin");
    expect(result).toBe(true);
  });

  it("returns false when no admin groups found", async () => {
    const chain = createChainableMock({ data: [], error: null });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroups(["g1"]);

    expect(result).toBe(false);
  });

  it("returns false for empty groupIds array", async () => {
    const result = await getIsAdminGroups([]);

    expect(result).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns false for null groupIds", async () => {
    const result = await getIsAdminGroups(null as any);

    expect(result).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns false for undefined groupIds", async () => {
    const result = await getIsAdminGroups(undefined as any);

    expect(result).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns false on query error", async () => {
    const chain = createChainableMock({
      data: null,
      error: new Error("DB error"),
    });
    mockSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroups(["g1"]);

    expect(result).toBe(false);
  });
});

// ===================================================================
// getUserManagedGroups
// ===================================================================

describe("getUserManagedGroups", () => {
  /**
   * Helper: set up the sequence of .from() calls that getUserManagedGroups makes.
   * The function calls .from() multiple times for different tables, so we queue
   * return values in order.
   */
  const setupManagedGroupsChain = (
    managedResult: { data: any; error: any },
    finalResult: { data: any; error: any },
    azureGroupsResult?: { data: any; error: any },
    insertResult?: { data: any; error: any },
  ) => {
    const managedChain = createChainableMock(managedResult);
    const finalChain = createChainableMock(finalResult);
    // Override .order on finalChain to resolve properly
    finalChain.order = jest.fn().mockResolvedValue(finalResult);

    const azureChain = azureGroupsResult
      ? createChainableMock(azureGroupsResult)
      : undefined;
    const insertChain = insertResult
      ? createChainableMock(insertResult)
      : undefined;

    const fromCalls: any[] = [];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "managed_user_groups") {
        // First call fetches existing managed groups,
        // subsequent calls may be insert or the final query with join
        const call = fromCalls.filter(c => c === "managed_user_groups").length;
        fromCalls.push("managed_user_groups");
        if (call === 0) return managedChain;
        if (call === 1 && insertChain) return insertChain;
        return finalChain;
      }
      if (table === "azure_groups" && azureChain) {
        fromCalls.push("azure_groups");
        return azureChain;
      }
      return finalChain;
    });

    return { managedChain, finalChain, azureChain, insertChain };
  };

  it("returns DB groups when no session groups provided", async () => {
    const dbGroups = [
      {
        group_id: "g1",
        is_selected: true,
        azure_groups: { group_id: "g1", name: "Alpha Group" },
      },
    ];

    setupManagedGroupsChain(
      { data: dbGroups, error: null }, // managed groups exist
      { data: dbGroups, error: null }, // final query
    );

    const result = await getUserManagedGroups();

    expect(result).toEqual(
      dbGroups.map(g => ({ ...g, is_session_only: false })),
    );
  });

  it("initializes managed groups when none exist (calls RPC)", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const dbGroupsAfterInit = [
      {
        group_id: "g1",
        is_selected: true,
        azure_groups: { group_id: "g1", name: "Group 1" },
      },
    ];

    setupManagedGroupsChain(
      { data: [], error: null }, // no managed groups initially
      { data: dbGroupsAfterInit, error: null }, // final query after init
    );

    const result = await getUserManagedGroups();

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "initialize_managed_groups_for_user",
      { p_user_id: "user-123" },
    );
    expect(result).toEqual(
      dbGroupsAfterInit.map(g => ({ ...g, is_session_only: false })),
    );
  });

  it("syncs missing session groups to managed_user_groups", async () => {
    const existingManaged = [{ group_id: "g1", is_selected: true }];
    const azureGroupsInDb = [
      { group_id: "g1" },
      { group_id: "g2" }, // g2 exists in azure_groups but not in managed
    ];
    const finalResult = [
      {
        group_id: "g1",
        is_selected: true,
        azure_groups: { group_id: "g1", name: "Group 1" },
      },
      {
        group_id: "g2",
        is_selected: true,
        azure_groups: { group_id: "g2", name: "Group 2" },
      },
    ];

    const { insertChain } = setupManagedGroupsChain(
      { data: existingManaged, error: null },
      { data: finalResult, error: null },
      { data: azureGroupsInDb, error: null },
      { data: null, error: null }, // insert result
    );

    const sessionGroups = [
      { id: "g1", displayName: "Group 1" },
      { id: "g2", displayName: "Group 2" },
    ];

    const result = await getUserManagedGroups(sessionGroups);

    // Verify insert was called for the missing group g2
    expect(insertChain!.insert).toHaveBeenCalledWith([
      { user_id: "user-123", group_id: "g2", is_selected: true },
    ]);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters out _ext groups from session-only groups", async () => {
    const dbGroups = [
      {
        group_id: "g1",
        is_selected: true,
        azure_groups: { group_id: "g1", name: "Group 1" },
      },
    ];

    setupManagedGroupsChain(
      { data: dbGroups, error: null },
      { data: dbGroups, error: null },
      { data: [], error: null }, // no azure groups match session IDs
    );

    const sessionGroups = [
      { id: "g1", displayName: "Group 1" },
      { id: "g-ext", displayName: "External_Ext" }, // ends with _ext
      { id: "g3", displayName: "Normal Group" },
    ];

    const result = await getUserManagedGroups(sessionGroups);

    // g-ext group should be filtered out, g1 is a DB group, g3 should appear as session-only
    const sessionOnlyIds = result
      .filter((g: any) => g.is_session_only)
      .map((g: any) => g.group_id);
    expect(sessionOnlyIds).toContain("g3");
    expect(sessionOnlyIds).not.toContain("g-ext");
  });

  it("filters out Security type groups from session-only groups", async () => {
    setupManagedGroupsChain(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const sessionGroups = [
      { id: "g-sec", displayName: "Sec Group", type: "Security" },
      { id: "g-ok", displayName: "OK Group", type: "Microsoft 365" },
    ];

    const result = await getUserManagedGroups(sessionGroups);

    const sessionOnlyIds = result
      .filter((g: any) => g.is_session_only)
      .map((g: any) => g.group_id);
    expect(sessionOnlyIds).toContain("g-ok");
    expect(sessionOnlyIds).not.toContain("g-sec");
  });

  it("fetches missing group names from Graph API", async () => {
    setupManagedGroupsChain(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          id: "g-noname",
          displayName: "Resolved Name",
          mail: "resolved@test.com",
        },
      ]),
    });

    const sessionGroups = [
      { id: "g-noname", displayName: "" }, // missing name triggers Graph API
    ];

    const result = await getUserManagedGroups(sessionGroups);

    expect(mockFetch).toHaveBeenCalledWith("/api/graph/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds: ["g-noname"] }),
    });

    const sessionEntry = result.find((g: any) => g.group_id === "g-noname");
    expect(sessionEntry?.azure_groups?.name).toBe("Resolved Name");
  });

  it("returns empty array when user not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const result = await getUserManagedGroups();

    expect(result).toEqual([]);
  });

  it("handles Graph API errors gracefully", async () => {
    setupManagedGroupsChain(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    mockFetch.mockRejectedValue(new Error("Network error"));

    const sessionGroups = [{ id: "g-noname", displayName: "" }];

    const result = await getUserManagedGroups(sessionGroups);

    // Should still return the group, just with the fallback id as name
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    const entry = result.find((g: any) => g.group_id === "g-noname");
    expect(entry).toBeDefined();
    // Falls back to the group id as name
    expect(entry?.azure_groups?.name).toBe("g-noname");
  });

  it("handles Graph API non-ok response gracefully", async () => {
    setupManagedGroupsChain(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const sessionGroups = [{ id: "g-fail", displayName: "" }];

    const result = await getUserManagedGroups(sessionGroups);

    expect(result).toBeDefined();
    const entry = result.find((g: any) => g.group_id === "g-fail");
    expect(entry?.azure_groups?.name).toBe("g-fail");
  });

  it("sorts combined groups by name", async () => {
    const dbGroups = [
      {
        group_id: "g2",
        is_selected: true,
        azure_groups: { group_id: "g2", name: "Zebra Group" },
      },
    ];

    setupManagedGroupsChain(
      { data: dbGroups, error: null },
      { data: dbGroups, error: null },
      { data: [], error: null },
    );

    const sessionGroups = [{ id: "g3", displayName: "Alpha Group" }];

    const result = await getUserManagedGroups(sessionGroups);

    expect(result.length).toBe(2);
    expect(result[0].azure_groups?.name).toBe("Alpha Group");
    expect(result[1].azure_groups?.name).toBe("Zebra Group");
  });

  it("returns empty array when managed groups query errors", async () => {
    const managedChain = createChainableMock({
      data: null,
      error: new Error("DB error"),
    });
    mockSupabase.from.mockReturnValue(managedChain);

    const result = await getUserManagedGroups();

    expect(result).toEqual([]);
  });

  it("returns empty array when final query errors", async () => {
    const managedChain = createChainableMock({
      data: [{ group_id: "g1" }],
      error: null,
    });
    const finalChain = createChainableMock({
      data: null,
      error: new Error("Final query error"),
    });
    finalChain.order = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("Final query error"),
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return managedChain;
      return finalChain;
    });

    const result = await getUserManagedGroups();

    expect(result).toEqual([]);
  });

  it("marks DB groups with is_session_only false", async () => {
    const dbGroups = [
      {
        group_id: "g1",
        is_selected: true,
        azure_groups: { group_id: "g1", name: "Group 1" },
      },
    ];

    setupManagedGroupsChain(
      { data: dbGroups, error: null },
      { data: dbGroups, error: null },
    );

    const result = await getUserManagedGroups();

    expect(result[0].is_session_only).toBe(false);
  });

  it("marks session-only groups with is_session_only true", async () => {
    setupManagedGroupsChain(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const sessionGroups = [{ id: "g-new", displayName: "New Group" }];

    const result = await getUserManagedGroups(sessionGroups);

    const sessionEntry = result.find((g: any) => g.group_id === "g-new");
    expect(sessionEntry?.is_session_only).toBe(true);
    expect(sessionEntry?.is_selected).toBe(false);
  });
});

// ===================================================================
// updateManagedGroupSelection
// ===================================================================

describe("updateManagedGroupSelection", () => {
  it("successfully updates via RPC returning true", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test Group",
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "create_session_group_and_manage",
      {
        p_user_id: "user-123",
        p_group_id: "g1",
        p_group_name: "Test Group",
        p_group_email: null,
        p_group_type: null,
        p_is_selected: true,
      },
    );
    expect(result).toBe(true);
  });

  it("returns false when RPC returns false", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test",
    });

    expect(result).toBe(false);
  });

  it("returns false when RPC returns error (does not fall back)", async () => {
    // When RPC returns an error object (not a thrown exception), the code
    // enters the `else if (error)` branch and returns false directly.
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("RPC not found"),
    });

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test Group",
    });

    // No fallback to .from() -- returns false immediately
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("falls back to direct update when RPC returns null data and null error", async () => {
    // When RPC returns { data: null, error: null } none of the if-branches
    // match, so execution falls through to the fallback direct update.
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const updateChain = createChainableMock({
      data: [{ group_id: "g1", is_selected: true }],
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test Group",
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("managed_user_groups");
    expect(updateChain.update).toHaveBeenCalledWith({ is_selected: true });
    expect(result).toBe(true);
  });

  it("falls back to direct update when RPC throws exception", async () => {
    mockSupabase.rpc.mockRejectedValue(new Error("Function not found"));

    const updateChain = createChainableMock({
      data: [{ group_id: "g1", is_selected: false }],
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await updateManagedGroupSelection("g1", false, {
      displayName: "Test",
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("managed_user_groups");
    expect(result).toBe(true);
  });

  it("returns false when no user authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const result = await updateManagedGroupSelection("g1", true);

    expect(result).toBe(false);
  });

  it("enriches session data from Graph API when displayName missing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          id: "g1",
          displayName: "Enriched Name",
          mail: "enriched@test.com",
          description: "desc",
          groupTypes: ["Unified"],
        },
      ]),
    });

    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "", // empty triggers Graph API enrichment
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/graph/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds: ["g1"] }),
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "create_session_group_and_manage",
      expect.objectContaining({
        p_group_name: "Enriched Name",
        p_group_email: "enriched@test.com",
        p_group_type: "Unified",
      }),
    );
    expect(result).toBe(true);
  });

  it("uses name fallback when displayName is absent in session data", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    await updateManagedGroupSelection("g1", true, {
      name: "Fallback Name",
      email: "fb@test.com",
      type: "M365",
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "create_session_group_and_manage",
      expect.objectContaining({
        p_group_name: "Fallback Name",
        p_group_email: "fb@test.com",
        p_group_type: "M365",
      }),
    );
  });

  it("uses groupId as name fallback when no name fields present", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    await updateManagedGroupSelection("g1", true, {});

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "create_session_group_and_manage",
      expect.objectContaining({
        p_group_name: "g1",
      }),
    );
  });

  it("returns false when fallback update finds no matching rows", async () => {
    // RPC fails with error
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("RPC error"),
    });

    // Direct update returns empty array (no rows matched)
    const updateChain = createChainableMock({
      data: [],
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await updateManagedGroupSelection("g-nonexistent", true, {
      displayName: "Test",
    });

    expect(result).toBe(false);
  });

  it("returns false when fallback update returns null data", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("RPC error"),
    });

    const updateChain = createChainableMock({
      data: null,
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test",
    });

    expect(result).toBe(false);
  });

  it("returns false when fallback update errors", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("RPC error"),
    });

    const updateChain = createChainableMock({
      data: null,
      error: new Error("Update error"),
    });
    mockSupabase.from.mockReturnValue(updateChain);

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "Test",
    });

    expect(result).toBe(false);
  });

  it("handles Graph API failure gracefully during enrichment", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await updateManagedGroupSelection("g1", true, {
      displayName: "", // triggers Graph API call which fails
      name: "Fallback",
    });

    // Should still proceed with original session data
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "create_session_group_and_manage",
      expect.objectContaining({
        p_group_name: "Fallback",
      }),
    );
    expect(result).toBe(true);
  });

  it("returns false when outer catch is triggered", async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error("Auth crash"));

    const result = await updateManagedGroupSelection("g1", true);

    expect(result).toBe(false);
  });
});

// ===================================================================
// getUserSelectedGroups
// ===================================================================

describe("getUserSelectedGroups", () => {
  it("returns selected groups from RPC", async () => {
    const groups = [
      { group_id: "g1", name: "Group 1" },
      { group_id: "g2", name: "Group 2" },
    ];
    mockSupabase.rpc.mockResolvedValue({ data: groups, error: null });

    const result = await getUserSelectedGroups();

    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_user_selected_groups", {
      p_user_id: "user-123",
    });
    expect(result).toEqual(groups);
  });

  it("returns empty array when no user authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const result = await getUserSelectedGroups();

    expect(result).toEqual([]);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("returns empty array on RPC error", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("RPC error"),
    });

    const result = await getUserSelectedGroups();

    expect(result).toEqual([]);
  });

  it("returns empty array when RPC data is null", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await getUserSelectedGroups();

    expect(result).toEqual([]);
  });

  it("returns empty array when getUser throws", async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error("Auth error"));

    const result = await getUserSelectedGroups();

    expect(result).toEqual([]);
  });
});

// ===================================================================
// getIsAdminGroupsServer
// ===================================================================

describe("getIsAdminGroupsServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://test-public.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-123",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates admin client with service role key", async () => {
    const { createClient } = require("@supabase/supabase-js");
    const chain = createChainableMock({
      data: [{ group_id: "g1" }],
      error: null,
    });
    mockAdminSupabase.from.mockReturnValue(chain);

    await getIsAdminGroupsServer(["g1"]);

    expect(createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "service-role-key-123",
    );
  });

  it("returns true when admin groups found", async () => {
    const chain = createChainableMock({
      data: [{ group_id: "g1" }],
      error: null,
    });
    mockAdminSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroupsServer(["g1", "g2"]);

    expect(mockAdminSupabase.from).toHaveBeenCalledWith("azure_groups");
    expect(chain.select).toHaveBeenCalledWith("group_id");
    expect(chain.in).toHaveBeenCalledWith("group_id", ["g1", "g2"]);
    expect(chain.eq).toHaveBeenCalledWith("role", "admin");
    expect(result).toBe(true);
  });

  it("returns false when no admin groups found", async () => {
    const chain = createChainableMock({ data: [], error: null });
    mockAdminSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroupsServer(["g1"]);

    expect(result).toBe(false);
  });

  it("returns false on query error", async () => {
    const chain = createChainableMock({
      data: null,
      error: new Error("Admin DB error"),
    });
    mockAdminSupabase.from.mockReturnValue(chain);

    const result = await getIsAdminGroupsServer(["g1"]);

    expect(result).toBe(false);
  });

  it("returns false when createClient throws", async () => {
    const { createClient } = require("@supabase/supabase-js");
    createClient.mockImplementationOnce(() => {
      throw new Error("Invalid credentials");
    });

    const result = await getIsAdminGroupsServer(["g1"]);

    expect(result).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is not set", async () => {
    delete process.env.SUPABASE_URL;
    const { createClient } = require("@supabase/supabase-js");

    const chain = createChainableMock({ data: [], error: null });
    mockAdminSupabase.from.mockReturnValue(chain);

    await getIsAdminGroupsServer(["g1"]);

    expect(createClient).toHaveBeenCalledWith(
      "https://test-public.supabase.co",
      "service-role-key-123",
    );
  });
});
