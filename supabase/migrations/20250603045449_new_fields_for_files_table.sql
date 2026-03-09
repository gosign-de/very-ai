alter table "public"."files" add column "error_message" text;

alter table "public"."files" add column "processing_progress" integer default 0;

alter table "public"."files" add column "processing_status" text;