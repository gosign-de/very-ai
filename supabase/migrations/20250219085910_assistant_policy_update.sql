create policy " Enable users to update their own data only"
on "public"."assistants"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable users to delete their own data only"
on "public"."assistants"
as permissive
for delete
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



