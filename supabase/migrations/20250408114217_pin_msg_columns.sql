alter table "public"."messages" add column "is_pin" boolean default false;

alter table "public"."messages" add column "pin_metadata" text;


