/** @jest-environment node */

import type { PiiDetectionResult, PiiEntity } from "./azure-pii-detection";

jest.mock("./azure-pii-detection", () => ({
  detectAndRedactPii: jest.fn(),
  detectAndRedactPiiBatch: jest.fn(),
}));
jest.mock("./presidio-pii-detection", () => ({
  detectAndRedactPii: jest.fn(),
  detectAndRedactPiiBatch: jest.fn(),
}));

import { detectAndRedactPii as detectAzureSingle } from "./azure-pii-detection";
import { detectAndRedactPiiBatch as detectAzureBatch } from "./azure-pii-detection";
import { detectAndRedactPii as detectPresidioSingle } from "./presidio-pii-detection";
import { detectAndRedactPiiBatch as detectPresidioBatch } from "./presidio-pii-detection";

import {
  isPiiEngineConfigured,
  detectPii,
  detectPiiBatch,
} from "./pii-detection";

const mockAzureSingle = detectAzureSingle as jest.MockedFunction<
  typeof detectAzureSingle
>;
const mockAzureBatch = detectAzureBatch as jest.MockedFunction<
  typeof detectAzureBatch
>;
const mockPresidioSingle = detectPresidioSingle as jest.MockedFunction<
  typeof detectPresidioSingle
>;
const mockPresidioBatch = detectPresidioBatch as jest.MockedFunction<
  typeof detectPresidioBatch
>;

function makeEntity(overrides: Partial<PiiEntity> = {}): PiiEntity {
  return {
    text: "John Doe",
    category: "Person",
    confidenceScore: 0.99,
    offset: 0,
    length: 8,
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<PiiDetectionResult> = {},
): PiiDetectionResult {
  return {
    originalText: "Hello John Doe",
    redactedText: "Hello [REDACTED]",
    entities: [makeEntity()],
    ...overrides,
  };
}

describe("pii-detection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AZURE_PII_ENDPOINT;
    delete process.env.AZURE_PII_API_KEY;
    delete process.env.PRESIDIO_ANALYZER_ENDPOINT;
    delete process.env.PRESIDIO_ANONYMIZER_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // isPiiEngineConfigured
  // ---------------------------------------------------------------------------
  describe("isPiiEngineConfigured", () => {
    it("returns true for azure when both AZURE_PII_ENDPOINT and AZURE_PII_API_KEY are set", () => {
      process.env.AZURE_PII_ENDPOINT = "https://azure.example.com";
      process.env.AZURE_PII_API_KEY = "secret-key";

      expect(isPiiEngineConfigured("azure")).toBe(true);
    });

    it("returns false for azure when AZURE_PII_ENDPOINT is missing", () => {
      process.env.AZURE_PII_API_KEY = "secret-key";

      expect(isPiiEngineConfigured("azure")).toBe(false);
    });

    it("returns false for azure when AZURE_PII_API_KEY is missing", () => {
      process.env.AZURE_PII_ENDPOINT = "https://azure.example.com";

      expect(isPiiEngineConfigured("azure")).toBe(false);
    });

    it("returns false for azure when both env vars are missing", () => {
      expect(isPiiEngineConfigured("azure")).toBe(false);
    });

    it("returns true for presidio when both endpoints are set", () => {
      process.env.PRESIDIO_ANALYZER_ENDPOINT = "http://analyzer:5001";
      process.env.PRESIDIO_ANONYMIZER_ENDPOINT = "http://anonymizer:5002";

      expect(isPiiEngineConfigured("presidio")).toBe(true);
    });

    it("returns false for presidio when PRESIDIO_ANALYZER_ENDPOINT is missing", () => {
      process.env.PRESIDIO_ANONYMIZER_ENDPOINT = "http://anonymizer:5002";

      expect(isPiiEngineConfigured("presidio")).toBe(false);
    });

    it("returns false for presidio when PRESIDIO_ANONYMIZER_ENDPOINT is missing", () => {
      process.env.PRESIDIO_ANALYZER_ENDPOINT = "http://analyzer:5001";

      expect(isPiiEngineConfigured("presidio")).toBe(false);
    });

    it("returns false for presidio when both env vars are missing", () => {
      expect(isPiiEngineConfigured("presidio")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // detectPii
  // ---------------------------------------------------------------------------
  describe("detectPii", () => {
    it("routes to azure engine by default", async () => {
      const expected = makeResult();
      mockAzureSingle.mockResolvedValue(expected);

      const result = await detectPii("azure", "Hello John Doe");

      expect(mockAzureSingle).toHaveBeenCalledWith(
        "Hello John Doe",
        undefined,
        undefined,
      );
      expect(mockPresidioSingle).not.toHaveBeenCalled();
      expect(result.originalText).toBe("Hello John Doe");
    });

    it("routes to presidio when engine is presidio", async () => {
      const expected = makeResult();
      mockPresidioSingle.mockResolvedValue(expected);

      const result = await detectPii("presidio", "Hello John Doe");

      expect(mockPresidioSingle).toHaveBeenCalledWith(
        "Hello John Doe",
        undefined,
        undefined,
      );
      expect(mockAzureSingle).not.toHaveBeenCalled();
      expect(result.originalText).toBe("Hello John Doe");
    });

    it("passes language to azure and converts null to undefined", async () => {
      mockAzureSingle.mockResolvedValue(makeResult());

      await detectPii("azure", "text", null);

      expect(mockAzureSingle).toHaveBeenCalledWith(
        "text",
        undefined,
        undefined,
      );
    });

    it("passes a defined language string to azure", async () => {
      mockAzureSingle.mockResolvedValue(makeResult());

      await detectPii("azure", "text", "de");

      expect(mockAzureSingle).toHaveBeenCalledWith("text", "de", undefined);
    });

    it("passes language to presidio (including null)", async () => {
      mockPresidioSingle.mockResolvedValue(makeResult());

      await detectPii("presidio", "text", null);

      expect(mockPresidioSingle).toHaveBeenCalledWith("text", null, undefined);
    });

    it("passes a defined language string to presidio", async () => {
      mockPresidioSingle.mockResolvedValue(makeResult());

      await detectPii("presidio", "text", "en");

      expect(mockPresidioSingle).toHaveBeenCalledWith("text", "en", undefined);
    });

    it("passes piiCategories through to the underlying engine", async () => {
      const categories = ["Person", "Email"];
      const personEntity = makeEntity({ category: "Person" });
      const emailEntity = makeEntity({
        category: "Email",
        text: "john@test.com",
      });
      mockAzureSingle.mockResolvedValue(
        makeResult({ entities: [personEntity, emailEntity] }),
      );

      await detectPii("azure", "text", undefined, categories);

      expect(mockAzureSingle).toHaveBeenCalledWith(
        "text",
        undefined,
        categories,
      );
    });

    it("filters entities by allowed categories", async () => {
      const personEntity = makeEntity({ category: "Person" });
      const emailEntity = makeEntity({
        category: "Email",
        text: "john@test.com",
      });
      const phoneEntity = makeEntity({
        category: "PhoneNumber",
        text: "555-0100",
      });
      mockAzureSingle.mockResolvedValue(
        makeResult({ entities: [personEntity, emailEntity, phoneEntity] }),
      );

      const result = await detectPii("azure", "text", undefined, [
        "Person",
        "Email",
      ]);

      expect(result.entities).toHaveLength(2);
      expect(result.entities).toEqual(
        expect.arrayContaining([personEntity, emailEntity]),
      );
      expect(result.entities).not.toEqual(
        expect.arrayContaining([phoneEntity]),
      );
    });

    it("returns all entities when no categories filter is provided", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
        makeEntity({ category: "PhoneNumber" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text");

      expect(result.entities).toHaveLength(3);
      expect(result.entities).toEqual(entities);
    });

    it("returns all entities when categories filter is an empty array", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, []);

      expect(result.entities).toHaveLength(2);
      expect(result.entities).toEqual(entities);
    });

    it("returns empty entities when no entities match the category filter", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, [
        "PhoneNumber",
      ]);

      expect(result.entities).toHaveLength(0);
    });

    it("preserves originalText and redactedText from the engine result", async () => {
      mockPresidioSingle.mockResolvedValue(
        makeResult({
          originalText: "My email is john@test.com",
          redactedText: "My email is [REDACTED]",
        }),
      );

      const result = await detectPii("presidio", "My email is john@test.com");

      expect(result.originalText).toBe("My email is john@test.com");
      expect(result.redactedText).toBe("My email is [REDACTED]");
    });
  });

  // ---------------------------------------------------------------------------
  // detectPiiBatch
  // ---------------------------------------------------------------------------
  describe("detectPiiBatch", () => {
    it("routes to azure batch for azure engine", async () => {
      const results = [makeResult(), makeResult()];
      mockAzureBatch.mockResolvedValue(results);

      const texts = ["text one", "text two"];
      const output = await detectPiiBatch("azure", texts);

      expect(mockAzureBatch).toHaveBeenCalledWith(texts, undefined, undefined);
      expect(mockPresidioBatch).not.toHaveBeenCalled();
      expect(output).toHaveLength(2);
    });

    it("routes to presidio batch for presidio engine", async () => {
      const results = [makeResult()];
      mockPresidioBatch.mockResolvedValue(results);

      const texts = ["some text"];
      const output = await detectPiiBatch("presidio", texts);

      expect(mockPresidioBatch).toHaveBeenCalledWith(
        texts,
        undefined,
        undefined,
      );
      expect(mockAzureBatch).not.toHaveBeenCalled();
      expect(output).toHaveLength(1);
    });

    it("passes language to azure batch and converts null to undefined", async () => {
      mockAzureBatch.mockResolvedValue([]);

      await detectPiiBatch("azure", ["text"], null);

      expect(mockAzureBatch).toHaveBeenCalledWith(
        ["text"],
        undefined,
        undefined,
      );
    });

    it("passes language to presidio batch (including null)", async () => {
      mockPresidioBatch.mockResolvedValue([]);

      await detectPiiBatch("presidio", ["text"], null);

      expect(mockPresidioBatch).toHaveBeenCalledWith(["text"], null, undefined);
    });

    it("passes piiCategories through to the batch engine", async () => {
      const categories = ["Person"];
      mockAzureBatch.mockResolvedValue([
        makeResult({ entities: [makeEntity({ category: "Person" })] }),
      ]);

      await detectPiiBatch("azure", ["text"], "en", categories);

      expect(mockAzureBatch).toHaveBeenCalledWith(["text"], "en", categories);
    });

    it("filters entities per result in the batch", async () => {
      const result1 = makeResult({
        entities: [
          makeEntity({ category: "Person" }),
          makeEntity({ category: "Email" }),
        ],
      });
      const result2 = makeResult({
        entities: [
          makeEntity({ category: "PhoneNumber" }),
          makeEntity({ category: "Person" }),
        ],
      });
      mockAzureBatch.mockResolvedValue([result1, result2]);

      const output = await detectPiiBatch(
        "azure",
        ["text1", "text2"],
        undefined,
        ["Person"],
      );

      expect(output[0].entities).toHaveLength(1);
      expect(output[0].entities[0].category).toBe("Person");
      expect(output[1].entities).toHaveLength(1);
      expect(output[1].entities[0].category).toBe("Person");
    });

    it("handles empty texts array", async () => {
      mockAzureBatch.mockResolvedValue([]);

      const output = await detectPiiBatch("azure", []);

      expect(mockAzureBatch).toHaveBeenCalledWith([], undefined, undefined);
      expect(output).toEqual([]);
    });

    it("returns all entities when no categories filter for batch", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
        makeEntity({ category: "PhoneNumber" }),
      ];
      mockPresidioBatch.mockResolvedValue([makeResult({ entities })]);

      const output = await detectPiiBatch("presidio", ["text"]);

      expect(output[0].entities).toHaveLength(3);
    });

    it("returns all entities when categories is an empty array for batch", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
      ];
      mockPresidioBatch.mockResolvedValue([makeResult({ entities })]);

      const output = await detectPiiBatch("presidio", ["text"], undefined, []);

      expect(output[0].entities).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // filterEntitiesByCategory (tested indirectly via detectPii / detectPiiBatch)
  // ---------------------------------------------------------------------------
  describe("filterEntitiesByCategory (indirect)", () => {
    it("returns all entities when allowedCategories is undefined", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text");

      expect(result.entities).toEqual(entities);
    });

    it("returns all entities when allowedCategories is empty", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "PhoneNumber" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, []);

      expect(result.entities).toEqual(entities);
    });

    it("filters to only matching categories", async () => {
      const personEntity = makeEntity({ category: "Person" });
      const emailEntity = makeEntity({ category: "Email" });
      const phoneEntity = makeEntity({ category: "PhoneNumber" });
      mockAzureSingle.mockResolvedValue(
        makeResult({ entities: [personEntity, emailEntity, phoneEntity] }),
      );

      const result = await detectPii("azure", "text", undefined, [
        "Person",
        "PhoneNumber",
      ]);

      expect(result.entities).toHaveLength(2);
      expect(result.entities).toContainEqual(personEntity);
      expect(result.entities).toContainEqual(phoneEntity);
      expect(result.entities).not.toContainEqual(emailEntity);
    });

    it("returns empty array when no entities match categories", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, [
        "CreditCardNumber",
      ]);

      expect(result.entities).toEqual([]);
    });

    it("handles category filtering with a single category", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "Email" }),
        makeEntity({ category: "Person", text: "Jane Doe" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, ["Person"]);

      expect(result.entities).toHaveLength(2);
      result.entities.forEach(e => expect(e.category).toBe("Person"));
    });

    it("category filtering is case-sensitive", async () => {
      const entities = [
        makeEntity({ category: "Person" }),
        makeEntity({ category: "person" }),
      ];
      mockAzureSingle.mockResolvedValue(makeResult({ entities }));

      const result = await detectPii("azure", "text", undefined, ["Person"]);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].category).toBe("Person");
    });
  });
});
