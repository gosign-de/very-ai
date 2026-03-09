-- Migration: Add thinkingcallback support for simplified n8n callbacks
-- This allows n8n workflows to use a single callback per step instead of running/completed pairs

-- New RPC function that handles the simplified thinkingcallback format
-- When called, it auto-completes any running step and inserts a new running step
CREATE OR REPLACE FUNCTION upsert_thinkingcallback_step(
  p_execution_id UUID,
  p_step_value TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step_id UUID;
  v_next_step_number INTEGER;
BEGIN
  -- Complete any currently running step (calculate duration automatically)
  UPDATE n8n_workflow_steps
  SET 
    status = 'completed',
    completed_at = NOW(),
    duration_ms = EXTRACT(MILLISECONDS FROM NOW() - started_at)::INTEGER
  WHERE execution_id = p_execution_id 
    AND status IN ('running', 'processing');

  -- Get next step number
  SELECT COALESCE(MAX(step_number), 0) + 1 
  INTO v_next_step_number
  FROM n8n_workflow_steps 
  WHERE execution_id = p_execution_id;

  -- Insert new running step with the value as step_name
  INSERT INTO n8n_workflow_steps (
    execution_id,
    step_number,
    step_name,
    status,
    started_at
  ) VALUES (
    p_execution_id,
    v_next_step_number,
    p_step_value,
    'running',
    NOW()
  ) RETURNING id INTO v_step_id;

  -- Update execution current_step (this triggers Realtime notifications)
  UPDATE n8n_workflow_executions
  SET current_step = v_next_step_number
  WHERE id = p_execution_id;

  RETURN v_step_id;
END;
$$;

COMMENT ON FUNCTION upsert_thinkingcallback_step IS 
  'Handles thinkingcallback format: auto-completes previous step, inserts new running step with auto-numbering';


-- Function to complete the last running step when execution finishes
CREATE OR REPLACE FUNCTION complete_last_thinkingcallback_step(
  p_execution_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Complete any currently running step
  UPDATE n8n_workflow_steps
  SET 
    status = 'completed',
    completed_at = NOW(),
    duration_ms = EXTRACT(MILLISECONDS FROM NOW() - started_at)::INTEGER
  WHERE execution_id = p_execution_id 
    AND status IN ('running', 'processing');

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION complete_last_thinkingcallback_step IS 
  'Called when execution completes to mark the last running step as completed';
