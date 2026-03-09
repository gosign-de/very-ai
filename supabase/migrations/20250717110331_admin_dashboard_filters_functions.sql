set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_model_stats(role_param text, time_period text, model_name text DEFAULT NULL::text)
 RETURNS TABLE(created_at timestamp with time zone, model text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    time_condition TEXT;
    model_condition TEXT;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Add your own authorization logic here if needed
    -- For example, check if user is an admin
    -- IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = calling_user_id AND is_admin = true) THEN
    --     RAISE EXCEPTION 'Admin access required';
    -- END IF;

    -- Determine the time condition based on the time_period (consistent with other functions)
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''30 days'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'previous_year' THEN
        time_condition := format('m.created_at >= DATE_TRUNC(''year'', CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < DATE_TRUNC(''year'', CURRENT_DATE)');
    ELSE
        time_condition := 'TRUE'; -- For 'all_time', include everything
    END IF;

    -- Determine the model condition based on the model_name parameter
    IF model_name IS NULL OR model_name = 'all_models' THEN
        model_condition := 'TRUE'; -- No model filtering
    ELSE
        model_condition := format('m.model = %L', model_name); -- Filter by specific model
    END IF;

    -- Construct and execute the SQL query
    RETURN QUERY EXECUTE format(
        'SELECT
            m.created_at,
            m.model
        FROM messages m
        WHERE m.role = %L
          AND (%s)
          AND (%s)',
        role_param,
        time_condition,
        model_condition
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_request_count(role_param text, time_period text, model_param text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    model_condition TEXT;
    time_condition TEXT;
    message_count BIGINT;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Add your own authorization logic here if needed

    -- Determine the model condition based on the model_param
    IF model_param IS NULL OR model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
    END IF;

    -- Determine the time condition based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''30 days'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'previous_year' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < DATE_TRUNC(''year'', CURRENT_DATE)';
    ELSE
        time_condition := 'TRUE'; -- For 'all_time', include everything
    END IF;

    -- Construct the SQL query dynamically to count messages
    EXECUTE format(
        'SELECT COUNT(*)
        FROM messages m
        WHERE m.role = %L
          AND (%s)
          AND (%s)',
        role_param,
        model_condition,
        time_condition
    ) INTO message_count;

    RETURN message_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_top_users(role_param text, limit_param integer, time_period text, model_param text)
 RETURNS TABLE(user_id uuid, username text, email text, message_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    model_condition TEXT;
    time_condition TEXT;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Add your own authorization logic here if needed

    -- Determine the model condition based on the model_param
    IF model_param IS NULL OR model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
    END IF;

    -- Determine the time condition based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''30 days'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'previous_year' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < DATE_TRUNC(''year'', CURRENT_DATE)';
    ELSE
        time_condition := 'TRUE'; -- For 'all_time', include everything
    END IF;

    -- Construct the SQL query dynamically
    RETURN QUERY EXECUTE format(
        'SELECT
            m.user_id,
            p.username,
            u.email::text AS email,  -- Cast email to text
            COUNT(*) AS message_count
        FROM messages m
        JOIN profiles p ON m.user_id = p.user_id
        JOIN auth.users u ON m.user_id = u.id  -- Join with auth.users
        WHERE m.role = %L
          AND (%s)
          AND (%s)
        GROUP BY m.user_id, p.username, u.email  -- Group by email as well
        ORDER BY message_count DESC
        LIMIT %s',
        role_param,
        model_condition,
        time_condition,
        limit_param
    );
END;
$function$
;