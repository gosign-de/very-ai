/**
 * Tests for n8n API utility functions
 *
 * Covers:
 * - extractFailedNodeLog (pure function, exhaustive)
 * - fetchN8nExecutionDetails (mocked global.fetch)
 * - pollExecutionUntilComplete (mocked fetch + timers)
 */

import {
  extractFailedNodeLog,
  fetchN8nExecutionDetails,
  pollExecutionUntilComplete,
  N8nExecutionDetails,
  N8nNodeExecution,
} from "@/lib/n8n/n8n-api-utils";

// Mock the logger module so server-only imports don't fail
jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers: factory functions for test data
// ---------------------------------------------------------------------------

function makeExecution(
  overrides: Partial<N8nExecutionDetails> = {},
): N8nExecutionDetails {
  return {
    id: "exec-1",
    finished: false,
    mode: "webhook",
    status: "success",
    createdAt: "2025-01-01T00:00:00.000Z",
    startedAt: "2025-01-01T00:00:01.000Z",
    stoppedAt: "2025-01-01T00:00:05.000Z",
    workflowId: "wf-1",
    ...overrides,
  };
}

function makeNodeExecution(
  overrides: Partial<N8nNodeExecution> = {},
): N8nNodeExecution {
  return {
    startTime: 1000,
    executionIndex: 0,
    executionTime: 500,
    executionStatus: "success",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractFailedNodeLog
// ---------------------------------------------------------------------------

describe("extractFailedNodeLog", () => {
  it("returns null when status is not 'error'", () => {
    expect(
      extractFailedNodeLog(makeExecution({ status: "success" })),
    ).toBeNull();
    expect(
      extractFailedNodeLog(makeExecution({ status: "running" })),
    ).toBeNull();
    expect(
      extractFailedNodeLog(makeExecution({ status: "waiting" })),
    ).toBeNull();
    expect(
      extractFailedNodeLog(makeExecution({ status: "canceled" })),
    ).toBeNull();
  });

  it("returns null when status is error but no resultData exists", () => {
    const exec = makeExecution({ status: "error", data: undefined });
    expect(extractFailedNodeLog(exec)).toBeNull();
  });

  it("returns null when resultData has no lastNodeExecuted and no top-level error", () => {
    const exec = makeExecution({
      status: "error",
      data: { resultData: { runData: {} } },
    });
    expect(extractFailedNodeLog(exec)).toBeNull();
  });

  it("returns FailedNodeInfo from top-level error when no lastNodeExecuted but error exists", () => {
    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          error: { message: "Workflow timed out" },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).toEqual({
      nodeName: "Unknown",
      errorMessage: "Workflow timed out",
      fullNodeLog: [],
    });
  });

  it("returns FailedNodeInfo with correct nodeName and errorMessage from failed execution", () => {
    const failedNode = makeNodeExecution({
      executionStatus: "error",
      error: { message: "Connection refused" },
    });

    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "HTTP Request",
          runData: {
            "HTTP Request": [failedNode],
          },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).toEqual({
      nodeName: "HTTP Request",
      errorMessage: "Connection refused",
      fullNodeLog: [failedNode],
    });
  });

  it("returns FailedNodeInfo from top-level error when node exists but has no failed execution", () => {
    const successNode = makeNodeExecution({ executionStatus: "success" });

    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "Set",
          runData: { Set: [successNode] },
          error: { message: "Unexpected workflow error" },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).toEqual({
      nodeName: "Set",
      errorMessage: "Unexpected workflow error",
      fullNodeLog: [successNode],
    });
  });

  it("returns null when node has no execution data (empty array)", () => {
    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "Missing Node",
          runData: { "Missing Node": [] },
        },
      },
    });

    expect(extractFailedNodeLog(exec)).toBeNull();
  });

  it("returns null when node has no execution data (key absent)", () => {
    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "Ghost Node",
          runData: {},
        },
      },
    });

    expect(extractFailedNodeLog(exec)).toBeNull();
  });

  it("handles missing error message in failed execution (fallback text)", () => {
    const failedNode = makeNodeExecution({
      executionStatus: "error",
      // error property is undefined
    });

    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "Code",
          runData: { Code: [failedNode] },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).not.toBeNull();
    expect(result!.errorMessage).toBe("Unknown error in node execution");
  });

  it("selects the correct failed execution among multiple node runs", () => {
    const successNode = makeNodeExecution({
      executionIndex: 0,
      executionStatus: "success",
    });
    const failedNode = makeNodeExecution({
      executionIndex: 1,
      executionStatus: "error",
      error: { message: "Rate limited" },
    });

    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          lastNodeExecuted: "API Call",
          runData: { "API Call": [successNode, failedNode] },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).toEqual({
      nodeName: "API Call",
      errorMessage: "Rate limited",
      fullNodeLog: [successNode, failedNode],
    });
  });

  it("returns null when no lastNodeExecuted AND no runData, even with error status", () => {
    const exec = makeExecution({
      status: "error",
      data: { resultData: {} },
    });
    expect(extractFailedNodeLog(exec)).toBeNull();
  });

  it("falls back to 'Unknown error occurred' when top-level error has no message", () => {
    const exec = makeExecution({
      status: "error",
      data: {
        resultData: {
          error: { message: "" },
        },
      },
    });

    const result = extractFailedNodeLog(exec);
    expect(result).not.toBeNull();
    // The code uses `resultData.error.message || "Unknown error occurred"`
    expect(result!.errorMessage).toBe("Unknown error occurred");
  });
});

// ---------------------------------------------------------------------------
// fetchN8nExecutionDetails
// ---------------------------------------------------------------------------

describe("fetchN8nExecutionDetails", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("calls correct URL with trailing slash removed from baseUrl", async () => {
    const mockExecution = makeExecution();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockExecution),
    });

    await fetchN8nExecutionDetails(
      "exec-123",
      "api-key-abc",
      "https://n8n.example.com/",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://n8n.example.com/api/v1/executions/exec-123?includeData=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-N8N-API-KEY": "api-key-abc",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("returns execution details on 200 OK", async () => {
    const mockExecution = makeExecution({ id: "exec-200" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockExecution),
    });

    const result = await fetchN8nExecutionDetails(
      "exec-200",
      "key",
      "https://n8n.example.com",
    );
    expect(result).toEqual(mockExecution);
  });

  it("returns null on 404 response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchN8nExecutionDetails(
      "missing",
      "key",
      "https://n8n.example.com",
    );
    expect(result).toBeNull();
  });

  it("throws on non-404 error responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(
      fetchN8nExecutionDetails("exec-err", "key", "https://n8n.example.com"),
    ).rejects.toThrow("n8n API request failed: 500 Internal Server Error");
  });

  it("throws on network error", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("Network unreachable"));

    await expect(
      fetchN8nExecutionDetails("exec-net", "key", "https://n8n.example.com"),
    ).rejects.toThrow("Network unreachable");
  });

  it("sets X-N8N-API-KEY header correctly", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeExecution()),
    });

    await fetchN8nExecutionDetails(
      "exec-1",
      "my-secret-key",
      "https://n8n.example.com",
    );

    const calledHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(calledHeaders["X-N8N-API-KEY"]).toBe("my-secret-key");
  });

  it("handles baseUrl without trailing slash", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeExecution()),
    });

    await fetchN8nExecutionDetails("exec-1", "key", "https://n8n.example.com");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://n8n.example.com/api/v1/executions/exec-1?includeData=true",
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// pollExecutionUntilComplete
// ---------------------------------------------------------------------------

describe("pollExecutionUntilComplete", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("returns immediately when execution is already finished", async () => {
    const finishedExec = makeExecution({
      finished: true,
      status: "success",
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(finishedExec),
    });

    const promise = pollExecutionUntilComplete(
      "exec-done",
      "key",
      "https://n8n.example.com",
      60000,
    );

    // Flush any pending microtasks
    await jest.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toEqual(finishedExec);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when execution is not found (404)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const promise = pollExecutionUntilComplete(
      "ghost",
      "key",
      "https://n8n.example.com",
      60000,
    );

    await jest.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBeNull();
  });

  it("polls until execution completes with error status", async () => {
    const runningExec = makeExecution({ status: "running", finished: false });
    const errorExec = makeExecution({ status: "error", finished: true });

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const exec = callCount < 3 ? runningExec : errorExec;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(exec),
      });
    });

    const promise = pollExecutionUntilComplete(
      "exec-poll",
      "key",
      "https://n8n.example.com",
      60000,
    );

    // Advance through polling intervals
    for (let i = 0; i < 10; i++) {
      await jest.advanceTimersByTimeAsync(11000);
    }

    const result = await promise;
    expect(result).toEqual(errorExec);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it("calls onProgress callback with each polled execution", async () => {
    const runningExec = makeExecution({ status: "running", finished: false });
    const doneExec = makeExecution({ status: "success", finished: true });
    const onProgress = jest.fn();

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const exec = callCount < 2 ? runningExec : doneExec;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(exec),
      });
    });

    const promise = pollExecutionUntilComplete(
      "exec-prog",
      "key",
      "https://n8n.example.com",
      60000,
      onProgress,
    );

    for (let i = 0; i < 5; i++) {
      await jest.advanceTimersByTimeAsync(11000);
    }

    await promise;
    expect(onProgress).toHaveBeenCalled();
  });

  it("returns null on timeout", async () => {
    const runningExec = makeExecution({ status: "running", finished: false });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(runningExec),
    });

    const maxWaitMs = 5000;
    const promise = pollExecutionUntilComplete(
      "exec-timeout",
      "key",
      "https://n8n.example.com",
      maxWaitMs,
    );

    // Advance well past the timeout
    await jest.advanceTimersByTimeAsync(maxWaitMs + 30000);

    const result = await promise;
    expect(result).toBeNull();
  });

  it("continues polling when fetch throws (resilient to transient errors)", async () => {
    const doneExec = makeExecution({ status: "success", finished: true });

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Transient error"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(doneExec),
      });
    });

    const promise = pollExecutionUntilComplete(
      "exec-retry",
      "key",
      "https://n8n.example.com",
      60000,
    );

    for (let i = 0; i < 10; i++) {
      await jest.advanceTimersByTimeAsync(11000);
    }

    const result = await promise;
    expect(result).toEqual(doneExec);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
