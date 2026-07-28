#!/bin/sh
set -e

echo "Running database migrations..."
node /app/scripts/migrate.js

echo "Starting app..."
exec node server.js
