-- Storage object deletion stub (credentials removed for open-source safety).
-- Override with a real implementation when using hosted Supabase.
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_storage_object(bucket text, object text, OUT status integer, OUT content text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  status := 200;
  content := 'OK';
END;
$function$;
