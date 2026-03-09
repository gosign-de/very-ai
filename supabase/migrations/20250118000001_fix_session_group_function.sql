-- Create improved function to handle session-only group creation and management
CREATE OR REPLACE FUNCTION public.create_session_group_and_manage(
    p_user_id uuid,
    p_group_id text,
    p_group_name text DEFAULT NULL,
    p_group_email text DEFAULT NULL,
    p_group_type text DEFAULT NULL,
    p_is_selected boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- First, ensure the group exists in azure_groups (cast text to uuid)
    INSERT INTO azure_groups (group_id, name, email, type, group_status)
    VALUES (p_group_id::uuid, COALESCE(p_group_name, p_group_id), p_group_email, p_group_type, true)
    ON CONFLICT (group_id) DO NOTHING;
    
    -- Then handle the managed_user_groups entry (cast text to uuid)
    INSERT INTO managed_user_groups (user_id, group_id, is_selected)
    VALUES (p_user_id, p_group_id::uuid, p_is_selected)
    ON CONFLICT (user_id, group_id) 
    DO UPDATE SET 
        is_selected = p_is_selected,
        updated_at = now();
    
    RETURN true;
END;
$function$;