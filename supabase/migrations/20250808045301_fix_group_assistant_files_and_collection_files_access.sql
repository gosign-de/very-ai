drop policy if exists "Allow full access to own assistant_files" on "public"."assistant_files";

drop policy if exists "Enable read access for all users" on "public"."collection_files";

drop policy if exists "Allow full access to own files" on "public"."files";

-- Drop policies before creating new ones to ensure idempotency
drop policy if exists "Allow access to own and group assistant collections" on "public"."assistant_collections";

create policy "Allow access to own and group assistant collections"
on "public"."assistant_collections"
as permissive
for all
to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM assistants a
  WHERE ((a.id = assistant_collections.assistant_id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid()))))))))
with check ((user_id = auth.uid()));


drop policy if exists "Allow access to own and group assistant files" on "public"."assistant_files";

create policy "Allow access to own and group assistant files"
on "public"."assistant_files"
as permissive
for all
to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM assistants a
  WHERE ((a.id = assistant_files.assistant_id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid()))))))))
with check ((user_id = auth.uid()));


drop policy if exists "Allow access to own collection files and group assistant collec" on "public"."collection_files";

create policy "Allow access to own collection files and group assistant collec"
on "public"."collection_files"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (assistant_collections ac
     JOIN assistants a ON ((ac.assistant_id = a.id)))
  WHERE ((ac.collection_id = collection_files.collection_id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid()))))))));


drop policy if exists "Allow access to own collections and collections used by group a" on "public"."collections";

create policy "Allow access to own collections and collections used by group a"
on "public"."collections"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (assistant_collections ac
     JOIN assistants a ON ((ac.assistant_id = a.id)))
  WHERE ((ac.collection_id = collections.id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid()))))))));


drop policy if exists "Allow users to create their own collections" on "public"."collections";

create policy "Allow users to create their own collections"
on "public"."collections"
as permissive
for insert
to authenticated
with check ((user_id = auth.uid()));


drop policy if exists "Allow users to delete their own collections" on "public"."collections";

create policy "Allow users to delete their own collections"
on "public"."collections"
as permissive
for delete
to authenticated
using ((user_id = auth.uid()));


drop policy if exists "Allow users to update their own collections" on "public"."collections";

create policy "Allow users to update their own collections"
on "public"."collections"
as permissive
for update
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


drop policy if exists "Allow access to own files, group assistant files, and group ass" on "public"."files";

create policy "Allow access to own files, group assistant files, and group ass"
on "public"."files"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (assistant_files af
     JOIN assistants a ON ((af.assistant_id = a.id)))
  WHERE ((af.file_id = files.id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM ((collection_files cf
     JOIN assistant_collections ac ON ((cf.collection_id = ac.collection_id)))
     JOIN assistants a ON ((ac.assistant_id = a.id)))
  WHERE ((cf.file_id = files.id) AND (a.group_id IN ( SELECT user_groups.group_id
           FROM user_groups
          WHERE (user_groups.user_id = auth.uid()))))))));


drop policy if exists "Allow users to create their own files" on "public"."files";

create policy "Allow users to create their own files"
on "public"."files"
as permissive
for insert
to authenticated
with check ((user_id = auth.uid()));


drop policy if exists "Allow users to delete their own files" on "public"."files";

create policy "Allow users to delete their own files"
on "public"."files"
as permissive
for delete
to authenticated
using ((user_id = auth.uid()));


drop policy if exists "Allow users to update their own files" on "public"."files";

create policy "Allow users to update their own files"
on "public"."files"
as permissive
for update
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));