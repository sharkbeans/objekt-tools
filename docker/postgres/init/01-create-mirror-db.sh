#!/bin/sh
set -eu

MIRROR_DB="${MIRROR_POSTGRES_DB:-indexer_mirror}"
POSTGRES_ADMIN_DB="${POSTGRES_DB:-postgres}"

if [ -z "$MIRROR_DB" ]; then
  echo "MIRROR_POSTGRES_DB is empty; skipping mirror DB creation"
  exit 0
fi

if psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_ADMIN_DB" \
  --tuples-only \
  --no-align \
  --command "SELECT 1 FROM pg_database WHERE datname = '$MIRROR_DB'" \
  | grep -q '^1$'; then
  echo "Mirror database '$MIRROR_DB' already exists; skipping creation"
  exit 0
fi

createdb --username "$POSTGRES_USER" "$MIRROR_DB"
echo "Created mirror database '$MIRROR_DB'"
