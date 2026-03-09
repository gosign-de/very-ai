-- Create function to handle session-only group creation and management
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
DECLARE
    v_error_message text;
BEGIN
    -- Log the attempt for debugging
    RAISE NOTICE 'Attempting to manage group: user_id=%, group_id=%, group_name=%, is_selected=%', 
        p_user_id, p_group_id, p_group_name, p_is_selected;

    -- First, check if the group exists in azure_groups, if not create it
    INSERT INTO azure_groups (group_id, name, email, type, group_status)
    VALUES (p_group_id, COALESCE(p_group_name, p_group_id), p_group_email, p_group_type, true)
    ON CONFLICT (group_id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, azure_groups.name),
        email = COALESCE(EXCLUDED.email, azure_groups.email),
        type = COALESCE(EXCLUDED.type, azure_groups.type);
    
    -- Then create or update the managed_user_groups entry
    INSERT INTO managed_user_groups (user_id, group_id, is_selected)
    VALUES (p_user_id, p_group_id, p_is_selected)
    ON CONFLICT (user_id, group_id) 
    DO UPDATE SET 
        is_selected = p_is_selected,
        updated_at = now();
    
    RAISE NOTICE 'Successfully managed group: user_id=%, group_id=%', p_user_id, p_group_id;
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RAISE NOTICE 'Error managing group: %, Error: %', p_group_id, v_error_message;
        RETURN false;
END;
$function$;