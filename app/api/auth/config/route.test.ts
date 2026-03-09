/**
 * @jest-environment node
 */
import { GET } from "./route";

describe("GET /api/auth/config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns entraEnabled false when env vars are not set", async () => {
    delete process.env.AUTH_AZURE_AD_ID;
    delete process.env.AUTH_AZURE_AD_SECRET;
    delete process.env.AUTH_AZURE_AD_TENANT_ID;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entraEnabled).toBe(false);
  });

  it("returns entraEnabled true when all three env vars are set", async () => {
    process.env.AUTH_AZURE_AD_ID = "test-client-id";
    process.env.AUTH_AZURE_AD_SECRET = "test-client-secret";
    process.env.AUTH_AZURE_AD_TENANT_ID = "test-tenant-id";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entraEnabled).toBe(true);
  });

  it("returns false when only AUTH_AZURE_AD_ID is set", async () => {
    process.env.AUTH_AZURE_AD_ID = "test-client-id";
    delete process.env.AUTH_AZURE_AD_SECRET;
    delete process.env.AUTH_AZURE_AD_TENANT_ID;

    const response = await GET();
    const body = await response.json();

    expect(body.entraEnabled).toBe(false);
  });

  it("returns false when only AUTH_AZURE_AD_SECRET is set", async () => {
    delete process.env.AUTH_AZURE_AD_ID;
    process.env.AUTH_AZURE_AD_SECRET = "test-client-secret";
    delete process.env.AUTH_AZURE_AD_TENANT_ID;

    const response = await GET();
    const body = await response.json();

    expect(body.entraEnabled).toBe(false);
  });

  it("returns false when only AUTH_AZURE_AD_TENANT_ID is set", async () => {
    delete process.env.AUTH_AZURE_AD_ID;
    delete process.env.AUTH_AZURE_AD_SECRET;
    process.env.AUTH_AZURE_AD_TENANT_ID = "test-tenant-id";

    const response = await GET();
    const body = await response.json();

    expect(body.entraEnabled).toBe(false);
  });

  it("returns false when two of three env vars are set", async () => {
    process.env.AUTH_AZURE_AD_ID = "test-client-id";
    process.env.AUTH_AZURE_AD_SECRET = "test-client-secret";
    delete process.env.AUTH_AZURE_AD_TENANT_ID;

    const response = await GET();
    const body = await response.json();

    expect(body.entraEnabled).toBe(false);
  });
});
