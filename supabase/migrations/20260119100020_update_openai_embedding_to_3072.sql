-- Drop old function
DROP FUNCTION IF EXISTS match_file_items_openai;

-- Drop index first (to allow altering column type)
DROP INDEX IF EXISTS file_items_embedding_idx;

-- Change to halfvec for up to 4000 dims
ALTER TABLE file_items
ALTER COLUMN openai_embedding TYPE halfvec(3072);

-- Recreate matching function
CREATE FUNCTION match_file_items_openai (
  query_embedding halfvec(3072),
  match_count int DEFAULT null,
  file_ids UUID[] DEFAULT null
) RETURNS TABLE (
  id UUID,
  file_id UUID,
  content TEXT,
  tokens INT,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    id,
    file_id,
    content,
    tokens,
    1 - (file_items.openai_embedding <=> query_embedding) AS similarity
  FROM file_items
  WHERE (file_id = ANY(file_ids))
  ORDER BY file_items.openai_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Rebuild HNSW or IVFFlat index
CREATE INDEX file_items_embedding_idx ON file_items
  USING ivfflat (openai_embedding halfvec_cosine_ops)
  WITH (lists = 100);
  
