-- Fix the this_month time filter to include data up to the current moment instead of current date + 1 day
-- This fixes the issue where charts don't show data for the current day properly

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.get_model_stats(text, text, text);
DROP FUNCTION IF EXISTS public.get_request_count(text, text, text);
DROP FUNCTION IF EXISTS public.get_user_stats(text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_users(text, integer, text, text);

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

    -- Determine the model condition based on the model_param
    IF model_param IS NULL OR model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
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

    -- Construct the SQL query dynamically to count messages
    EXECUTE format(
        'SELECT COUNT(*)
        FROM messages m
        WHERE m.role = %L
          AND (%s)
          AND (%s)',
        role_param,
        time_condition,
        model_condition
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

    -- Determine the model condition based on the model_param
    IF model_param IS NULL OR model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
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

    -- Construct and execute the SQL query
    RETURN QUERY EXECUTE format(
        'SELECT
            m.user_id,
            p.username,
            au.email::text,
            COUNT(m.id) AS message_count
        FROM messages m
        INNER JOIN profiles p ON m.user_id = p.user_id
        INNER JOIN auth.users au ON m.user_id = au.id
        WHERE m.role = %L
          AND (%s)
          AND (%s)
        GROUP BY m.user_id, p.username, au.email
        ORDER BY message_count DESC
        LIMIT %L',
        role_param,
        model_condition,
        time_condition,
        limit_param
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_stats(role_param text, time_period text, model_param text, page_param integer, per_page integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, username text, email text, message_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    model_condition TEXT;
    time_condition TEXT;
    offset_value INTEGER;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Determine the model condition based on the model_param
    IF model_param IS NULL OR model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
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

    -- Calculate the offset based on the page number
    offset_value := (page_param - 1) * per_page;

    -- Construct and execute the SQL query
    RETURN QUERY EXECUTE format(
        'SELECT
            m.user_id,
            p.username,
            au.email::text,
            COUNT(m.id) AS message_count
        FROM messages m
        INNER JOIN profiles p ON m.user_id = p.user_id
        INNER JOIN auth.users au ON m.user_id = au.id
        WHERE m.role = %L
          AND (%s)
          AND (%s)
        GROUP BY m.user_id, p.username, au.email
        ORDER BY message_count DESC
        LIMIT %L OFFSET %L',
        role_param,
        model_condition,
        time_condition,
        per_page,
        offset_value
    );
END;
$function$
;