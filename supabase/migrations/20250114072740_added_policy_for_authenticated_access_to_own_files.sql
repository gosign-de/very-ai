create policy "Give users access to own folder 1m0cqf_0"
on "storage"."objects"
as permissive
for select
to authenticated
using (((bucket_id = 'files'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));



