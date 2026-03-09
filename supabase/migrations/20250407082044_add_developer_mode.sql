alter table "public"."files" add column "original_file_path" text;

alter table "public"."files" add column "original_type" text;

alter table "public"."profiles" add column "developer_mode" boolean default false;


