-- Migration: Add cancelled status and update statistics for n8n failure logging
-- Purpose: Enable proper failure logging for async workflows with deep error extraction

-- 1. Update n8n_webhook_logs status CHECK constraint to include 'cancelled'
ALTER TABLE n8n_webhook_logs 
DROP CONSTRAINT IF EXISTS n8n_webhook_logs_status_check;

ALTER TABLE n8n_webhook_logs 
ADD CONSTRAINT n8n_webhook_logs_status_check 
CHECK (status IN ('success', 'error', 'timeout', 'cancelled', 'pending', 'running'));

-- 2. Update n8n_workflow_executions status CHECK constraint to include 'cancelled'
ALTER TABLE n8n_workflow_executions 
DROP CONSTRAINT IF EXISTS n8n_workflow_executions_status_check;

ALTER TABLE n8n_workflow_executions 
ADD CONSTRAINT n8n_workflow_executions_status_check 
CHECK (status IN ('pending', 'running', 'completed', 'error', 'timeout', 'cancelled'));

-- 3. Update get_webhook_statistics to count 'cancelled' as failed
CREATE OR REPLACE FUNCTION get_webhook_statistics(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_webhooks BIGINT,
    active_webhooks BIGINT,
    total_calls BIGINT,
    successful_calls BIGINT,
    failed_calls BIGINT,
    success_rate NUMERIC,
    avg_execution_time_ms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM n8n_webhooks WHERE user_id = p_user_id),
        (SELECT COUNT(*) FROM n8n_webhooks WHERE user_id = p_user_id AND status = 'active'),
        (SELECT COUNT(*) FROM n8n_webhook_logs WHERE user_id = p_user_id AND created_at >= NOW() - INTERVAL '1 day' * p_days),
        (SELECT COUNT(*) FROM n8n_webhook_logs WHERE user_id = p_user_id AND status = 'success' AND created_at >= NOW() - INTERVAL '1 day' * p_days),
        -- Updated to include 'cancelled' in failed calls
        (SELECT COUNT(*) FROM n8n_webhook_logs WHERE user_id = p_user_id AND status IN ('error', 'timeout', 'cancelled') AND created_at >= NOW() - INTERVAL '1 day' * p_days),
        (SELECT
            CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            END
        FROM n8n_webhook_logs
        WHERE user_id = p_user_id AND created_at >= NOW() - INTERVAL '1 day' * p_days),
        (SELECT
            CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND(AVG(execution_time_ms), 2)
            END
        FROM n8n_webhook_logs
        WHERE user_id = p_user_id AND status = 'success' AND created_at >= NOW() - INTERVAL '1 day' * p_days);
END;
$$;

-- 4. Create function to log async execution completion (mirrors to n8n_webhook_logs)
CREATE OR REPLACE FUNCTION log_async_execution_completion(
    p_execution_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL,
    p_response_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
    v_execution RECORD;
    v_execution_time_ms INTEGER;
    v_executions_status TEXT;
BEGIN
    -- Get execution details
    SELECT 
        id, user_id, webhook_id, chat_id, request_data, started_at, n8n_execution_id
    INTO v_execution
    FROM n8n_workflow_executions
    WHERE id = p_execution_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Execution not found: %', p_execution_id;
    END IF;

    -- Calculate execution time in milliseconds
    v_execution_time_ms := (EXTRACT(EPOCH FROM NOW() - v_execution.started_at) * 1000)::INTEGER;

    -- Map status: n8n_workflow_executions uses 'completed', code passes 'success'
    v_executions_status := CASE WHEN p_status = 'success' THEN 'completed' ELSE p_status END;

    -- Insert into n8n_webhook_logs for statistics (uses 'success' directly)
    INSERT INTO n8n_webhook_logs (
        user_id,
        webhook_id,
        chat_id,
        request_data,
        response_data,
        status,
        error_message,
        execution_time_ms,
        http_status_code
    ) VALUES (
        v_execution.user_id,
        v_execution.webhook_id,
        v_execution.chat_id,
        v_execution.request_data,
        p_response_data,
        p_status,
        p_error_message,
        v_execution_time_ms,
        CASE WHEN p_status = 'success' THEN 200 ELSE 500 END
    ) RETURNING id INTO v_log_id;

    -- Update the execution record (uses 'completed' for success)
    -- Only update result if p_response_data is provided, otherwise keep existing result from callback
    UPDATE n8n_workflow_executions
    SET
        status = v_executions_status,
        error_message = p_error_message,
        result = CASE 
            WHEN p_response_data IS NOT NULL THEN p_response_data 
            ELSE result  -- Keep existing result (set by callback)
        END,
        completed_at = NOW()
    WHERE id = p_execution_id;

    RETURN v_log_id;
END;
$$;



COMMENT ON FUNCTION log_async_execution_completion IS 
    'Logs async execution completion to n8n_webhook_logs for statistics and updates the execution record';
