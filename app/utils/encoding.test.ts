import { encodeString, decodedString } from "./encoding";

describe("encodeString", () => {
  it("encodes a simple ASCII string to base64", () => {
    expect(encodeString("hello")).toBe(Buffer.from("hello").toString("base64"));
    expect(encodeString("hello")).toBe("aGVsbG8=");
  });

  it("returns an empty string when given an empty string", () => {
    expect(encodeString("")).toBe("");
  });

  it("encodes special characters", () => {
    const input = "!@#$%^&*()_+-=[]{}|;':\",./<>?";
    expect(encodeString(input)).toBe(Buffer.from(input).toString("base64"));
  });

  it("encodes unicode characters", () => {
    const input = "Hallo Welt! \u00e4\u00f6\u00fc\u00df \u00c4\u00d6\u00dc";
    expect(encodeString(input)).toBe(Buffer.from(input).toString("base64"));
  });

  it("encodes emoji characters", () => {
    const input = "\u{1F680}\u{1F4A5}\u{2728}";
    expect(encodeString(input)).toBe(Buffer.from(input).toString("base64"));
  });

  it("encodes strings with whitespace (spaces, tabs, newlines)", () => {
    const input = "  hello\tworld\nfoo\r\nbar  ";
    expect(encodeString(input)).toBe(Buffer.from(input).toString("base64"));
  });

  it("encodes a long string", () => {
    const input = "a".repeat(10_000);
    const encoded = encodeString(input);
    expect(encoded).toBe(Buffer.from(input).toString("base64"));
    expect(encoded.length).toBeGreaterThan(input.length);
  });

  it("encodes a string containing only newlines", () => {
    expect(encodeString("\n\n\n")).toBe(
      Buffer.from("\n\n\n").toString("base64"),
    );
  });

  it("produces valid base64 output (only valid base64 characters)", () => {
    const encoded = encodeString("test data 123");
    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  });
});

describe("decodedString", () => {
  it("decodes a valid base64 string back to the original", () => {
    expect(decodedString("aGVsbG8=")).toBe("hello");
  });

  it("returns an empty string when given an empty string", () => {
    expect(decodedString("")).toBe("");
  });

  it("decodes base64-encoded special characters", () => {
    const original = "foo/bar+baz=qux";
    const encoded = Buffer.from(original).toString("base64");
    expect(decodedString(encoded)).toBe(original);
  });

  it("decodes base64-encoded unicode", () => {
    const original = "\u00e4\u00f6\u00fc\u00df";
    const encoded = Buffer.from(original).toString("base64");
    expect(decodedString(encoded)).toBe(original);
  });

  it("decodes base64 without padding", () => {
    // "ab" encodes to "YWI=" but Node handles "YWI" without padding too
    const encoded = Buffer.from("ab").toString("base64");
    expect(decodedString(encoded)).toBe("ab");
  });
});

describe("roundtrip: encodeString then decodedString", () => {
  it.each([
    ["simple ASCII", "hello world"],
    ["empty string", ""],
    ["special characters", "!@#$%^&*()"],
    ["unicode (German)", "Guten Tag! \u00e4\u00f6\u00fc\u00df"],
    ["unicode (CJK)", "\u4f60\u597d\u4e16\u754c"],
    ["emoji", "\u{1F680}\u{1F30D}"],
    ["whitespace mix", "  \t\n\r\n  "],
    ["newlines only", "\n\n\n"],
    ["long string", "x".repeat(5_000)],
    ["JSON-like", '{"key":"value","num":42}'],
    ["multiline text", "line1\nline2\nline3"],
    ["single character", "a"],
    ["numeric string", "1234567890"],
    [
      "base64 alphabet chars",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    ],
  ])("preserves %s through encode/decode", (_label, input) => {
    expect(decodedString(encodeString(input))).toBe(input);
  });
});
