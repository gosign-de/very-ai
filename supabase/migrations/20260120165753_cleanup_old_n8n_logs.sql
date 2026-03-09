-- Migration to add automated log cleanup for n8n detailed logs
-- This cleans up the large response_data (JSON) after 3 days to save storage
-- while keeping the log rows themselves for statistics (7/30/90 days).

-- 1. Create the cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_n8n_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set response_data and request_data to NULL for logs older than 3 days
    -- We keep the status, execution_time_ms, and metadata for statistics
    UPDATE n8n_webhook_logs
    SET 
        response_data = NULL,
        request_data = NULL
    WHERE created_at < NOW() - INTERVAL '3 days'
    AND (response_data IS NOT NULL OR request_data IS NOT NULL);

    -- Optional: Actually delete very old logs (e.g., older than 90 days) if they are no longer needed even for stats
    -- DELETE FROM n8n_webhook_logs WHERE created_at < NOW() - INTERVAL '95 days';
END;
$$;

-- 2. Schedule the cleanup to run daily at midnight
-- Note: This requires pg_cron to be enabled in Supabase (Extensions -> pg_cron)
DO $$
BEGIN
    -- Only try to schedule if the pg_cron extension is enabled
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Safely schedule/overwrite the job
        PERFORM cron.schedule(
            'cleanup-n8n-logs',  -- unique name
            '0 0 * * *',         -- daily at midnight
            'SELECT cleanup_old_n8n_logs()'
        );
    END IF;
END;
$$;

COMMENT ON FUNCTION cleanup_old_n8n_logs IS 'Cleans up detailed request/response data from n8n logs older than 3 days to save storage while preserving stats.';
