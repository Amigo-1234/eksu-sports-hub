-- EKSU Sports Hub — foundation: schemas, enums, identity and roles.
--
-- Conventions
--   * UUID primary keys everywhere; relationships are foreign keys.
--   * public  : tables/RPCs exposed through the Supabase API (guarded by RLS).
--   * private : helper functions that are never exposed through the API.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Functions are not executable by default; each one is granted deliberately.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ── Enums ──────────────────────────────────────────────────────────────────
-- Canonical football match states. Extra periods (ET1/ET2/PENS) can be added
-- later with ALTER TYPE ... ADD VALUE without touching existing rows.
create type public.match_status as enum (
  'SCHEDULED', '1H', 'HT', '2H', 'FT', 'POSTPONED', 'CANCELLED', 'ABANDONED'
);

create type public.assignment_role as enum ('PRIMARY', 'BACKUP');
create type public.competition_format as enum ('LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT');
create type public.competition_category as enum ('MEN', 'WOMEN', 'MIXED');
create type public.team_kind as enum ('FACULTY', 'DEPARTMENT', 'OTHER');

-- ── updated_at helper ──────────────────────────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Identity ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z_]+$'),
  description text not null default ''
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_id)
);
create index user_roles_user_idx on public.user_roles (user_id);

-- Every auth user gets a profile row (no roles — roles are granted explicitly).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Operator'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Role check used by RLS and RPCs. Stable + definer so policies stay cheap and
-- can read user_roles without exposing it.
create or replace function private.has_role(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = p_code
  );
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code in ('ADMIN', 'MANAGER', 'OPERATOR')
  );
$$;

grant usage on schema private to authenticated, anon;
grant execute on function private.has_role(text), private.is_staff() to authenticated, anon;
