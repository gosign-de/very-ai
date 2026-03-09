import {
  PII_CATEGORIES,
  PII_CATEGORY_GROUPS,
  GROUPED_PII_CATEGORIES,
  PRESIDIO_PII_CATEGORIES,
  PRESIDIO_SUPPORTED_CATEGORY_VALUES,
  GROUPED_PRESIDIO_PII_CATEGORIES,
  PII_CATEGORIES_BY_ENGINE,
  GROUPED_PII_CATEGORIES_BY_ENGINE,
  getPiiCategoriesForEngine,
  getGroupedPiiCategories,
  filterCategoriesByEngine,
  getCategoryLabel,
  getCategoryByValue,
  DEFAULT_PII_CATEGORIES,
} from "./pii-categories";

describe("pii-categories", () => {
  // ---------------------------------------------------------------------------
  // PII_CATEGORIES
  // ---------------------------------------------------------------------------
  describe("PII_CATEGORIES", () => {
    it("should be a non-empty array", () => {
      expect(Array.isArray(PII_CATEGORIES)).toBe(true);
      expect(PII_CATEGORIES.length).toBeGreaterThan(0);
    });

    it("every entry should have value, label, description, and group", () => {
      for (const cat of PII_CATEGORIES) {
        expect(typeof cat.value).toBe("string");
        expect(cat.value.length).toBeGreaterThan(0);
        expect(typeof cat.label).toBe("string");
        expect(cat.label.length).toBeGreaterThan(0);
        expect(typeof cat.description).toBe("string");
        expect(cat.description.length).toBeGreaterThan(0);
        expect(PII_CATEGORY_GROUPS).toContain(cat.group);
      }
    });

    it('should contain a "Person" category', () => {
      const person = PII_CATEGORIES.find(c => c.value === "Person");
      expect(person).toBeDefined();
      expect(person!.label).toBe("Person Name");
      expect(person!.group).toBe("personal");
    });

    it('should contain an "Email" category', () => {
      const email = PII_CATEGORIES.find(c => c.value === "Email");
      expect(email).toBeDefined();
      expect(email!.label).toBe("Email Address");
      expect(email!.group).toBe("personal");
    });

    it("should have no duplicate values", () => {
      const values = PII_CATEGORIES.map(c => c.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  // ---------------------------------------------------------------------------
  // PII_CATEGORY_GROUPS
  // ---------------------------------------------------------------------------
  describe("PII_CATEGORY_GROUPS", () => {
    it("should contain all 7 expected groups", () => {
      const expected = [
        "personal",
        "identification",
        "financial",
        "medical",
        "location",
        "organization",
        "security",
      ];
      for (const group of expected) {
        expect(PII_CATEGORY_GROUPS).toContain(group);
      }
      expect(PII_CATEGORY_GROUPS).toHaveLength(7);
    });
  });

  // ---------------------------------------------------------------------------
  // GROUPED_PII_CATEGORIES
  // ---------------------------------------------------------------------------
  describe("GROUPED_PII_CATEGORIES", () => {
    it("should have a key for every group", () => {
      for (const group of PII_CATEGORY_GROUPS) {
        expect(GROUPED_PII_CATEGORIES).toHaveProperty(group);
        expect(Array.isArray(GROUPED_PII_CATEGORIES[group])).toBe(true);
      }
    });

    it('"personal" group should contain Person', () => {
      const personalValues = GROUPED_PII_CATEGORIES.personal.map(c => c.value);
      expect(personalValues).toContain("Person");
    });

    it('"financial" group should contain CreditCardNumber', () => {
      const financialValues = GROUPED_PII_CATEGORIES.financial.map(
        c => c.value,
      );
      expect(financialValues).toContain("CreditCardNumber");
    });

    it("all categories across groups should sum to PII_CATEGORIES length", () => {
      const total = PII_CATEGORY_GROUPS.reduce(
        (sum, group) => sum + GROUPED_PII_CATEGORIES[group].length,
        0,
      );
      expect(total).toBe(PII_CATEGORIES.length);
    });
  });

  // ---------------------------------------------------------------------------
  // PRESIDIO categories
  // ---------------------------------------------------------------------------
  describe("PRESIDIO_SUPPORTED_CATEGORY_VALUES", () => {
    it("should be a non-empty array", () => {
      expect(PRESIDIO_SUPPORTED_CATEGORY_VALUES.length).toBeGreaterThan(0);
    });

    it('should contain known values like "Person" and "Email"', () => {
      expect(PRESIDIO_SUPPORTED_CATEGORY_VALUES).toContain("Person");
      expect(PRESIDIO_SUPPORTED_CATEGORY_VALUES).toContain("Email");
      expect(PRESIDIO_SUPPORTED_CATEGORY_VALUES).toContain(
        "USSocialSecurityNumber",
      );
    });
  });

  describe("PRESIDIO_PII_CATEGORIES", () => {
    it("should be a non-empty array", () => {
      expect(PRESIDIO_PII_CATEGORIES.length).toBeGreaterThan(0);
    });

    it("should be a subset of PII_CATEGORIES", () => {
      const allValues = new Set(PII_CATEGORIES.map(c => c.value));
      for (const cat of PRESIDIO_PII_CATEGORIES) {
        expect(allValues.has(cat.value)).toBe(true);
      }
    });

    it("should have fewer or equal entries compared to PII_CATEGORIES", () => {
      expect(PRESIDIO_PII_CATEGORIES.length).toBeLessThanOrEqual(
        PII_CATEGORIES.length,
      );
    });

    it("every entry value should be in PRESIDIO_SUPPORTED_CATEGORY_VALUES", () => {
      const supported = new Set<string>(PRESIDIO_SUPPORTED_CATEGORY_VALUES);
      for (const cat of PRESIDIO_PII_CATEGORIES) {
        expect(supported.has(cat.value)).toBe(true);
      }
    });
  });

  describe("GROUPED_PRESIDIO_PII_CATEGORIES", () => {
    it("should have a key for every group", () => {
      for (const group of PII_CATEGORY_GROUPS) {
        expect(GROUPED_PRESIDIO_PII_CATEGORIES).toHaveProperty(group);
        expect(Array.isArray(GROUPED_PRESIDIO_PII_CATEGORIES[group])).toBe(
          true,
        );
      }
    });

    it("grouped entries should sum to PRESIDIO_PII_CATEGORIES length", () => {
      const total = PII_CATEGORY_GROUPS.reduce(
        (sum, group) => sum + GROUPED_PRESIDIO_PII_CATEGORIES[group].length,
        0,
      );
      expect(total).toBe(PRESIDIO_PII_CATEGORIES.length);
    });
  });

  // ---------------------------------------------------------------------------
  // PII_CATEGORIES_BY_ENGINE & GROUPED_PII_CATEGORIES_BY_ENGINE
  // ---------------------------------------------------------------------------
  describe("PII_CATEGORIES_BY_ENGINE", () => {
    it("azure key should reference PII_CATEGORIES", () => {
      expect(PII_CATEGORIES_BY_ENGINE.azure).toBe(PII_CATEGORIES);
    });

    it("presidio key should reference PRESIDIO_PII_CATEGORIES", () => {
      expect(PII_CATEGORIES_BY_ENGINE.presidio).toBe(PRESIDIO_PII_CATEGORIES);
    });
  });

  describe("GROUPED_PII_CATEGORIES_BY_ENGINE", () => {
    it("azure key should reference GROUPED_PII_CATEGORIES", () => {
      expect(GROUPED_PII_CATEGORIES_BY_ENGINE.azure).toBe(
        GROUPED_PII_CATEGORIES,
      );
    });

    it("presidio key should reference GROUPED_PRESIDIO_PII_CATEGORIES", () => {
      expect(GROUPED_PII_CATEGORIES_BY_ENGINE.presidio).toBe(
        GROUPED_PRESIDIO_PII_CATEGORIES,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getPiiCategoriesForEngine
  // ---------------------------------------------------------------------------
  describe("getPiiCategoriesForEngine", () => {
    it("should return the full list for azure", () => {
      const result = getPiiCategoriesForEngine("azure");
      expect(result).toBe(PII_CATEGORIES);
      expect(result.length).toBe(PII_CATEGORIES.length);
    });

    it("should return the presidio subset for presidio", () => {
      const result = getPiiCategoriesForEngine("presidio");
      expect(result).toBe(PRESIDIO_PII_CATEGORIES);
      expect(result.length).toBeLessThanOrEqual(PII_CATEGORIES.length);
    });
  });

  // ---------------------------------------------------------------------------
  // getGroupedPiiCategories
  // ---------------------------------------------------------------------------
  describe("getGroupedPiiCategories", () => {
    it("should return grouped record for azure with all group keys", () => {
      const result = getGroupedPiiCategories("azure");
      for (const group of PII_CATEGORY_GROUPS) {
        expect(result).toHaveProperty(group);
        expect(Array.isArray(result[group])).toBe(true);
      }
    });

    it("should return grouped record for presidio with all group keys", () => {
      const result = getGroupedPiiCategories("presidio");
      for (const group of PII_CATEGORY_GROUPS) {
        expect(result).toHaveProperty(group);
        expect(Array.isArray(result[group])).toBe(true);
      }
    });

    it("azure grouped should be GROUPED_PII_CATEGORIES", () => {
      expect(getGroupedPiiCategories("azure")).toBe(GROUPED_PII_CATEGORIES);
    });

    it("presidio grouped should be GROUPED_PRESIDIO_PII_CATEGORIES", () => {
      expect(getGroupedPiiCategories("presidio")).toBe(
        GROUPED_PRESIDIO_PII_CATEGORIES,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // filterCategoriesByEngine
  // ---------------------------------------------------------------------------
  describe("filterCategoriesByEngine", () => {
    it("should return empty array for null input", () => {
      expect(filterCategoriesByEngine(null, "azure")).toEqual([]);
    });

    it("should return empty array for undefined input", () => {
      expect(filterCategoriesByEngine(undefined, "azure")).toEqual([]);
    });

    it("should return empty array for empty array input", () => {
      expect(filterCategoriesByEngine([], "azure")).toEqual([]);
    });

    it("should return valid categories for azure", () => {
      const input = ["Person", "Email", "CreditCardNumber"];
      const result = filterCategoriesByEngine(input, "azure");
      expect(result).toEqual(["Person", "Email", "CreditCardNumber"]);
    });

    it("should filter out invalid categories", () => {
      const input = ["Person", "NotARealCategory", "Email"];
      const result = filterCategoriesByEngine(input, "azure");
      expect(result).toEqual(["Person", "Email"]);
    });

    it("should filter out presidio-unsupported categories for presidio engine", () => {
      // DEIdentityCardNumber is azure-only (not in Presidio supported list)
      const input = ["Person", "DEIdentityCardNumber", "Email"];
      const result = filterCategoriesByEngine(input, "presidio");
      expect(result).toEqual(["Person", "Email"]);
    });

    it("should return all valid when all are supported by the engine", () => {
      const input = ["Person", "Email", "PhoneNumber"];
      const resultAzure = filterCategoriesByEngine(input, "azure");
      const resultPresidio = filterCategoriesByEngine(input, "presidio");
      expect(resultAzure).toEqual(input);
      expect(resultPresidio).toEqual(input);
    });

    it("should return empty array when no categories match the engine", () => {
      const input = ["CompletelyFake", "AlsoNotReal"];
      expect(filterCategoriesByEngine(input, "azure")).toEqual([]);
      expect(filterCategoriesByEngine(input, "presidio")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getCategoryLabel
  // ---------------------------------------------------------------------------
  describe("getCategoryLabel", () => {
    it("should return label for a known value (azure default)", () => {
      expect(getCategoryLabel("Person")).toBe("Person Name");
    });

    it("should return label for a known value with explicit azure engine", () => {
      expect(getCategoryLabel("Email", "azure")).toBe("Email Address");
    });

    it("should return label for a known presidio value", () => {
      expect(getCategoryLabel("CreditCardNumber", "presidio")).toBe(
        "Credit Card Number",
      );
    });

    it("should return the value string itself for an unknown value", () => {
      expect(getCategoryLabel("UnknownCategory")).toBe("UnknownCategory");
    });

    it("should return the value string for a category not in presidio", () => {
      // DEIdentityCardNumber exists in azure but not presidio
      expect(getCategoryLabel("DEIdentityCardNumber", "presidio")).toBe(
        "DEIdentityCardNumber",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getCategoryByValue
  // ---------------------------------------------------------------------------
  describe("getCategoryByValue", () => {
    it("should return PiiCategory object for a known value", () => {
      const result = getCategoryByValue("Person");
      expect(result).toBeDefined();
      expect(result!.value).toBe("Person");
      expect(result!.label).toBe("Person Name");
      expect(result!.group).toBe("personal");
      expect(typeof result!.description).toBe("string");
    });

    it("should return PiiCategory with explicit azure engine", () => {
      const result = getCategoryByValue("DEIdentityCardNumber", "azure");
      expect(result).toBeDefined();
      expect(result!.value).toBe("DEIdentityCardNumber");
      expect(result!.label).toBe("German Identity Card");
    });

    it("should return undefined for an unknown value", () => {
      expect(getCategoryByValue("DoesNotExist")).toBeUndefined();
    });

    it("should return undefined for an azure-only category when querying presidio", () => {
      expect(
        getCategoryByValue("DEIdentityCardNumber", "presidio"),
      ).toBeUndefined();
    });

    it("should return a presidio category when querying presidio", () => {
      const result = getCategoryByValue("Email", "presidio");
      expect(result).toBeDefined();
      expect(result!.value).toBe("Email");
      expect(result!.label).toBe("Email Address");
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_PII_CATEGORIES
  // ---------------------------------------------------------------------------
  describe("DEFAULT_PII_CATEGORIES", () => {
    it("should contain the expected default categories", () => {
      const expected = [
        "Person",
        "Email",
        "PhoneNumber",
        "Address",
        "USSocialSecurityNumber",
        "CreditCardNumber",
      ];
      expect(DEFAULT_PII_CATEGORIES).toEqual(expected);
    });

    it("all defaults should be valid PII_CATEGORIES values", () => {
      const allValues = new Set(PII_CATEGORIES.map(c => c.value));
      for (const val of DEFAULT_PII_CATEGORIES) {
        expect(allValues.has(val)).toBe(true);
      }
    });

    it("should have exactly 6 entries", () => {
      expect(DEFAULT_PII_CATEGORIES).toHaveLength(6);
    });
  });
});
