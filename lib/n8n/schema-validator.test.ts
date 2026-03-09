/**
 * Tests for n8n schema-validator utility functions
 *
 * All exported functions are PURE -- no external mocks needed except logger.
 *
 * Covers:
 * - validateAgainstSchema
 * - schemaExpectsFiles
 * - schemaExpectsText
 * - getSchemaSummary
 */

import {
  validateAgainstSchema,
  schemaExpectsFiles,
  schemaExpectsText,
  getSchemaSummary,
} from "@/lib/n8n/schema-validator";

// Mock the logger so server-only imports do not fail in test env
jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const textOnlySchema = {
  properties: {
    message: { type: "string", minLength: 5, maxLength: 100 },
  },
  required: ["message"],
};

const fileSchema = {
  properties: {
    file: { type: "string", format: "binary" },
  },
  required: ["file"],
};

const fileSchemaWithConstraints = {
  properties: {
    file: {
      type: "string",
      format: "binary",
      "x-accepted-types": ["pdf", "docx"],
      "x-max-size": 5 * 1024 * 1024, // 5 MB
    },
  },
  required: ["file"],
};

const multipleFilesSchema = {
  properties: {
    files: {
      type: "array",
      items: { type: "string", format: "binary" },
    },
  },
  required: [],
};

const singleFileOnlySchema = {
  properties: {
    file: {
      type: "string",
      format: "binary",
      "x-allow-multiple": false,
    },
  },
  required: [],
};

const openApiSchema = {
  paths: {
    "/webhook": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                properties: {
                  message: { type: "string" },
                },
                required: ["message"],
              },
            },
          },
        },
      },
    },
  },
};

const mixedSchema = {
  properties: {
    message: { type: "string", minLength: 3, maxLength: 200 },
    attachment: { type: "string", format: "binary" },
  },
  required: ["message"],
};

// ---------------------------------------------------------------------------
// Helper: create a fake File object (JSDOM compatible)
// ---------------------------------------------------------------------------

function makeFile(
  name: string,
  sizeBytes: number,
  type: string = "application/octet-stream",
): File {
  const buffer = new ArrayBuffer(sizeBytes);
  return new File([buffer], name, { type });
}

// ---------------------------------------------------------------------------
// validateAgainstSchema
// ---------------------------------------------------------------------------

describe("validateAgainstSchema", () => {
  // --- Happy paths ---

  it("returns valid for matching text data against text schema", () => {
    const result = validateAgainstSchema(
      { message: "Hello world" },
      textOnlySchema,
    );
    expect(result.valid).toBe(true);
  });

  it("returns valid for file upload against file schema", () => {
    const result = validateAgainstSchema(
      { files: [makeFile("report.pdf", 1024, "application/pdf")] },
      fileSchemaWithConstraints,
    );
    expect(result.valid).toBe(true);
  });

  it("returns valid for OpenAPI 3.0 paths-based schema", () => {
    const result = validateAgainstSchema(
      { message: "test message" },
      openApiSchema,
    );
    expect(result.valid).toBe(true);
  });

  // --- Error: missing / misconfigured schema ---

  it("returns error when schema has no requestBody (no extractable schema)", () => {
    const result = validateAgainstSchema({ message: "hello" }, { paths: {} });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("configuration error");
  });

  it("returns error for null-ish schema", () => {
    const result = validateAgainstSchema({ message: "hi" }, {});
    expect(result.valid).toBe(false);
  });

  // --- Error: file upload when schema doesn't accept files ---

  it("returns error for file upload when schema does not accept files", () => {
    const result = validateAgainstSchema(
      { files: [makeFile("photo.png", 1024)] },
      textOnlySchema,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not supported");
  });

  // --- Error: invalid file type ---

  it("returns error for invalid file type", () => {
    const result = validateAgainstSchema(
      { files: [makeFile("image.png", 1024, "image/png")] },
      fileSchemaWithConstraints,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });

  // --- Error: file too large ---

  it("returns error for file too large", () => {
    const bigFile = makeFile("huge.pdf", 10 * 1024 * 1024, "application/pdf");
    const result = validateAgainstSchema(
      { files: [bigFile] },
      fileSchemaWithConstraints,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
    expect(result.maxFileSize).toBe(5 * 1024 * 1024);
  });

  // --- Error: multiple files when not allowed ---

  it("returns error for multiple files when not allowed", () => {
    const result = validateAgainstSchema(
      {
        files: [
          makeFile("a.pdf", 100, "application/pdf"),
          makeFile("b.pdf", 100, "application/pdf"),
        ],
      },
      singleFileOnlySchema,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Multiple files not allowed");
  });

  // --- Error: message too short ---

  it("returns error for message too short", () => {
    const result = validateAgainstSchema({ message: "Hi" }, textOnlySchema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too short");
  });

  // --- Error: message too long ---

  it("returns error for message too long", () => {
    const longMessage = "x".repeat(101);
    const result = validateAgainstSchema(
      { message: longMessage },
      textOnlySchema,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too long");
  });

  // --- Error: missing required file ---

  it("returns error for missing required file", () => {
    const result = validateAgainstSchema({ message: "text only" }, fileSchema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File required");
  });

  // --- Error: missing required message ---

  it("returns error for missing required message", () => {
    const result = validateAgainstSchema({}, textOnlySchema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Message required");
  });

  it("returns error for whitespace-only message (hits minLength before required check)", () => {
    const result = validateAgainstSchema({ message: "  " }, textOnlySchema);
    expect(result.valid).toBe(false);
    // Message validation runs before required-field validation, so minLength triggers first
    expect(result.error).toContain("too short");
  });

  // --- Handles string schema (JSON.parse) ---

  it("handles string schema by parsing JSON", () => {
    const result = validateAgainstSchema(
      { message: "Hello world" },
      JSON.stringify(textOnlySchema),
    );
    expect(result.valid).toBe(true);
  });

  it("handles mixed schema with both text and file", () => {
    const result = validateAgainstSchema(
      { message: "Some text input" },
      mixedSchema,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// schemaExpectsFiles
// ---------------------------------------------------------------------------

describe("schemaExpectsFiles", () => {
  it("returns true for schema with binary format property", () => {
    expect(schemaExpectsFiles(fileSchema)).toBe(true);
  });

  it("returns true for schema with array of binary items", () => {
    expect(schemaExpectsFiles(multipleFilesSchema)).toBe(true);
  });

  it("returns false for text-only schema", () => {
    expect(schemaExpectsFiles(textOnlySchema)).toBe(false);
  });

  it("throws on null schema (source does not guard against null)", () => {
    expect(() => schemaExpectsFiles(null)).toThrow();
  });

  it("returns false for empty object schema", () => {
    expect(schemaExpectsFiles({})).toBe(false);
  });

  it("handles string schema (JSON string)", () => {
    expect(schemaExpectsFiles(JSON.stringify(fileSchema))).toBe(true);
  });

  it("returns true for OpenAPI schema with binary in paths", () => {
    const schema = {
      paths: {
        "/upload": {
          post: {
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: {
                    properties: {
                      document: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(schemaExpectsFiles(schema)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// schemaExpectsText
// ---------------------------------------------------------------------------

describe("schemaExpectsText", () => {
  it("returns true for schema with string property", () => {
    expect(schemaExpectsText(textOnlySchema)).toBe(true);
  });

  it("returns false for file-only schema", () => {
    expect(schemaExpectsText(fileSchema)).toBe(false);
  });

  it("throws on null schema (source does not guard against null)", () => {
    expect(() => schemaExpectsText(null)).toThrow();
  });

  it("returns false for empty object schema", () => {
    expect(schemaExpectsText({})).toBe(false);
  });

  it("returns true for mixed schema", () => {
    expect(schemaExpectsText(mixedSchema)).toBe(true);
  });

  it("handles string schema (JSON string)", () => {
    expect(schemaExpectsText(JSON.stringify(textOnlySchema))).toBe(true);
  });

  it("returns true for OpenAPI schema with string property", () => {
    expect(schemaExpectsText(openApiSchema)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSchemaSummary
// ---------------------------------------------------------------------------

describe("getSchemaSummary", () => {
  it("returns summary with correct flags for text-only schema", () => {
    const summary = getSchemaSummary(textOnlySchema);
    expect(summary.acceptsFiles).toBe(false);
    expect(summary.acceptsText).toBe(true);
    expect(summary.requiredFields).toEqual(["message"]);
  });

  it("returns summary with correct flags for file schema", () => {
    const summary = getSchemaSummary(fileSchema);
    expect(summary.acceptsFiles).toBe(true);
    expect(summary.acceptsText).toBe(false);
    expect(summary.requiredFields).toEqual(["file"]);
  });

  it("returns summary with fileTypes and maxFileSize when schema has constraints", () => {
    const summary = getSchemaSummary(fileSchemaWithConstraints);
    expect(summary.acceptsFiles).toBe(true);
    expect(summary.fileTypes).toEqual(["pdf", "docx"]);
    expect(summary.maxFileSize).toBe(5 * 1024 * 1024);
  });

  it("throws on null schema (source does not guard against null)", () => {
    expect(() => getSchemaSummary(null)).toThrow();
  });

  it("returns empty summary for empty object schema", () => {
    const summary = getSchemaSummary({});
    expect(summary).toEqual({
      acceptsFiles: false,
      acceptsText: false,
      requiredFields: [],
    });
  });

  it("returns summary for mixed schema", () => {
    const summary = getSchemaSummary(mixedSchema);
    expect(summary.acceptsFiles).toBe(true);
    expect(summary.acceptsText).toBe(true);
    expect(summary.requiredFields).toEqual(["message"]);
  });

  it("handles string schema (JSON string)", () => {
    const summary = getSchemaSummary(JSON.stringify(textOnlySchema));
    expect(summary.acceptsText).toBe(true);
    expect(summary.acceptsFiles).toBe(false);
  });

  it("returns summary for OpenAPI paths-based schema", () => {
    const summary = getSchemaSummary(openApiSchema);
    expect(summary.acceptsText).toBe(true);
    expect(summary.requiredFields).toEqual(["message"]);
  });
});
