-- Migration: Update assistant group access policy to use managed_user_groups
-- Issue: Assistant SELECT policy was checking user_groups table, but system uses managed_user_groups

-- Drop existing group access policy
DROP POLICY IF EXISTS "Users can access assistants in their groups or public assistant" ON assistants;

-- Create new policy using managed_user_groups
CREATE POLICY "Users can access assistants in their groups or public assistant"
ON assistants
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT group_id::text::uuid
    FROM managed_user_groups
    WHERE user_id = auth.uid()
  )
);

-- Also update the azure_groups policy to use managed_user_groups
DROP POLICY IF EXISTS "Users can read their own data only" ON azure_groups;

CREATE POLICY "Users can read their own data only"
ON azure_groups
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM managed_user_groups
    WHERE managed_user_groups.group_id = azure_groups.group_id
      AND managed_user_groups.user_id = auth.uid()
  )
);
