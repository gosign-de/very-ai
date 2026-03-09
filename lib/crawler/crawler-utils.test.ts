jest.mock("crawler", () => jest.fn());
jest.mock("puppeteer", () => ({ launch: jest.fn() }));
jest.mock("../logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock("../supabase/service-client", () => ({
  getServiceClient: jest.fn(),
}));

// Mock the jsdom npm package using the DOM APIs provided by jest-environment-jsdom.
// This avoids loading jsdom@27 which has ESM/TextEncoder compatibility issues in Jest.
jest.mock("jsdom", () => {
  class JSDOM {
    window: { document: Document };
    constructor(html: string) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      this.window = { document: doc };
    }
  }
  return { JSDOM };
});

import {
  isInternalUrl,
  normalizeWhitespace,
  removeNodesOfType,
  extractText,
  URL_REGEX,
} from "./crawler-utils";

// ---------------------------------------------------------------------------
// isInternalUrl
// ---------------------------------------------------------------------------
describe("isInternalUrl", () => {
  it("returns true for localhost", () => {
    expect(isInternalUrl("http://localhost")).toBe(true);
    expect(isInternalUrl("http://localhost:3000/path")).toBe(true);
  });

  it("returns true for 127.0.0.1 (IPv4 loopback)", () => {
    expect(isInternalUrl("http://127.0.0.1")).toBe(true);
    expect(isInternalUrl("http://127.0.0.1:8080/api")).toBe(true);
  });

  it("returns true for 10.x.x.x (Class A private)", () => {
    expect(isInternalUrl("http://10.0.0.1")).toBe(true);
    expect(isInternalUrl("http://10.255.255.255")).toBe(true);
    expect(isInternalUrl("http://10.10.10.10:443/secure")).toBe(true);
  });

  it("returns true for 192.168.x.x (Class C private)", () => {
    expect(isInternalUrl("http://192.168.0.1")).toBe(true);
    expect(isInternalUrl("http://192.168.1.100:9090")).toBe(true);
    expect(isInternalUrl("http://192.168.255.255")).toBe(true);
  });

  it("returns true for 169.254.x.x (link-local)", () => {
    expect(isInternalUrl("http://169.254.0.1")).toBe(true);
    expect(isInternalUrl("http://169.254.169.254")).toBe(true);
  });

  it("returns true for 172.16-31.x.x (Class B private)", () => {
    expect(isInternalUrl("http://172.16.0.1")).toBe(true);
    expect(isInternalUrl("http://172.20.5.5")).toBe(true);
    expect(isInternalUrl("http://172.31.255.255")).toBe(true);
  });

  it("returns false for 172.x outside the private range", () => {
    expect(isInternalUrl("http://172.15.0.1")).toBe(false);
    expect(isInternalUrl("http://172.32.0.1")).toBe(false);
  });

  it("returns true for *.internal hostnames", () => {
    expect(isInternalUrl("http://api.internal")).toBe(true);
    expect(isInternalUrl("http://service.corp.internal")).toBe(true);
  });

  it("returns true for *.local hostnames", () => {
    expect(isInternalUrl("http://myhost.local")).toBe(true);
    expect(isInternalUrl("http://printer.office.local:631")).toBe(true);
  });

  it("returns false for public domains", () => {
    expect(isInternalUrl("http://example.com")).toBe(false);
    expect(isInternalUrl("https://google.com")).toBe(false);
    expect(isInternalUrl("https://very-ai.eu/chat")).toBe(false);
  });

  it("returns true for invalid URLs (safe default)", () => {
    expect(isInternalUrl("not-a-url")).toBe(true);
    expect(isInternalUrl("")).toBe(true);
    expect(isInternalUrl("://missing-scheme")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeWhitespace
// ---------------------------------------------------------------------------
describe("normalizeWhitespace", () => {
  it("returns empty string for null", () => {
    expect(normalizeWhitespace(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeWhitespace("")).toBe("");
  });

  it("collapses multiple newlines to a single newline", () => {
    expect(normalizeWhitespace("a\n\n\nb")).toBe("a\nb");
    expect(normalizeWhitespace("a\r\n\r\nb")).toBe("a\nb");
  });

  it("collapses multiple spaces to a single space", () => {
    expect(normalizeWhitespace("a   b")).toBe("a b");
  });

  it("collapses tabs to a single space", () => {
    expect(normalizeWhitespace("a\t\tb")).toBe("a b");
  });

  it("collapses mixed spaces and tabs", () => {
    expect(normalizeWhitespace("a \t \t b")).toBe("a b");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello  ")).toBe("hello");
    expect(normalizeWhitespace("\n\nhello\n\n")).toBe("hello");
  });

  it("handles a combination of newlines, spaces, and tabs", () => {
    const input = "\n\n  Hello \t World \n\n\n Foo  Bar \n";
    const result = normalizeWhitespace(input);
    expect(result).toBe("Hello World \n Foo Bar");
  });
});

// ---------------------------------------------------------------------------
// removeNodesOfType
// ---------------------------------------------------------------------------
describe("removeNodesOfType", () => {
  function createDoc(html: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  }

  it("removes script elements", () => {
    const doc = createDoc(
      "<html><body><p>text</p><script>alert(1)</script></body></html>",
    );
    removeNodesOfType(doc, "script");
    expect(doc.getElementsByTagName("script").length).toBe(0);
    expect(doc.querySelector("p")?.textContent).toBe("text");
  });

  it("removes style elements", () => {
    const doc = createDoc(
      "<html><head><style>body{color:red}</style></head><body><p>visible</p></body></html>",
    );
    removeNodesOfType(doc, "style");
    expect(doc.getElementsByTagName("style").length).toBe(0);
    expect(doc.querySelector("p")?.textContent).toBe("visible");
  });

  it("removes svg elements", () => {
    const doc = createDoc(
      '<html><body><svg><circle r="5"/></svg><p>after</p></body></html>',
    );
    removeNodesOfType(doc, "svg");
    expect(doc.getElementsByTagName("svg").length).toBe(0);
    expect(doc.querySelector("p")?.textContent).toBe("after");
  });

  it("removes multiple types at once", () => {
    const doc = createDoc(
      "<html><body><script>x</script><style>.a{}</style><svg></svg><p>keep</p></body></html>",
    );
    removeNodesOfType(doc, "script", "style", "svg");
    expect(doc.getElementsByTagName("script").length).toBe(0);
    expect(doc.getElementsByTagName("style").length).toBe(0);
    expect(doc.getElementsByTagName("svg").length).toBe(0);
    expect(doc.querySelector("p")?.textContent).toBe("keep");
  });

  it("handles multiple elements of the same type", () => {
    const doc = createDoc(
      "<html><body><script>a</script><script>b</script><script>c</script></body></html>",
    );
    removeNodesOfType(doc, "script");
    expect(doc.getElementsByTagName("script").length).toBe(0);
  });

  it("does nothing when no elements of the given type exist", () => {
    const doc = createDoc("<html><body><p>hello</p></body></html>");
    removeNodesOfType(doc, "script", "style", "svg");
    expect(doc.querySelector("p")?.textContent).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------
describe("extractText", () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with extractTextOption = true", () => {
    it("strips script, style, svg, path elements and returns text content", () => {
      const html = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <script>alert('xss')</script>
            <style>.hidden { display: none }</style>
            <svg><path d="M0 0"/></svg>
            <p>Visible content</p>
          </body>
        </html>
      `;
      const result = extractText(true, html, mockLogger);
      expect(result.title).toBe("Test Page");
      expect(result.content).toContain("Visible content");
      expect(result.content).not.toContain("alert");
      expect(result.content).not.toContain("hidden");
    });

    it("normalizes whitespace in extracted text", () => {
      const html = `
        <html>
          <head><title>  Spaced   Title  </title></head>
          <body><p>  lots   of   spaces  </p></body>
        </html>
      `;
      const result = extractText(true, html, mockLogger);
      expect(result.title).toBe("Spaced Title");
      expect(result.content).toContain("lots of spaces");
    });

    it("returns empty content when body has no text", () => {
      const html =
        "<html><head><title>Empty</title></head><body><script>only script</script></body></html>";
      const result = extractText(true, html, mockLogger);
      expect(result.title).toBe("Empty");
      expect(result.content).toBe("");
    });

    it("returns empty title when no title element exists", () => {
      const html =
        "<html><head></head><body><p>No title here</p></body></html>";
      const result = extractText(true, html, mockLogger);
      expect(result.title).toBe("");
      expect(result.content).toContain("No title here");
    });
  });

  describe("with extractTextOption = false", () => {
    it("returns raw innerHTML and title", () => {
      const html = `
        <html>
          <head><title>Raw Page</title></head>
          <body><p>Some <strong>bold</strong> text</p></body>
        </html>
      `;
      const result = extractText(false, html, mockLogger);
      expect(result.title).toBe("Raw Page");
      expect(result.content).toContain("<p>");
      expect(result.content).toContain("<strong>bold</strong>");
    });

    it("preserves script and style tags in raw mode", () => {
      const html = `
        <html>
          <head><title>With Scripts</title></head>
          <body><script>var x = 1;</script><p>text</p></body>
        </html>
      `;
      const result = extractText(false, html, mockLogger);
      expect(result.content).toContain("<script>");
      expect(result.content).toContain("var x = 1;");
    });

    it("returns empty content when body is empty", () => {
      const html =
        "<html><head><title>No Body</title></head><body></body></html>";
      const result = extractText(false, html, mockLogger);
      expect(result.title).toBe("No Body");
      expect(result.content).toBe("");
    });
  });

  describe("error handling", () => {
    it("does not throw for valid HTML", () => {
      expect(() =>
        extractText(true, "<html><body>ok</body></html>", mockLogger),
      ).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// URL_REGEX
// ---------------------------------------------------------------------------
describe("URL_REGEX", () => {
  it("matches valid http URLs", () => {
    expect(URL_REGEX.test("http://example.com")).toBe(true);
    expect(URL_REGEX.test("http://example.com/path?q=1")).toBe(true);
  });

  it("matches valid https URLs", () => {
    expect(URL_REGEX.test("https://example.com")).toBe(true);
    expect(URL_REGEX.test("https://sub.example.com/path")).toBe(true);
  });

  it("rejects URLs without http(s) scheme", () => {
    expect(URL_REGEX.test("ftp://example.com")).toBe(false);
    expect(URL_REGEX.test("example.com")).toBe(false);
    expect(URL_REGEX.test("://example.com")).toBe(false);
  });

  it("rejects URLs containing spaces", () => {
    expect(URL_REGEX.test("http://example .com")).toBe(false);
    expect(URL_REGEX.test("https://example.com/path with spaces")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(URL_REGEX.test("")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(URL_REGEX.test("not a url")).toBe(false);
    expect(URL_REGEX.test("just-text")).toBe(false);
  });
});
