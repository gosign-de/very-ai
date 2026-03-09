set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_model_stats_aggregated(role_param text, time_period text, model_name text DEFAULT NULL::text)
 RETURNS TABLE(date_key text, model text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    time_condition TEXT;
    model_condition TEXT;
    date_format TEXT;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Determine the time condition and date format based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE AND m.created_at < CURRENT_DATE + INTERVAL ''1 day''';
        date_format := 'LPAD(EXTRACT(hour FROM m.created_at)::text, 2, ''0'') || '':00''';
    ELSIF time_period = 'this_month' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE) AND m.created_at <= NOW()';
        date_format := 'LPAD(EXTRACT(day FROM m.created_at)::text, 2, ''0'')';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE - INTERVAL ''1 month'') AND m.created_at < DATE_TRUNC(''month'', CURRENT_DATE)';
        date_format := 'LPAD(EXTRACT(day FROM m.created_at)::text, 2, ''0'') || '' '' || TO_CHAR(m.created_at, ''Mon'')';
    ELSIF time_period = 'this_year' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE) AND m.created_at <= NOW()';
        date_format := 'TO_CHAR(m.created_at, ''Mon'')';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= DATE_TRUNC(''year'', CURRENT_DATE - INTERVAL ''1 year'') AND m.created_at < DATE_TRUNC(''year'', CURRENT_DATE)';
        date_format := 'TO_CHAR(m.created_at, ''Mon'') || '' '' || EXTRACT(year FROM m.created_at)::text';
    ELSE
        -- Default to this month
        time_condition := 'm.created_at >= DATE_TRUNC(''month'', CURRENT_DATE) AND m.created_at <= NOW()';
        date_format := 'LPAD(EXTRACT(day FROM m.created_at)::text, 2, ''0'')';
    END IF;

    -- Determine the model condition based on the model_name parameter
    IF model_name IS NULL OR model_name = 'all_models' THEN
        model_condition := 'TRUE'; -- No model filtering
    ELSE
        model_condition := format('m.model = %L', model_name); -- Filter by specific model
    END IF;

    -- Construct and execute the aggregated SQL query
    RETURN QUERY EXECUTE format(
        'SELECT
            (%s) as date_key,
            m.model,
            COUNT(*) as count
        FROM messages m
        WHERE m.role = %L
          AND (%s)
          AND (%s)
        GROUP BY date_key, m.model
        ORDER BY date_key, m.model',
        date_format,
        role_param,
        time_condition,
        model_condition
    );
END;
$function$;