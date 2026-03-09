ALTER TABLE file_items
ADD COLUMN IF NOT EXISTS original_content TEXT,
ADD COLUMN IF NOT EXISTS pii_entities JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS pii_token_map JSONB DEFAULT '{}'::jsonb;

