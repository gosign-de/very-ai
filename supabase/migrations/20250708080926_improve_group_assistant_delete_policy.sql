-- Update the group assistant delete policy to allow admins to delete all group assistants
-- This policy allows:
-- 1. Owners to delete their own assistants
-- 2. Users to delete assistants in their groups
-- 3. Admin users to delete any group assistant (from all users)

-- Drop the existing delete policy
DROP POLICY IF EXISTS "Users can delete assistants in their groups or public assistant" ON "public"."assistants";

-- Create an improved delete policy that allows admins to delete all group assistants
CREATE POLICY "Enhanced group assistant delete policy"
ON "public"."assistants"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  -- Allow users to delete their own assistants (both private and group)
  user_id = auth.uid()
  OR
  -- Allow users to delete assistants in groups they belong to
  (group_id IN (
    SELECT user_groups.group_id
    FROM user_groups
    WHERE user_groups.user_id = auth.uid()
  ))
  OR
  -- Allow admin users to delete any group assistant (admins can delete from all users)
  (group_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM user_groups ug
    JOIN azure_groups ag ON ug.group_id = ag.group_id
    WHERE ug.user_id = auth.uid()
    AND ag.role = 'admin'
  ))
);
