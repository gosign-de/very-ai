set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_active_users_by_date_range(start_date date, end_date date)
 RETURNS TABLE(chat_date date, user_count integer)
 LANGUAGE sql
 SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.get_weekly_active_users(start_date date, end_date date)
 RETURNS TABLE(week_start date, user_count integer)
 LANGUAGE sql
 SECURITY DEFINER
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


