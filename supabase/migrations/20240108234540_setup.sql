-- Enable HTTP extension
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Function to update modified column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to delete a message and all following messages
CREATE OR REPLACE FUNCTION delete_message_including_and_after(
    p_user_id UUID,
    p_chat_id UUID,
    p_sequence_number INT
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM messages
    WHERE user_id = p_user_id AND chat_id = p_chat_id AND sequence_number >= p_sequence_number;
END;
$$ LANGUAGE plpgsql;

-- Function to create duplicate messages for a new chat
CREATE OR REPLACE FUNCTION create_duplicate_messages_for_new_chat(old_chat_id UUID, new_chat_id UUID, new_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO messages (user_id, chat_id, content, role, model, sequence_number, tokens, created_at, updated_at)
    SELECT new_user_id, new_chat_id, content, role, model, sequence_number, tokens, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM messages
    WHERE chat_id = old_chat_id;
END;
$$ LANGUAGE plpgsql;

-- Ensure owner_id column exists (older image versions only have 'owner')
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id TEXT;

-- Policy to allow users to read their own files
CREATE POLICY "Allow users to read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (auth.uid()::text = COALESCE(owner_id, owner::text));

-- Storage object deletion stub.
-- In production with hosted Supabase, this calls the Storage API via HTTP.
-- For self-hosted Docker (no Storage API), this is a no-op returning HTTP 200.
CREATE OR REPLACE FUNCTION delete_storage_object(bucket TEXT, object TEXT, OUT status INT, OUT content TEXT)
RETURNS RECORD
LANGUAGE 'plpgsql'
SECURITY DEFINER
AS $$
BEGIN
  -- No-op stub: Storage API not available in self-hosted Docker mode.
  -- Override this function with a real implementation when using hosted Supabase.
  status := 200;
  content := 'OK';
END;
$$;

-- Function to delete a storage object from a bucket
CREATE OR REPLACE FUNCTION delete_storage_object_from_bucket(bucket_name TEXT, object_path TEXT, OUT status INT, OUT content TEXT)
RETURNS RECORD
LANGUAGE 'plpgsql'
SECURITY DEFINER
AS $$
BEGIN
  SELECT
      INTO status, content
           result.status, result.content
      FROM public.delete_storage_object(bucket_name, object_path) AS result;
END;
$$;
