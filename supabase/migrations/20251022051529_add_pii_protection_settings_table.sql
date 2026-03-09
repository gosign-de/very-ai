-- =================================================================
-- Create PII Protection Settings Table
-- =================================================================
CREATE TABLE pii_protection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  enabled boolean DEFAULT false,
  detection_engine text CHECK (detection_engine IN ('azure', 'presidio')) DEFAULT 'azure',
  custom_patterns jsonb DEFAULT '[]',
  categories jsonb DEFAULT '[]',
  max_sensitivity_level text CHECK (max_sensitivity_level IN ('public', 'internal', 'confidential', 'restricted')) DEFAULT 'internal',
  audit_log_enabled boolean DEFAULT true,
  audit_log_retention_days integer DEFAULT 90,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- =================================================================
-- Create Helper Function to Check Admin Status
-- =================================================================
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_groups ug
    INNER JOIN azure_groups ag ON ug.group_id = ag.group_id
    WHERE ug.user_id = $1
      AND LOWER(ag.role) = 'admin'
  );
$$;

-- =================================================================
-- Create Updated At Trigger Function
-- =================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =================================================================
-- Create Trigger for Auto-updating updated_at
-- =================================================================
CREATE TRIGGER update_pii_protection_settings_updated_at
  BEFORE UPDATE ON pii_protection_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- Enable Row Level Security
-- =================================================================
ALTER TABLE pii_protection_settings ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- RLS Policies
-- =================================================================

-- Policy: All authenticated users can read settings
CREATE POLICY "Authenticated read access"
  ON pii_protection_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admin users can insert, update, or delete settings
CREATE POLICY "Admin write access"
  ON pii_protection_settings
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- =================================================================
-- Create Indexes for Performance
-- =================================================================
CREATE INDEX idx_pii_protection_settings_model_id ON pii_protection_settings(model_id);
CREATE INDEX idx_pii_protection_settings_enabled ON pii_protection_settings(enabled);

-- =================================================================
-- Grant Permissions
-- =================================================================

GRANT ALL ON pii_protection_settings TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated;

-- =================================================================
-- Comments for Documentation
-- =================================================================
COMMENT ON TABLE pii_protection_settings IS 'Stores PII protection configuration settings. Read access for all authenticated users, write access (insert/update/delete) restricted to admins via RLS.';
COMMENT ON COLUMN pii_protection_settings.model_id IS 'Unique identifier for the model this setting applies to';
COMMENT ON COLUMN pii_protection_settings.enabled IS 'Whether PII protection is enabled for this model';
COMMENT ON COLUMN pii_protection_settings.detection_engine IS 'Engine used for PII detection: azure or presidio';
COMMENT ON COLUMN pii_protection_settings.custom_patterns IS 'JSON array of custom regex patterns for PII detection';
COMMENT ON COLUMN pii_protection_settings.categories IS 'JSON array of PII categories to detect (e.g., email, phone, ssn)';
COMMENT ON COLUMN pii_protection_settings.max_sensitivity_level IS 'Maximum sensitivity level allowed: public, internal, confidential, restricted';
COMMENT ON COLUMN pii_protection_settings.audit_log_enabled IS 'Whether to log PII detection events';
COMMENT ON COLUMN pii_protection_settings.audit_log_retention_days IS 'Number of days to retain audit logs';
COMMENT ON FUNCTION is_admin(uuid) IS 'Checks if a user has admin role via user_groups and azure_groups tables';
