-- Create managed_user_groups table
create table "public"."managed_user_groups" (
    "id" uuid not null default uuid_generate_v4(),
    "user_id" uuid not null,
    "group_id" uuid not null,
    "is_selected" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

-- Enable RLS
alter table "public"."managed_user_groups" enable row level security;

-- Create indexes
CREATE UNIQUE INDEX managed_user_groups_pkey ON public.managed_user_groups USING btree (id);
CREATE UNIQUE INDEX managed_user_groups_user_group_key ON public.managed_user_groups USING btree (user_id, group_id);
CREATE INDEX managed_user_groups_user_id_idx ON public.managed_user_groups USING btree (user_id);
CREATE INDEX managed_user_groups_is_selected_idx ON public.managed_user_groups USING btree (user_id, is_selected);

-- Add primary key constraint
alter table "public"."managed_user_groups" add constraint "managed_user_groups_pkey" PRIMARY KEY using index "managed_user_groups_pkey";

-- Add unique constraint for user_id and group_id combination
alter table "public"."managed_user_groups" add constraint "managed_user_groups_user_group_key" UNIQUE using index "managed_user_groups_user_group_key";

-- Add foreign key constraints
alter table "public"."managed_user_groups" add constraint "managed_user_groups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE not valid;
alter table "public"."managed_user_groups" validate constraint "managed_user_groups_user_id_fkey";

alter table "public"."managed_user_groups" add constraint "managed_user_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES azure_groups(group_id) ON DELETE CASCADE not valid;
alter table "public"."managed_user_groups" validate constraint "managed_user_groups_group_id_fkey";

-- Create update trigger
CREATE TRIGGER update_managed_user_groups_updated_at BEFORE UPDATE ON public.managed_user_groups 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
grant delete on table "public"."managed_user_groups" to "anon";
grant insert on table "public"."managed_user_groups" to "anon";
grant references on table "public"."managed_user_groups" to "anon";
grant select on table "public"."managed_user_groups" to "anon";
grant trigger on table "public"."managed_user_groups" to "anon";
grant truncate on table "public"."managed_user_groups" to "anon";
grant update on table "public"."managed_user_groups" to "anon";

grant delete on table "public"."managed_user_groups" to "authenticated";
grant insert on table "public"."managed_user_groups" to "authenticated";
grant references on table "public"."managed_user_groups" to "authenticated";
grant select on table "public"."managed_user_groups" to "authenticated";
grant trigger on table "public"."managed_user_groups" to "authenticated";
grant truncate on table "public"."managed_user_groups" to "authenticated";
grant update on table "public"."managed_user_groups" to "authenticated";

grant delete on table "public"."managed_user_groups" to "service_role";
grant insert on table "public"."managed_user_groups" to "service_role";
grant references on table "public"."managed_user_groups" to "service_role";
grant select on table "public"."managed_user_groups" to "service_role";
grant trigger on table "public"."managed_user_groups" to "service_role";
grant truncate on table "public"."managed_user_groups" to "service_role";
grant update on table "public"."managed_user_groups" to "service_role";

-- Create RLS policies
create policy "Users can view their own managed groups"
on "public"."managed_user_groups"
as permissive
for select
to authenticated
using ((auth.uid() = user_id));

create policy "Users can insert their own managed groups"
on "public"."managed_user_groups"
as permissive
for insert
to authenticated
with check ((auth.uid() = user_id));

create policy "Users can update their own managed groups"
on "public"."managed_user_groups"
as permissive
for update
to authenticated
using ((auth.uid() = user_id));

create policy "Users can delete their own managed groups"
on "public"."managed_user_groups"
as permissive
for delete
to authenticated
using ((auth.uid() = user_id));

-- Create function to get user's selected managed groups
CREATE OR REPLACE FUNCTION public.get_user_selected_groups(p_user_id uuid)
RETURNS TABLE(group_id uuid, name varchar, type varchar, email varchar)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT ag.group_id, ag.name, ag.type, ag.email
    FROM managed_user_groups mug
    JOIN azure_groups ag ON mug.group_id = ag.group_id
    WHERE mug.user_id = p_user_id
    AND mug.is_selected = true
    ORDER BY ag.name;
END;
$function$;

-- Create function to initialize managed groups for a user
CREATE OR REPLACE FUNCTION public.initialize_managed_groups_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Insert all user's accessible groups as selected by default
    INSERT INTO managed_user_groups (user_id, group_id, is_selected)
    SELECT p_user_id, ag.group_id, true
    FROM user_groups ug
    JOIN azure_groups ag ON ug.group_id = ag.group_id
    WHERE ug.user_id = p_user_id
    ON CONFLICT (user_id, group_id) DO NOTHING;
END;
$function$;