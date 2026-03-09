create table "public"."azure_groups" (
    "id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "group_id" uuid not null,
    "name" character varying,
    "type" character varying,
    "email" character varying
);


alter table "public"."azure_groups" enable row level security;

create table "public"."custom_prompts" (
    "id" uuid not null default uuid_generate_v4(),
    "user_id" uuid not null,
    "folder_id" uuid,
    "created_at" timestamp with time zone not null default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone,
    "sharing" text not null default 'private'::text,
    "content" text not null,
    "name" text not null,
    "group_id" text
);


alter table "public"."custom_prompts" enable row level security;

create table "public"."profile_images" (
    "user_id" character varying not null,
    "profile_image" character varying not null
);


alter table "public"."profile_images" enable row level security;

CREATE UNIQUE INDEX azure_groups_pkey ON public.azure_groups USING btree (id);

CREATE UNIQUE INDEX custom_prompts_pkey ON public.custom_prompts USING btree (id);

CREATE INDEX custom_prompts_user_id_idx ON public.custom_prompts USING btree (user_id);

CREATE UNIQUE INDEX profile_images_pkey ON public.profile_images USING btree (user_id);

alter table "public"."azure_groups" add constraint "azure_groups_pkey" PRIMARY KEY using index "azure_groups_pkey";

alter table "public"."custom_prompts" add constraint "custom_prompts_pkey" PRIMARY KEY using index "custom_prompts_pkey";

alter table "public"."profile_images" add constraint "profile_images_pkey" PRIMARY KEY using index "profile_images_pkey";

alter table "public"."custom_prompts" add constraint "prompts_content_check" CHECK ((char_length(content) <= 100000)) not valid;

alter table "public"."custom_prompts" validate constraint "prompts_content_check";

alter table "public"."custom_prompts" add constraint "prompts_name_check" CHECK ((char_length(name) <= 100)) not valid;

alter table "public"."custom_prompts" validate constraint "prompts_name_check";

grant delete on table "public"."azure_groups" to "anon";

grant insert on table "public"."azure_groups" to "anon";

grant references on table "public"."azure_groups" to "anon";

grant select on table "public"."azure_groups" to "anon";

grant trigger on table "public"."azure_groups" to "anon";

grant truncate on table "public"."azure_groups" to "anon";

grant update on table "public"."azure_groups" to "anon";

grant delete on table "public"."azure_groups" to "authenticated";

grant insert on table "public"."azure_groups" to "authenticated";

grant references on table "public"."azure_groups" to "authenticated";

grant select on table "public"."azure_groups" to "authenticated";

grant trigger on table "public"."azure_groups" to "authenticated";

grant truncate on table "public"."azure_groups" to "authenticated";

grant update on table "public"."azure_groups" to "authenticated";

grant delete on table "public"."azure_groups" to "service_role";

grant insert on table "public"."azure_groups" to "service_role";

grant references on table "public"."azure_groups" to "service_role";

grant select on table "public"."azure_groups" to "service_role";

grant trigger on table "public"."azure_groups" to "service_role";

grant truncate on table "public"."azure_groups" to "service_role";

grant update on table "public"."azure_groups" to "service_role";

grant delete on table "public"."custom_prompts" to "anon";

grant insert on table "public"."custom_prompts" to "anon";

grant references on table "public"."custom_prompts" to "anon";

grant select on table "public"."custom_prompts" to "anon";

grant trigger on table "public"."custom_prompts" to "anon";

grant truncate on table "public"."custom_prompts" to "anon";

grant update on table "public"."custom_prompts" to "anon";

grant delete on table "public"."custom_prompts" to "authenticated";

grant insert on table "public"."custom_prompts" to "authenticated";

grant references on table "public"."custom_prompts" to "authenticated";

grant select on table "public"."custom_prompts" to "authenticated";

grant trigger on table "public"."custom_prompts" to "authenticated";

grant truncate on table "public"."custom_prompts" to "authenticated";

grant update on table "public"."custom_prompts" to "authenticated";

grant delete on table "public"."custom_prompts" to "service_role";

grant insert on table "public"."custom_prompts" to "service_role";

grant references on table "public"."custom_prompts" to "service_role";

grant select on table "public"."custom_prompts" to "service_role";

grant trigger on table "public"."custom_prompts" to "service_role";

grant truncate on table "public"."custom_prompts" to "service_role";

grant update on table "public"."custom_prompts" to "service_role";

grant delete on table "public"."profile_images" to "anon";

grant insert on table "public"."profile_images" to "anon";

grant references on table "public"."profile_images" to "anon";

grant select on table "public"."profile_images" to "anon";

grant trigger on table "public"."profile_images" to "anon";

grant truncate on table "public"."profile_images" to "anon";

grant update on table "public"."profile_images" to "anon";

grant delete on table "public"."profile_images" to "authenticated";

grant insert on table "public"."profile_images" to "authenticated";

grant references on table "public"."profile_images" to "authenticated";

grant select on table "public"."profile_images" to "authenticated";

grant trigger on table "public"."profile_images" to "authenticated";

grant truncate on table "public"."profile_images" to "authenticated";

grant update on table "public"."profile_images" to "authenticated";

grant delete on table "public"."profile_images" to "service_role";

grant insert on table "public"."profile_images" to "service_role";

grant references on table "public"."profile_images" to "service_role";

grant select on table "public"."profile_images" to "service_role";

grant trigger on table "public"."profile_images" to "service_role";

grant truncate on table "public"."profile_images" to "service_role";

grant update on table "public"."profile_images" to "service_role";

create policy "Enable insert for authenticated users only"
on "public"."azure_groups"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."azure_groups"
as permissive
for select
to public
using (true);


create policy "custompromptspolicy"
on "public"."custom_prompts"
as permissive
for all
to public
using (true);


create policy "Enable insert for all users"
on "public"."profile_images"
as permissive
for insert
to public
with check (true);


create policy "Enable read access for all users"
on "public"."profile_images"
as permissive
for select
to public
using (true);


create policy "Enable update for all users"
on "public"."profile_images"
as permissive
for update
to public
using (true);



