#!/bin/sh
set -eu

MIRROR_DB="${MIRROR_POSTGRES_DB:-indexer_mirror}"

if [ -z "$MIRROR_DB" ]; then
  echo "MIRROR_POSTGRES_DB is empty; skipping mirror DB creation"
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${MIRROR_DB}') THEN
    EXECUTE format('CREATE DATABASE %I', '${MIRROR_DB}');
  END IF;
END
\$\$;
SQL
