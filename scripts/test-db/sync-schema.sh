#!/usr/bin/env bash
# Copies the PUBLIC schema (no data) from production into the test project.
# Reads production only. Writes only to the project in backend/.env.test.
# Needs: Docker running, SUPABASE_ACCESS_TOKEN (read access to production), backend/.env.test.
# Usage: scripts/test-db/sync-schema.sh [--reset]
#   --reset  drops and recreates schema "public" on the TEST project first (destroys its data).
set -euo pipefail

PROD_REF="gwbiwweeznbuqfgawywv"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/backend/.env.test"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.165"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

TEST_REF="$(get TEST_DB_PROJECT_REF)"
TEST_PW="$(get TEST_DB_PASSWORD)"
POOLER="$(get TEST_DB_POOLER_HOST)"

[ -n "$TEST_REF" ] && [ -n "$TEST_PW" ] && [ -n "$POOLER" ] || { echo "TEST_DB_PROJECT_REF, TEST_DB_PASSWORD and TEST_DB_POOLER_HOST must be set in $ENV_FILE"; exit 1; }
[ "$TEST_REF" != "$PROD_REF" ] || { echo "Refusing: the test project ref is the production ref."; exit 1; }
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || { echo "SUPABASE_ACCESS_TOKEN is not set."; exit 1; }

WORK="$ROOT/.tools/test-db-work"
mkdir -p "$WORK/supabase"
trap 'rm -rf "$WORK"' EXIT
MOUNT="$(cd "$WORK" && (pwd -W 2>/dev/null || pwd))"

echo "Linking to production (read only)..."
(cd "$ROOT" && npx supabase link --project-ref "$PROD_REF" --workdir "$WORK" >/dev/null)
echo "Dumping production public schema..."
(cd "$ROOT" && npx supabase db dump --linked --schema public --workdir "$WORK" -f "$WORK/public.sql")

CONN="host=$POOLER port=5432 user=postgres.$TEST_REF dbname=postgres sslmode=require"
psql_test() {
  MSYS_NO_PATHCONV=1 docker run --rm -e PGPASSWORD="$TEST_PW" -v "$MOUNT:/work" "$IMAGE" psql "$CONN" "$@"
}

if [ "${1:-}" = "--reset" ]; then
  echo "Resetting schema public on the TEST project ($TEST_REF)..."
  psql_test -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public;'
fi

echo "Applying schema to the TEST project ($TEST_REF)..."
psql_test -v ON_ERROR_STOP=1 -1 -f /work/public.sql >/dev/null

echo "Seeding storage buckets and platform settings..."
psql_test -v ON_ERROR_STOP=1 \
  -c "insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('audio-sketches','audio-sketches',false,20971520,array['audio/wav','audio/x-wav','audio/wave']),('custom-sounds','custom-sounds',false,10485760,array['audio/wav','audio/x-wav','audio/wave']) on conflict (id) do nothing" \
  -c "insert into public.platform_settings (key,value) select 'custom_sound_quota_bytes','52428800'::jsonb where not exists (select 1 from public.platform_settings where key='custom_sound_quota_bytes')"

echo "Done. Tables in public:"
psql_test -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
