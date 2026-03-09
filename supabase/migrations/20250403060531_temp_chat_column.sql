

-- Enable pg_cron extension
-- create extension if not exists pg_cron with schema public;


-- SELECT cron.schedule(
--     'archive_old_chats_job',  
--     '0 */12 * * *',
--     $$ SELECT archive_old_chats(); $$  
-- );


alter table "public"."chats" add column "is_temp_chat" boolean default false;

alter table "public"."profiles" add column "is_tempchat_popup" boolean default false;


