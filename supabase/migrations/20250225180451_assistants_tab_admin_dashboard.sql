set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_assistant_stats()
 RETURNS TABLE(id uuid, name text, description text, created_at timestamp with time zone, group_id uuid, group_name text, email text, chat_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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