-- Migration: Allow group members to read webhook assignments for shared assistants
-- This properly extends RLS instead of bypassing it

-- Drop existing select policy if it exists
DROP POLICY IF EXISTS "Users can view their own webhook assignments" ON n8n_webhook_assignments;
DROP POLICY IF EXISTS "Users can view webhook assignments for shared assistants" ON n8n_webhook_assignments;
DROP POLICY IF EXISTS "Users can view webhook assignments" ON n8n_webhook_assignments;

-- Create new comprehensive select policy
-- Allows users to see:
-- 1. Their own webhook assignments
-- 2. Webhook assignments for assistants shared with groups they belong to
CREATE POLICY "Users can view webhook assignments"
ON n8n_webhook_assignments
FOR SELECT
USING (
  -- User's own assignments
  user_id = auth.uid()
  OR
  -- Assignments for assistants shared with user's groups
  (
    entity_type = 'assistant'
    AND entity_id::text IN (
      SELECT a.id::text 
      FROM assistants a
      WHERE 
        -- Assistant is shared with a group the user belongs to
        a.group_id::text IN (
          SELECT mug.group_id::text
          FROM managed_user_groups mug
          WHERE mug.user_id = auth.uid()
        )
        OR
        -- Assistant has sharing = 'public' or 'link'
        a.sharing IN ('public', 'link')
        OR
        -- User owns the assistant
        a.user_id = auth.uid()
    )
  )
);

-- Also need to allow reading the actual webhooks for shared assistants
DROP POLICY IF EXISTS "Users can view their own webhooks" ON n8n_webhooks;
DROP POLICY IF EXISTS "Users can view webhooks for shared assistants" ON n8n_webhooks;
DROP POLICY IF EXISTS "Users can view webhooks" ON n8n_webhooks;

-- Create new comprehensive select policy for webhooks
CREATE POLICY "Users can view webhooks"
ON n8n_webhooks
FOR SELECT
USING (
  -- User's own webhooks
  user_id = auth.uid()
  OR
  -- Webhooks assigned to assistants shared with user's groups
  id IN (
    SELECT nwa.webhook_id
    FROM n8n_webhook_assignments nwa
    WHERE nwa.entity_type = 'assistant'
    AND nwa.entity_id::text IN (
      SELECT a.id::text 
      FROM assistants a
      WHERE 
        -- Assistant is shared with a group the user belongs to
        a.group_id::text IN (
          SELECT mug.group_id::text
          FROM managed_user_groups mug
          WHERE mug.user_id = auth.uid()
        )
        OR
        -- Assistant has sharing = 'public' or 'link'  
        a.sharing IN ('public', 'link')
        OR
        -- User owns the assistant
        a.user_id = auth.uid()
    )
  )
);

-- Keep insert/update/delete policies restricted to owner only
-- (These should already exist, but recreate to be safe)

DROP POLICY IF EXISTS "Users can insert their own webhook assignments" ON n8n_webhook_assignments;
CREATE POLICY "Users can insert their own webhook assignments"
ON n8n_webhook_assignments
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own webhook assignments" ON n8n_webhook_assignments;
CREATE POLICY "Users can update their own webhook assignments"
ON n8n_webhook_assignments
FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own webhook assignments" ON n8n_webhook_assignments;
CREATE POLICY "Users can delete their own webhook assignments"
ON n8n_webhook_assignments
FOR DELETE
USING (user_id = auth.uid());
