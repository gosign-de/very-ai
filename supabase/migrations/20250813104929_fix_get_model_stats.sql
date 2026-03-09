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

    -- Determine the time condition based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
    ELSIF time_period = 'this_month' THEN
        -- Current month from beginning to now (using NOW() instead of CURRENT_DATE + 1 day)
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE) AND m.created_at <= NOW()';
    ELSIF time_period = 'last_month' THEN
        -- Previous full month (e.g., if current is Aug, show all of July)
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE - INTERVAL ''1 month'') AND m.created_at < DATE_TRUNC(''month'', CURRENT_DATE)';
    ELSIF time_period = 'this_year' THEN
        -- From Jan 1 to current moment (using NOW() instead of CURRENT_DATE + 1 day)
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE) AND m.created_at <= NOW()';
    ELSIF time_period = 'last_year' THEN
        -- Entire previous year
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < DATE_TRUNC(''year'', CURRENT_DATE)';
    ELSE
        -- Default to this month if unknown period (using NOW() instead of CURRENT_DATE + 1 day)
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE) AND m.created_at <= NOW()';
    END IF;

    -- Determine the model condition based on the model_name parameter
    IF model_name IS NULL OR model_name = 'all_models' THEN
        model_condition := 'TRUE'; -- No model filtering
    ELSE
        model_condition := format('m.model = %L', model_name); -- Filter by specific model
    END IF;

    -- Construct and execute the SQL query WITHOUT LIMIT
    -- IMPORTANT: No LIMIT clause to ensure ALL data is returned
    RETURN QUERY EXECUTE format(
        'SELECT
            m.created_at,
            m.model
        FROM messages m
        WHERE m.role = %L
          AND (%s)
          AND (%s)
        ORDER BY m.created_at DESC',  -- Added ORDER BY for consistent results
        role_param,
        time_condition,
        model_condition
    );
END;
$function$
;


