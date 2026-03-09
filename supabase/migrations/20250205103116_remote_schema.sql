drop policy if exists "Policy with security definer functions" on "public"."files";

drop policy if exists "Enable read access for all users" on "public"."messages";

drop policy if exists "Policy with security definer functions" on "public"."assistant_collections";

drop policy if exists "Allow full access to own assistant_files" on "public"."assistant_files";

drop policy if exists "Enable read access for all users" on "public"."assistant_tools";

drop policy if exists "Policy with security definer functions" on "public"."assistant_tools";

drop policy if exists "Allow full access to own assistant_workspaces" on "public"."assistant_workspaces";

drop policy if exists "Enable read access for all users" on "public"."assistants";

drop policy if exists "Policy with security definer functions" on "public"."assistants";

drop policy if exists "Allow full access to own chat_files" on "public"."chat_files";

drop policy if exists "Enable read access for all users" on "public"."chats";

drop policy if exists "Policy with security definer functions" on "public"."chats";

drop policy if exists "Enable read access for all users" on "public"."collection_files";

drop policy if exists "Policy with security definer functions" on "public"."collection_files";

drop policy if exists "Allow full access to own collection_workspaces" on "public"."collection_workspaces";

drop policy if exists "Enable read access for all users" on "public"."collections";

drop policy if exists "Policy with security definer functions" on "public"."collections";

drop policy if exists "Enable delete for users based on user_id" on "public"."custom_prompts";

drop policy if exists "Enable read access for all users" on "public"."custom_prompts";

drop policy if exists "custompromptspolicy" on "public"."custom_prompts";

drop policy if exists "Allow full access to own file items" on "public"."file_items";

drop policy if exists "Allow view access to non-private file items" on "public"."file_items";

drop policy if exists "Allow full access to own file_workspaces" on "public"."file_workspaces";

drop policy if exists "Allow view access to files for non-private collections" on "public"."files";

drop policy if exists "Allow view access to non-private files" on "public"."files";

drop policy if exists "Enable read access for all users" on "public"."folders";

drop policy if exists "Policy with security definer functions" on "public"."folders";

drop policy if exists "Allow full access to own message_file_items" on "public"."message_file_items";

drop policy if exists "Policy with security definer functions" on "public"."messages";

drop policy if exists "Allow full access to own model_workspaces" on "public"."model_workspaces";

drop policy if exists "Allow full access to own models" on "public"."models";

drop policy if exists "Allow view access to non-private models" on "public"."models";

drop policy if exists "Allow full access to own preset_workspaces" on "public"."preset_workspaces";

drop policy if exists "Allow full access to own presets" on "public"."presets";

drop policy if exists "Allow view access to non-private presets" on "public"."presets";

drop policy if exists "Enable insert for all users" on "public"."profile_images";

drop policy if exists "Enable read access for all users" on "public"."profile_images";

drop policy if exists "Enable update for all users" on "public"."profile_images";

drop policy if exists "Allow full access to own profiles" on "public"."profiles";

drop policy if exists "Allow full access to own prompt_workspaces" on "public"."prompt_workspaces";

drop policy if exists "Allow full access to own prompts" on "public"."prompts";

drop policy if exists "Allow view access to non-private prompts" on "public"."prompts";

drop policy if exists "Allow full access to own tool_workspaces" on "public"."tool_workspaces";

drop policy if exists "Allow full access to own tools" on "public"."tools";

drop policy if exists "Allow view access to non-private tools" on "public"."tools";

drop policy if exists "Allow full access to own workspaces" on "public"."workspaces";

drop policy if exists "Allow view access to non-private workspaces" on "public"."workspaces";

alter table "public"."azure_groups" alter column "id" set default gen_random_uuid();

-- group_id was added via Supabase dashboard but never captured in a migration
alter table "public"."assistants" add column if not exists "group_id" uuid;

create policy "Allow full access to own files"
on "public"."files"
as permissive
for all
to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable users to view their own data only"
on "public"."messages"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Policy with security definer functions"
on "public"."assistant_collections"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own assistant_files"
on "public"."assistant_files"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable read access for all users"
on "public"."assistant_tools"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."assistant_tools"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own assistant_workspaces"
on "public"."assistant_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable read access for all users"
on "public"."assistants"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."assistants"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own chat_files"
on "public"."chat_files"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable read access for all users"
on "public"."chats"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."chats"
as permissive
for all
to authenticated
using (true);


create policy "Enable read access for all users"
on "public"."collection_files"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."collection_files"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own collection_workspaces"
on "public"."collection_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable read access for all users"
on "public"."collections"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."collections"
as permissive
for all
to authenticated
using (true);


create policy "Enable delete for users based on user_id"
on "public"."custom_prompts"
as permissive
for delete
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable read access for all users"
on "public"."custom_prompts"
as permissive
for select
to authenticated
using (true);


create policy "custompromptspolicy"
on "public"."custom_prompts"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own file items"
on "public"."file_items"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private file items"
on "public"."file_items"
as permissive
for select
to authenticated
using ((file_id IN ( SELECT files.id
   FROM files
  WHERE (files.sharing <> 'private'::text))));


create policy "Allow full access to own file_workspaces"
on "public"."file_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to files for non-private collections"
on "public"."files"
as permissive
for select
to authenticated
using ((id IN ( SELECT collection_files.file_id
   FROM collection_files
  WHERE (collection_files.collection_id IN ( SELECT collections.id
           FROM collections
          WHERE (collections.sharing <> 'private'::text))))));


create policy "Allow view access to non-private files"
on "public"."files"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));


create policy "Enable read access for all users"
on "public"."folders"
as permissive
for select
to authenticated
using (true);


create policy "Policy with security definer functions"
on "public"."folders"
as permissive
for all
to authenticated
using (true);


create policy "Allow full access to own message_file_items"
on "public"."message_file_items"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Policy with security definer functions"
on "public"."messages"
as permissive
for all
to authenticated
using ((auth.uid() = user_id));


create policy "Allow full access to own model_workspaces"
on "public"."model_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow full access to own models"
on "public"."models"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private models"
on "public"."models"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));


create policy "Allow full access to own preset_workspaces"
on "public"."preset_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow full access to own presets"
on "public"."presets"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private presets"
on "public"."presets"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));


create policy "Enable insert for all users"
on "public"."profile_images"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."profile_images"
as permissive
for select
to authenticated
using (true);


create policy "Enable update for all users"
on "public"."profile_images"
as permissive
for update
to authenticated
using (true);


create policy "Allow full access to own profiles"
on "public"."profiles"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow full access to own prompt_workspaces"
on "public"."prompt_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow full access to own prompts"
on "public"."prompts"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private prompts"
on "public"."prompts"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));


create policy "Allow full access to own tool_workspaces"
on "public"."tool_workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow full access to own tools"
on "public"."tools"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private tools"
on "public"."tools"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));


create policy "Allow full access to own workspaces"
on "public"."workspaces"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Allow view access to non-private workspaces"
on "public"."workspaces"
as permissive
for select
to authenticated
using ((sharing <> 'private'::text));



