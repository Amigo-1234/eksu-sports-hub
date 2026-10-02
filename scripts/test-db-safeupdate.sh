#!/usr/bin/env bash
# Runs every pgTAP file with pg_safeupdate loaded, as PostgREST (authenticator)
# sessions do: UPDATE/DELETE without a WHERE clause fail there but not in a
# plain psql session. LOCAL ONLY (uses the local supabase_admin role).
set -uo pipefail
DB_URL="${SAFEUPDATE_DB_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/../supabase/tests"
fail=0
for f in [0-9]*.test.sql; do
  out=$(printf "load 'safeupdate';\nset role postgres;\n\\\\i %s\n" "$PWD/$f" | psql "$DB_URL" -X -q -t -A 2>&1)
  ok=$(grep -cE '^ok ' <<<"$out"); bad=$(grep -cE '^not ok ' <<<"$out"); err=$(grep -m1 'ERROR' <<<"$out")
  printf '%-36s ok=%-4s not_ok=%s %s\n' "$f" "$ok" "$bad" "${err:+ $err}"
  if [ "$bad" != 0 ] || [ -n "$err" ]; then fail=1; fi
done
exit $fail
