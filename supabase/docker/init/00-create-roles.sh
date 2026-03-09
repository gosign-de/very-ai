#!/bin/bash
# Create the supabase_admin role BEFORE the image's migrate.sh runs.
# The supabase/postgres image expects this role to exist but doesn't
# create it during initdb — it's normally pre-baked into the AMI.
# This script sorts before "migrate.sh" (digits < letters in ASCII).
set -e

echo "Creating supabase_admin role..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD '${POSTGRES_PASSWORD}';
  END IF;
END
\$\$;
EOF
echo "supabase_admin role created."
