-- Create admin_settings table
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(key);

-- Enable RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access (you may need to adjust this based on your admin role system)
CREATE POLICY "Allow admin access to admin_settings"
    ON admin_settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Insert default admin settings
INSERT INTO admin_settings (key, value, description) VALUES
    ('default_model', 'gemini-2.5-pro', 'Default chat model for new workspaces'),
    ('default_image_model', 'imagen-3.0-generate-002', 'Default image generation model for new workspaces'),
    ('default_context_length', '1048576', 'Default context length for new workspaces'),
    ('default_temperature', '0.5', 'Default temperature setting for new workspaces'),
    ('default_prompt', 'You are a helpful AI assistant.', 'Default system prompt for new workspaces'),
    ('default_embeddings_provider', 'openai', 'Default embeddings provider for new workspaces'),
    ('include_profile_context', 'true', 'Whether to include profile context by default'),
    ('include_workspace_instructions', 'true', 'Whether to include workspace instructions by default'),
    ('default_fallback_model', 'gemini-2.5-pro', 'Default fallback model when primary model is unavailable')
ON CONFLICT (key) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_settings_updated_at(); 