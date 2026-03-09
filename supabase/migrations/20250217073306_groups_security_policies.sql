drop policy if exists "Enable read access for all users" on "public"."assistants";

drop policy if exists "Policy with security definer functions" on "public"."assistants";

drop policy if exists "Enable insert for authenticated users only" on "public"."azure_groups";

drop policy if exists "Enable read access for all users" on "public"."azure_groups";

create table "public"."user_groups" (
    "user_id" uuid not null,
    "group_id" uuid not null,
    "joined_at" timestamp without time zone default now(),
    "azure_user_id" uuid not null
);


alter table "public"."user_groups" enable row level security;

alter table "public"."profiles" add column "azure_user_id" uuid;

CREATE UNIQUE INDEX azure_groups_group_id_key ON public.azure_groups USING btree (group_id);

CREATE UNIQUE INDEX profiles_azure_user_id_key ON public.profiles USING btree (azure_user_id);

CREATE UNIQUE INDEX user_groups_pkey ON public.user_groups USING btree (user_id, group_id, azure_user_id);

alter table "public"."user_groups" add constraint "user_groups_pkey" PRIMARY KEY using index "user_groups_pkey";

alter table "public"."azure_groups" add constraint "azure_groups_group_id_key" UNIQUE using index "azure_groups_group_id_key";

alter table "public"."profiles" add constraint "profiles_azure_user_id_key" UNIQUE using index "profiles_azure_user_id_key";

alter table "public"."user_groups" add constraint "user_groups_azure_user_id_fkey" FOREIGN KEY (azure_user_id) REFERENCES profiles(azure_user_id) ON DELETE CASCADE not valid;

alter table "public"."user_groups" validate constraint "user_groups_azure_user_id_fkey";

alter table "public"."user_groups" add constraint "user_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES azure_groups(group_id) ON DELETE CASCADE not valid;

alter table "public"."user_groups" validate constraint "user_groups_group_id_fkey";

alter table "public"."user_groups" add constraint "user_groups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE not valid;

alter table "public"."user_groups" validate constraint "user_groups_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_azure_groups_exists(group_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM azure_groups
    WHERE group_id = ANY(group_ids)
  );
END;
$function$
;

grant delete on table "public"."user_groups" to "anon";

grant insert on table "public"."user_groups" to "anon";

grant references on table "public"."user_groups" to "anon";

grant select on table "public"."user_groups" to "anon";

grant trigger on table "public"."user_groups" to "anon";

grant truncate on table "public"."user_groups" to "anon";

grant update on table "public"."user_groups" to "anon";

grant delete on table "public"."user_groups" to "authenticated";

grant insert on table "public"."user_groups" to "authenticated";

grant references on table "public"."user_groups" to "authenticated";

grant select on table "public"."user_groups" to "authenticated";

grant trigger on table "public"."user_groups" to "authenticated";

grant truncate on table "public"."user_groups" to "authenticated";

grant update on table "public"."user_groups" to "authenticated";

grant delete on table "public"."user_groups" to "service_role";

grant insert on table "public"."user_groups" to "service_role";

grant references on table "public"."user_groups" to "service_role";

grant select on table "public"."user_groups" to "service_role";

grant trigger on table "public"."user_groups" to "service_role";

grant truncate on table "public"."user_groups" to "service_role";

grant update on table "public"."user_groups" to "service_role";

create policy "Enable insert for authenticated users only"
on "public"."assistants"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable users to view their own data only"
on "public"."assistants"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can access assistants in their groups or public assistant"
on "public"."assistants"
as permissive
for select
to authenticated
using ((group_id IN ( SELECT user_groups.group_id
   FROM user_groups
  WHERE (user_groups.user_id = auth.uid()))));


create policy "Users can read their own data only"
on "public"."azure_groups"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM user_groups
  WHERE ((user_groups.group_id = azure_groups.group_id) AND (user_groups.user_id = auth.uid())))));


create policy "Enable insert for authenticated users only"
on "public"."user_groups"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable users to update their own data only"
on "public"."user_groups"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Enable users to view their own data only"
on "public"."user_groups"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


