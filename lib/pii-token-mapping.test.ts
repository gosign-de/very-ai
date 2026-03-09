import crypto from "crypto";
import {
  createTokenMapping,
  maskTextWithTokens,
  serializeTokenMap,
  TokenMapping,
} from "./pii-token-mapping";

interface PiiEntity {
  text: string;
  category: string;
  subcategory?: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

function makePiiEntity(
  overrides: Partial<PiiEntity> &
    Pick<PiiEntity, "text" | "category" | "offset">,
): PiiEntity {
  return {
    confidenceScore: 0.95,
    length: overrides.text.length,
    ...overrides,
  };
}

/**
 * Replicates the internal hash logic so tests can assert exact token strings.
 */
function expectedToken(value: string, category: string): string {
  const combined = `${category}:${value.toLowerCase().trim()}`;
  const hash = crypto
    .createHash("sha256")
    .update(combined)
    .digest("hex")
    .substring(0, 4);
  return `[${category}_${hash}]`;
}

describe("createTokenMapping", () => {
  it("returns empty tokenMap and metadata for an empty entity array", () => {
    const { tokenMap, metadata } = createTokenMapping([]);
    expect(tokenMap).toEqual({});
    expect(metadata).toEqual([]);
  });

  it("maps a single entity to a deterministic token", () => {
    const entity = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 0,
    });
    const { tokenMap, metadata } = createTokenMapping([entity]);
    const token = expectedToken("Max Mustermann", "Person");

    expect(Object.keys(tokenMap)).toHaveLength(1);
    expect(tokenMap[token]).toBe("Max Mustermann");

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual({
      token,
      originalValue: "Max Mustermann",
      category: "Person",
      subcategory: undefined,
      confidenceScore: 0.95,
      position: 0,
    });
  });

  it("maps multiple distinct entities to separate tokens", () => {
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 0 }),
      makePiiEntity({ text: "max@example.com", category: "Email", offset: 20 }),
      makePiiEntity({
        text: "+49 170 1234567",
        category: "PhoneNumber",
        offset: 40,
      }),
    ];

    const { tokenMap, metadata } = createTokenMapping(entities);

    expect(Object.keys(tokenMap)).toHaveLength(3);
    expect(metadata).toHaveLength(3);

    expect(tokenMap[expectedToken("Max Mustermann", "Person")]).toBe(
      "Max Mustermann",
    );
    expect(tokenMap[expectedToken("max@example.com", "Email")]).toBe(
      "max@example.com",
    );
    expect(tokenMap[expectedToken("+49 170 1234567", "PhoneNumber")]).toBe(
      "+49 170 1234567",
    );
  });

  it("deduplicates the same value+category in tokenMap but keeps all metadata entries", () => {
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 0 }),
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 50 }),
      makePiiEntity({
        text: "Max Mustermann",
        category: "Person",
        offset: 100,
      }),
    ];

    const { tokenMap, metadata } = createTokenMapping(entities);

    // tokenMap has only one entry for the duplicate
    expect(Object.keys(tokenMap)).toHaveLength(1);

    // metadata has all three occurrences
    expect(metadata).toHaveLength(3);
    expect(metadata[0].position).toBe(0);
    expect(metadata[1].position).toBe(50);
    expect(metadata[2].position).toBe(100);
    metadata.forEach(m => {
      expect(m.token).toBe(expectedToken("Max Mustermann", "Person"));
      expect(m.originalValue).toBe("Max Mustermann");
    });
  });

  it("assigns different tokens when same text has different categories", () => {
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Berlin", category: "Location", offset: 0 }),
      makePiiEntity({ text: "Berlin", category: "Organization", offset: 30 }),
    ];

    const { tokenMap, metadata } = createTokenMapping(entities);

    const locationToken = expectedToken("Berlin", "Location");
    const orgToken = expectedToken("Berlin", "Organization");

    expect(locationToken).not.toBe(orgToken);
    expect(Object.keys(tokenMap)).toHaveLength(2);
    expect(tokenMap[locationToken]).toBe("Berlin");
    expect(tokenMap[orgToken]).toBe("Berlin");

    expect(metadata).toHaveLength(2);
    expect(metadata[0].category).toBe("Location");
    expect(metadata[1].category).toBe("Organization");
  });

  it("sorts entities by offset in metadata output", () => {
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "second@test.com", category: "Email", offset: 50 }),
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 0 }),
      makePiiEntity({
        text: "+49 170 1234567",
        category: "PhoneNumber",
        offset: 25,
      }),
    ];

    const { metadata } = createTokenMapping(entities);

    expect(metadata[0].position).toBe(0);
    expect(metadata[1].position).toBe(25);
    expect(metadata[2].position).toBe(50);
  });

  it("preserves subcategory and confidenceScore in metadata", () => {
    const entity = makePiiEntity({
      text: "DE89370400440532013000",
      category: "Financial",
      subcategory: "IBAN",
      confidenceScore: 0.99,
      offset: 10,
    });

    const { metadata } = createTokenMapping([entity]);

    expect(metadata[0].subcategory).toBe("IBAN");
    expect(metadata[0].confidenceScore).toBe(0.99);
  });
});

describe("determinism", () => {
  it("produces the same token for identical value+category across separate calls", () => {
    const entity1 = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 0,
    });
    const entity2 = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 42,
    });

    const result1 = createTokenMapping([entity1]);
    const result2 = createTokenMapping([entity2]);

    const token1 = Object.keys(result1.tokenMap)[0];
    const token2 = Object.keys(result2.tokenMap)[0];

    expect(token1).toBe(token2);
  });

  it("produces the same token regardless of leading/trailing whitespace", () => {
    const e1 = makePiiEntity({
      text: "  Max Mustermann  ",
      category: "Person",
      offset: 0,
      length: 18,
    });
    const e2 = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 0,
    });

    const r1 = createTokenMapping([e1]);
    const r2 = createTokenMapping([e2]);

    // The hash is based on trimmed + lowercased value, so tokens match
    expect(Object.keys(r1.tokenMap)[0]).toBe(Object.keys(r2.tokenMap)[0]);
  });

  it("produces the same token regardless of casing", () => {
    const e1 = makePiiEntity({
      text: "MAX MUSTERMANN",
      category: "Person",
      offset: 0,
    });
    const e2 = makePiiEntity({
      text: "max mustermann",
      category: "Person",
      offset: 0,
    });

    const r1 = createTokenMapping([e1]);
    const r2 = createTokenMapping([e2]);

    expect(Object.keys(r1.tokenMap)[0]).toBe(Object.keys(r2.tokenMap)[0]);
  });
});

describe("maskTextWithTokens", () => {
  it("replaces a single PII occurrence in text", () => {
    const text = "Hello Max Mustermann, welcome!";
    const entity = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 6,
    });
    const { tokenMap } = createTokenMapping([entity]);
    const token = expectedToken("Max Mustermann", "Person");

    const masked = maskTextWithTokens(text, [entity], tokenMap);

    expect(masked).toBe(`Hello ${token}, welcome!`);
  });

  it("replaces multiple distinct PII occurrences", () => {
    const text = "Contact Max Mustermann at max@example.com or +49 170 1234567";
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 8 }),
      makePiiEntity({ text: "max@example.com", category: "Email", offset: 26 }),
      makePiiEntity({
        text: "+49 170 1234567",
        category: "PhoneNumber",
        offset: 45,
      }),
    ];
    const { tokenMap } = createTokenMapping(entities);

    const masked = maskTextWithTokens(text, entities, tokenMap);

    const personToken = expectedToken("Max Mustermann", "Person");
    const emailToken = expectedToken("max@example.com", "Email");
    const phoneToken = expectedToken("+49 170 1234567", "PhoneNumber");

    expect(masked).toBe(
      `Contact ${personToken} at ${emailToken} or ${phoneToken}`,
    );
  });

  it("replaces duplicate occurrences of the same PII value", () => {
    const text = "Dear Max Mustermann, as Max Mustermann you qualify.";
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 5 }),
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 24 }),
    ];
    const { tokenMap } = createTokenMapping(entities);
    const token = expectedToken("Max Mustermann", "Person");

    const masked = maskTextWithTokens(text, entities, tokenMap);

    expect(masked).toBe(`Dear ${token}, as ${token} you qualify.`);
  });

  it("returns text unchanged when entities array is empty", () => {
    const text = "Nothing to mask here.";
    const masked = maskTextWithTokens(text, [], {});
    expect(masked).toBe(text);
  });

  it("returns text unchanged when entity text is not found in tokenMap", () => {
    const text = "Hello Max Mustermann";
    const entity = makePiiEntity({
      text: "Max Mustermann",
      category: "Person",
      offset: 6,
    });
    // Provide an empty tokenMap so there is no mapping
    const masked = maskTextWithTokens(text, [entity], {});
    expect(masked).toBe(text);
  });

  it("handles offset-based replacement correctly (no offset shift issues)", () => {
    // Tokens may be longer or shorter than original text.
    // Replacing from end-to-start prevents earlier replacements from
    // invalidating later offsets.
    const text = "A B C";
    //            0123456 (A at 0, B at 2, C at 4)
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "A", category: "Letter", offset: 0, length: 1 }),
      makePiiEntity({ text: "B", category: "Letter", offset: 2, length: 1 }),
      makePiiEntity({ text: "C", category: "Letter", offset: 4, length: 1 }),
    ];
    const { tokenMap } = createTokenMapping(entities);

    const masked = maskTextWithTokens(text, entities, tokenMap);

    // All three should be replaced correctly despite the tokens being
    // much longer than the original single characters
    const tokenA = expectedToken("A", "Letter");
    const tokenB = expectedToken("B", "Letter");
    const tokenC = expectedToken("C", "Letter");

    expect(masked).toBe(`${tokenA} ${tokenB} ${tokenC}`);
  });

  it("replaces based on offset and length, not string search", () => {
    // The word "test" appears twice but only the entity at offset 10 should be replaced
    const text = "test foo test bar";
    const entity = makePiiEntity({
      text: "test",
      category: "Keyword",
      offset: 9,
      length: 4,
    });
    const { tokenMap } = createTokenMapping([entity]);
    const token = expectedToken("test", "Keyword");

    const masked = maskTextWithTokens(text, [entity], tokenMap);

    // Only the second "test" (at offset 9) should be replaced
    expect(masked).toBe(`test foo ${token} bar`);
  });
});

describe("serializeTokenMap", () => {
  it("serializes an empty token map", () => {
    const result = serializeTokenMap({});
    expect(result).toBe("{}");
  });

  it("serializes a populated token map to JSON", () => {
    const token = expectedToken("Max Mustermann", "Person");
    const tokenMap: TokenMapping = {
      [token]: "Max Mustermann",
    };

    const result = serializeTokenMap(tokenMap);
    const parsed = JSON.parse(result);

    expect(parsed[token]).toBe("Max Mustermann");
  });

  it("supports roundtrip with JSON.parse", () => {
    const entities: PiiEntity[] = [
      makePiiEntity({ text: "Max Mustermann", category: "Person", offset: 0 }),
      makePiiEntity({ text: "max@example.com", category: "Email", offset: 20 }),
      makePiiEntity({ text: "Berlin", category: "Location", offset: 40 }),
    ];

    const { tokenMap } = createTokenMapping(entities);
    const serialized = serializeTokenMap(tokenMap);
    const deserialized: TokenMapping = JSON.parse(serialized);

    expect(deserialized).toEqual(tokenMap);
  });

  it("serializes multiple entries preserving all key-value pairs", () => {
    const tokenMap: TokenMapping = {
      "[Person_abcd]": "Alice",
      "[Email_ef01]": "alice@example.com",
      "[PhoneNumber_2345]": "+1 555 0100",
    };

    const serialized = serializeTokenMap(tokenMap);
    const parsed = JSON.parse(serialized);

    expect(Object.keys(parsed)).toHaveLength(3);
    expect(parsed["[Person_abcd]"]).toBe("Alice");
    expect(parsed["[Email_ef01]"]).toBe("alice@example.com");
    expect(parsed["[PhoneNumber_2345]"]).toBe("+1 555 0100");
  });
});
