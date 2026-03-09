-- Add n8n settings columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS n8n_url TEXT,
ADD COLUMN IF NOT EXISTS n8n_api_key TEXT;

-- Add comment to columns
COMMENT ON COLUMN profiles.n8n_url IS 'n8n instance URL for webhook integration';
COMMENT ON COLUMN profiles.n8n_api_key IS 'API key for n8n instance authentication';
