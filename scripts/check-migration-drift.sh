#!/usr/bin/env sh
# Fails CI when schema.prisma and prisma/migrations disagree.
#
# Some objects live only in migration SQL and are invisible to Prisma's
# datamodel — it would emit a DROP for them on the next `migrate dev` (that is
# how the Message trgm indexes got lost). Anything Prisma can express is
# declared in schema.prisma; the rest is allow-listed below and must stay in
# sync with the migrations that create it.
#
# Usage: DATABASE_URL must point at a database with all migrations applied.
set -eu

ALLOWED='Delivery_pending_sweep_idx'   # partial index, init migration

diff=$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script)
unexpected=$(printf '%s\n' "$diff" | grep -E '^(ALTER|CREATE|DROP)' | grep -vE "$ALLOWED" || true)

if [ -n "$unexpected" ]; then
  echo "schema.prisma drifts from prisma/migrations. Create a migration (pnpm db:migrate) or update the allow-list:" >&2
  printf '%s\n' "$unexpected" >&2
  exit 1
fi
echo "No migration drift."
