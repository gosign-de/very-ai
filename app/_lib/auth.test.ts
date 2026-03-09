/** @jest-environment node */

// ---------------------------------------------------------------------------
// Mocks – must be declared before any import that triggers the source module
// ---------------------------------------------------------------------------

// Use `var` so the declaration is hoisted above jest.mock factory calls.
// `let` would cause a TDZ ReferenceError because jest.mock factories are
// hoisted to the top of the file at compile time.
var capturedConfig: any;

jest.mock("next-auth", () => {
  const fn = (config: any) => {
    capturedConfig = config;
    return {
      handlers: { GET: jest.fn(), POST: jest.fn() },
      auth: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    };
  };
  fn.default = fn;
  return { __esModule: true, default: fn };
});

jest.mock("next-auth/providers/microsoft-entra-id", () => ({
  __esModule: true,
  default: jest.fn((opts: any) => ({ id: "microsoft-entra-id", ...opts })),
}));

const mockGraphGet = jest.fn();
const mockGraphApi = jest.fn(() => ({
  select: jest.fn().mockReturnThis(),
  get: mockGraphGet,
}));

jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: jest.fn(() => ({
      api: mockGraphApi,
    })),
  },
}));

jest.mock("@/db/profile", () => ({
  saveProfileImage: jest.fn().mockResolvedValue(undefined),
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Client } from "@microsoft/microsoft-graph-client";
import { saveProfileImage } from "@/db/profile";

// Force the module to load and populate capturedConfig
import "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env;

function setEntraEnv(overrides: Record<string, string | undefined> = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_AZURE_AD_ID: "test-client-id",
    AUTH_AZURE_AD_SECRET: "test-client-secret",
    AUTH_AZURE_AD_TENANT_ID: "test-tenant-id",
    ...overrides,
  };
}

function makeToken(overrides: Record<string, any> = {}) {
  return {
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    userDetails: {
      id: "user-123",
      userPrincipalName: "user@example.com",
      groups: [],
    },
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, any> = {}) {
  return {
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
    expires_in: 3600,
    ...overrides,
  };
}

/**
 * Sets up the Graph API mock so that a call through the JWT callback
 * (which calls getUserDetails -> getAllUserGroups) returns the given data.
 */
function setupGraphMocks({
  userDetails = { id: "user-123", userPrincipalName: "user@example.com" },
  groups = [
    { id: "g1", displayName: "Group1", groupTypes: ["Unified"] },
    { id: "g2", displayName: "Group2", groupTypes: [] },
  ],
  photo = null as any,
  photoError = false,
}: {
  userDetails?: Record<string, any>;
  groups?: any[];
  photo?: any;
  photoError?: boolean;
} = {}) {
  // The module creates a Client.init with an authProvider, which returns
  // an object whose .api() chains are used for /me, /me/memberOf, /me/photo/$value.
  // We need mockGraphApi to return different things for different paths.

  const apiMock = jest.fn();
  const selectMock = jest.fn();

  selectMock.mockReturnValue({
    get: jest.fn().mockResolvedValue({ value: groups }),
  });

  apiMock.mockImplementation((path: string) => {
    if (path === "/me") {
      return {
        get: jest.fn().mockResolvedValue(userDetails),
        select: selectMock,
      };
    }
    if (path === "/me/memberOf") {
      return {
        select: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ value: groups }),
        }),
      };
    }
    if (path === "/me/photo/$value") {
      if (photoError) {
        return {
          get: jest.fn().mockRejectedValue(new Error("Photo not found")),
        };
      }
      return { get: jest.fn().mockResolvedValue(photo) };
    }
    // Pagination next link
    return {
      get: jest.fn().mockResolvedValue({ value: [] }),
      select: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ value: [] }),
      }),
    };
  });

  (Client.init as jest.Mock).mockReturnValue({ api: apiMock });

  return { apiMock, selectMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auth module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEntraEnv();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // authConfig – static properties
  // -----------------------------------------------------------------------
  describe("authConfig", () => {
    it("should have captured the config via NextAuth call", () => {
      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.callbacks).toBeDefined();
    });

    it("should have jwt, session, and authorized callbacks", () => {
      expect(typeof capturedConfig.callbacks.jwt).toBe("function");
      expect(typeof capturedConfig.callbacks.session).toBe("function");
      expect(typeof capturedConfig.callbacks.authorized).toBe("function");
    });
  });

  // -----------------------------------------------------------------------
  // refreshAccessToken (tested indirectly via JWT callback)
  // -----------------------------------------------------------------------
  describe("refreshAccessToken (via JWT callback)", () => {
    it("should refresh token successfully when token is expiring soon", async () => {
      setupGraphMocks();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "refreshed-access-token",
          expires_in: 7200,
          refresh_token: "refreshed-refresh-token",
        }),
      });

      const expiredToken = makeToken({
        expiresAt: Date.now() - 1000, // already expired
        refreshToken: "old-refresh-token",
      });

      const result = await capturedConfig.callbacks.jwt({
        token: expiredToken,
      });

      expect(result.accessToken).toBe("refreshed-access-token");
      expect(result.refreshToken).toBe("refreshed-refresh-token");
      expect(result.error).toBeUndefined();
    });

    it("should set expiresAt based on expires_in from response", async () => {
      setupGraphMocks();
      const beforeCall = Date.now();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() - 1000 }),
      });

      const afterCall = Date.now();
      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeCall + 3600 * 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(afterCall + 3600 * 1000);
    });

    it("should preserve old refreshToken if new one is not provided", async () => {
      setupGraphMocks();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          // no refresh_token in response
        }),
      });

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({
          expiresAt: Date.now() - 1000,
          refreshToken: "keep-this-rt",
        }),
      });

      expect(result.refreshToken).toBe("keep-this-rt");
    });

    it("should return error when fetch response is not OK", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: "invalid_grant",
          error_description: "Token expired",
        }),
      });

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() - 1000 }),
      });

      expect(result.error).toBe("RefreshAccessTokenError");
    });

    it("should return error when fetch throws an exception", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error("Network failure"),
      );

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() - 1000 }),
      });

      expect(result.error).toBe("RefreshAccessTokenError");
    });

    it("should call the Microsoft token endpoint with correct parameters", async () => {
      setupGraphMocks();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() - 1000 }),
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain("login.microsoftonline.com");
      expect(url).toContain("oauth2/v2.0/token");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      );

      const body = new URLSearchParams(options.body);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
    });

    it("should return error when no refreshToken is available and token expired", async () => {
      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({
          expiresAt: Date.now() - 1000,
          refreshToken: undefined,
        }),
      });

      expect(result.error).toBe("RefreshAccessTokenError");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should trigger refresh when token expires within 5 minutes", async () => {
      setupGraphMocks();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      // 4 minutes from now (less than the 5-minute window)
      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() + 4 * 60 * 1000 }),
      });

      expect(global.fetch).toHaveBeenCalled();
      expect(result.accessToken).toBe("new-at");
    });

    it("should fetch user details after successful refresh if userDetails is missing", async () => {
      const { apiMock: _apiMock } = setupGraphMocks({
        userDetails: { id: "refreshed-user", userPrincipalName: "u@e.com" },
        groups: [
          { id: "g1", displayName: "First", groupTypes: [] },
          { id: "g2", displayName: "Second", groupTypes: [] },
        ],
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({
          expiresAt: Date.now() - 1000,
          userDetails: undefined,
        }),
      });

      // getUserDetails should have been called (Client.init invoked)
      expect(Client.init).toHaveBeenCalled();
      expect(result.userDetails).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getAllUserGroups (tested indirectly via JWT callback -> getUserDetails)
  // -----------------------------------------------------------------------
  describe("getAllUserGroups (via JWT callback)", () => {
    it("should fetch a single page of groups", async () => {
      const groups = [
        { id: "g1", displayName: "Group1", groupTypes: ["Unified"] },
        { id: "g2", displayName: "Group2", groupTypes: [] },
      ];

      setupGraphMocks({ groups });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      // First group is skipped by getUserDetails
      expect(result.userDetails.groups).toHaveLength(1);
      expect(result.userDetails.groups[0].id).toBe("g2");
    });

    it("should handle pagination via @odata.nextLink", async () => {
      const page1Groups = [
        { id: "g1", displayName: "Group1", groupTypes: [] },
        { id: "g2", displayName: "Group2", groupTypes: [] },
      ];
      const page2Groups = [{ id: "g3", displayName: "Group3", groupTypes: [] }];

      const apiMock = jest.fn();
      apiMock.mockImplementation((path: string) => {
        if (path === "/me") {
          return {
            get: jest.fn().mockResolvedValue({
              id: "user-1",
              userPrincipalName: "u@e.com",
            }),
          };
        }
        if (path === "/me/memberOf") {
          return {
            select: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                value: page1Groups,
                "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
              }),
            }),
          };
        }
        if (path === "https://graph.microsoft.com/v1.0/next-page") {
          return {
            get: jest.fn().mockResolvedValue({
              value: page2Groups,
              // no nextLink => pagination ends
            }),
          };
        }
        if (path === "/me/photo/$value") {
          return {
            get: jest.fn().mockRejectedValue(new Error("No photo")),
          };
        }
        return { get: jest.fn().mockResolvedValue({ value: [] }) };
      });

      (Client.init as jest.Mock).mockReturnValue({ api: apiMock });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      // 3 total groups, first one skipped => 2 in result
      expect(result.userDetails.groups).toHaveLength(2);
      expect(result.userDetails.groups[0].id).toBe("g2");
      expect(result.userDetails.groups[1].id).toBe("g3");
    });

    it("should return empty array when no groups exist", async () => {
      setupGraphMocks({ groups: [] });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      expect(result.userDetails.groups).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getUserDetails (tested indirectly via JWT callback)
  // -----------------------------------------------------------------------
  describe("getUserDetails (via JWT callback)", () => {
    it("should initialize Graph client with the access token", async () => {
      setupGraphMocks();

      await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ access_token: "the-token" }),
      });

      expect(Client.init).toHaveBeenCalledWith({
        authProvider: expect.any(Function),
      });
    });

    it("should return user details with mapped groups (skipping first group)", async () => {
      const groups = [
        { id: "g1", displayName: "SkippedGroup", groupTypes: ["Unified"] },
        { id: "g2", displayName: "KeptGroup", groupTypes: [] },
        {
          id: "g3",
          displayName: "AnotherKept",
          groupTypes: ["Unified", "DynamicMembership"],
        },
      ];

      setupGraphMocks({ groups });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      expect(result.userDetails.groups).toHaveLength(2);
      expect(result.userDetails.groups[0]).toEqual({
        id: "g2",
        displayName: "KeptGroup",
        groupTypes: [],
      });
      expect(result.userDetails.groups[1]).toEqual({
        id: "g3",
        displayName: "AnotherKept",
        groupTypes: ["Unified", "DynamicMembership"],
      });
    });

    it("should include user photo when available", async () => {
      const photoBinary = Buffer.from("fake-photo-data");
      setupGraphMocks({ photo: photoBinary });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      expect(result.userDetails.photo).toBe(photoBinary);
    });

    it("should not fail when photo fetch errors", async () => {
      setupGraphMocks({ photoError: true });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      // Should still return user details; photo is null
      expect(result.userDetails).toBeDefined();
      expect(result.userDetails.photo).toBeNull();
    });

    it("should throw on Graph API error (caught by JWT callback)", async () => {
      const apiMock = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error("Graph API Error")),
        select: jest.fn().mockReturnThis(),
      }));

      (Client.init as jest.Mock).mockReturnValue({ api: apiMock });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      // JWT callback catches the error and logs it; token should not have userDetails
      expect(result.userDetails).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // JWT callback – initial login
  // -----------------------------------------------------------------------
  describe("JWT callback – initial login (account present)", () => {
    it("should set accessToken from account", async () => {
      setupGraphMocks();

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ access_token: "my-access-token" }),
      });

      expect(result.accessToken).toBe("my-access-token");
    });

    it("should set refreshToken from account", async () => {
      setupGraphMocks();

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ refresh_token: "my-refresh-token" }),
      });

      expect(result.refreshToken).toBe("my-refresh-token");
    });

    it("should set expiresAt based on account.expires_in", async () => {
      setupGraphMocks();
      const before = Date.now();

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ expires_in: 7200 }),
      });

      const after = Date.now();
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(after + 7200 * 1000);
    });

    it("should default expires_in to 3600 if not provided", async () => {
      setupGraphMocks();
      const before = Date.now();

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ expires_in: undefined }),
      });

      const after = Date.now();
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it("should fetch and store userDetails on initial login", async () => {
      setupGraphMocks({
        userDetails: {
          id: "ud-123",
          userPrincipalName: "user@company.com",
        },
      });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      expect(result.userDetails).toBeDefined();
      expect(result.userDetails.id).toBe("ud-123");
    });

    it("should save profile image when token.picture exists", async () => {
      setupGraphMocks({
        userDetails: { id: "user-with-pic", userPrincipalName: "u@e.com" },
      });

      const result = await capturedConfig.callbacks.jwt({
        token: { picture: "https://example.com/photo.jpg" },
        account: makeAccount(),
      });

      expect(saveProfileImage).toHaveBeenCalledWith({
        profile_image: "https://example.com/photo.jpg",
        user_id: "user-with-pic",
      });

      // picture should be deleted from token
      expect(result.picture).toBeUndefined();
    });

    it("should not save profile image when token.picture is absent", async () => {
      setupGraphMocks();

      await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      expect(saveProfileImage).not.toHaveBeenCalled();
    });

    it("should handle saveProfileImage failure gracefully (does not throw)", async () => {
      setupGraphMocks({
        userDetails: { id: "u1", userPrincipalName: "u@e.com" },
      });
      (saveProfileImage as jest.Mock).mockRejectedValueOnce(
        new Error("DB Error"),
      );

      const result = await capturedConfig.callbacks.jwt({
        token: { picture: "https://example.com/pic.jpg" },
        account: makeAccount(),
      });

      // Should still return token successfully
      expect(result.accessToken).toBeDefined();
    });

    it("should handle getUserDetails error gracefully on initial login", async () => {
      const apiMock = jest.fn().mockImplementation(() => ({
        get: jest
          .fn()
          .mockRejectedValue(new Error("Graph service unavailable")),
        select: jest.fn().mockReturnThis(),
      }));
      (Client.init as jest.Mock).mockReturnValue({ api: apiMock });

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount(),
      });

      // Token should still be returned (error is caught, not rethrown)
      expect(result.accessToken).toBe("new-access-token");
      expect(result.userDetails).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // JWT callback – token not expired
  // -----------------------------------------------------------------------
  describe("JWT callback – token not expired", () => {
    it("should return token as-is when expiresAt is far in the future", async () => {
      const token = makeToken({
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      const result = await capturedConfig.callbacks.jwt({ token });

      expect(result).toBe(token);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should return token as-is when expiresAt is more than 5 minutes away", async () => {
      const token = makeToken({
        expiresAt: Date.now() + 6 * 60 * 1000, // 6 minutes
      });

      const result = await capturedConfig.callbacks.jwt({ token });

      expect(result).toBe(token);
    });

    it("should return token as-is when expiresAt is not set", async () => {
      const token = makeToken({ expiresAt: undefined });

      const result = await capturedConfig.callbacks.jwt({ token });

      expect(result).toBe(token);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Session callback
  // -----------------------------------------------------------------------
  describe("session callback", () => {
    it("should return null when token has error (force re-login)", async () => {
      const result = await capturedConfig.callbacks.session({
        session: { user: { name: "test" } },
        token: { error: "RefreshAccessTokenError" },
      });

      expect(result).toBeNull();
    });

    it("should merge userDetails into session when available", async () => {
      const session = { user: { name: "Original" } };
      const token = {
        userDetails: {
          id: "u-1",
          displayName: "Graph User",
          groups: [{ id: "g1", displayName: "Team" }],
        },
        accessToken: "at-123",
      };

      const result = await capturedConfig.callbacks.session({
        session,
        token,
      });

      expect(result.user.id).toBe("u-1");
      expect(result.user.displayName).toBe("Graph User");
      expect(result.user.groups).toHaveLength(1);
    });

    it("should add accessToken to session.user", async () => {
      const result = await capturedConfig.callbacks.session({
        session: { user: { name: "Test" } },
        token: {
          userDetails: { id: "u1" },
          accessToken: "my-at",
        },
      });

      expect(result.user.accessToken).toBe("my-at");
    });

    it("should return session without userDetails when token has none", async () => {
      const session = { user: { name: "Test" } };
      const result = await capturedConfig.callbacks.session({
        session,
        token: { accessToken: "at" },
      });

      expect(result).toBe(session);
    });

    it("should preserve existing session.user properties when merging", async () => {
      const result = await capturedConfig.callbacks.session({
        session: { user: { name: "Original", email: "orig@e.com" } },
        token: {
          userDetails: { id: "u1", displayName: "Merged" },
          accessToken: "at",
        },
      });

      expect(result.user.name).toBe("Original");
      expect(result.user.email).toBe("orig@e.com");
      expect(result.user.id).toBe("u1");
    });
  });

  // -----------------------------------------------------------------------
  // Authorized callback
  // -----------------------------------------------------------------------
  describe("authorized callback", () => {
    it("should return true when auth.user exists", async () => {
      const result = await capturedConfig.callbacks.authorized({
        auth: { user: { name: "Test User" } },
      });
      expect(result).toBe(true);
    });

    it("should return false when auth is null", async () => {
      const result = await capturedConfig.callbacks.authorized({
        auth: null,
      });
      expect(result).toBe(false);
    });

    it("should return false when auth.user is null", async () => {
      const result = await capturedConfig.callbacks.authorized({
        auth: { user: null },
      });
      expect(result).toBe(false);
    });

    it("should return false when auth.user is undefined", async () => {
      const result = await capturedConfig.callbacks.authorized({
        auth: { user: undefined },
      });
      expect(result).toBe(false);
    });

    it("should return false when auth is undefined", async () => {
      const result = await capturedConfig.callbacks.authorized({
        auth: undefined,
      });
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Token refresh with user details refetch
  // -----------------------------------------------------------------------
  describe("JWT callback – token refresh with user details refetch", () => {
    it("should not refetch user details after refresh when already present", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      const tokenWithDetails = makeToken({
        expiresAt: Date.now() - 1000,
        userDetails: { id: "already-here", userPrincipalName: "u@e.com" },
      });

      const result = await capturedConfig.callbacks.jwt({
        token: tokenWithDetails,
      });

      // Client.init should NOT have been called because userDetails is already set
      expect(Client.init).not.toHaveBeenCalled();
      expect(result.userDetails.id).toBe("already-here");
    });

    it("should handle getUserDetails failure after refresh gracefully", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "new-at",
          expires_in: 3600,
          refresh_token: "new-rt",
        }),
      });

      const apiMock = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error("Graph down")),
        select: jest.fn().mockReturnThis(),
      }));
      (Client.init as jest.Mock).mockReturnValue({ api: apiMock });

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({
          expiresAt: Date.now() - 1000,
          userDetails: undefined,
        }),
      });

      // Should still have the refreshed token, just no userDetails
      expect(result.accessToken).toBe("new-at");
      expect(result.error).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("should handle account with no refresh_token on initial login", async () => {
      setupGraphMocks();

      const result = await capturedConfig.callbacks.jwt({
        token: {},
        account: makeAccount({ refresh_token: undefined }),
      });

      expect(result.refreshToken).toBeUndefined();
      expect(result.accessToken).toBeDefined();
    });

    it("should handle token with both account and existing expiresAt", async () => {
      setupGraphMocks();

      const result = await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() + 99999 }),
        account: makeAccount(),
      });

      // account present => initial login path wins, expiresAt recalculated
      expect(result.accessToken).toBe("new-access-token");
    });

    it("should send correct tenant ID in refresh URL", async () => {
      process.env.AUTH_AZURE_AD_TENANT_ID = "custom-tenant-abc";

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: "at",
          expires_in: 3600,
        }),
      });

      setupGraphMocks();

      await capturedConfig.callbacks.jwt({
        token: makeToken({ expiresAt: Date.now() - 1000 }),
      });

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain("custom-tenant-abc");
    });

    it("should log the token error in session callback", async () => {
      await capturedConfig.callbacks.session({
        session: { user: {} },
        token: { error: "RefreshAccessTokenError", userDetails: { id: "u1" } },
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Session rejected due to token error",
        expect.objectContaining({ error: "RefreshAccessTokenError" }),
      );
    });
  });
});
