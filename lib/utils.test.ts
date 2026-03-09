import {
  cn,
  formatDate,
  getMediaTypeFromDataURL,
  getBase64FromDataURL,
} from "./utils";

describe("cn", () => {
  it("returns empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns a single class unchanged", () => {
    expect(cn("text-red-500")).toBe("text-red-500");
  });

  it("merges multiple classes", () => {
    const result = cn("px-4", "py-2", "font-bold");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
    expect(result).toContain("font-bold");
  });

  it("handles conditional classes via object syntax", () => {
    const result = cn("base", { "text-red-500": true, "text-blue-500": false });
    expect(result).toContain("base");
    expect(result).toContain("text-red-500");
    expect(result).not.toContain("text-blue-500");
  });

  it("handles conditional classes via array syntax", () => {
    const isActive = true;
    const result = cn("btn", isActive && "btn-active");
    expect(result).toContain("btn");
    expect(result).toContain("btn-active");
  });

  it("filters out falsy values", () => {
    const result = cn("base", undefined, null, false, "", "valid");
    expect(result).toBe("base valid");
  });

  it("resolves Tailwind merge conflicts by keeping the last conflicting class", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("resolves Tailwind color conflicts", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("resolves Tailwind padding conflicts with conditional", () => {
    const result = cn("p-4", { "p-2": true });
    expect(result).toBe("p-2");
  });

  it("keeps non-conflicting Tailwind classes", () => {
    const result = cn("px-4", "py-2", "text-red-500", "bg-blue-500");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
    expect(result).toContain("text-red-500");
    expect(result).toContain("bg-blue-500");
  });
});

describe("formatDate", () => {
  it("formats a date string input", () => {
    const result = formatDate("2024-01-15");
    expect(result).toBe("January 15, 2024");
  });

  it("formats a numeric timestamp input", () => {
    const timestamp = new Date("2023-07-04T00:00:00Z").getTime();
    const result = formatDate(timestamp);
    expect(result).toContain("July");
    expect(result).toContain("2023");
  });

  it("formats a Date object input", () => {
    const date = new Date("2025-12-25T00:00:00Z");
    const result = formatDate(date);
    expect(result).toContain("December");
    expect(result).toContain("2025");
  });

  it("formats a date at the start of the year", () => {
    const result = formatDate("2020-01-01");
    expect(result).toBe("January 1, 2020");
  });

  it("formats a date at the end of the year", () => {
    const result = formatDate("2022-12-31");
    expect(result).toBe("December 31, 2022");
  });

  it("formats a leap day", () => {
    const result = formatDate("2024-02-29");
    expect(result).toBe("February 29, 2024");
  });

  it("returns the en-US locale format with long month", () => {
    const result = formatDate("2023-03-14");
    expect(result).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });
});

describe("getMediaTypeFromDataURL", () => {
  it("extracts image/png media type", () => {
    const dataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    expect(getMediaTypeFromDataURL(dataURL)).toBe("image/png");
  });

  it("extracts image/jpeg media type", () => {
    const dataURL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    expect(getMediaTypeFromDataURL(dataURL)).toBe("image/jpeg");
  });

  it("extracts application/pdf media type", () => {
    const dataURL = "data:application/pdf;base64,JVBERi0xLjQ=";
    expect(getMediaTypeFromDataURL(dataURL)).toBe("application/pdf");
  });

  it("extracts image/svg+xml media type", () => {
    const dataURL = "data:image/svg+xml;base64,PHN2Zz4=";
    expect(getMediaTypeFromDataURL(dataURL)).toBe("image/svg+xml");
  });

  it("extracts image/gif media type", () => {
    const dataURL = "data:image/gif;base64,R0lGODlhAQABAA==";
    expect(getMediaTypeFromDataURL(dataURL)).toBe("image/gif");
  });

  it("returns null for an invalid data URL without the data: prefix", () => {
    expect(getMediaTypeFromDataURL("not-a-data-url")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(getMediaTypeFromDataURL("")).toBeNull();
  });

  it("returns null for a data URL missing base64 indicator", () => {
    expect(getMediaTypeFromDataURL("data:image/png,rawdata")).toBeNull();
  });

  it("returns null for a plain URL", () => {
    expect(getMediaTypeFromDataURL("https://example.com/image.png")).toBeNull();
  });
});

describe("getBase64FromDataURL", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("fetches the data URL and returns a base64 string", async () => {
    const testContent = "Hello, World!";
    const uint8Array = Buffer.from(testContent);
    const arrayBuffer = uint8Array.buffer.slice(
      uint8Array.byteOffset,
      uint8Array.byteOffset + uint8Array.byteLength,
    );

    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(arrayBuffer),
    });

    const expectedBase64 = Buffer.from(testContent).toString("base64");
    const result = await getBase64FromDataURL(
      "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==",
    );
    expect(result).toBe(expectedBase64);
  });

  it("handles binary content correctly", async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const arrayBuffer = binaryData.buffer;

    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(arrayBuffer),
    });

    const expectedBase64 = Buffer.from(binaryData).toString("base64");
    const result = await getBase64FromDataURL(
      "data:image/png;base64,fakecontent",
    );

    expect(result).toBe(expectedBase64);
  });

  it("handles empty content", async () => {
    const emptyBuffer = new ArrayBuffer(0);

    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(emptyBuffer),
    });

    const result = await getBase64FromDataURL("data:text/plain;base64,");
    expect(result).toBe("");
  });

  it("propagates fetch errors", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      getBase64FromDataURL("data:image/png;base64,abc"),
    ).rejects.toThrow("Network error");
  });

  it("propagates arrayBuffer errors", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      arrayBuffer: jest.fn().mockRejectedValue(new Error("Buffer error")),
    });

    await expect(
      getBase64FromDataURL("data:image/png;base64,abc"),
    ).rejects.toThrow("Buffer error");
  });
});
