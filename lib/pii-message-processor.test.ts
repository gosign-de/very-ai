/** @jest-environment node */

import type { PiiEntity } from "./pii-detection";
import type { TokenMapping, TokenMetadata } from "./pii-token-mapping";

// --- Mocks ---

const mockDetectPii = jest.fn();
jest.mock("./pii-detection", () => ({
  detectPii: (...args: any[]) => mockDetectPii(...args),
}));

const mockCreateTokenMapping = jest.fn();
const mockMaskTextWithTokens = jest.fn();
const mockSerializeTokenMap = jest.fn();
jest.mock("./pii-token-mapping", () => ({
  createTokenMapping: (...args: any[]) => mockCreateTokenMapping(...args),
  maskTextWithTokens: (...args: any[]) => mockMaskTextWithTokens(...args),
  serializeTokenMap: (...args: any[]) => mockSerializeTokenMap(...args),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import { processUserMessage } from "./pii-message-processor";
import { createLogger } from "@/lib/logger";

// Capture the logger instance created during module initialization (before clearAllMocks).
const mockLoggerInstance = (createLogger as jest.Mock).mock.results[0]
  ?.value as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

// --- Helpers ---

function makePiiEntity(overrides: Partial<PiiEntity> = {}): PiiEntity {
  return {
    text: "Max Mustermann",
    category: "Person",
    subcategory: undefined,
    confidenceScore: 0.95,
    offset: 14,
    length: 14,
    ...overrides,
  };
}

function setupSuccessMocks(
  options: {
    entities?: PiiEntity[];
    tokenMap?: TokenMapping;
    metadata?: TokenMetadata[];
    maskedContent?: string;
    serialized?: string;
  } = {},
) {
  const entities = options.entities ?? [makePiiEntity()];
  const tokenMap: TokenMapping = options.tokenMap ?? {
    "[Person_f57a]": "Max Mustermann",
  };
  const metadata: TokenMetadata[] = options.metadata ?? [
    {
      token: "[Person_f57a]",
      originalValue: "Max Mustermann",
      category: "Person",
      subcategory: undefined,
      confidenceScore: 0.95,
      position: 14,
    },
  ];
  const maskedContent = options.maskedContent ?? "My name is [Person_f57a].";
  const serialized = options.serialized ?? JSON.stringify(tokenMap);

  mockDetectPii.mockResolvedValue({
    originalText: "My name is Max Mustermann.",
    redactedText: "My name is ***.",
    entities,
  });
  mockCreateTokenMapping.mockReturnValue({ tokenMap, metadata });
  mockMaskTextWithTokens.mockReturnValue(maskedContent);
  mockSerializeTokenMap.mockReturnValue(serialized);

  return { entities, tokenMap, metadata, maskedContent, serialized };
}

// --- Tests ---

describe("processUserMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Success flow
  // =========================================================================
  describe("success flow", () => {
    it("calls detectPii with correct engine, content, language, and categories", async () => {
      setupSuccessMocks();

      await processUserMessage(
        "My name is Max Mustermann.",
        "en",
        ["Person", "Email"],
        "azure",
      );

      expect(mockDetectPii).toHaveBeenCalledWith(
        "azure",
        "My name is Max Mustermann.",
        "en",
        ["Person", "Email"],
      );
    });

    it("defaults to 'azure' engine when not specified", async () => {
      setupSuccessMocks();

      await processUserMessage("Hello world");

      expect(mockDetectPii).toHaveBeenCalledWith(
        "azure",
        "Hello world",
        undefined,
        undefined,
      );
    });

    it("uses 'presidio' engine when specified", async () => {
      setupSuccessMocks();

      await processUserMessage("Hello world", undefined, undefined, "presidio");

      expect(mockDetectPii).toHaveBeenCalledWith(
        "presidio",
        "Hello world",
        undefined,
        undefined,
      );
    });

    it("passes detected entities to createTokenMapping", async () => {
      const entities = [
        makePiiEntity({ text: "Alice", offset: 0, length: 5 }),
        makePiiEntity({
          text: "bob@test.com",
          category: "Email",
          offset: 20,
          length: 12,
        }),
      ];
      setupSuccessMocks({ entities });

      await processUserMessage("Alice sent mail to bob@test.com");

      expect(mockCreateTokenMapping).toHaveBeenCalledWith(entities);
    });

    it("passes content, entities, and tokenMap to maskTextWithTokens", async () => {
      const entities = [makePiiEntity()];
      const tokenMap = { "[Person_abcd]": "Max Mustermann" };
      setupSuccessMocks({ entities, tokenMap });

      const content = "My name is Max Mustermann.";
      await processUserMessage(content);

      expect(mockMaskTextWithTokens).toHaveBeenCalledWith(
        content,
        entities,
        tokenMap,
      );
    });

    it("calls serializeTokenMap with the tokenMap", async () => {
      const tokenMap = { "[Person_abcd]": "Max Mustermann" };
      setupSuccessMocks({ tokenMap });

      await processUserMessage("My name is Max Mustermann.");

      expect(mockSerializeTokenMap).toHaveBeenCalledWith(tokenMap);
    });

    it("returns correct ProcessedMessage shape", async () => {
      setupSuccessMocks();

      const result = await processUserMessage("My name is Max Mustermann.");

      expect(result).toHaveProperty("originalContent");
      expect(result).toHaveProperty("redactedContent");
      expect(result).toHaveProperty("piiEntities");
      expect(result).toHaveProperty("tokenMap");
      expect(result).toHaveProperty("tokenMetadata");
    });

    it("returns originalContent unchanged", async () => {
      setupSuccessMocks();
      const content = "My name is Max Mustermann.";

      const result = await processUserMessage(content);

      expect(result.originalContent).toBe(content);
    });

    it("returns redactedContent from maskTextWithTokens", async () => {
      const maskedContent = "My name is [Person_f57a].";
      setupSuccessMocks({ maskedContent });

      const result = await processUserMessage("My name is Max Mustermann.");

      expect(result.redactedContent).toBe(maskedContent);
    });

    it("returns piiEntities from detection result", async () => {
      const entities = [makePiiEntity({ text: "Alice", offset: 0, length: 5 })];
      setupSuccessMocks({ entities });

      const result = await processUserMessage("Alice is here.");

      expect(result.piiEntities).toEqual(entities);
    });

    it("returns serialized tokenMap", async () => {
      const serialized = '{"[Person_abcd]":"Max Mustermann"}';
      setupSuccessMocks({ serialized });

      const result = await processUserMessage("My name is Max Mustermann.");

      expect(result.tokenMap).toBe(serialized);
    });

    it("returns metadata from createTokenMapping", async () => {
      const metadata: TokenMetadata[] = [
        {
          token: "[Person_abcd]",
          originalValue: "Max Mustermann",
          category: "Person",
          subcategory: undefined,
          confidenceScore: 0.95,
          position: 14,
        },
      ];
      setupSuccessMocks({ metadata });

      const result = await processUserMessage("My name is Max Mustermann.");

      expect(result.tokenMetadata).toEqual(metadata);
    });
  });

  // =========================================================================
  // No PII detected
  // =========================================================================
  describe("no PII detected", () => {
    it("handles empty entities array", async () => {
      setupSuccessMocks({
        entities: [],
        tokenMap: {},
        metadata: [],
        maskedContent: "Hello world, no PII here.",
        serialized: "{}",
      });

      const result = await processUserMessage("Hello world, no PII here.");

      expect(result.piiEntities).toEqual([]);
      expect(result.tokenMetadata).toEqual([]);
      expect(result.tokenMap).toBe("{}");
    });

    it("returns content as redactedContent when no PII found", async () => {
      const content = "Just a normal message.";
      setupSuccessMocks({
        entities: [],
        tokenMap: {},
        metadata: [],
        maskedContent: content,
        serialized: "{}",
      });

      const result = await processUserMessage(content);

      expect(result.redactedContent).toBe(content);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe("error handling", () => {
    it("returns fallback when detectPii throws", async () => {
      mockDetectPii.mockRejectedValue(new Error("Azure API timeout"));

      const result = await processUserMessage("My name is Max Mustermann.");

      expect(result).toBeDefined();
      expect(result.piiEntities).toEqual([]);
    });

    it("fallback has originalContent equal to content", async () => {
      mockDetectPii.mockRejectedValue(new Error("Network failure"));
      const content = "Sensitive data here.";

      const result = await processUserMessage(content);

      expect(result.originalContent).toBe(content);
    });

    it("fallback has redactedContent equal to raw content", async () => {
      mockDetectPii.mockRejectedValue(new Error("Service unavailable"));
      const content = "My SSN is 123-45-6789.";

      const result = await processUserMessage(content);

      expect(result.redactedContent).toBe(content);
    });

    it("fallback has empty piiEntities", async () => {
      mockDetectPii.mockRejectedValue(new Error("Crash"));

      const result = await processUserMessage("test");

      expect(result.piiEntities).toEqual([]);
    });

    it('fallback has tokenMap equal to "{}"', async () => {
      mockDetectPii.mockRejectedValue(new Error("Crash"));

      const result = await processUserMessage("test");

      expect(result.tokenMap).toBe("{}");
    });

    it("fallback has empty tokenMetadata", async () => {
      mockDetectPii.mockRejectedValue(new Error("Crash"));

      const result = await processUserMessage("test");

      expect(result.tokenMetadata).toEqual([]);
    });

    it("logs error on failure", async () => {
      const error = new Error("Detection failed");
      mockDetectPii.mockRejectedValue(error);

      await processUserMessage("test");

      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        "Error processing user message for PII",
        { error: { message: "Detection failed", name: "Error" } },
      );
    });

    it("logs non-Error throwables correctly", async () => {
      mockDetectPii.mockRejectedValue("string error");

      await processUserMessage("test");

      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        "Error processing user message for PII",
        { error: "string error" },
      );
    });

    it("returns fallback when createTokenMapping throws", async () => {
      mockDetectPii.mockResolvedValue({
        originalText: "test",
        redactedText: "test",
        entities: [makePiiEntity()],
      });
      mockCreateTokenMapping.mockImplementation(() => {
        throw new Error("Mapping failure");
      });

      const result = await processUserMessage("test");

      expect(result.piiEntities).toEqual([]);
      expect(result.tokenMap).toBe("{}");
      expect(result.tokenMetadata).toEqual([]);
    });
  });

  // =========================================================================
  // Parameter passing
  // =========================================================================
  describe("parameter passing", () => {
    it("passes language through to detectPii", async () => {
      setupSuccessMocks();

      await processUserMessage("Mein Name ist Max.", "de");

      expect(mockDetectPii).toHaveBeenCalledWith(
        "azure",
        "Mein Name ist Max.",
        "de",
        undefined,
      );
    });

    it("passes piiCategories through to detectPii", async () => {
      setupSuccessMocks();

      await processUserMessage("test", undefined, ["Person", "PhoneNumber"]);

      expect(mockDetectPii).toHaveBeenCalledWith("azure", "test", undefined, [
        "Person",
        "PhoneNumber",
      ]);
    });

    it("handles undefined language", async () => {
      setupSuccessMocks();

      await processUserMessage("test", undefined);

      expect(mockDetectPii).toHaveBeenCalledWith(
        "azure",
        "test",
        undefined,
        undefined,
      );
    });

    it("handles undefined piiCategories", async () => {
      setupSuccessMocks();

      await processUserMessage("test", "en", undefined);

      expect(mockDetectPii).toHaveBeenCalledWith(
        "azure",
        "test",
        "en",
        undefined,
      );
    });

    it("passes all parameters together correctly", async () => {
      setupSuccessMocks();

      await processUserMessage("Hello", "fr", ["Email"], "presidio");

      expect(mockDetectPii).toHaveBeenCalledWith("presidio", "Hello", "fr", [
        "Email",
      ]);
    });
  });
});
