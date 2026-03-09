drop policy if exists "Allow full access to own assistant_collections" on "public"."assistant_collections";

drop policy if exists "Allow full access to own assistant_tools" on "public"."assistant_tools";

drop policy if exists "Allow full access to own assistants" on "public"."assistants";

drop policy if exists "Allow view access to non-private assistants" on "public"."assistants";

drop policy if exists "Allow full access to own folders" on "public"."folders";

alter table "public"."assistants" add column if not exists "group_id" uuid;

alter table "public"."folders" add column if not exists "group_id" uuid;

create policy "Policy with security definer functions"
on "public"."assistant_collections"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."assistant_tools"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."assistant_tools"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."assistants"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."assistants"
as permissive
for all
to public
using (true);


create policy "Enable read access for all users"
on "public"."folders"
as permissive
for select
to public
using (true);


create policy "Policy with security definer functions"
on "public"."folders"
as permissive
for all
to public
using (true);
