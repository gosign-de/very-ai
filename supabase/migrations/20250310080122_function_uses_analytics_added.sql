set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_users_analytics(start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, email text, username text, "aiModelRequests" jsonb, "aiAssistantUses" bigint, "lastSignIn" timestamp with time zone)
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
        p.username::TEXT,
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
