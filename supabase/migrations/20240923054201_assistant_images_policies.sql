drop policy if exists "Allow delete access to own assistant images" on "storage"."objects";

drop policy if exists "Allow insert access to own assistant images" on "storage"."objects";

drop policy if exists "Allow public read access on non-private assistant images" on "storage"."objects";

drop policy if exists "Allow update access to own assistant images" on "storage"."objects";

create policy "Allow delete access to all users"
on "storage"."objects"
as permissive
for delete
to public
using ((bucket_id = 'assistant_images'::text));


create policy "Allow insert access to all users"
on "storage"."objects"
as permissive
for insert
to public
with check ((bucket_id = 'assistant_images'::text));


create policy "Allow public read access for all users"
on "storage"."objects"
as permissive
for select
to public
using ((bucket_id = 'assistant_images'::text));


create policy "Allow update access to all users"
on "storage"."objects"
as permissive
for update
to public
using ((bucket_id = 'assistant_images'::text));



