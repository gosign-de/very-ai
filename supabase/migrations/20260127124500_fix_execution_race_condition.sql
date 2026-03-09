-- Migration: Fix race condition in execution status updates
-- Issue: When multiple files are processed, background .then() can set status to "running" 
-- AFTER n8n callback has already set it to "completed"

-- Fix 1: update_execution_from_callback - Never downgrade from terminal status
CREATE OR REPLACE FUNCTION update_execution_from_callback(
  p_execution_id UUID,
  p_status TEXT DEFAULT NULL,
  p_current_step INTEGER DEFAULT NULL,
  p_total_steps INTEGER DEFAULT NULL,
  p_result JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_n8n_execution_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE n8n_workflow_executions
  SET
    -- Never downgrade from terminal status (completed/error/timeout/cancelled)
    status = CASE 
      WHEN status IN ('completed', 'error', 'timeout', 'cancelled') THEN status
      ELSE COALESCE(p_status, status)
    END,
    current_step = COALESCE(p_current_step, current_step),
    total_steps = COALESCE(p_total_steps, total_steps),
    result = COALESCE(p_result, result),
    error_message = COALESCE(p_error_message, error_message),
    n8n_execution_id = COALESCE(p_n8n_execution_id, n8n_execution_id),
    completed_at = CASE 
      WHEN p_status IN ('completed', 'error', 'timeout') THEN NOW()
      ELSE completed_at
    END
  WHERE id = p_execution_id;

  RETURN FOUND;
END;
$$;

-- Fix 2: log_async_execution_completion - Don't overwrite result if p_response_data is NULL
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

COMMENT ON FUNCTION update_execution_from_callback IS 
    'Updates execution from n8n callback. Never downgrades from terminal status to prevent race conditions.';

COMMENT ON FUNCTION log_async_execution_completion IS 
    'Logs async execution completion. Preserves existing result if p_response_data is NULL.';
