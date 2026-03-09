set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_active_users_by_date_range(start_date date, end_date date)
 RETURNS TABLE(chat_date date, user_count integer)
 LANGUAGE sql
AS $function$
    SELECT 
        created_at::DATE AS chat_date,
        COUNT(DISTINCT user_id) AS user_count
    FROM chats
    WHERE created_at::DATE BETWEEN start_date AND end_date
    GROUP BY chat_date
    ORDER BY chat_date;
$function$
;

CREATE OR REPLACE FUNCTION public.get_assistant_stats()
 RETURNS TABLE(id uuid, name text, description text, created_at timestamp with time zone, group_id uuid, group_name text, email text, chat_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT 
        a.id, 
        a.name, 
        a.description,
        a.created_at,
        a.group_id, 
        g.name AS group_name,
        u.email, 
        COUNT(c.id) AS chat_count
    FROM assistants a
    LEFT JOIN auth.users u ON a.user_id = u.id
    LEFT JOIN chats c ON a.id = c.assistant_id
    LEFT JOIN azure_groups g ON a.group_id = g.group_id
    GROUP BY a.id, a.name, a.description, a.created_at, a.group_id, g.name, u.email
    ORDER BY chat_count DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_model_stats(role_param text, time_period text)
 RETURNS TABLE(created_at timestamp with time zone, model text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    start_date TIMESTAMPTZ;
    end_date TIMESTAMPTZ := NOW(); -- Current date/time with timezone
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
    -- For example, check if user is an admin
    -- IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = calling_user_id AND is_admin = true) THEN
    --     RAISE EXCEPTION 'Admin access required';
    -- END IF;

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

CREATE OR REPLACE FUNCTION public.get_user_analytics(start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, email text, "aiModelRequests" jsonb, "aiAssistantUses" bigint, "lastSignIn" timestamp with time zone)
 LANGUAGE plpgsql
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
            AND m.role = 'assistant'
            AND (
                CASE
                    WHEN start_date IS NULL AND end_date IS NULL THEN TRUE
                    WHEN start_date IS NULL THEN m.created_at <= end_date
                    WHEN end_date IS NULL THEN m.created_at >= start_date
                    ELSE m.created_at BETWEEN start_date AND end_date
                END
            )
    ),
    model_counts AS (
        SELECT
            user_id,
            jsonb_object_agg(model, message_count) as ai_model_requests
        FROM (
            SELECT
                user_id,
                model,
                COUNT(m.id)::INT as message_count
            FROM
                time_filtered_messages m
            GROUP BY
                user_id, model
        ) as model_data
        GROUP BY
            user_id
    ),
    assistant_counts AS (
        SELECT
            user_id,
            COUNT(m.id)::BIGINT as ai_assistant_uses
        FROM
            time_filtered_messages m
        WHERE
            assistant_id IS NOT NULL
        GROUP BY
            user_id
    )
    SELECT
        u.id,
        u.email::TEXT,
        COALESCE(mc.ai_model_requests, '{}'::JSONB) as "aiModelRequests",
        COALESCE(ac.ai_assistant_uses, 0) as "aiAssistantUses",
        u.last_sign_in_at as "lastSignIn"
    FROM
        auth.users AS u
    JOIN
        profiles AS p ON u.id = p.user_id
    LEFT JOIN
        model_counts AS mc ON u.id = mc.user_id
    LEFT JOIN
        assistant_counts AS ac ON u.id = ac.user_id
    ORDER BY
        u.last_sign_in_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_stats(time_period text, model_param text, role_param text, page_size integer, page_number integer)
 RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamp with time zone, username text, message_count integer, total_count integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    total_users INT;
    calling_user_id UUID;
BEGIN
    -- Get the calling user's ID
    calling_user_id := auth.uid();

    -- Check if user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Add your own authorization logic here if needed

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

CREATE OR REPLACE FUNCTION public.get_weekly_active_users(start_date date, end_date date)
 RETURNS TABLE(week_start date, user_count integer)
 LANGUAGE sql
AS $function$
    SELECT 
        DATE_TRUNC('week', created_at::DATE) AS week_start,
        COUNT(DISTINCT user_id) AS user_count
    FROM chats
    WHERE created_at::DATE BETWEEN start_date AND end_date
    GROUP BY week_start
    ORDER BY week_start;
$function$
;


