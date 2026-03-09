/** @jest-environment node */

import { signIn } from "./signIn";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

jest.mock("@/app/_lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/db/azure_groups-server", () => ({
  userGroupIsValid: jest.fn(),
}));

jest.mock("@/db/profile", () => ({
  setUserAzureId: jest.fn(),
  updateUserGroups: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockAdminListUsers = jest.fn();
const mockAdminUpdateUserById = jest.fn();

jest.mock("@/lib/supabase/service-client", () => ({
  getServiceClient: jest.fn(() => ({
    auth: {
      admin: {
        listUsers: mockAdminListUsers,
        updateUserById: mockAdminUpdateUserById,
      },
    },
  })),
}));

// ---------------------------------------------------------------------------
// Import mocked modules so we can control return values
// ---------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import { auth } from "@/app/_lib/auth";
import { userGroupIsValid } from "@/db/azure_groups-server";
import { setUserAzureId, updateUserGroups } from "@/db/profile";
import { redirect } from "next/navigation";

const mockedAuth = auth as jest.Mock;
const mockedCreateClient = createClient as jest.Mock;
const mockedUserGroupIsValid = userGroupIsValid as jest.Mock;
const mockedSetUserAzureId = setUserAzureId as jest.Mock;
const mockedUpdateUserGroups = updateUserGroups as jest.Mock;
const mockedRedirect = redirect as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expect signIn to redirect to `expectedUrl` via thrown error. */
const expectRedirect = async (expectedUrl: string) => {
  try {
    await signIn();
    throw new Error("Expected redirect but signIn resolved normally");
  } catch (e: any) {
    expect(e.message).toBe(`REDIRECT:${expectedUrl}`);
  }
};

/** Build a minimal Azure session object. */
const makeAzureSession = (overrides: Record<string, any> = {}) => ({
  user: {
    id: "azure-user-123",
    userPrincipalName: "test@example.com",
    groups: [{ id: "group-1" }, { id: "group-2" }],
    ...overrides,
  },
});

/** Build the chainable Supabase mock. */
const buildMockSupabase = () => {
  const mockLimit = jest.fn();
  const mockEq2 = jest.fn(() => ({ limit: mockLimit }));
  const mockEq1 = jest.fn(() => ({ eq: mockEq2, limit: mockLimit }));
  const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));

  return {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
    },
    from: mockFrom,
    // Expose inner mocks for fine-grained control
    _chain: { mockFrom, mockSelect, mockEq1, mockEq2, mockLimit },
  };
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("signIn", () => {
  const originalEnv = process.env;
  let mockSupabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NEXT_LOGIN_PASSWORD: "test-password" };

    mockSupabase = buildMockSupabase();
    mockedCreateClient.mockReturnValue(mockSupabase as any);

    // Default: cookies return "en" locale
    mockCookieStore.get.mockReturnValue({ value: "en" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // 1. No Azure session
  // =========================================================================
  describe("when there is no Azure session", () => {
    it("should redirect to / when auth() returns null", async () => {
      mockedAuth.mockResolvedValue(null);

      await expectRedirect("/");
    });

    it("should redirect to / when auth() returns undefined", async () => {
      mockedAuth.mockResolvedValue(undefined as any);

      await expectRedirect("/");
    });

    it("should not attempt Supabase sign-in when no Azure session", async () => {
      mockedAuth.mockResolvedValue(null);

      await expectRedirect("/");
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Successful sign-in (existing user)
  // =========================================================================
  describe("when sign-in succeeds for an existing user", () => {
    const supabaseUser = { id: "supabase-user-456" };
    const azureSession = makeAzureSession();

    beforeEach(() => {
      mockedAuth.mockResolvedValue(azureSession as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: supabaseUser },
        error: null,
      });
      mockedUserGroupIsValid.mockResolvedValue(true);
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
    });

    it("should call signInWithPassword with azure email and NEXT_LOGIN_PASSWORD", async () => {
      // Need workspace + profile for full path
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1", is_home: true }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "test-password",
      });
    });

    it("should set Azure ID and update groups", async () => {
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1", is_home: true }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");

      expect(mockedSetUserAzureId).toHaveBeenCalledWith(
        mockSupabase,
        "supabase-user-456",
        "azure-user-123",
      );
      expect(mockedUpdateUserGroups).toHaveBeenCalledWith(
        mockSupabase,
        "supabase-user-456",
        "azure-user-123",
        azureSession.user.groups,
      );
    });

    it("should redirect to /{workspaceId}/chat with en locale (no prefix)", async () => {
      mockCookieStore.get.mockReturnValue({ value: "en" });

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "workspace-abc" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/workspace-abc/chat");
    });

    it("should redirect with locale prefix for non-en locale", async () => {
      mockCookieStore.get.mockReturnValue({ value: "de" });

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "workspace-abc" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/de/workspace-abc/chat");
    });

    it("should default to en locale when NEXT_LOCALE cookie is absent", async () => {
      mockCookieStore.get.mockReturnValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");
    });
  });

  // =========================================================================
  // 3. No home workspace found
  // =========================================================================
  describe("when no home workspace is found", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
    });

    it("should redirect to /setup when workspaces query returns empty", async () => {
      mockSupabase._chain.mockLimit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      await expectRedirect("/setup");
    });

    it("should redirect to /setup when workspaces query returns null data", async () => {
      mockSupabase._chain.mockLimit.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expectRedirect("/setup");
    });

    it("should redirect to /setup when workspaces query errors", async () => {
      mockSupabase._chain.mockLimit.mockResolvedValueOnce({
        data: null,
        error: { message: "query failed" },
      });

      await expectRedirect("/setup");
    });
  });

  // =========================================================================
  // 4. User not onboarded
  // =========================================================================
  describe("when user has not onboarded", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedUserGroupIsValid.mockResolvedValue(true);
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
    });

    it("should redirect to /setup when has_onboarded is false", async () => {
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: false }],
          error: null,
        });

      await expectRedirect("/setup");
    });

    it("should redirect to /setup when profile is null", async () => {
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [],
          error: null,
        });

      await expectRedirect("/setup");
    });

    it("should redirect to /setup when profiles data is null", async () => {
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: null,
        });

      await expectRedirect("/setup");
    });
  });

  // =========================================================================
  // 5. User group validation fails after successful sign-in
  // =========================================================================
  describe("when user group validation fails after sign-in", () => {
    it("should redirect to /no-access", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
      mockedUserGroupIsValid.mockResolvedValue(false);

      // Workspace found so we reach the group check
      mockSupabase._chain.mockLimit.mockResolvedValueOnce({
        data: [{ id: "ws-1" }],
        error: null,
      });

      await expectRedirect("/no-access");
    });
  });

  // =========================================================================
  // 6. Invalid login credentials - new user signup path
  // =========================================================================
  describe("when sign-in fails with 'Invalid login credentials' (signup path)", () => {
    const azureSession = makeAzureSession();

    beforeEach(() => {
      mockedAuth.mockResolvedValue(azureSession as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });
    });

    describe("when signup succeeds", () => {
      const signedUpUser = { id: "new-user-789" };

      beforeEach(() => {
        mockSupabase.auth.signUp.mockResolvedValue({
          data: { user: signedUpUser },
          error: null,
        });
      });

      it("should call signUp with azure email and NEXT_LOGIN_PASSWORD", async () => {
        mockedUserGroupIsValid.mockResolvedValue(true);
        mockedSetUserAzureId.mockResolvedValue(undefined);
        mockedUpdateUserGroups.mockResolvedValue(undefined);

        await expectRedirect("/setup");

        expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "test-password",
        });
      });

      it("should validate group, set Azure data, and redirect to /setup", async () => {
        mockedUserGroupIsValid.mockResolvedValue(true);
        mockedSetUserAzureId.mockResolvedValue(undefined);
        mockedUpdateUserGroups.mockResolvedValue(undefined);

        await expectRedirect("/setup");

        expect(mockedUserGroupIsValid).toHaveBeenCalled();
        expect(mockedSetUserAzureId).toHaveBeenCalledWith(
          mockSupabase,
          "new-user-789",
          "azure-user-123",
        );
        expect(mockedUpdateUserGroups).toHaveBeenCalledWith(
          mockSupabase,
          "new-user-789",
          "azure-user-123",
          azureSession.user.groups,
        );
      });

      it("should redirect to /no-access when group validation fails after signup", async () => {
        mockedUserGroupIsValid.mockResolvedValue(false);

        await expectRedirect("/no-access");

        // Azure data should NOT be set since group validation failed before that
        expect(mockedSetUserAzureId).not.toHaveBeenCalled();
      });

      it("should continue to redirect /setup even if setUserAzureId throws", async () => {
        mockedUserGroupIsValid.mockResolvedValue(true);
        mockedSetUserAzureId.mockRejectedValue(new Error("DB error"));
        mockedUpdateUserGroups.mockResolvedValue(undefined);

        await expectRedirect("/setup");
      });

      it("should continue to redirect /setup even if updateUserGroups throws", async () => {
        mockedUserGroupIsValid.mockResolvedValue(true);
        mockedSetUserAzureId.mockResolvedValue(undefined);
        mockedUpdateUserGroups.mockRejectedValue(
          new Error("Groups update failed"),
        );

        await expectRedirect("/setup");
      });
    });

    describe("when signup fails with signUpData.user being null", () => {
      it("should redirect to / when signUp returns null user without specific error", async () => {
        mockSupabase.auth.signUp.mockResolvedValue({
          data: { user: null },
          error: null,
        });

        await expectRedirect("/");
      });
    });
  });

  // =========================================================================
  // 7. Signup fails with "User already registered" - password reset path
  // =========================================================================
  describe("when signup fails with 'User already registered'", () => {
    const azureSession = makeAzureSession();
    const existingUser = { id: "existing-sb-user", email: "test@example.com" };

    beforeEach(() => {
      mockedAuth.mockResolvedValue(azureSession as any);

      // First sign-in attempt fails
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });

      // Sign-up fails with "User already registered"
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: { message: "User already registered" },
      });

      // Admin finds the user
      mockAdminListUsers.mockResolvedValue({
        data: { users: [existingUser] },
      });
      mockAdminUpdateUserById.mockResolvedValue({ data: {}, error: null });
    });

    it("should reset password via admin client and retry sign-in", async () => {
      // Retry sign-in succeeds
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      // Workspace + profile for post-retry redirect
      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-reset" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-reset/chat");

      expect(mockAdminUpdateUserById).toHaveBeenCalledWith("existing-sb-user", {
        password: "test-password",
      });
    });

    it("should update Azure data after successful password reset and re-sign-in", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");

      expect(mockedSetUserAzureId).toHaveBeenCalledWith(
        mockSupabase,
        "existing-sb-user",
        "azure-user-123",
      );
      expect(mockedUpdateUserGroups).toHaveBeenCalledWith(
        mockSupabase,
        "existing-sb-user",
        "azure-user-123",
        azureSession.user.groups,
      );
    });

    it("should redirect to /setup when no workspace after password reset", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      await expectRedirect("/setup");
    });

    it("should redirect to /setup when user not onboarded after password reset", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: false }],
          error: null,
        });

      await expectRedirect("/setup");
    });

    it("should handle locale correctly in retry path (non-en)", async () => {
      // The retry path calls `(await cookies()).get(...)` again for locale
      mockCookieStore.get.mockReturnValue({ value: "fr" });

      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/fr/ws-1/chat");
    });

    it("should continue if Azure data update fails after password reset", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "existing-sb-user" } },
        error: null,
      });
      mockedSetUserAzureId.mockRejectedValue(new Error("Azure update failed"));
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      // Should still redirect to chat, not throw
      await expectRedirect("/ws-1/chat");
    });

    it("should redirect to / when retry sign-in also fails", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Some other error" },
      });

      await expectRedirect("/");
    });

    it("should redirect to / when admin listUsers returns no matching user", async () => {
      mockAdminListUsers.mockResolvedValue({
        data: {
          users: [{ id: "other-user", email: "other@example.com" }],
        },
      });

      // No matching user found, so no password reset, falls through to redirect /
      await expectRedirect("/");
    });

    it("should redirect to / when admin listUsers returns empty list", async () => {
      mockAdminListUsers.mockResolvedValue({
        data: { users: [] },
      });

      await expectRedirect("/");
    });
  });

  // =========================================================================
  // 8. Signup fails with other error
  // =========================================================================
  describe("when signup fails with a non-specific error", () => {
    it("should redirect to / for generic signup errors", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: { message: "Database connection failed" },
      });

      await expectRedirect("/");
    });

    it("should redirect to / for rate limit errors on signup", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: { message: "Rate limit exceeded" },
      });

      await expectRedirect("/");
    });
  });

  // =========================================================================
  // 9. Non-"Invalid login credentials" sign-in error
  // =========================================================================
  describe("when sign-in fails with error other than 'Invalid login credentials'", () => {
    it("should redirect to / for server errors", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Internal server error" },
      });

      await expectRedirect("/");

      // Should NOT attempt signup
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });

    it("should redirect to / for network errors", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Network request failed" },
      });

      await expectRedirect("/");
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 10. Azure data update failures on successful sign-in path
  // =========================================================================
  describe("when Azure data update fails on the primary sign-in path", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedUserGroupIsValid.mockResolvedValue(true);
    });

    it("should continue flow when setUserAzureId throws", async () => {
      mockedSetUserAzureId.mockRejectedValue(new Error("Profile update error"));
      mockedUpdateUserGroups.mockResolvedValue(undefined);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      // Flow should continue to workspace check and redirect
      await expectRedirect("/ws-1/chat");
    });

    it("should continue flow when updateUserGroups throws", async () => {
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockRejectedValue(
        new Error("Groups update error"),
      );

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");
    });

    it("should continue flow when both Azure data updates throw", async () => {
      mockedSetUserAzureId.mockRejectedValue(new Error("Error 1"));
      // updateUserGroups won't be called because setUserAzureId throwing
      // causes the try block to jump to catch. Verify the flow still continues.

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");
    });
  });

  // =========================================================================
  // 11. Supabase client creation
  // =========================================================================
  describe("Supabase client creation", () => {
    it("should create Supabase client with cookie store from next/headers", async () => {
      mockedAuth.mockResolvedValue(makeAzureSession() as any);
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
      mockedUserGroupIsValid.mockResolvedValue(true);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "ws-1" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      await expectRedirect("/ws-1/chat");

      expect(mockedCreateClient).toHaveBeenCalledWith(mockCookieStore);
    });
  });

  // =========================================================================
  // 12. redirect() behavior verification
  // =========================================================================
  describe("redirect calls", () => {
    it("should call next/navigation redirect (not return value)", async () => {
      mockedAuth.mockResolvedValue(null);

      try {
        await signIn();
      } catch {
        // expected
      }

      expect(mockedRedirect).toHaveBeenCalledWith("/");
    });
  });

  // =========================================================================
  // 13. Full happy path end-to-end
  // =========================================================================
  describe("full happy path", () => {
    it("should complete entire sign-in flow for onboarded user with workspace", async () => {
      const azureSession = makeAzureSession({
        id: "az-999",
        userPrincipalName: "admin@company.com",
        groups: [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
      });
      mockedAuth.mockResolvedValue(azureSession as any);

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "sb-user-999" } },
        error: null,
      });
      mockedSetUserAzureId.mockResolvedValue(undefined);
      mockedUpdateUserGroups.mockResolvedValue(undefined);
      mockedUserGroupIsValid.mockResolvedValue(true);

      mockSupabase._chain.mockLimit
        .mockResolvedValueOnce({
          data: [{ id: "main-workspace" }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ has_onboarded: true }],
          error: null,
        });

      mockCookieStore.get.mockReturnValue({ value: "en" });

      await expectRedirect("/main-workspace/chat");

      // Verify correct order of operations
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "admin@company.com",
        password: "test-password",
      });
      expect(mockedSetUserAzureId).toHaveBeenCalledWith(
        mockSupabase,
        "sb-user-999",
        "az-999",
      );
      expect(mockedUpdateUserGroups).toHaveBeenCalledWith(
        mockSupabase,
        "sb-user-999",
        "az-999",
        [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
      );
      expect(mockedUserGroupIsValid).toHaveBeenCalled();
    });
  });
});
