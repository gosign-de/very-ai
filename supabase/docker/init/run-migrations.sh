#!/bin/bash
# Run Very AI application migrations after the Supabase image's own
# migrate.sh has set up roles, schemas, and extensions.
#
# IMPORTANT: This file is mounted as "zzz-veryai-migrations.sh" so it
# sorts AFTER the image's "migrate.sh" (digits < letters in ASCII).
# The app migrations are mounted at /veryai-migrations/ to avoid
# shadowing the image's built-in /docker-entrypoint-initdb.d/migrations/.
set -e

MIGRATION_DIR="/veryai-migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "No migrations directory found at $MIGRATION_DIR — skipping."
  exit 0
fi

SQL_FILES=$(find "$MIGRATION_DIR" -maxdepth 1 -name '*.sql' | sort)

if [ -z "$SQL_FILES" ]; then
  echo "No SQL migration files found — skipping."
  exit 0
fi

# Pre-migration setup: fix schema gaps between the Supabase image and what
# the application migrations expect.
echo "Preparing database for migrations..."
psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U supabase_admin -d "$POSTGRES_DB" \
  --set=svc_pass="${POSTGRES_PASSWORD:-postgres}" <<-'EOSQL'
  -- Set passwords on roles created by the image's init scripts.
  -- Network connections (from PostgREST, GoTrue) require password auth via pg_hba.conf.
  ALTER ROLE authenticator WITH PASSWORD :'svc_pass';
  ALTER ROLE supabase_auth_admin WITH PASSWORD :'svc_pass';
  ALTER ROLE supabase_storage_admin WITH PASSWORD :'svc_pass';

  -- Add extensions schema to search path so uuid_generate_v4() etc. resolve
  ALTER DATABASE postgres SET search_path TO public, extensions;
  SET search_path TO public, extensions;

  -- The image's storage schema is older and lacks columns the migrations expect.
  ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public BOOLEAN DEFAULT FALSE;
  ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS avif_autodetection BOOLEAN DEFAULT FALSE;
  ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit BIGINT;
  ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types TEXT[];
  ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version TEXT;
EOSQL

echo "Running Very AI migrations..."

COUNT=0
for f in $SQL_FILES; do
  echo "  → $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U supabase_admin -d "$POSTGRES_DB" \
    -c "SET search_path TO public, extensions;" \
    -f "$f"
  COUNT=$((COUNT + 1))
done

echo "All $COUNT migrations complete."
