#!/bin/bash
# Entrypoint for the Project Management Platform API container.
# Waits for Postgres, applies Alembic migrations, optionally seeds, then runs CMD.

set -e

echo "🚀 Starting Project Management Platform API..."

echo "⏳ Waiting for PostgreSQL at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}..."
until nc -z "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}"; do
  sleep 1
done
echo "✅ PostgreSQL is ready!"

if [ "${RUN_MIGRATIONS_ON_STARTUP:-true}" = "true" ]; then
  echo "🔄 Applying database migrations (alembic upgrade head)..."
  alembic upgrade head
fi

if [ "${SEED_ON_STARTUP:-false}" = "true" ]; then
  echo "🌱 Seeding RBAC catalog + default admin..."
  python scripts/seed_db.py
fi

echo "🌟 Launching process: $*"
exec "$@"
