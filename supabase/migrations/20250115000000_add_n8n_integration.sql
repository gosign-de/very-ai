--------------- N8N WEBHOOKS ---------------

-- TABLE --

CREATE TABLE IF NOT EXISTS n8n_webhooks (
    -- ID
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- REQUIRED RELATIONSHIPS
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- METADATA
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,

    -- REQUIRED FIELDS
    name TEXT NOT NULL CHECK (char_length(name) <= 100),
    webhook_url TEXT NOT NULL CHECK (char_length(webhook_url) <= 2000),
    schema JSONB NOT NULL,

    -- OPTIONAL FIELDS
    description TEXT CHECK (char_length(description) <= 500),
    http_method TEXT NOT NULL DEFAULT 'POST' CHECK (http_method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
    custom_headers JSONB,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

    -- PREVENT DUPLICATES
    UNIQUE(user_id, name)
);

-- INDEXES --

CREATE INDEX n8n_webhooks_user_id_idx ON n8n_webhooks(user_id);
CREATE INDEX n8n_webhooks_status_idx ON n8n_webhooks(status);
CREATE INDEX n8n_webhooks_name_idx ON n8n_webhooks(name);

-- RLS --

ALTER TABLE n8n_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to own n8n webhooks"
    ON n8n_webhooks
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- TRIGGERS --

CREATE TRIGGER update_n8n_webhooks_updated_at
BEFORE UPDATE ON n8n_webhooks
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();


--------------- N8N WEBHOOK ASSIGNMENTS ---------------

-- TABLE --

CREATE TABLE IF NOT EXISTS n8n_webhook_assignments (
    -- ID
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- REQUIRED RELATIONSHIPS
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    webhook_id UUID NOT NULL REFERENCES n8n_webhooks(id) ON DELETE CASCADE,

    -- METADATA
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ASSIGNMENT DETAILS
    entity_type TEXT NOT NULL CHECK (entity_type IN ('model', 'assistant')),
    entity_id TEXT NOT NULL,

    -- PREVENT DUPLICATE ASSIGNMENTS
    UNIQUE(webhook_id, entity_type, entity_id)
);

-- INDEXES --

CREATE INDEX n8n_webhook_assignments_user_id_idx ON n8n_webhook_assignments(user_id);
CREATE INDEX n8n_webhook_assignments_webhook_id_idx ON n8n_webhook_assignments(webhook_id);
CREATE INDEX n8n_webhook_assignments_entity_idx ON n8n_webhook_assignments(entity_type, entity_id);

-- RLS --

ALTER TABLE n8n_webhook_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to own webhook assignments"
    ON n8n_webhook_assignments
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


--------------- N8N WEBHOOK LOGS ---------------

-- TABLE --

CREATE TABLE IF NOT EXISTS n8n_webhook_logs (
    -- ID
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- REQUIRED RELATIONSHIPS
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    webhook_id UUID NOT NULL REFERENCES n8n_webhooks(id) ON DELETE CASCADE,

    -- METADATA
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- EXECUTION DETAILS
    model_id TEXT,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,

    -- REQUEST/RESPONSE DATA
    request_data JSONB,
    response_data JSONB,

    -- STATUS & PERFORMANCE
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
    error_message TEXT,
    execution_time_ms INTEGER,
    http_status_code INTEGER
);

-- INDEXES --

CREATE INDEX n8n_webhook_logs_user_id_idx ON n8n_webhook_logs(user_id);
CREATE INDEX n8n_webhook_logs_webhook_id_idx ON n8n_webhook_logs(webhook_id);
CREATE INDEX n8n_webhook_logs_status_idx ON n8n_webhook_logs(status);
CREATE INDEX n8n_webhook_logs_created_at_idx ON n8n_webhook_logs(created_at DESC);
CREATE INDEX n8n_webhook_logs_model_id_idx ON n8n_webhook_logs(model_id);

-- RLS --

ALTER TABLE n8n_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow view access to own webhook logs"
    ON n8n_webhook_logs
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Allow insert own webhook logs"
    ON n8n_webhook_logs
    FOR INSERT
    WITH CHECK (user_id = auth.uid());


--------------- HELPER FUNCTIONS ---------------

-- Function to get webhooks assigned to a specific model
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
    status TEXT
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
        w.status
    FROM n8n_webhooks w
    INNER JOIN n8n_webhook_assignments a ON w.id = a.webhook_id
    WHERE a.entity_type = 'model'
        AND a.entity_id = p_model_id
        AND a.user_id = p_user_id
        AND w.status = 'active';
END;
$$;

-- Function to get webhooks assigned to a specific assistant
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
    status TEXT
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
        w.status
    FROM n8n_webhooks w
    INNER JOIN n8n_webhook_assignments a ON w.id = a.webhook_id
    WHERE a.entity_type = 'assistant'
        AND a.entity_id = p_assistant_id::TEXT
        AND a.user_id = p_user_id
        AND w.status = 'active';
END;
$$;

-- Function to get webhook statistics
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
        (SELECT COUNT(*) FROM n8n_webhook_logs WHERE user_id = p_user_id AND status IN ('error', 'timeout') AND created_at >= NOW() - INTERVAL '1 day' * p_days),
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

-- Function to get webhook usage by model
CREATE OR REPLACE FUNCTION get_webhook_usage_by_model(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    model_id TEXT,
    webhook_calls BIGINT,
    success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.model_id,
        COUNT(*) as webhook_calls,
        ROUND((COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) as success_rate
    FROM n8n_webhook_logs l
    WHERE l.user_id = p_user_id
        AND l.model_id IS NOT NULL
        AND l.created_at >= NOW() - INTERVAL '1 day' * p_days
    GROUP BY l.model_id
    ORDER BY webhook_calls DESC;
END;
$$;

-- Function to log webhook execution
CREATE OR REPLACE FUNCTION log_webhook_execution(
    p_user_id UUID,
    p_webhook_id UUID,
    p_model_id TEXT,
    p_assistant_id UUID,
    p_chat_id UUID,
    p_request_data JSONB,
    p_response_data JSONB,
    p_status TEXT,
    p_error_message TEXT,
    p_execution_time_ms INTEGER,
    p_http_status_code INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO n8n_webhook_logs (
        user_id,
        webhook_id,
        model_id,
        assistant_id,
        chat_id,
        request_data,
        response_data,
        status,
        error_message,
        execution_time_ms,
        http_status_code
    ) VALUES (
        p_user_id,
        p_webhook_id,
        p_model_id,
        p_assistant_id,
        p_chat_id,
        p_request_data,
        p_response_data,
        p_status,
        p_error_message,
        p_execution_time_ms,
        p_http_status_code
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;
