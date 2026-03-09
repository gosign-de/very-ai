-- Remove old job (if exists)
SELECT cron.unschedule('pii_audit_log_cleanup_job');

-- Recreate job with correct SQL (no PERFORM)
SELECT cron.schedule(
  'pii_audit_log_cleanup_job',
  '0 0 * * *', -- daily at midnight UTC
  $$SELECT delete_expired_pii_audit_logs();$$
);