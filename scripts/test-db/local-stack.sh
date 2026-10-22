#!/usr/bin/env bash
# Local Supabase stack (Docker) for tests that need a real mailbox.
# Services: Postgres, Auth (GoTrue), PostgREST, Kong and Mailpit (the CLI calls it inbucket).
# Nothing here touches production except `schema`, which only READS it.
# Usage: scripts/test-db/local-stack.sh up | schema | env | down
#   up      start the stack (first run pulls images)
#   schema  copy the PUBLIC schema from production (read only) into the local database
#   env     write backend/.env.test.localstack and frontend/.env.test.localstack
#   down    stop the stack (data kept; add --reset to wipe it)
# Then run E2E against it with: cd frontend && E2E_TARGET=local npx playwright test <file>
set -euo pipefail

PROD_REF="gwbiwweeznbuqfgawywv"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL="$ROOT/scripts/test-db/local"
DB="supabase_db_stave-local"

sb() { (cd "$ROOT" && npx supabase "$@" --workdir "$LOCAL"); }

case "${1:-}" in
  up)
    sb start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,storage-api
    ;;
  schema)
    [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || { echo "SUPABASE_ACCESS_TOKEN is not set."; exit 1; }
    WORK="$ROOT/.tools/local-stack-work"
    mkdir -p "$WORK/supabase"
    trap 'rm -rf "$WORK"' EXIT
    echo "Linking to production (read only)..."
    (cd "$ROOT" && npx supabase link --project-ref "$PROD_REF" --workdir "$WORK" >/dev/null)
    echo "Dumping production public schema..."
    (cd "$ROOT" && npx supabase db dump --linked --schema public --workdir "$WORK" -f "$WORK/public.sql")
    echo "Resetting schema public in the LOCAL database..."
    docker exec "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public;'
    echo "Applying schema to the LOCAL database..."
    docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < "$WORK/public.sql" >/dev/null
    docker exec "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "insert into public.platform_settings (key,value) select 'custom_sound_quota_bytes','52428800'::jsonb where not exists (select 1 from public.platform_settings where key='custom_sound_quota_bytes')"
    docker exec "$DB" psql -U postgres -d postgres -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
    ;;
  env)
    STATUS="$(mktemp)"
    trap 'rm -f "$STATUS"' EXIT
    sb status -o env > "$STATUS"
    "${PYTHON:-$(command -v python3 || command -v python)}" - "$ROOT" "$STATUS" <<'PY'
import re, sys, pathlib
root, status = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
def parse(path):
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^([A-Z_]+)="?(.*?)"?$', line)
        if m:
            out[m.group(1)] = m.group(2)
    return out
s = parse(status)
payos = {}
src = root / "backend" / ".env.test"
if src.exists():
    payos = {k: v for k, v in parse(src).items() if k.startswith("PAYOS_")}
backend = {
    "SUPABASE_URL": s["API_URL"],
    "SUPABASE_SERVICE_ROLE_KEY": s["SERVICE_ROLE_KEY"],
    "SUPABASE_ANON_KEY": s["ANON_KEY"],
    "TEST_DB_PROJECT_REF": "local",
    **payos,
}
frontend = {
    "NEXT_PUBLIC_SUPABASE_URL": s["API_URL"],
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": s["ANON_KEY"],
    "NEXT_PUBLIC_API_URL": "http://localhost:3101",
}
for path, values in (
    (root / "backend" / ".env.test.localstack", backend),
    (root / "frontend" / ".env.test.localstack", frontend),
):
    path.write_text("".join(f"{k}={v}\n" for k, v in values.items()), encoding="utf-8")
    print("wrote", path.relative_to(root))
PY
    ;;
  down)
    if [ "${2:-}" = "--reset" ]; then sb stop --no-backup; else sb stop; fi
    ;;
  *)
    echo "Usage: $0 up | schema | env | down"
    exit 1
    ;;
esac
