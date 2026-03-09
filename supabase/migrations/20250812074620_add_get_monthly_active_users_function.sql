set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_monthly_active_users(start_date date, end_date date)
 RETURNS TABLE(month_start date, user_count integer)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
    SELECT
        DATE_TRUNC('month', created_at::DATE) AS month_start,
        COUNT(DISTINCT user_id) AS user_count
    FROM chats
    WHERE created_at::DATE BETWEEN start_date AND end_date
    GROUP BY month_start
    ORDER BY month_start;
$function$
;