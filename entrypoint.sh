#!/bin/sh
set -e

echo "Running database migrations..."
node /app/migrate.js

echo "Starting app..."
exec node server.js
