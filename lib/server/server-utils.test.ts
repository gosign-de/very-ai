/**
 * @jest-environment node
 */

jest.mock("openai", () => ({ default: jest.fn() }));
jest.mock("openai/streaming.mjs", () => ({ Stream: jest.fn() }));

import { createResponse, createStreamingResponse } from "./server-utils";

describe("createResponse", () => {
  it("returns correct status code", () => {
    const response = createResponse({ message: "ok" }, 200);
    expect(response.status).toBe(200);
  });

  it("returns JSON content type header", () => {
    const response = createResponse({ message: "ok" }, 200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("body is JSON serialized data", async () => {
    const data = { message: "hello", count: 42 };
    const response = createResponse(data, 200);
    const body = await response.json();
    expect(body).toEqual(data);
  });

  it("handles empty object", async () => {
    const response = createResponse({}, 200);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({});
  });

  it("handles nested objects", async () => {
    const data = {
      user: {
        name: "Test",
        settings: {
          theme: "dark",
          notifications: [1, 2, 3],
        },
      },
    };
    const response = createResponse(data, 200);
    const body = await response.json();
    expect(body).toEqual(data);
  });
});

describe("createStreamingResponse", () => {
  function createMockStream(
    chunks: Array<{ choices: Array<{ delta: { content?: string } }> }>,
  ) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    } as any;
  }

  it("returns Response with text/plain content type", async () => {
    const stream = createMockStream([]);
    const response = await createStreamingResponse(stream);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("streams content from chunks", async () => {
    const stream = createMockStream([
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " World" } }] },
    ]);

    const response = await createStreamingResponse(stream);
    const text = await response.text();
    expect(text).toBe("Hello World");
  });

  it("handles empty chunks gracefully", async () => {
    const stream = createMockStream([
      { choices: [{ delta: { content: "" } }] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: "data" } }] },
    ]);

    const response = await createStreamingResponse(stream);
    const text = await response.text();
    expect(text).toBe("data");
  });
});
