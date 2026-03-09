create policy "Users can delete assistants in their groups or public assistant"
on "public"."assistants"
as permissive
for delete
to authenticated
using ((group_id IN ( SELECT user_groups.group_id
   FROM user_groups
  WHERE (user_groups.user_id = auth.uid()))));


create policy "Users can update assistants in their groups or public assistant"
on "public"."assistants"
as permissive
for update
to authenticated
using ((group_id IN ( SELECT user_groups.group_id
   FROM user_groups
  WHERE (user_groups.user_id = auth.uid()))));



