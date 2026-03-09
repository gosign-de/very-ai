-- Migration: Add Thinking Steps Feature for n8n Webhooks
-- Purpose: Enable async webhook execution with real-time step progress feedback

--------------- MODIFY N8N_WEBHOOKS TABLE ---------------

-- Add thinking_steps_enabled column to existing n8n_webhooks table
ALTER TABLE n8n_webhooks 
ADD COLUMN IF NOT EXISTS thinking_steps_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN n8n_webhooks.thinking_steps_enabled IS 
  'When true, webhook uses async execution with callback-based step updates for long-running workflows';

-- Add timeout_minutes column for configurable timeout
ALTER TABLE n8n_webhooks 
ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN n8n_webhooks.timeout_minutes IS 
  'Timeout in minutes for async webhook executions (used when thinking_steps_enabled is true)';


--------------- N8N WORKFLOW EXECUTIONS TABLE ---------------

-- Main table to track async workflow executions
CREATE TABLE IF NOT EXISTS n8n_workflow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationships
  webhook_id UUID NOT NULL REFERENCES n8n_webhooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  
  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'error', 'timeout', 'cancelled')),
  
  -- Step tracking
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
  
  -- Result storage
  result JSONB,
  error_message TEXT,
  
  -- Metadata
  request_data JSONB,
  n8n_execution_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE n8n_workflow_executions IS 
  'Tracks async n8n workflow executions for thinking steps feature';


--------------- N8N WORKFLOW STEPS TABLE ---------------

-- Sub-table to track individual steps within an execution
CREATE TABLE IF NOT EXISTS n8n_workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES n8n_workflow_executions(id) ON DELETE CASCADE,
  
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'processing', 'completed', 'error')),
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Step data
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique step numbers per execution
  UNIQUE(execution_id, step_number)
);

COMMENT ON TABLE n8n_workflow_steps IS 
  'Tracks individual step progress within async n8n workflow executions';


--------------- INDEXES ---------------

CREATE INDEX IF NOT EXISTS idx_workflow_executions_user ON n8n_workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_webhook ON n8n_workflow_executions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON n8n_workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_expires ON n8n_workflow_executions(expires_at) 
  WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_workflow_steps_execution ON n8n_workflow_steps(execution_id);


--------------- ROW LEVEL SECURITY ---------------

ALTER TABLE n8n_workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE n8n_workflow_steps ENABLE ROW LEVEL SECURITY;

-- Users can view their own executions
CREATE POLICY "Users can view own executions" ON n8n_workflow_executions
  FOR SELECT USING (user_id = auth.uid());

-- Service role can insert executions (for API routes)
CREATE POLICY "Service can insert executions" ON n8n_workflow_executions
  FOR INSERT WITH CHECK (true);

-- Service role can update executions (for callback updates)
CREATE POLICY "Service can update executions" ON n8n_workflow_executions
  FOR UPDATE USING (true);

-- Users can delete their own executions (for cleanup after completion)
CREATE POLICY "Users can delete own executions" ON n8n_workflow_executions
  FOR DELETE USING (user_id = auth.uid());

-- Users can view steps of their own executions
CREATE POLICY "Users can view own steps" ON n8n_workflow_steps
  FOR SELECT USING (
    execution_id IN (SELECT id FROM n8n_workflow_executions WHERE user_id = auth.uid())
  );

-- Service role can insert steps
CREATE POLICY "Service can insert steps" ON n8n_workflow_steps
  FOR INSERT WITH CHECK (true);

-- Service role can update steps
CREATE POLICY "Service can update steps" ON n8n_workflow_steps
  FOR UPDATE USING (true);


--------------- HELPER FUNCTIONS ---------------

-- Function to create a new workflow execution
CREATE OR REPLACE FUNCTION create_workflow_execution(
  p_webhook_id UUID,
  p_user_id UUID,
  p_chat_id UUID DEFAULT NULL,
  p_request_data JSONB DEFAULT NULL,
  p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_execution_id UUID;
BEGIN
  INSERT INTO n8n_workflow_executions (
    webhook_id,
    user_id,
    chat_id,
    request_data,
    expires_at,
    status
  ) VALUES (
    p_webhook_id,
    p_user_id,
    p_chat_id,
    p_request_data,
    NOW() + (p_timeout_minutes || ' minutes')::INTERVAL,
    'pending'
  ) RETURNING id INTO v_execution_id;

  RETURN v_execution_id;
END;
$$;

-- Function to update execution from callback
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

-- Function to add or update a step
CREATE OR REPLACE FUNCTION upsert_workflow_step(
  p_execution_id UUID,
  p_step_number INTEGER,
  p_step_name TEXT,
  p_status TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step_id UUID;
BEGIN
  INSERT INTO n8n_workflow_steps (
    execution_id,
    step_number,
    step_name,
    status,
    metadata,
    started_at,
    completed_at,
    duration_ms
  ) VALUES (
    p_execution_id,
    p_step_number,
    p_step_name,
    p_status,
    p_metadata,
    CASE WHEN p_status IN ('running', 'processing', 'completed', 'error') THEN NOW() ELSE NULL END,
    CASE WHEN p_status IN ('completed', 'error') THEN NOW() ELSE NULL END,
    NULL
  )
  ON CONFLICT (execution_id, step_number) DO UPDATE SET
    step_name = EXCLUDED.step_name,
    status = EXCLUDED.status,
    metadata = COALESCE(EXCLUDED.metadata, n8n_workflow_steps.metadata),
    started_at = CASE 
      WHEN n8n_workflow_steps.started_at IS NULL AND EXCLUDED.status IN ('running', 'processing', 'completed', 'error') 
      THEN NOW() 
      ELSE n8n_workflow_steps.started_at 
    END,
    completed_at = CASE 
      WHEN EXCLUDED.status IN ('completed', 'error') THEN NOW() 
      ELSE n8n_workflow_steps.completed_at 
    END,
    duration_ms = CASE 
      WHEN EXCLUDED.status IN ('completed', 'error') AND n8n_workflow_steps.started_at IS NOT NULL
      THEN EXTRACT(MILLISECONDS FROM NOW() - n8n_workflow_steps.started_at)::INTEGER
      ELSE n8n_workflow_steps.duration_ms
    END
  RETURNING id INTO v_step_id;

  -- Also update current_step in the execution
  UPDATE n8n_workflow_executions
  SET current_step = p_step_number
  WHERE id = p_execution_id AND current_step < p_step_number;

  RETURN v_step_id;
END;
$$;

-- Drop existing functions that need return type changes
DROP FUNCTION IF EXISTS get_webhooks_for_model(TEXT, UUID);
DROP FUNCTION IF EXISTS get_webhooks_for_assistant(UUID, UUID);

-- Update get_webhooks_for_model to include thinking_steps_enabled
CREATE OR REPLACE FUNCTION get_webhooks_for_model(
    p_model_id TEXT,
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    webhook_url TEXT,
    http_method TEXT,
    schema JSONB,
    custom_headers JSONB,
    status TEXT,
    thinking_steps_enabled BOOLEAN,
    timeout_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.name,
        w.description,
        w.webhook_url,
        w.http_method,
        w.schema,
        w.custom_headers,
        w.status,
        w.thinking_steps_enabled,
        w.timeout_minutes
    FROM n8n_webhooks w
    INNER JOIN n8n_webhook_assignments a ON w.id = a.webhook_id
    WHERE a.entity_type = 'model'
        AND a.entity_id = p_model_id
        AND a.user_id = p_user_id
        AND w.status = 'active';
END;
$$;

-- Update get_webhooks_for_assistant to include thinking_steps_enabled
CREATE OR REPLACE FUNCTION get_webhooks_for_assistant(
    p_assistant_id UUID,
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    webhook_url TEXT,
    http_method TEXT,
    schema JSONB,
    custom_headers JSONB,
    status TEXT,
    thinking_steps_enabled BOOLEAN,
    timeout_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.name,
        w.description,
        w.webhook_url,
        w.http_method,
        w.schema,
        w.custom_headers,
        w.status,
        w.thinking_steps_enabled,
        w.timeout_minutes
    FROM n8n_webhooks w
    INNER JOIN n8n_webhook_assignments a ON w.id = a.webhook_id
    WHERE a.entity_type = 'assistant'
        AND a.entity_id = p_assistant_id::TEXT
        AND a.user_id = p_user_id
        AND w.status = 'active';
END;
$$;
