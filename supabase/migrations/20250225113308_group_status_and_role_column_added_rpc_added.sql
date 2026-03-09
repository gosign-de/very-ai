alter table "public"."azure_groups" add column "group_status" boolean;

alter table "public"."azure_groups" add column "role" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_model_stats(role_param text, time_period text)
 RETURNS TABLE(created_at timestamp with time zone, model text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    start_date TIMESTAMPTZ;
    end_date TIMESTAMPTZ := NOW(); -- Current date/time with timezone
    time_condition TEXT;
BEGIN
    -- Determine the start_date based on the time_period
    IF time_period = 'today' THEN
        start_date := DATE_TRUNC('day', NOW()); -- Start of the current day
    ELSIF time_period = 'last_month' THEN
        start_date := (NOW() - INTERVAL '1 month');
    ELSIF time_period = 'last_year' THEN
        start_date := (NOW() - INTERVAL '1 year');
    ELSE
        start_date := NULL; -- For 'all_time', include everything
    END IF;

    -- Determine the time condition based on the start_date
    IF start_date IS NOT NULL THEN
        time_condition := format('m.created_at BETWEEN %L AND %L', start_date, end_date);
    ELSE
        time_condition := 'TRUE'; -- No date filtering for 'all_time'
    END IF;

    -- Construct and execute the SQL query
    RETURN QUERY EXECUTE format(
        'SELECT 
            m.created_at, 
            m.model
        FROM messages m
        WHERE m.role = %L
          AND (%s)',
        role_param,
        time_condition
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_request_count(role_param text, time_period text, model_param text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE
    model_condition TEXT;
    time_condition TEXT;
    message_count BIGINT;
BEGIN
    -- Determine the model condition based on the model_param
    IF model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
    END IF;

    -- Determine the time condition based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 month'')';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 year'')';
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
BEGIN
    -- Determine the model condition based on the model_param
    IF model_param = 'all_models' THEN
        model_condition := 'TRUE'; -- Include all models
    ELSE
        model_condition := 'm.model = ' || quote_literal(model_param); -- Filter by specific model
    END IF;

    -- Determine the time condition based on the time_period
    IF time_period = 'today' THEN
        time_condition := 'm.created_at >= CURRENT_DATE';
    ELSIF time_period = 'last_month' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 month'')';
    ELSIF time_period = 'last_year' THEN
        time_condition := 'm.created_at >= (CURRENT_DATE - INTERVAL ''1 year'')';
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

CREATE OR REPLACE FUNCTION public.get_user_stats(time_period text, model_param text, role_param text, page_size integer, page_number integer)
 RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamp with time zone, username text, message_count integer, total_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total_users INT;
BEGIN
    -- Calculate the total number of users in auth.users table
    SELECT COUNT(*) INTO total_users FROM auth.users;

    RETURN QUERY 
    WITH time_filtered_messages AS (
        SELECT *
        FROM messages AS m
        WHERE 
            m.user_id IS NOT NULL 
            AND (
                CASE 
                    WHEN role_param IS NULL THEN TRUE
                    ELSE m.role = role_param
                END
            )
            AND (
                CASE 
                    WHEN model_param = 'all_models' THEN TRUE
                    ELSE m.model = model_param
                END
            )
            AND (
                CASE 
                    WHEN time_period = 'today' THEN m.created_at >= CURRENT_DATE
                    WHEN time_period = 'last_month' THEN m.created_at >= (CURRENT_DATE - INTERVAL '1 month')
                    WHEN time_period = 'last_year' THEN m.created_at >= (CURRENT_DATE - INTERVAL '1 year')
                    ELSE TRUE
                END
            )
    )
    SELECT 
        u.id AS user_id,
        u.email::TEXT,  -- Explicit cast to TEXT
        u.last_sign_in_at,
        p.username::TEXT,  -- Explicit cast to TEXT
        COUNT(tfm.id)::INT AS message_count,  -- Cast COUNT to INT
        total_users AS total_count  -- Include total count in each row
    FROM 
        auth.users AS u
    JOIN 
        profiles AS p ON u.id = p.user_id
    LEFT JOIN 
        time_filtered_messages AS tfm ON u.id = tfm.user_id
    GROUP BY 
        u.id, u.email, u.last_sign_in_at, p.username, total_users
    ORDER BY 
        u.last_sign_in_at DESC
    LIMIT page_size OFFSET (page_number - 1) * page_size;
END;
$function$
;


