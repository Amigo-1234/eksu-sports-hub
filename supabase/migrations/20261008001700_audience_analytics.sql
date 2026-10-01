-- PRIVATE LIVE AUDIENCE ANALYTICS
--
-- Internal, per-match audience numbers for assigned operators and admins:
--   WATCHING NOW  distinct anonymous devices with an open viewing session whose
--                 latest heartbeat is within the active timeout (50 s);
--   PEAK VIEWERS  the highest WATCHING NOW observed for the match, over its
--                 whole page life (before kick-off, live and after FT);
--   UNIQUE VIEWERS distinct anonymous devices that started ≥ 1 viewing session;
--   TOTAL VISITS  viewing sessions started (one per page view; a tab that comes
--                 back within 10 minutes resumes its session, it is not a new visit).
--
-- Identity: the Notifications V1 anonymous device (server-issued 256-bit token
-- in the httpOnly `eksu_alerts` cookie, only its SHA-256 stored). No IPs,
-- fingerprints or personal data. Browsers never talk to these tables or
-- functions: the Next.js server calls service_audience_* as service_role with
-- the cookie token; counters are derived here, never sent by clients.
--
-- Nothing is public: tables have forced RLS and no grants; aggregates are only
-- readable through op_match_audience (active assignment) and
-- admin_match_audience (ADMIN). public_match_feed is untouched.
--
-- Retention: raw sessions are deleted 2 days after their last heartbeat; the
-- per-match device list after 180 days; the aggregate row (match_audience) is
-- kept for good. Analytics-only devices idle for 400 days (the cookie's
-- lifetime) are removed.

-- ── 1. Tables ──────────────────────────────────────────────────────────────
create table public.match_audience (
  match_id uuid primary key references public.matches (id) on delete cascade,
  unique_viewers integer not null default 0 check (unique_viewers >= 0),
  total_visits integer not null default 0 check (total_visits >= 0),
  peak_viewers integer not null default 0 check (peak_viewers >= 0),
  peak_at timestamptz,
  first_view_at timestamptz,
  last_view_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per (match, device): de-duplicates unique viewers. Counters above
-- stay correct after these rows are purged.
create table public.match_audience_viewers (
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits integer not null default 1,
  primary key (match_id, device_id)
);
create index match_audience_viewers_device_idx on public.match_audience_viewers (device_id);

create table public.match_view_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index match_view_sessions_active_idx on public.match_view_sessions (match_id, last_seen_at) where ended_at is null;
create index match_view_sessions_device_idx on public.match_view_sessions (device_id, match_id);
create index match_view_sessions_seen_idx on public.match_view_sessions (last_seen_at);

-- ── 2. Definitions ─────────────────────────────────────────────────────────
-- Heartbeat every 20 s while the page is visible → active for 50 s.
create or replace function private.audience_active_window() returns interval
language sql immutable set search_path = '' as $$ select interval '50 seconds' $$;
-- A session not heard from for longer than this is a finished visit.
create or replace function private.audience_resume_window() returns interval
language sql immutable set search_path = '' as $$ select interval '10 minutes' $$;

create or replace function private.audience_watching(p_match_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct s.device_id)::int from public.match_view_sessions s
  where s.match_id = p_match_id and s.ended_at is null and s.last_seen_at > now() - private.audience_active_window()
$$;

-- Peak only ever rises.
create or replace function private.audience_bump_peak(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v int := private.audience_watching(p_match_id);
begin
  update public.match_audience set peak_viewers = v, peak_at = now(), updated_at = now()
  where match_id = p_match_id and peak_viewers < v;
end $$;

create or replace function private.audience_summary(p_match_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'match_id', p_match_id,
    'watching_now', private.audience_watching(p_match_id),
    'peak_viewers', coalesce(a.peak_viewers, 0),
    'peak_at', a.peak_at,
    'unique_viewers', coalesce(a.unique_viewers, 0),
    'total_visits', coalesce(a.total_visits, 0),
    'first_view_at', a.first_view_at,
    'last_view_at', a.last_view_at,
    'active_window_seconds', extract(epoch from private.audience_active_window())::int)
  from (select 1) one left join public.match_audience a on a.match_id = p_match_id
$$;

-- Token → device, without writing (heartbeats must stay cheap).
create or replace function private.audience_device(p_token text) returns public.notification_devices
language plpgsql stable security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then
    raise exception 'Unknown device' using errcode = 'EK401';
  end if;
  select * into d from public.notification_devices where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if d.id is null then
    raise exception 'Unknown device' using errcode = 'EK401';
  end if;
  return d;
end $$;

-- ── 3. Retention ───────────────────────────────────────────────────────────
create or replace function private.audience_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sessions int; v_viewers int; v_devices int;
begin
  delete from public.match_view_sessions where last_seen_at < now() - interval '2 days';
  get diagnostics v_sessions = row_count;
  delete from public.match_audience_viewers where last_seen_at < now() - interval '180 days';
  get diagnostics v_viewers = row_count;
  -- Analytics-only devices (no alerts set up) that have not been seen for the cookie's whole lifetime.
  delete from public.notification_devices d
  where d.last_seen_at < now() - interval '400 days'
    and not exists (select 1 from public.push_subscriptions s where s.device_id = d.id)
    and not exists (select 1 from public.match_notification_preferences p where p.device_id = d.id)
    and not exists (select 1 from public.team_notification_preferences p where p.device_id = d.id);
  get diagnostics v_devices = row_count;
  return jsonb_build_object('sessions', v_sessions, 'viewers', v_viewers, 'devices', v_devices);
end $$;

-- ── 4. Server-only write path (service_role) ───────────────────────────────
-- A browser without a device yet (separate, generous per-network budget: a full
-- stadium on campus Wi-Fi shares one IP).
create or replace function public.service_audience_register(p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not private.rate_hit('audience-register', p_rate_key, 2000, 600) then
    raise exception 'Too many requests' using errcode = 'EK429';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.notification_devices (token_hash) values (encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('token', v_token);
end $$;

-- A visit begins (page opened / shown again after the resume window).
create or replace function public.service_audience_start(p_token text, p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices; v_session uuid; v_new boolean;
begin
  d := private.audience_device(p_token);
  if p_match_id is null or not private.match_is_public(p_match_id) then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if not private.rate_hit('audience-start', d.id::text, 60, 600) then
    raise exception 'Too many visits' using errcode = 'EK429';
  end if;
  -- A device cannot hold more than 10 open sessions on one match (tabs).
  if (select count(*) from public.match_view_sessions s where s.device_id = d.id and s.match_id = p_match_id
      and s.ended_at is null and s.last_seen_at > now() - private.audience_active_window()) >= 10 then
    raise exception 'Too many open views' using errcode = 'EK429';
  end if;

  insert into public.match_view_sessions (match_id, device_id) values (p_match_id, d.id) returning id into v_session;
  insert into public.match_audience (match_id, first_view_at) values (p_match_id, now()) on conflict (match_id) do nothing;
  insert into public.match_audience_viewers as v (match_id, device_id) values (p_match_id, d.id)
  on conflict (match_id, device_id) do update set visits = v.visits + 1, last_seen_at = now()
  returning (xmax = 0) into v_new;
  update public.match_audience set
    total_visits = total_visits + 1,
    unique_viewers = unique_viewers + case when v_new then 1 else 0 end,
    last_view_at = now(), updated_at = now()
  where match_id = p_match_id;
  update public.notification_devices set last_seen_at = now() where id = d.id;
  perform private.audience_bump_peak(p_match_id);
  if random() < 0.02 then
    perform private.audience_housekeeping();
  end if;
  return jsonb_build_object('session_id', v_session);
end $$;

-- Still viewing. Cheap: no write when the last beat was < 10 s ago.
create or replace function public.service_audience_beat(p_token text, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices; s public.match_view_sessions;
begin
  d := private.audience_device(p_token);
  select * into s from public.match_view_sessions where id = p_session_id and device_id = d.id;
  if s.id is null or s.ended_at is not null or s.last_seen_at < now() - private.audience_resume_window() then
    return jsonb_build_object('ok', false, 'restart', true);
  end if;
  if s.last_seen_at > now() - interval '10 seconds' then
    return jsonb_build_object('ok', true);
  end if;
  update public.match_view_sessions set last_seen_at = now() where id = s.id;
  -- A session coming back from stale can raise the simultaneous count.
  if s.last_seen_at <= now() - private.audience_active_window() then
    perform private.audience_bump_peak(s.match_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Page closed / hidden: stop counting this view now (best effort; timeouts cover the rest).
create or replace function public.service_audience_end(p_token text, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.audience_device(p_token);
  update public.match_view_sessions set ended_at = now(), last_seen_at = greatest(last_seen_at, now())
  where id = p_session_id and device_id = d.id and ended_at is null;
end $$;

-- ── 5. Readers: assigned operators and admins only ─────────────────────────
-- Same rule as operator_match_state: active staff with an active assignment (primary or backup).
create or replace function public.op_match_audience(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if not private.is_staff() or not exists (
    select 1 from public.operator_assignments a where a.match_id = p_match_id and a.user_id = auth.uid() and a.active
  ) then
    raise exception 'Match not found or not assigned to you' using errcode = 'EK403';
  end if;
  return private.audience_summary(p_match_id) - 'first_view_at' - 'last_view_at';
end $$;

create or replace function public.admin_match_audience(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  return private.audience_summary(p_match_id);
end $$;

-- ── 6. Lock down ───────────────────────────────────────────────────────────
alter table public.match_audience enable row level security;
alter table public.match_audience force row level security;
alter table public.match_audience_viewers enable row level security;
alter table public.match_audience_viewers force row level security;
alter table public.match_view_sessions enable row level security;
alter table public.match_view_sessions force row level security;
revoke all on public.match_audience, public.match_audience_viewers, public.match_view_sessions from public, anon, authenticated;

revoke execute on function
  public.service_audience_register(text),
  public.service_audience_start(text, uuid),
  public.service_audience_beat(text, uuid),
  public.service_audience_end(text, uuid),
  public.op_match_audience(uuid),
  public.admin_match_audience(uuid)
from public, anon, authenticated;
grant execute on function
  public.service_audience_register(text),
  public.service_audience_start(text, uuid),
  public.service_audience_beat(text, uuid),
  public.service_audience_end(text, uuid)
to service_role;
grant execute on function public.op_match_audience(uuid), public.admin_match_audience(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
