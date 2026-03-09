drop policy if exists "Allow full access to own chats" on "public"."chats";

drop policy if exists "Allow view access to non-private chats" on "public"."chats";

drop policy if exists "Allow full access to own collection_files" on "public"."collection_files";

drop policy if exists "Allow view access to collection files for non-private collectio" on "public"."collection_files";

drop policy if exists "Allow full access to own collections" on "public"."collections";

drop policy if exists "Allow view access to non-private collections" on "public"."collections";

drop policy if exists "Allow full access to own files" on "public"."files";

drop policy if exists "Allow full access to own messages" on "public"."messages";

drop policy if exists "Allow view access to messages for non-private chats" on "public"."messages";

alter table "public"."chats" add column "group_id" uuid;

alter table "public"."collections" add column "group_id" uuid;

create policy "Enable read access for all users"
on "public"."chats"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."chats"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."collection_files"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."collection_files"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."collections"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."collections"
as permissive
for all
to public
using (true);


create policy "Enable delete for users based on user_id"
on "public"."custom_prompts"
as permissive
for delete
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable insert for authenticated users only"
on "public"."custom_prompts"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."custom_prompts"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."files"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."messages"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."messages"
as permissive
for all
to public
using (true);



