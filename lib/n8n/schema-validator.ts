/**
 * Schema Validation Utility for n8n Webhooks
 *
 * This module validates user inputs against OpenAPI 3.0 webhook schemas
 * and generates dynamic, user-friendly error messages.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  guidance?: string;
  expectedTypes?: string[];
  requiredFields?: string[];
  maxFileSize?: number;
}

interface SchemaAnalysis {
  acceptsFiles: boolean;
  acceptsText: boolean;
  requiredFields: string[];
  fileProperties: FilePropertyInfo[];
  textProperties: TextPropertyInfo[];
}

interface FilePropertyInfo {
  name: string;
  acceptedTypes?: string[];
  maxSize?: number;
  multiple?: boolean;
}

interface TextPropertyInfo {
  name: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates user input against a webhook's OpenAPI 3.0 schema
 * @param data - The user's input data (message and/or files)
 * @param schema - The webhook's OpenAPI 3.0 schema
 * @returns ValidationResult with detailed error information if validation fails
 */
export function validateAgainstSchema(
  data: { message?: string; files?: File[] },
  schema: any,
): ValidationResult {
  // Parse schema if it's a string
  const parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;

  // Extract request schema from OpenAPI 3.0
  const requestSchema = extractRequestSchema(parsedSchema);

  if (!requestSchema) {
    return {
      valid: false,
      error: "Webhook configuration error",
      guidance:
        "The webhook schema is not properly configured. Please contact support.",
    };
  }

  // Analyze schema to understand expectations
  const schemaAnalysis = analyzeSchemaProperties(requestSchema);

  // Validate files if provided
  if (data.files && data.files.length > 0) {
    const fileValidation = validateFiles(data.files, schemaAnalysis);
    if (!fileValidation.valid) {
      return fileValidation;
    }
  }

  // Validate message/text fields if provided
  if (data.message) {
    const messageValidation = validateMessage(data.message, schemaAnalysis);
    if (!messageValidation.valid) {
      return messageValidation;
    }
  }

  // Validate required fields
  const requiredValidation = validateRequiredFields(data, schemaAnalysis);
  if (!requiredValidation.valid) {
    return requiredValidation;
  }

  return { valid: true };
}

// ============================================================================
// Schema Parsing Functions
// ============================================================================

/**
 * Extracts the request schema from an OpenAPI 3.0 schema
 * Supports both paths-based and direct requestBody formats
 */
function extractRequestSchema(schema: any): any {
  // Try paths first (standard OpenAPI 3.0 format)
  if (schema.paths) {
    for (const [_pathName, pathObj] of Object.entries(schema.paths)) {
      for (const [_method, methodObj] of Object.entries(pathObj as any)) {
        const requestBody = (methodObj as any)?.requestBody?.content;
        if (requestBody) {
          // Prefer multipart/form-data, then application/json
          const contentType =
            requestBody["multipart/form-data"]?.schema ||
            requestBody["application/json"]?.schema ||
            (Object.values(requestBody)[0] as any)?.schema;

          return contentType;
        }
      }
    }
  }

  // Fallback to direct requestBody (simplified format)
  if (schema.requestBody?.content) {
    const content = schema.requestBody.content;
    return (
      content["multipart/form-data"]?.schema ||
      content["application/json"]?.schema ||
      (Object.values(content)[0] as any)?.schema
    );
  }

  // Fallback to direct properties (very simplified format)
  if (schema.properties) {
    return schema;
  }

  return null;
}

/**
 * Analyzes schema properties to extract file and text field information
 */
function analyzeSchemaProperties(requestSchema: any): SchemaAnalysis {
  const properties = requestSchema.properties || {};
  const required = requestSchema.required || [];

  const analysis: SchemaAnalysis = {
    acceptsFiles: false,
    acceptsText: false,
    requiredFields: required,
    fileProperties: [],
    textProperties: [],
  };

  for (const [propName, propSchema] of Object.entries(properties)) {
    const prop = propSchema as any;

    // Detect file fields (format: binary or base64)
    if (
      (prop.type === "string" && prop.format === "binary") ||
      (prop.type === "string" && prop.format === "base64") ||
      prop.type === "file"
    ) {
      analysis.acceptsFiles = true;
      analysis.fileProperties.push({
        name: propName,
        acceptedTypes:
          prop["x-accepted-types"] || parseAcceptedTypes(prop.description),
        maxSize: prop["x-max-size"] || parseMaxSize(prop.description),
        multiple: prop["x-allow-multiple"] || prop.type === "array" || false,
      });
    }

    // Detect array of files
    else if (prop.type === "array" && prop.items) {
      const itemType = prop.items.type;
      const itemFormat = prop.items.format;

      if (
        (itemType === "string" &&
          (itemFormat === "binary" || itemFormat === "base64")) ||
        itemType === "file"
      ) {
        analysis.acceptsFiles = true;
        analysis.fileProperties.push({
          name: propName,
          acceptedTypes:
            prop.items["x-accepted-types"] ||
            parseAcceptedTypes(prop.description),
          maxSize: prop.items["x-max-size"] || parseMaxSize(prop.description),
          multiple: true,
        });
      }
    }

    // Detect text fields
    else if (prop.type === "string") {
      analysis.acceptsText = true;
      analysis.textProperties.push({
        name: propName,
        description: prop.description,
        minLength: prop.minLength,
        maxLength: prop.maxLength,
      });
    }
  }

  return analysis;
}

// ============================================================================
// Helper Parsing Functions
// ============================================================================

/**
 * Parses accepted file types from description string
 * Looks for patterns like "Accepts: PDF, DOCX, TXT" or "Supported formats: jpg, png"
 */
function parseAcceptedTypes(description?: string): string[] | undefined {
  if (!description) return undefined;

  // Look for various patterns
  const patterns = [
    /accepts?:?\s*([a-z0-9,\s]+)/i,
    /supported\s+(?:formats?|types?):?\s*([a-z0-9,\s]+)/i,
    /allowed\s+(?:formats?|types?):?\s*([a-z0-9,\s]+)/i,
    /file\s+types?:?\s*([a-z0-9,\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1].split(",").map(t => t.trim().toLowerCase());
    }
  }

  return undefined;
}

/**
 * Parses maximum file size from description string
 * Looks for patterns like "Max size: 10MB" or "Maximum: 5MB"
 */
function parseMaxSize(description?: string): number | undefined {
  if (!description) return undefined;

  // Look for size patterns
  const match = description.match(
    /max(?:imum)?\s*(?:size)?:?\s*(\d+)\s*(mb|kb|gb|bytes?)/i,
  );
  if (match) {
    const size = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === "kb" || unit === "kilobytes") return size * 1024;
    if (unit === "mb" || unit === "megabytes") return size * 1024 * 1024;
    if (unit === "gb" || unit === "gigabytes") return size * 1024 * 1024 * 1024;
    if (unit === "byte" || unit === "bytes") return size;
  }

  return undefined;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates uploaded files against schema requirements
 */
function validateFiles(
  files: File[],
  analysis: SchemaAnalysis,
): ValidationResult {
  // Check if files are expected
  if (!analysis.acceptsFiles) {
    return {
      valid: false,
      error: "Files not supported",
      guidance:
        "This workflow does not accept file uploads. Please send a text message only.",
    };
  }

  const fileProperty = analysis.fileProperties[0]; // Take first file field

  if (!fileProperty) {
    return { valid: true };
  }

  // Check file types
  if (fileProperty.acceptedTypes && fileProperty.acceptedTypes.length > 0) {
    for (const file of files) {
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const fileType = file.type.split("/")[1]?.toLowerCase();
      const fullType = file.type.toLowerCase();

      const matches = fileProperty.acceptedTypes.some(accepted => {
        const acceptedLower = accepted.toLowerCase();
        return (
          fileExt === acceptedLower ||
          fileType === acceptedLower ||
          fullType.includes(acceptedLower) ||
          acceptedLower.includes(fileExt || "") ||
          // Handle MIME type patterns like "image/*"
          (acceptedLower.includes("*") &&
            fullType.startsWith(acceptedLower.replace("*", "")))
        );
      });

      if (!matches) {
        return {
          valid: false,
          error: `Invalid file type: ${file.name}`,
          guidance:
            `This workflow accepts: ${fileProperty.acceptedTypes.map(t => t.toUpperCase()).join(", ")} files only. ` +
            `Please upload a compatible file format.`,
          expectedTypes: fileProperty.acceptedTypes,
        };
      }
    }
  }

  // Check file size
  if (fileProperty.maxSize) {
    for (const file of files) {
      if (file.size > fileProperty.maxSize) {
        const maxSizeMB = (fileProperty.maxSize / (1024 * 1024)).toFixed(1);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

        return {
          valid: false,
          error: `File too large: ${file.name}`,
          guidance:
            `Maximum file size: ${maxSizeMB}MB. Your file: ${fileSizeMB}MB. ` +
            `Please compress or choose a smaller file.`,
          maxFileSize: fileProperty.maxSize,
        };
      }
    }
  }

  // Check multiple files
  if (files.length > 1 && !fileProperty.multiple) {
    return {
      valid: false,
      error: "Multiple files not allowed",
      guidance:
        "This workflow accepts only one file at a time. Please upload a single file.",
    };
  }

  return { valid: true };
}

/**
 * Validates message text against schema requirements
 */
function validateMessage(
  message: string,
  analysis: SchemaAnalysis,
): ValidationResult {
  if (!analysis.acceptsText) {
    // Schema doesn't expect text, only files
    if (analysis.acceptsFiles) {
      return { valid: true }; // Message can be optional if files are primary
    }
  }

  const textProperty = analysis.textProperties[0];

  if (textProperty) {
    // Check min length
    if (textProperty.minLength && message.length < textProperty.minLength) {
      return {
        valid: false,
        error: "Message too short",
        guidance:
          `Please provide at least ${textProperty.minLength} characters. ` +
          (textProperty.description ? `Hint: ${textProperty.description}` : ""),
      };
    }

    // Check max length
    if (textProperty.maxLength && message.length > textProperty.maxLength) {
      return {
        valid: false,
        error: "Message too long",
        guidance: `Maximum ${textProperty.maxLength} characters allowed. Current: ${message.length} characters.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates that all required fields are present
 */
function validateRequiredFields(
  data: { message?: string; files?: File[] },
  analysis: SchemaAnalysis,
): ValidationResult {
  // Check if required file field is missing
  const hasRequiredFileField = analysis.requiredFields.some(field =>
    analysis.fileProperties.some(fp => fp.name === field),
  );

  if (hasRequiredFileField) {
    if (!data.files || data.files.length === 0) {
      const fileField = analysis.fileProperties.find(fp =>
        analysis.requiredFields.includes(fp.name),
      );

      return {
        valid: false,
        error: "File required",
        guidance:
          `This workflow requires a file. ` +
          (fileField?.acceptedTypes
            ? `Accepted formats: ${fileField.acceptedTypes.map(t => t.toUpperCase()).join(", ")}`
            : "Please upload a file."),
        expectedTypes: fileField?.acceptedTypes,
        requiredFields: analysis.requiredFields,
      };
    }
  }

  // Check if required text field is missing
  const hasRequiredTextField = analysis.requiredFields.some(field =>
    analysis.textProperties.some(tp => tp.name === field),
  );

  if (hasRequiredTextField) {
    if (!data.message || data.message.trim().length === 0) {
      const textField = analysis.textProperties.find(tp =>
        analysis.requiredFields.includes(tp.name),
      );

      return {
        valid: false,
        error: "Message required",
        guidance:
          `This workflow requires a message. ` +
          (textField?.description
            ? `${textField.description}`
            : "Please enter your message."),
        requiredFields: analysis.requiredFields,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a schema expects files
 */
export function schemaExpectsFiles(schema: any): boolean {
  const parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;
  const requestSchema = extractRequestSchema(parsedSchema);

  if (!requestSchema) return false;

  const analysis = analyzeSchemaProperties(requestSchema);
  return analysis.acceptsFiles;
}

/**
 * Checks if a schema expects text/message
 */
export function schemaExpectsText(schema: any): boolean {
  const parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;
  const requestSchema = extractRequestSchema(parsedSchema);

  if (!requestSchema) return false;

  const analysis = analyzeSchemaProperties(requestSchema);
  return analysis.acceptsText;
}

/**
 * Gets a summary of what a schema expects
 */
export function getSchemaSummary(schema: any): {
  acceptsFiles: boolean;
  acceptsText: boolean;
  requiredFields: string[];
  fileTypes?: string[];
  maxFileSize?: number;
} {
  const parsedSchema = typeof schema === "string" ? JSON.parse(schema) : schema;
  const requestSchema = extractRequestSchema(parsedSchema);

  if (!requestSchema) {
    return {
      acceptsFiles: false,
      acceptsText: false,
      requiredFields: [],
    };
  }

  const analysis = analyzeSchemaProperties(requestSchema);

  return {
    acceptsFiles: analysis.acceptsFiles,
    acceptsText: analysis.acceptsText,
    requiredFields: analysis.requiredFields,
    fileTypes: analysis.fileProperties[0]?.acceptedTypes,
    maxFileSize: analysis.fileProperties[0]?.maxSize,
  };
}
