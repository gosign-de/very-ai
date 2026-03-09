create table "public"."model_restrictions" (
    "id" uuid not null default uuid_generate_v4(),
    "group_id" text not null,
    "model_id" text not null,
    "is_allowed" boolean default true,
    "created_at" timestamp with time zone not null default CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone default CURRENT_TIMESTAMP,
    "created_by" uuid
);


alter table "public"."model_restrictions" enable row level security;

CREATE INDEX idx_model_restrictions_group_id ON public.model_restrictions USING btree (group_id);

CREATE INDEX idx_model_restrictions_group_model ON public.model_restrictions USING btree (group_id, model_id);

CREATE INDEX idx_model_restrictions_model_id ON public.model_restrictions USING btree (model_id);

CREATE UNIQUE INDEX model_restrictions_group_id_model_id_key ON public.model_restrictions USING btree (group_id, model_id);

CREATE UNIQUE INDEX model_restrictions_pkey ON public.model_restrictions USING btree (id);

alter table "public"."model_restrictions" add constraint "model_restrictions_pkey" PRIMARY KEY using index "model_restrictions_pkey";

alter table "public"."model_restrictions" add constraint "model_restrictions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."model_restrictions" validate constraint "model_restrictions_created_by_fkey";

alter table "public"."model_restrictions" add constraint "model_restrictions_group_id_model_id_key" UNIQUE using index "model_restrictions_group_id_model_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_allowed_models_for_group(p_group_id text)
 RETURNS TABLE(model_id text, is_allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        mr.model_id,
        mr.is_allowed
    FROM model_restrictions mr
    WHERE mr.group_id = p_group_id
    ORDER BY mr.model_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_model_allowed_for_group(p_group_id text, p_model_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_is_allowed BOOLEAN;
    v_exists BOOLEAN;
BEGIN
    -- Check if there's a restriction record
    SELECT EXISTS(
        SELECT 1 FROM model_restrictions
        WHERE group_id = p_group_id AND model_id = p_model_id
    ) INTO v_exists;

    -- If no restriction exists, model is allowed by default
    IF NOT v_exists THEN
        RETURN true;
    END IF;

    -- Otherwise, check the restriction
    SELECT is_allowed INTO v_is_allowed
    FROM model_restrictions
    WHERE group_id = p_group_id AND model_id = p_model_id;

    RETURN COALESCE(v_is_allowed, true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_model_restrictions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."model_restrictions" to "anon";

grant insert on table "public"."model_restrictions" to "anon";

grant references on table "public"."model_restrictions" to "anon";

grant select on table "public"."model_restrictions" to "anon";

grant trigger on table "public"."model_restrictions" to "anon";

grant truncate on table "public"."model_restrictions" to "anon";

grant update on table "public"."model_restrictions" to "anon";

grant delete on table "public"."model_restrictions" to "authenticated";

grant insert on table "public"."model_restrictions" to "authenticated";

grant references on table "public"."model_restrictions" to "authenticated";

grant select on table "public"."model_restrictions" to "authenticated";

grant trigger on table "public"."model_restrictions" to "authenticated";

grant truncate on table "public"."model_restrictions" to "authenticated";

grant update on table "public"."model_restrictions" to "authenticated";

grant delete on table "public"."model_restrictions" to "service_role";

grant insert on table "public"."model_restrictions" to "service_role";

grant references on table "public"."model_restrictions" to "service_role";

grant select on table "public"."model_restrictions" to "service_role";

grant trigger on table "public"."model_restrictions" to "service_role";

grant truncate on table "public"."model_restrictions" to "service_role";

grant update on table "public"."model_restrictions" to "service_role";

create policy "Allow admin access to model_restrictions"
on "public"."model_restrictions"
as permissive
for all
to public
using (true)
with check (true);


CREATE TRIGGER update_model_restrictions_updated_at BEFORE UPDATE ON public.model_restrictions FOR EACH ROW EXECUTE FUNCTION update_model_restrictions_updated_at();


