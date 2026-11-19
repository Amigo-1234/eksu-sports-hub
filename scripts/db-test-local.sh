#!/bin/bash
# Run the pgTAP suites (supabase/tests) against a throwaway local Postgres —
# no Docker needed. Requires Homebrew-style Postgres binaries (initdb, pg_ctl,
# psql) on PATH. Supabase platform pieces (auth, realtime, vault, storage,
# pg_net) are replaced by minimal stand-ins; pgTAP is loaded from its official
# release (checksum-verified). Nothing here touches any remote database.
#
#   scripts/db-test-local.sh                 # build + run every suite
#   scripts/db-test-local.sh 17_fan_zone     # build + run matching suites
#   KEEP=1 scripts/db-test-local.sh          # leave the server running afterwards
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${DB_TEST_DIR:-$HOME/.cache/eksu-db-test}"
PORT="${DB_TEST_PORT:-54399}"
FILTER="${1:-}"
mkdir -p "$WORK"
export PGOPTIONS='-c client_min_messages=error'
Q() { psql -h localhost -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

if [ ! -d "$WORK/data" ]; then
  initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 >/dev/null
  printf "port = %s\nunix_socket_directories = ''\nlisten_addresses = 'localhost'\n" "$PORT" >> "$WORK/data/postgresql.conf"
fi
pg_isready -q -h localhost -p "$PORT" || pg_ctl -D "$WORK/data" -l "$WORK/pg.log" start >/dev/null
for _ in $(seq 1 40); do pg_isready -q -h localhost -p "$PORT" && break; sleep 0.25; done

if [ ! -f "$WORK/pgtap.sql" ]; then
  curl -sSL -o "$WORK/pgtap.tar.gz" https://github.com/theory/pgtap/archive/refs/tags/v1.3.3.tar.gz
  echo "325ea79d0d2515bce96bce43f6823dcd3effbd6c54cb2a4d6c2384fffa3a14c7  $WORK/pgtap.tar.gz" | shasum -a 256 -c - >/dev/null
  tar xzf "$WORK/pgtap.tar.gz" -C "$WORK"
  sed -e 's/__OS__/darwin/' -e 's/__VERSION__/1.33/' "$WORK/pgtap-1.3.3/sql/pgtap.sql.in" > "$WORK/pgtap.sql"
fi

Q -d postgres <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;
drop database if exists qa;
create database qa;
alter database qa set search_path = public, extensions;
SQL

Q -d qa <<'SQL'
create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
set search_path = public, extensions;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}',
  raw_user_meta_data jsonb default '{}', banned_until timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  deleted_at timestamptz, phone text, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
  insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$;
grant select, insert on realtime.messages to authenticated, anon;
grant execute on all functions in schema realtime to anon, authenticated, service_role;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as select *, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$
  insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id $$;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, path_tokens text[], created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant all on storage.objects, storage.buckets to authenticated, service_role, anon;
create schema net;
create table net.requests (id bigserial primary key, url text, body jsonb, headers jsonb, created_at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$
  insert into net.requests (url, body, headers) values (url, body, headers) returning id $$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
Q -d qa -c "set search_path=extensions" -f "$WORK/pgtap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do Q -d qa -1 -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }; done
Q -d qa -1 -f "$ROOT/supabase/seed.sql" >/dev/null
echo "built: $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"

rm -rf "$WORK/tests" && cp -R "$ROOT/supabase/tests" "$WORK/tests"
sed -i '' 's/^create extension if not exists pgtap with schema extensions;/-- (pgtap preloaded)/' "$WORK/tests/helpers.inc"
cd "$WORK/tests"
total=0; failed=0
for f in [0-9]*.test.sql; do
  [ -n "$FILTER" ] && [[ "$f" != *"$FILTER"* ]] && continue
  out=$(PGOPTIONS='-c client_min_messages=warning' psql -h localhost -p "$PORT" -U postgres -d qa -X -At -f "$f" 2>&1 || true)
  ok=$(echo "$out" | grep -cE "^ok " || true); bad=$(echo "$out" | grep -cE "^not ok " || true); err=$(echo "$out" | grep -m1 "ERROR" || true)
  total=$((total + ok)); [ "$bad" != 0 ] || [ -n "$err" ] && failed=$((failed + 1))
  echo "$f ok=$ok notok=$bad ${err}"
  [ "$bad" != 0 ] && echo "$out" | grep -A4 "^not ok" | head -16
done
echo "TOTAL ok=$total failing_suites=$failed"
[ "${KEEP:-}" = 1 ] || pg_ctl -D "$WORK/data" stop -m fast >/dev/null
[ "$failed" = 0 ]
