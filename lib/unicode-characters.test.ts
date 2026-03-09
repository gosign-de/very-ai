import {
  UNICODE_CHARACTER_MAP,
  sanitizeTextForPdf,
  containsUnicodeCharacters,
  getUnicodeStats,
} from "./unicode-characters";

// ---------------------------------------------------------------------------
// UNICODE_CHARACTER_MAP
// ---------------------------------------------------------------------------
describe("UNICODE_CHARACTER_MAP", () => {
  it("is a non-empty Record<string, string>", () => {
    expect(typeof UNICODE_CHARACTER_MAP).toBe("object");
    expect(Object.keys(UNICODE_CHARACTER_MAP).length).toBeGreaterThan(0);
  });

  it.each([
    ["≤", "<="],
    ["≥", ">="],
    ["±", "+/-"],
    ["×", "x"],
    ["÷", "/"],
    ["≠", "!="],
    ["≈", "~="],
    ["√", "sqrt"],
    ["∞", "infinity"],
    ["∫", "integral"],
    ["∑", "sum"],
    ["∏", "product"],
    ["∇", "del"],
    ["∂", "partial"],
  ])("maps mathematical symbol %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["α", "alpha"],
    ["β", "beta"],
    ["γ", "gamma"],
    ["δ", "delta"],
    ["π", "pi"],
    ["ω", "omega"],
    ["Γ", "Gamma"],
    ["Δ", "Delta"],
    ["Σ", "Sigma"],
    ["Ω", "Omega"],
  ])("maps Greek letter %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["→", "->"],
    ["←", "<-"],
    ["↔", "<->"],
    ["↑", "up"],
    ["↓", "down"],
  ])("maps arrow %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["²", "2"],
    ["³", "3"],
    ["⁰", "0"],
    ["⁹", "9"],
    ["⁺", "+"],
    ["⁻", "-"],
  ])("maps superscript %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["₀", "0"],
    ["₁", "1"],
    ["₂", "2"],
    ["₉", "9"],
  ])("maps subscript %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["∈", "in"],
    ["∉", "not in"],
    ["⊂", "subset of"],
    ["∪", "union"],
    ["∩", "intersection"],
    ["∅", "empty set"],
  ])("maps set theory symbol %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["∧", "and"],
    ["∨", "or"],
    ["¬", "not"],
    ["∀", "for all"],
    ["∃", "there exists"],
    ["∴", "therefore"],
  ])("maps logic symbol %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });

  it.each([
    ["°", "deg"],
    ["–", "-"],
    ["—", "-"],
    ["…", "..."],
    ["«", "<<"],
    ["»", ">>"],
    ["✓", "check"],
    ["✔", "check"],
    ["✗", "x"],
  ])("maps miscellaneous symbol %s -> %s", (unicode, ascii) => {
    expect(UNICODE_CHARACTER_MAP[unicode]).toBe(ascii);
  });
});

// ---------------------------------------------------------------------------
// sanitizeTextForPdf
// ---------------------------------------------------------------------------
describe("sanitizeTextForPdf", () => {
  describe("falsy / empty input", () => {
    it("returns empty string unchanged", () => {
      expect(sanitizeTextForPdf("")).toBe("");
    });

    it("returns null unchanged", () => {
      // The function signature accepts string but guards with `if (!text)`
      expect(sanitizeTextForPdf(null as unknown as string)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      expect(
        sanitizeTextForPdf(undefined as unknown as string),
      ).toBeUndefined();
    });
  });

  describe("plain ASCII input (no replacements needed)", () => {
    it("returns plain ASCII text unchanged", () => {
      const input = "Hello, world! This is plain text with 123 numbers.";
      expect(sanitizeTextForPdf(input)).toBe(input);
    });

    it("preserves whitespace and newlines", () => {
      const input = "line 1\nline 2\ttab";
      expect(sanitizeTextForPdf(input)).toBe(input);
    });
  });

  describe("mathematical symbols", () => {
    it("replaces less-than-or-equal", () => {
      expect(sanitizeTextForPdf("x ≤ 5")).toBe("x <= 5");
    });

    it("replaces greater-than-or-equal", () => {
      expect(sanitizeTextForPdf("x ≥ 10")).toBe("x >= 10");
    });

    it("replaces plus-minus", () => {
      expect(sanitizeTextForPdf("±3")).toBe("+/-3");
    });

    it("replaces not-equal", () => {
      expect(sanitizeTextForPdf("a ≠ b")).toBe("a != b");
    });

    it("replaces square root and infinity", () => {
      expect(sanitizeTextForPdf("√∞")).toBe("sqrtinfinity");
    });
  });

  describe("Greek letters", () => {
    it("replaces lowercase Greek letters", () => {
      expect(sanitizeTextForPdf("α + β = γ")).toBe("alpha + beta = gamma");
    });

    it("replaces uppercase Greek letters", () => {
      expect(sanitizeTextForPdf("ΔΣΩ")).toBe("DeltaSigmaOmega");
    });

    it("handles mixed Greek and ASCII", () => {
      expect(sanitizeTextForPdf("angle θ = 90°")).toBe("angle theta = 90deg");
    });
  });

  describe("arrows", () => {
    it("replaces right arrow", () => {
      expect(sanitizeTextForPdf("A → B")).toBe("A -> B");
    });

    it("replaces left arrow", () => {
      expect(sanitizeTextForPdf("A ← B")).toBe("A <- B");
    });

    it("replaces bidirectional arrow", () => {
      expect(sanitizeTextForPdf("A ↔ B")).toBe("A <-> B");
    });
  });

  describe("smart quotes (ADDITIONAL_UNICODE_MAP)", () => {
    it("replaces left double quotation mark \\u201C", () => {
      expect(sanitizeTextForPdf("\u201Chello\u201D")).toBe('"hello"');
    });

    it("replaces left single quotation mark \\u2018", () => {
      expect(sanitizeTextForPdf("\u2018world\u2019")).toBe("'world'");
    });

    it("replaces single low-9 quotation mark \\u201A", () => {
      // \u201A (‚) is mapped to "," in UNICODE_CHARACTER_MAP (processed first),
      // so the ADDITIONAL_UNICODE_MAP entry ("'") is never reached.
      expect(sanitizeTextForPdf("\u201Atest")).toBe(",test");
    });

    it("replaces double low-9 quotation mark \\u201E", () => {
      expect(sanitizeTextForPdf("\u201Etest")).toBe('"test');
    });
  });

  describe("mixed content", () => {
    it("replaces multiple different unicode characters in one string", () => {
      const input = "if x ≤ 5 → α² ≠ β";
      const expected = "if x <= 5 -> alpha2 != beta";
      expect(sanitizeTextForPdf(input)).toBe(expected);
    });

    it("handles unicode mixed with smart quotes", () => {
      const input = "\u201CResult: α ≥ 0\u201D";
      const expected = '"Result: alpha >= 0"';
      expect(sanitizeTextForPdf(input)).toBe(expected);
    });
  });

  describe("multiple occurrences", () => {
    it("replaces all occurrences of the same character", () => {
      expect(sanitizeTextForPdf("α + α + α")).toBe("alpha + alpha + alpha");
    });

    it("replaces all occurrences of arrows", () => {
      expect(sanitizeTextForPdf("A → B → C → D")).toBe("A -> B -> C -> D");
    });

    it("replaces all smart quote pairs", () => {
      expect(sanitizeTextForPdf("\u201Chi\u201D and \u201Cbye\u201D")).toBe(
        '"hi" and "bye"',
      );
    });
  });

  describe("superscripts and subscripts", () => {
    it("replaces superscript digits", () => {
      expect(sanitizeTextForPdf("x² + y³")).toBe("x2 + y3");
    });

    it("replaces subscript digits", () => {
      expect(sanitizeTextForPdf("H₂O")).toBe("H2O");
    });
  });

  describe("set theory and logic", () => {
    it("replaces set theory symbols", () => {
      expect(sanitizeTextForPdf("A ∈ B ∪ C")).toBe("A in B union C");
    });

    it("replaces logic symbols", () => {
      expect(sanitizeTextForPdf("∀x ∃y")).toBe("for allx there existsy");
    });
  });

  describe("checkmarks", () => {
    it("replaces checkmarks and crosses", () => {
      expect(sanitizeTextForPdf("✓ done ✗ failed")).toBe("check done x failed");
    });
  });

  describe("punctuation replacements", () => {
    it("replaces en-dash and em-dash", () => {
      expect(sanitizeTextForPdf("a–b—c")).toBe("a-b-c");
    });

    it("replaces ellipsis", () => {
      expect(sanitizeTextForPdf("wait…")).toBe("wait...");
    });

    it("replaces guillemets", () => {
      expect(sanitizeTextForPdf("«text»")).toBe("<<text>>");
    });
  });
});

// ---------------------------------------------------------------------------
// containsUnicodeCharacters
// ---------------------------------------------------------------------------
describe("containsUnicodeCharacters", () => {
  describe("falsy / empty input", () => {
    it("returns false for empty string", () => {
      expect(containsUnicodeCharacters("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(containsUnicodeCharacters(null as unknown as string)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(containsUnicodeCharacters(undefined as unknown as string)).toBe(
        false,
      );
    });
  });

  describe("plain ASCII", () => {
    it("returns false for simple ASCII text", () => {
      expect(containsUnicodeCharacters("Hello World 123 !@#$%")).toBe(false);
    });

    it("returns false for text with normal punctuation", () => {
      expect(containsUnicodeCharacters("a <= b, c >= d, x != y")).toBe(false);
    });
  });

  describe("text with mapped unicode characters", () => {
    it("returns true for a single unicode character", () => {
      expect(containsUnicodeCharacters("≤")).toBe(true);
    });

    it("returns true for text containing one unicode char among ASCII", () => {
      expect(containsUnicodeCharacters("value is ≥ 100")).toBe(true);
    });

    it("returns true for Greek letters", () => {
      expect(containsUnicodeCharacters("angle α")).toBe(true);
    });

    it("returns true for arrows", () => {
      expect(containsUnicodeCharacters("go →")).toBe(true);
    });

    it("returns true for superscripts", () => {
      expect(containsUnicodeCharacters("x²")).toBe(true);
    });

    it("returns true for subscripts", () => {
      expect(containsUnicodeCharacters("H₂O")).toBe(true);
    });

    it("returns true for multiple different unicode characters", () => {
      expect(containsUnicodeCharacters("α → β ≤ γ")).toBe(true);
    });
  });

  describe("ADDITIONAL_UNICODE_MAP characters", () => {
    it("returns true for left double quote", () => {
      expect(containsUnicodeCharacters("\u201Chello")).toBe(true);
    });

    it("returns true for right double quote", () => {
      expect(containsUnicodeCharacters("hello\u201D")).toBe(true);
    });

    it("returns true for left single quote", () => {
      expect(containsUnicodeCharacters("\u2018test")).toBe(true);
    });

    it("returns true for right single quote", () => {
      expect(containsUnicodeCharacters("test\u2019")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// getUnicodeStats
// ---------------------------------------------------------------------------
describe("getUnicodeStats", () => {
  describe("plain ASCII text", () => {
    it("returns total=0 and empty set for plain text", () => {
      const stats = getUnicodeStats("Hello World 123");
      expect(stats.total).toBe(0);
      expect(stats.unique.size).toBe(0);
    });

    it("returns total=0 and empty set for empty string", () => {
      const stats = getUnicodeStats("");
      expect(stats.total).toBe(0);
      expect(stats.unique.size).toBe(0);
    });
  });

  describe("text with unicode characters", () => {
    it("counts a single unicode character", () => {
      const stats = getUnicodeStats("x ≤ 5");
      expect(stats.total).toBe(1);
      expect(stats.unique.has("≤")).toBe(true);
    });

    it("counts multiple distinct unicode characters", () => {
      const stats = getUnicodeStats("α → β ≤ γ");
      expect(stats.total).toBe(5);
      expect(stats.unique).toEqual(new Set(["α", "→", "β", "≤", "γ"]));
    });

    it("counts repeated characters as one unique entry", () => {
      const stats = getUnicodeStats("α + α + α");
      expect(stats.total).toBe(1);
      expect(stats.unique.size).toBe(1);
      expect(stats.unique.has("α")).toBe(true);
    });

    it("includes characters from ADDITIONAL_UNICODE_MAP", () => {
      const stats = getUnicodeStats("\u201Chello\u201D");
      expect(stats.total).toBe(2);
      expect(stats.unique.has("\u201C")).toBe(true);
      expect(stats.unique.has("\u201D")).toBe(true);
    });

    it("counts characters from both maps together", () => {
      const stats = getUnicodeStats("\u201Cα ≥ 0\u201D");
      expect(stats.total).toBe(4);
      expect(stats.unique).toEqual(new Set(["α", "≥", "\u201C", "\u201D"]));
    });

    it("correctly identifies superscript and subscript characters", () => {
      const stats = getUnicodeStats("x² + y₃");
      expect(stats.total).toBe(2);
      expect(stats.unique.has("²")).toBe(true);
      expect(stats.unique.has("₃")).toBe(true);
    });

    it("identifies checkmarks", () => {
      const stats = getUnicodeStats("✓ pass ✗ fail");
      expect(stats.total).toBe(2);
      expect(stats.unique.has("✓")).toBe(true);
      expect(stats.unique.has("✗")).toBe(true);
    });

    it("identifies set theory and logic symbols", () => {
      const stats = getUnicodeStats("∀x ∈ A ∧ ∃y ∈ B");
      expect(stats.total).toBe(4);
      expect(stats.unique).toEqual(new Set(["∀", "∈", "∧", "∃"]));
    });
  });
});
