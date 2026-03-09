-- =================================================================
-- Create PII Audit Logs Table
-- =================================================================
CREATE TABLE pii_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  model_id TEXT NOT NULL,
  pii_type TEXT NOT NULL,
  pii_action TEXT NOT NULL,
  detection_engine TEXT CHECK (detection_engine IN ('azure', 'presidio')) DEFAULT 'azure'
);



-- =================================================================
-- Enable Row Level Security
-- =================================================================
ALTER TABLE pii_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and write everything
CREATE POLICY "Allow authenticated full access"
  ON pii_audit_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- =================================================================
-- Enable pg_cron if not already enabled
-- =================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA public;


-- =================================================================
-- FUNCTION: delete expired PII audit logs per model
-- =================================================================
CREATE OR REPLACE FUNCTION delete_expired_pii_audit_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT model_id, audit_log_retention_days
    FROM pii_protection_settings
    WHERE audit_log_retention_days IS NOT NULL
  LOOP
    DELETE FROM pii_audit_logs
    WHERE model_id = rec.model_id
    AND created_at < (NOW() - (rec.audit_log_retention_days || ' days')::INTERVAL);
  END LOOP;
END;
$$;


-- =================================================================
-- CRON JOB: run cleanup daily at midnight (UTC)
-- =================================================================
SELECT cron.schedule(
  'pii_audit_log_cleanup_job',
  '0 0 * * *', -- daily at 00:00 UTC
  $$PERFORM delete_expired_pii_audit_logs();$$
);