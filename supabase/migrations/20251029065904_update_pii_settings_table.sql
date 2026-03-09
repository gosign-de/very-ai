-- Add new boolean columns with sensible defaults
ALTER TABLE pii_protection_settings
  ADD COLUMN image_processing boolean DEFAULT true,
  ADD COLUMN doc_processing boolean DEFAULT true;

-- Update comments for clarity

COMMENT ON COLUMN pii_protection_settings.image_processing IS 'Whether to perform PII detection in images (OCR-based or model-based)';
COMMENT ON COLUMN pii_protection_settings.doc_processing IS 'Whether to perform PII detection during document processing (e.g., DOCX, PDF parsing)';
