ALTER TABLE messages
ADD COLUMN IF NOT EXISTS original_content TEXT,
ADD COLUMN IF NOT EXISTS pii_entities JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS pii_token_map JSONB DEFAULT '{}'::jsonb;

-- Add index for querying messages with PII
CREATE INDEX IF NOT EXISTS idx_messages_pii_entities ON messages USING GIN (pii_entities);

