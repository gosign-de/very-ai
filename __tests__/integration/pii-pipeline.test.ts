/** @jest-environment node */

/**
 * Integration tests for the full PII re-anonymization pipeline.
 *
 * Strategy: use REAL implementations of the pure token-mapping functions
 * (createTokenMapping, maskTextWithTokens, serializeTokenMap) and only
 * mock the external boundaries — the detection engines that call Azure /
 * Presidio APIs, and the logger (which writes to disk).
 */

// ---------------------------------------------------------------------------
// Mocks — external boundaries only
// ---------------------------------------------------------------------------

const mockAzureDetect = jest.fn();
const mockAzureDetectBatch = jest.fn();
jest.mock("@/lib/azure-pii-detection", () => ({
  detectAndRedactPii: (...args: any[]) => mockAzureDetect(...args),
  detectAndRedactPiiBatch: (...args: any[]) => mockAzureDetectBatch(...args),
}));

const mockPresidioDetect = jest.fn();
const mockPresidioDetectBatch = jest.fn();
jest.mock("@/lib/presidio-pii-detection", () => ({
  detectAndRedactPii: (...args: any[]) => mockPresidioDetect(...args),
  detectAndRedactPiiBatch: (...args: any[]) => mockPresidioDetectBatch(...args),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks so module-level calls use the mocked versions
// ---------------------------------------------------------------------------

import { processUserMessage } from "@/lib/pii-message-processor";
import {
  createTokenMapping,
  maskTextWithTokens,
  serializeTokenMap,
} from "@/lib/pii-token-mapping";
import type { PiiEntity } from "@/lib/pii-detection";
import type { PiiDetectionResult } from "@/lib/azure-pii-detection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entity(
  text: string,
  category: string,
  offset: number,
  opts: Partial<PiiEntity> = {},
): PiiEntity {
  return {
    text,
    category,
    subcategory: undefined,
    confidenceScore: 0.95,
    offset,
    length: text.length,
    ...opts,
  };
}

function azureResult(
  originalText: string,
  entities: PiiEntity[],
): PiiDetectionResult {
  return {
    originalText,
    redactedText: originalText, // detection engine redaction not used by pipeline
    entities,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PII Pipeline Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Detection -> Masking -> Re-identification pipeline
  // =========================================================================

  describe("Detection -> Masking -> Re-identification pipeline", () => {
    it("masks a single person name and stores original in token map", async () => {
      const content = "My name is Hans Mueller.";
      const entities = [entity("Hans Mueller", "Person", 11)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // The redacted content should contain a Person token
      expect(result.redactedContent).toMatch(/\[Person_[a-f0-9]{4}\]/);
      expect(result.redactedContent).not.toContain("Hans Mueller");

      // Token map should contain the original value
      const tokenMap = JSON.parse(result.tokenMap);
      const values = Object.values(tokenMap) as string[];
      expect(values).toContain("Hans Mueller");
    });

    it("masks an email address and creates a token map entry", async () => {
      const content = "Contact me at hans@example.com please.";
      const entities = [entity("hans@example.com", "Email", 14)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      expect(result.redactedContent).toMatch(/\[Email_[a-f0-9]{4}\]/);
      expect(result.redactedContent).not.toContain("hans@example.com");

      const tokenMap = JSON.parse(result.tokenMap);
      const values = Object.values(tokenMap) as string[];
      expect(values).toContain("hans@example.com");
    });

    it("masks multiple PII types in one message and stores all in token map", async () => {
      const content =
        "Send to Hans Mueller at hans@example.com from 192.168.1.1";
      const entities = [
        entity("Hans Mueller", "Person", 8),
        entity("hans@example.com", "Email", 24),
        entity("192.168.1.1", "IPAddress", 46),
      ];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // All PII should be masked
      expect(result.redactedContent).not.toContain("Hans Mueller");
      expect(result.redactedContent).not.toContain("hans@example.com");
      expect(result.redactedContent).not.toContain("192.168.1.1");

      // All three tokens should exist
      expect(result.redactedContent).toMatch(/\[Person_[a-f0-9]{4}\]/);
      expect(result.redactedContent).toMatch(/\[Email_[a-f0-9]{4}\]/);
      expect(result.redactedContent).toMatch(/\[IPAddress_[a-f0-9]{4}\]/);

      // Token map should contain all three originals
      const tokenMap = JSON.parse(result.tokenMap);
      const values = Object.values(tokenMap) as string[];
      expect(values).toContain("Hans Mueller");
      expect(values).toContain("hans@example.com");
      expect(values).toContain("192.168.1.1");
      expect(Object.keys(tokenMap)).toHaveLength(3);
    });

    it("uses the same token for identical names appearing twice (deterministic)", async () => {
      const content = "Hans Mueller called. Then Hans Mueller left.";
      const entities = [
        entity("Hans Mueller", "Person", 0),
        entity("Hans Mueller", "Person", 25),
      ];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // Extract the token used — there should be exactly one unique Person token
      const personTokens = result.redactedContent.match(
        /\[Person_[a-f0-9]{4}\]/g,
      );
      expect(personTokens).toHaveLength(2);
      expect(personTokens![0]).toBe(personTokens![1]);

      // Token map should only have one entry (deduplicated)
      const tokenMap = JSON.parse(result.tokenMap);
      expect(Object.keys(tokenMap)).toHaveLength(1);
    });

    it("returns content unchanged and empty token map when no PII detected", async () => {
      const content = "Hello world, no sensitive data here.";
      mockAzureDetect.mockResolvedValue(azureResult(content, []));

      const result = await processUserMessage(content);

      expect(result.redactedContent).toBe(content);
      expect(result.piiEntities).toEqual([]);
      expect(result.tokenMap).toBe("{}");
      expect(result.tokenMetadata).toEqual([]);
    });

    it("masks mixed PII: person name + email in a single sentence", async () => {
      const content = "Send to Hans Mueller at hans@example.com";
      const entities = [
        entity("Hans Mueller", "Person", 8),
        entity("hans@example.com", "Email", 24),
      ];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // Verify both are masked
      expect(result.redactedContent).not.toContain("Hans Mueller");
      expect(result.redactedContent).not.toContain("hans@example.com");

      // Verify the non-PII parts remain
      expect(result.redactedContent).toContain("Send to ");
      expect(result.redactedContent).toContain(" at ");
    });
  });

  // =========================================================================
  // Token mapping consistency (real implementations)
  // =========================================================================

  describe("Token mapping consistency", () => {
    it("token map is serializable as valid JSON", async () => {
      const content = "My name is Max Mustermann.";
      const entities = [entity("Max Mustermann", "Person", 11)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      expect(() => JSON.parse(result.tokenMap)).not.toThrow();
      const parsed = JSON.parse(result.tokenMap);
      expect(typeof parsed).toBe("object");
    });

    it("token metadata entries have correct category, original text, and position", async () => {
      const content = "Contact alice@test.de for info.";
      const entities = [entity("alice@test.de", "Email", 8)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      expect(result.tokenMetadata).toHaveLength(1);
      const meta = result.tokenMetadata[0];
      expect(meta.category).toBe("Email");
      expect(meta.originalValue).toBe("alice@test.de");
      expect(meta.position).toBe(8);
      expect(meta.confidenceScore).toBe(0.95);
      expect(meta.token).toMatch(/\[Email_[a-f0-9]{4}\]/);
    });

    it("tokens are deterministic — same input always produces same token", async () => {
      // Call the REAL createTokenMapping twice with identical input
      const entities1 = [entity("Max", "Person", 0)];
      const entities2 = [entity("Max", "Person", 5)]; // different offset, same text + category

      const result1 = createTokenMapping(entities1);
      const result2 = createTokenMapping(entities2);

      // Same name+category => same token string
      expect(result1.metadata[0].token).toBe(result2.metadata[0].token);
    });

    it("different values produce different tokens", () => {
      const entitiesA = [entity("Alice", "Person", 0)];
      const entitiesB = [entity("Bob", "Person", 0)];

      const resultA = createTokenMapping(entitiesA);
      const resultB = createTokenMapping(entitiesB);

      expect(resultA.metadata[0].token).not.toBe(resultB.metadata[0].token);
    });

    it("serializeTokenMap produces a round-trippable JSON string", () => {
      const map = {
        "[Person_abcd]": "Alice",
        "[Email_1234]": "alice@test.com",
      };
      const serialized = serializeTokenMap(map);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(map);
    });

    it("maskTextWithTokens replaces at correct offsets without corrupting surrounding text", () => {
      const text = "Hi Alice, meet Bob.";
      const entities = [
        entity("Alice", "Person", 3),
        entity("Bob", "Person", 15),
      ];
      const { tokenMap } = createTokenMapping(entities);
      const masked = maskTextWithTokens(text, entities, tokenMap);

      expect(masked).not.toContain("Alice");
      expect(masked).not.toContain("Bob");
      expect(masked).toContain("Hi ");
      expect(masked).toContain(", meet ");
      expect(masked).toContain(".");
    });
  });

  // =========================================================================
  // Pipeline error handling
  // =========================================================================

  describe("Pipeline error handling", () => {
    it("returns original content safely when detection engine throws", async () => {
      const content = "Secret: my SSN is 123-45-6789";
      mockAzureDetect.mockRejectedValue(new Error("Azure API unavailable"));

      const result = await processUserMessage(content);

      expect(result.originalContent).toBe(content);
      expect(result.redactedContent).toBe(content);
      expect(result.piiEntities).toEqual([]);
      expect(result.tokenMap).toBe("{}");
      expect(result.tokenMetadata).toEqual([]);
    });

    it("returns original content when detection returns empty entities", async () => {
      const content = "Just a normal message.";
      mockAzureDetect.mockResolvedValue(azureResult(content, []));

      const result = await processUserMessage(content);

      expect(result.redactedContent).toBe(content);
      expect(result.piiEntities).toEqual([]);
    });

    it("handles non-Error throwables gracefully", async () => {
      const content = "Some text";
      mockAzureDetect.mockRejectedValue("string-based error");

      const result = await processUserMessage(content);

      expect(result.redactedContent).toBe(content);
      expect(result.piiEntities).toEqual([]);
      expect(result.tokenMap).toBe("{}");
    });
  });

  // =========================================================================
  // Per-engine routing
  // =========================================================================

  describe("Per-engine routing", () => {
    it("uses Azure engine by default", async () => {
      const content = "Test message.";
      mockAzureDetect.mockResolvedValue(azureResult(content, []));

      await processUserMessage(content);

      expect(mockAzureDetect).toHaveBeenCalledTimes(1);
      expect(mockPresidioDetect).not.toHaveBeenCalled();
    });

    it("uses Presidio engine when specified", async () => {
      const content = "Test message.";
      mockPresidioDetect.mockResolvedValue(azureResult(content, []));

      await processUserMessage(content, undefined, undefined, "presidio");

      expect(mockPresidioDetect).toHaveBeenCalledTimes(1);
      expect(mockAzureDetect).not.toHaveBeenCalled();
    });

    it("both engines produce compatible output that flows through the pipeline", async () => {
      const content = "My name is Maria Schmidt.";
      const entities = [entity("Maria Schmidt", "Person", 11)];

      // Azure path
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));
      const azureResult_ = await processUserMessage(
        content,
        "de",
        undefined,
        "azure",
      );

      jest.clearAllMocks();

      // Presidio path
      mockPresidioDetect.mockResolvedValue(azureResult(content, entities));
      const presidioResult = await processUserMessage(
        content,
        "de",
        undefined,
        "presidio",
      );

      // Both should produce the same masking (same input entities)
      expect(azureResult_.redactedContent).toBe(presidioResult.redactedContent);
      expect(azureResult_.tokenMap).toBe(presidioResult.tokenMap);
    });
  });

  // =========================================================================
  // End-to-end data flow verification
  // =========================================================================

  describe("End-to-end data flow verification", () => {
    it("originalContent always preserves the raw user input", async () => {
      const content = "Call me at 0171-1234567, my name is Anna.";
      const entities = [
        entity("0171-1234567", "PhoneNumber", 11),
        entity("Anna", "Person", 36),
      ];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      expect(result.originalContent).toBe(content);
    });

    it("piiEntities in result match what the detection engine returned", async () => {
      const content = "Email: bob@corp.de";
      const entities = [entity("bob@corp.de", "Email", 7)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      expect(result.piiEntities).toEqual(entities);
    });

    it("token metadata count matches entity count (including duplicates)", async () => {
      const content = "Alice met Alice again.";
      const entities = [
        entity("Alice", "Person", 0),
        entity("Alice", "Person", 10),
      ];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // Two metadata entries (one per occurrence)
      expect(result.tokenMetadata).toHaveLength(2);
      // But only one entry in the token map (deduplicated)
      const tokenMap = JSON.parse(result.tokenMap);
      expect(Object.keys(tokenMap)).toHaveLength(1);
    });

    it("redacted content length differs from original when PII is replaced", async () => {
      const content = "Contact Hans Mueller for details.";
      const entities = [entity("Hans Mueller", "Person", 8)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      const result = await processUserMessage(content);

      // Token "[Person_XXXX]" is 14 chars, "Hans Mueller" is 12 chars -> lengths differ
      expect(result.redactedContent.length).not.toBe(content.length);
    });

    it("passes language and piiCategories through the full pipeline", async () => {
      const content = "Herr Schmidt lebt in Berlin.";
      const entities = [entity("Schmidt", "Person", 5)];
      mockAzureDetect.mockResolvedValue(azureResult(content, entities));

      await processUserMessage(content, "de", ["Person"]);

      expect(mockAzureDetect).toHaveBeenCalledWith(content, "de", ["Person"]);
    });
  });
});
