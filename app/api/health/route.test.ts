/**
 * @jest-environment node
 */
import { GET } from "./route";

describe("GET /api/health", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it("returns 200 status", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('returns status "ok"', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  it("returns timestamp as ISO string", async () => {
    const fixedDate = new Date("2025-01-15T12:00:00.000Z");
    jest.setSystemTime(fixedDate);

    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBe("2025-01-15T12:00:00.000Z");
    // Verify it parses back to a valid date
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns version from env when set", async () => {
    process.env.npm_package_version = "2.5.0";

    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe("2.5.0");
  });

  it('returns "unknown" when npm_package_version is not set', async () => {
    delete process.env.npm_package_version;

    const response = await GET();
    const body = await response.json();

    expect(body.version).toBe("unknown");
  });
});
