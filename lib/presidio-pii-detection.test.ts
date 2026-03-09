/** @jest-environment node */

import type { PiiDetectionResult } from "./azure-pii-detection";

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ANALYZER_ENDPOINT = "http://localhost:5001";
const ANONYMIZER_ENDPOINT = "http://localhost:5002";

function analyzerOk(results: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(results),
    text: jest.fn().mockResolvedValue(JSON.stringify(results)),
  };
}

function anonymizerOk(redactedText: string) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ text: redactedText }),
    text: jest.fn().mockResolvedValue(JSON.stringify({ text: redactedText })),
  };
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: jest.fn().mockRejectedValue(new Error("not json")),
    text: jest.fn().mockResolvedValue(body),
  };
}

describe("presidio-pii-detection", () => {
  let detectAndRedactPii: typeof import("./presidio-pii-detection").detectAndRedactPii;
  let detectAndRedactPiiBatch: typeof import("./presidio-pii-detection").detectAndRedactPiiBatch;

  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    process.env.PRESIDIO_ANALYZER_ENDPOINT = ANALYZER_ENDPOINT;
    process.env.PRESIDIO_ANONYMIZER_ENDPOINT = ANONYMIZER_ENDPOINT;
  });

  afterEach(() => {
    delete process.env.PRESIDIO_ANALYZER_ENDPOINT;
    delete process.env.PRESIDIO_ANONYMIZER_ENDPOINT;
  });

  async function loadModule() {
    const mod = await import("./presidio-pii-detection");
    detectAndRedactPii = mod.detectAndRedactPii;
    detectAndRedactPiiBatch = mod.detectAndRedactPiiBatch;
  }

  // ---------------------------------------------------------------------------
  // detectAndRedactPii — environment validation
  // ---------------------------------------------------------------------------
  describe("detectAndRedactPii", () => {
    describe("environment validation", () => {
      it("should throw when PRESIDIO_ANALYZER_ENDPOINT is not set", async () => {
        delete process.env.PRESIDIO_ANALYZER_ENDPOINT;
        await loadModule();

        await expect(detectAndRedactPii("hello")).rejects.toThrow(
          "Presidio detection is not configured",
        );
      });

      it("should throw when PRESIDIO_ANONYMIZER_ENDPOINT is not set", async () => {
        delete process.env.PRESIDIO_ANONYMIZER_ENDPOINT;
        await loadModule();

        await expect(detectAndRedactPii("hello")).rejects.toThrow(
          "Presidio detection is not configured",
        );
      });

      it("should throw when both endpoints are missing", async () => {
        delete process.env.PRESIDIO_ANALYZER_ENDPOINT;
        delete process.env.PRESIDIO_ANONYMIZER_ENDPOINT;
        await loadModule();

        await expect(detectAndRedactPii("hello")).rejects.toThrow(
          "PRESIDIO_ANALYZER_ENDPOINT and PRESIDIO_ANONYMIZER_ENDPOINT",
        );
      });
    });

    // -------------------------------------------------------------------------
    // Analyzer call shape
    // -------------------------------------------------------------------------
    describe("analyzer call", () => {
      beforeEach(async () => {
        await loadModule();
      });

      it("should call analyzer endpoint with correct URL (/analyze)", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text");

        expect(mockFetch).toHaveBeenCalledWith(
          `${ANALYZER_ENDPOINT}/analyze`,
          expect.any(Object),
        );
      });

      it("should send correct payload with text, language, and analyzer_config", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("some text"));

        await detectAndRedactPii("some text");

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.text).toBe("some text");
        expect(body.language).toBe("en");
        expect(body.analyzer_config).toEqual({
          language: "en",
          score_threshold: 0.3,
        });
      });

      it("should use default language 'en' when language is not specified", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text");

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.language).toBe("en");
        expect(body.analyzer_config.language).toBe("en");
      });

      it("should use default language 'en' when language is null", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text", null);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.language).toBe("en");
      });

      it("should pass custom language when provided", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text", "de");

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.language).toBe("de");
        expect(body.analyzer_config.language).toBe("de");
      });

      it("should pass mapped categories as entities in analyzer_config", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        // "person" uppercases to "PERSON" which is a direct Presidio entity type,
        // so it short-circuits and only adds "PERSON" (not the full person mapping).
        // "email" normalizes to the map key and maps to EMAIL_ADDRESS.
        await detectAndRedactPii("text", "en", ["person", "email"]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        const entities = body.analyzer_config.entities;

        expect(entities).toEqual(
          expect.arrayContaining(["PERSON", "EMAIL_ADDRESS"]),
        );
        expect(entities).toHaveLength(2);
      });

      it("should not include entities key when no categories provided", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text", "en");

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.analyzer_config.entities).toBeUndefined();
      });

      it("should send POST request with Content-Type application/json", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await detectAndRedactPii("text");

        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("POST");
        expect(options.headers["Content-Type"]).toBe("application/json");
      });

      it("should strip trailing slash from analyzer endpoint", async () => {
        process.env.PRESIDIO_ANALYZER_ENDPOINT = "http://localhost:5001/";
        jest.resetModules();
        const mod = await import("./presidio-pii-detection");

        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await mod.detectAndRedactPii("text");

        expect(mockFetch.mock.calls[0][0]).toBe(
          "http://localhost:5001/analyze",
        );
      });

      it("should throw on analyzer non-OK response", async () => {
        mockFetch.mockResolvedValueOnce(
          errorResponse(500, "Internal Server Error"),
        );

        await expect(detectAndRedactPii("text")).rejects.toThrow(
          "Presidio analyzer request failed (500)",
        );
      });

      it("should throw when analyzer returns non-array", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ results: "not-an-array" }),
        });

        await expect(detectAndRedactPii("text")).rejects.toThrow(
          "Unexpected analyzer response shape from Presidio",
        );
      });
    });

    // -------------------------------------------------------------------------
    // Anonymizer call shape
    // -------------------------------------------------------------------------
    describe("anonymizer call", () => {
      beforeEach(async () => {
        await loadModule();
      });

      it("should call anonymizer endpoint with analyzer results", async () => {
        const analyzerResults = [
          { start: 0, end: 4, score: 0.9, entity_type: "PERSON" },
        ];

        mockFetch
          .mockResolvedValueOnce(analyzerOk(analyzerResults))
          .mockResolvedValueOnce(anonymizerOk("[REDACTED]"));

        await detectAndRedactPii("John");

        expect(mockFetch).toHaveBeenCalledTimes(2);
        const [url, options] = mockFetch.mock.calls[1];
        expect(url).toBe(`${ANONYMIZER_ENDPOINT}/anonymize`);
        const body = JSON.parse(options.body);
        expect(body.text).toBe("John");
        expect(body.analyzer_results).toEqual(analyzerResults);
        expect(body.anonymizers.DEFAULT).toEqual({
          type: "replace",
          new_value: "[REDACTED]",
        });
      });

      it("should strip trailing slash from anonymizer endpoint", async () => {
        process.env.PRESIDIO_ANONYMIZER_ENDPOINT = "http://localhost:5002/";
        jest.resetModules();
        const mod = await import("./presidio-pii-detection");

        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("text"));

        await mod.detectAndRedactPii("text");

        expect(mockFetch.mock.calls[1][0]).toBe(
          "http://localhost:5002/anonymize",
        );
      });

      it("should fall back to original text when anonymizer fails (does not throw)", async () => {
        const analyzerResults = [
          { start: 0, end: 4, score: 0.9, entity_type: "PERSON" },
        ];

        mockFetch
          .mockResolvedValueOnce(analyzerOk(analyzerResults))
          .mockResolvedValueOnce(errorResponse(500, "Anonymizer down"));

        const result = await detectAndRedactPii("John");

        expect(result.redactedText).toBe("John");
        expect(result.entities).toHaveLength(1);
      });

      it("should fall back to original text when anonymizer fetch throws", async () => {
        const analyzerResults = [
          { start: 5, end: 9, score: 0.85, entity_type: "PERSON" },
        ];

        mockFetch
          .mockResolvedValueOnce(analyzerOk(analyzerResults))
          .mockRejectedValueOnce(new Error("Network error"));

        const result = await detectAndRedactPii("Call John now");

        expect(result.redactedText).toBe("Call John now");
      });
    });

    // -------------------------------------------------------------------------
    // Result structure
    // -------------------------------------------------------------------------
    describe("result structure", () => {
      beforeEach(async () => {
        await loadModule();
      });

      it("should return PiiDetectionResult with originalText, redactedText, entities", async () => {
        const analyzerResults = [
          { start: 0, end: 4, score: 0.95, entity_type: "PERSON" },
        ];

        mockFetch
          .mockResolvedValueOnce(analyzerOk(analyzerResults))
          .mockResolvedValueOnce(anonymizerOk("[REDACTED]"));

        const result = await detectAndRedactPii("John");

        expect(result).toEqual({
          originalText: "John",
          redactedText: "[REDACTED]",
          entities: [
            {
              text: "John",
              category: "Person",
              subcategory: undefined,
              confidenceScore: 0.95,
              offset: 0,
              length: 4,
            },
          ],
        });
      });

      it("should handle empty analyzer results", async () => {
        mockFetch
          .mockResolvedValueOnce(analyzerOk([]))
          .mockResolvedValueOnce(anonymizerOk("no pii here"));

        const result = await detectAndRedactPii("no pii here");

        expect(result.originalText).toBe("no pii here");
        expect(result.redactedText).toBe("no pii here");
        expect(result.entities).toEqual([]);
      });

      it("should handle multiple entities in result", async () => {
        const analyzerResults = [
          { start: 0, end: 4, score: 0.9, entity_type: "PERSON" },
          { start: 17, end: 33, score: 0.85, entity_type: "EMAIL_ADDRESS" },
        ];

        mockFetch
          .mockResolvedValueOnce(analyzerOk(analyzerResults))
          .mockResolvedValueOnce(anonymizerOk("[REDACTED] email [REDACTED]"));

        const result = await detectAndRedactPii(
          "John email is at john@example.com",
        );

        expect(result.entities).toHaveLength(2);
        expect(result.entities[0].category).toBe("Person");
        expect(result.entities[1].category).toBe("Email");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Category mapping (via detectAndRedactPii)
  // ---------------------------------------------------------------------------
  describe("category mapping", () => {
    beforeEach(async () => {
      await loadModule();
    });

    function getEntitiesFromCall(): string[] {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      return body.analyzer_config.entities;
    }

    it('should map "person" directly to PERSON (direct Presidio match takes precedence)', async () => {
      // "person".toUpperCase() = "PERSON" which is in PRESIDIO_ENTITY_TYPES,
      // so the direct match short-circuits before the CATEGORY_TO_PRESIDIO_MAP lookup.
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["person"]);

      expect(getEntitiesFromCall()).toEqual(["PERSON"]);
    });

    it('should map "Person_First_Name" style categories via normalization to the map', async () => {
      // "Person_First_Name" uppercases to "PERSON_FIRST_NAME" which IS in PRESIDIO_ENTITY_TYPES
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["PERSON_FIRST_NAME"]);

      expect(getEntitiesFromCall()).toEqual(["PERSON_FIRST_NAME"]);
    });

    it('should map "email" to EMAIL_ADDRESS', async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["email"]);

      expect(getEntitiesFromCall()).toEqual(["EMAIL_ADDRESS"]);
    });

    it('should map "phonenumber" to PHONE_NUMBER', async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["phonenumber"]);

      expect(getEntitiesFromCall()).toEqual(["PHONE_NUMBER"]);
    });

    it('should map "PhoneNumber" (mixed case) to PHONE_NUMBER via normalization', async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["PhoneNumber"]);

      expect(getEntitiesFromCall()).toEqual(["PHONE_NUMBER"]);
    });

    it("should pass direct Presidio types (e.g., PERSON) through unchanged", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["PERSON"]);

      expect(getEntitiesFromCall()).toEqual(["PERSON"]);
    });

    it("should pass direct Presidio type CREDIT_CARD through unchanged", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["CREDIT_CARD"]);

      expect(getEntitiesFromCall()).toEqual(["CREDIT_CARD"]);
    });

    it("should not include entities key for empty categories array", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", []);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.analyzer_config.entities).toBeUndefined();
    });

    it("should not include entities key for undefined categories", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", undefined);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.analyzer_config.entities).toBeUndefined();
    });

    it("should handle mixed categories (Azure-style + Presidio direct)", async () => {
      // "person" uppercases to "PERSON" (direct match); "IBAN_CODE" is also direct.
      // Use "creditcardnumber" as an Azure-style key that maps via the category map.
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["creditcardnumber", "IBAN_CODE"]);

      const entities = getEntitiesFromCall();
      expect(entities).toEqual(
        expect.arrayContaining(["CREDIT_CARD", "IBAN_CODE"]),
      );
      expect(entities).toHaveLength(2);
    });

    it("should map internationalbankingaccountnumber to IBAN_CODE via category map", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", [
        "internationalbankingaccountnumber",
      ]);

      expect(getEntitiesFromCall()).toEqual(["IBAN_CODE"]);
    });

    it('should map "address" to LOCATION', async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["address"]);

      expect(getEntitiesFromCall()).toEqual(["LOCATION"]);
    });

    it('should map "passportnumber" to PASSPORT and US_PASSPORT', async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["passportnumber"]);

      expect(getEntitiesFromCall()).toEqual(
        expect.arrayContaining(["PASSPORT", "US_PASSPORT"]),
      );
    });

    it("should deduplicate when both Azure-style and direct Presidio map to same entity", async () => {
      mockFetch
        .mockResolvedValueOnce(analyzerOk([]))
        .mockResolvedValueOnce(anonymizerOk("text"));

      await detectAndRedactPii("text", "en", ["email", "EMAIL_ADDRESS"]);

      expect(getEntitiesFromCall()).toEqual(["EMAIL_ADDRESS"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Entity type mapping (Presidio -> Azure-style categories)
  // ---------------------------------------------------------------------------
  describe("entity type mapping (via result entities)", () => {
    beforeEach(async () => {
      await loadModule();
    });

    async function detectWithEntityType(
      entityType: string,
      text = "test value",
    ): Promise<PiiDetectionResult> {
      const analyzerResults = [
        { start: 0, end: text.length, score: 0.9, entity_type: entityType },
      ];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("[REDACTED]"));

      return detectAndRedactPii(text);
    }

    it("should map PERSON to category Person", async () => {
      const result = await detectWithEntityType("PERSON");
      expect(result.entities[0].category).toBe("Person");
      expect(result.entities[0].subcategory).toBeUndefined();
    });

    it("should map EMAIL_ADDRESS to category Email", async () => {
      const result = await detectWithEntityType("EMAIL_ADDRESS");
      expect(result.entities[0].category).toBe("Email");
    });

    it("should map PHONE_NUMBER to category PhoneNumber", async () => {
      const result = await detectWithEntityType("PHONE_NUMBER");
      expect(result.entities[0].category).toBe("PhoneNumber");
    });

    it("should map IBAN_CODE to category InternationalBankingAccountNumber", async () => {
      const result = await detectWithEntityType("IBAN_CODE");
      expect(result.entities[0].category).toBe(
        "InternationalBankingAccountNumber",
      );
    });

    it("should map CREDIT_CARD to category CreditCardNumber", async () => {
      const result = await detectWithEntityType("CREDIT_CARD");
      expect(result.entities[0].category).toBe("CreditCardNumber");
    });

    it("should map IP_ADDRESS to category IPAddress", async () => {
      const result = await detectWithEntityType("IP_ADDRESS");
      expect(result.entities[0].category).toBe("IPAddress");
    });

    it("should map URL to category URL", async () => {
      const result = await detectWithEntityType("URL");
      expect(result.entities[0].category).toBe("URL");
    });

    it("should map ORGANIZATION to category Organization", async () => {
      const result = await detectWithEntityType("ORGANIZATION");
      expect(result.entities[0].category).toBe("Organization");
    });

    it("should map LOCATION to category Address with subcategory LOCATION", async () => {
      const result = await detectWithEntityType("LOCATION");
      expect(result.entities[0].category).toBe("Address");
      expect(result.entities[0].subcategory).toBe("LOCATION");
    });

    it("should map DATE_TIME to category Date", async () => {
      const result = await detectWithEntityType("DATE_TIME");
      expect(result.entities[0].category).toBe("Date");
    });

    it("should map US_SSN to category USSocialSecurityNumber with subcategory US_SSN", async () => {
      const result = await detectWithEntityType("US_SSN");
      expect(result.entities[0].category).toBe("USSocialSecurityNumber");
      expect(result.entities[0].subcategory).toBe("US_SSN");
    });

    it("should map PERSON_FIRST_NAME with subcategory PERSON_FIRST_NAME", async () => {
      const result = await detectWithEntityType("PERSON_FIRST_NAME");
      expect(result.entities[0].category).toBe("Person");
      expect(result.entities[0].subcategory).toBe("PERSON_FIRST_NAME");
    });

    it("should map PERSON_LAST_NAME with subcategory PERSON_LAST_NAME", async () => {
      const result = await detectWithEntityType("PERSON_LAST_NAME");
      expect(result.entities[0].category).toBe("Person");
      expect(result.entities[0].subcategory).toBe("PERSON_LAST_NAME");
    });

    it("should map US_DRIVER_LICENSE with subcategory", async () => {
      const result = await detectWithEntityType("US_DRIVER_LICENSE");
      expect(result.entities[0].category).toBe("DriversLicenseNumber");
      expect(result.entities[0].subcategory).toBe("US_DRIVER_LICENSE");
    });

    it("should map PASSPORT to category PassportNumber", async () => {
      const result = await detectWithEntityType("PASSPORT");
      expect(result.entities[0].category).toBe("PassportNumber");
      expect(result.entities[0].subcategory).toBeUndefined();
    });

    it("should map US_PASSPORT with subcategory US_PASSPORT", async () => {
      const result = await detectWithEntityType("US_PASSPORT");
      expect(result.entities[0].category).toBe("PassportNumber");
      expect(result.entities[0].subcategory).toBe("US_PASSPORT");
    });

    it("should map CRYPTO with subcategory CRYPTO", async () => {
      const result = await detectWithEntityType("CRYPTO");
      expect(result.entities[0].category).toBe("CryptoAddress");
      expect(result.entities[0].subcategory).toBe("CRYPTO");
    });

    it("should map US_ITIN with correct category and subcategory", async () => {
      const result = await detectWithEntityType("US_ITIN");
      expect(result.entities[0].category).toBe(
        "USIndividualTaxpayerIdentification",
      );
      expect(result.entities[0].subcategory).toBe("US_ITIN");
    });

    it("should fall back to entity type itself as category for unknown types", async () => {
      const result = await detectWithEntityType("CUSTOM_ENTITY_TYPE");
      expect(result.entities[0].category).toBe("CUSTOM_ENTITY_TYPE");
      expect(result.entities[0].subcategory).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // mapAnalyzerResultsToPiiEntities (tested indirectly via detectAndRedactPii)
  // ---------------------------------------------------------------------------
  describe("mapAnalyzerResultsToPiiEntities (via detectAndRedactPii)", () => {
    beforeEach(async () => {
      await loadModule();
    });

    it("should extract text from original using start/end offsets", async () => {
      const text = "Hello John Doe from Berlin";
      const analyzerResults = [
        { start: 6, end: 14, score: 0.9, entity_type: "PERSON" },
        { start: 20, end: 26, score: 0.8, entity_type: "LOCATION" },
      ];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("[REDACTED] from [REDACTED]"));

      const result = await detectAndRedactPii(text);

      expect(result.entities[0].text).toBe("John Doe");
      expect(result.entities[1].text).toBe("Berlin");
    });

    it("should map score to confidenceScore", async () => {
      const analyzerResults = [
        { start: 0, end: 4, score: 0.87, entity_type: "PERSON" },
      ];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("[REDACTED]"));

      const result = await detectAndRedactPii("John");

      expect(result.entities[0].confidenceScore).toBe(0.87);
    });

    it("should default confidenceScore to 0 when score is missing", async () => {
      const analyzerResults = [{ start: 0, end: 4, entity_type: "PERSON" }];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("[REDACTED]"));

      const result = await detectAndRedactPii("John");

      expect(result.entities[0].confidenceScore).toBe(0);
    });

    it("should calculate correct length from start and end", async () => {
      const analyzerResults = [
        { start: 10, end: 25, score: 0.9, entity_type: "EMAIL_ADDRESS" },
      ];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("redacted"));

      const result = await detectAndRedactPii(
        "Email is: test@example.com today",
      );

      expect(result.entities[0].offset).toBe(10);
      expect(result.entities[0].length).toBe(15);
    });

    it("should set offset from result.start", async () => {
      const analyzerResults = [
        { start: 5, end: 10, score: 0.9, entity_type: "PERSON" },
      ];

      mockFetch
        .mockResolvedValueOnce(analyzerOk(analyzerResults))
        .mockResolvedValueOnce(anonymizerOk("redacted"));

      const result = await detectAndRedactPii("Hi,  Alice works");

      expect(result.entities[0].offset).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // detectAndRedactPiiBatch
  // ---------------------------------------------------------------------------
  describe("detectAndRedactPiiBatch", () => {
    beforeEach(async () => {
      await loadModule();
    });

    it("should process all texts in parallel", async () => {
      // Promise.all runs concurrently so mockResolvedValueOnce ordering is
      // unpredictable. Use mockImplementation that routes by URL.
      mockFetch.mockImplementation((url: string) => {
        if (url.endsWith("/analyze")) {
          return Promise.resolve(analyzerOk([]));
        }
        if (url.endsWith("/anonymize")) {
          return Promise.resolve(anonymizerOk("redacted"));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const results = await detectAndRedactPiiBatch([
        "text1",
        "text2",
        "text3",
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].originalText).toBe("text1");
      expect(results[1].originalText).toBe("text2");
      expect(results[2].originalText).toBe("text3");
    });

    it("should return array of PiiDetectionResult objects", async () => {
      const personResult = [
        { start: 0, end: 4, score: 0.9, entity_type: "PERSON" },
      ];

      mockFetch.mockImplementation(
        (url: string, options?: { body?: string }) => {
          if (url.endsWith("/analyze")) {
            const body = JSON.parse(options?.body || "{}");
            if (body.text === "John") {
              return Promise.resolve(analyzerOk(personResult));
            }
            return Promise.resolve(analyzerOk([]));
          }
          if (url.endsWith("/anonymize")) {
            const body = JSON.parse(options?.body || "{}");
            if (body.text === "John") {
              return Promise.resolve(anonymizerOk("[REDACTED]"));
            }
            return Promise.resolve(anonymizerOk(body.text));
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        },
      );

      const results = await detectAndRedactPiiBatch(["John", "safe text"]);

      expect(results).toHaveLength(2);
      expect(results[0].entities).toHaveLength(1);
      expect(results[0].redactedText).toBe("[REDACTED]");
      expect(results[1].entities).toHaveLength(0);
      expect(results[1].redactedText).toBe("safe text");
    });

    it("should handle empty texts array", async () => {
      const results = await detectAndRedactPiiBatch([]);

      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should pass language and piiCategories to each call", async () => {
      const analyzerBodies: Record<string, unknown>[] = [];

      mockFetch.mockImplementation(
        (url: string, options?: { body?: string }) => {
          if (url.endsWith("/analyze")) {
            const body = JSON.parse(options?.body || "{}");
            analyzerBodies.push(body);
            return Promise.resolve(analyzerOk([]));
          }
          if (url.endsWith("/anonymize")) {
            const body = JSON.parse(options?.body || "{}");
            return Promise.resolve(anonymizerOk(body.text));
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        },
      );

      await detectAndRedactPiiBatch(["a", "b"], "de", ["email"]);

      expect(analyzerBodies).toHaveLength(2);
      for (const body of analyzerBodies) {
        expect(body.language).toBe("de");
        expect(
          (body.analyzer_config as Record<string, unknown>).entities,
        ).toEqual(["EMAIL_ADDRESS"]);
      }
    });

    it("should throw when endpoints are not configured", async () => {
      delete process.env.PRESIDIO_ANALYZER_ENDPOINT;
      jest.resetModules();
      const mod = await import("./presidio-pii-detection");

      await expect(mod.detectAndRedactPiiBatch(["text"])).rejects.toThrow(
        "Presidio detection is not configured",
      );
    });
  });
});
