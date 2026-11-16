-- Site visitors: a light "what should we call you?" sign-in for the public site.
--
-- * Not an account: no password, no Supabase Auth user. A visitor is the
--   existing anonymous device (notification_devices, httpOnly cookie token,
--   only its SHA-256 hash stored) plus a display name and, optionally, an
--   email address or phone number.
-- * Nothing is public: the table has forced RLS and no grants. Writes go through
--   service_role functions called by the Next.js server; only ADMINs can read
--   the list (admin_site_visitors).
-- * Retention follows the device: unseen for 400 days → device and visitor go
--   (audience_housekeeping already removes analytics-only devices).

create table public.site_visitors (
  device_id uuid primary key references public.notification_devices (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  contact text check (contact is null or char_length(contact) between 5 and 120),
  contact_kind text check (contact_kind in ('email', 'phone')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_visit_on date not null default (now() at time zone 'Africa/Lagos')::date,
  visit_days integer not null default 1 check (visit_days >= 1),
  check ((contact is null) = (contact_kind is null))
);
create index site_visitors_last_seen_idx on public.site_visitors (last_seen_at desc);

alter table public.site_visitors enable row level security;
alter table public.site_visitors force row level security;
revoke all on public.site_visitors from public, anon, authenticated;

-- Normalise and validate the optional contact. Returns null when empty.
create or replace function private.visitor_contact(p_contact text, out contact text, out kind text)
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p_contact, ''));
  v_digits text;
begin
  if v = '' then
    return;
  end if;
  if v ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(v) <= 120 then
    contact := lower(v); kind := 'email';
    return;
  end if;
  v_digits := regexp_replace(v, '[\s().-]', '', 'g');
  if v_digits ~ '^\+?[0-9]{7,15}$' then
    contact := v_digits; kind := 'phone';
    return;
  end if;
  raise exception 'Enter a valid email address or phone number, or leave it empty' using errcode = 'EK422';
end $$;

create or replace function private.visitor_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v = '' then
    raise exception 'Please tell us your name' using errcode = 'EK422';
  end if;
  if char_length(v) > 40 then
    raise exception 'Name must be 40 characters or fewer' using errcode = 'EK422';
  end if;
  return v;
end $$;

-- Counts a visit: bumps last-seen and, once per WAT day, the number of visit days.
create or replace function private.visitor_touch(p_device_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  update public.site_visitors
     set last_seen_at = now(),
         visit_days = visit_days + case when last_visit_on < v_today then 1 else 0 end,
         last_visit_on = v_today
   where device_id = p_device_id;
  update public.notification_devices set last_seen_at = now() where id = p_device_id;
end $$;

-- ── Server-only write path (service_role) ──────────────────────────────────
-- Is this device signed in? Unknown or missing token → not known (never an error).
create or replace function public.service_visitor_state(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices; v public.site_visitors;
begin
  begin
    d := private.audience_device(p_token);
  exception when others then
    return jsonb_build_object('known', false);
  end;
  select * into v from public.site_visitors where device_id = d.id;
  if v.device_id is null then
    return jsonb_build_object('known', false);
  end if;
  return jsonb_build_object('known', true, 'name', v.display_name);
end $$;

-- Sign in (or update the name/contact). The device must already exist.
create or replace function public.service_visitor_join(p_token text, p_name text, p_contact text default null, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices; v_name text := private.visitor_name(p_name); c record;
begin
  d := private.audience_device(p_token);
  if not private.rate_hit('visitor-join', d.id::text, 10, 600) or not private.rate_hit('visitor-join-net', p_rate_key, 600, 600) then
    raise exception 'Too many requests. Please try again in a few minutes.' using errcode = 'EK429';
  end if;
  select * into c from private.visitor_contact(p_contact);
  insert into public.site_visitors (device_id, display_name, contact, contact_kind)
  values (d.id, v_name, c.contact, c.kind)
  on conflict (device_id) do update
    set display_name = excluded.display_name,
        contact = coalesce(excluded.contact, public.site_visitors.contact),
        contact_kind = coalesce(excluded.contact_kind, public.site_visitors.contact_kind);
  perform private.visitor_touch(d.id);
  return jsonb_build_object('known', true, 'name', v_name);
end $$;

-- A signed-in visitor opened the site (the browser sends this at most once a day).
create or replace function public.service_visitor_seen(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices; v_name text;
begin
  begin
    d := private.audience_device(p_token);
  exception when others then
    return jsonb_build_object('known', false);
  end;
  select display_name into v_name from public.site_visitors where device_id = d.id;
  if v_name is null then
    return jsonb_build_object('known', false);
  end if;
  if private.rate_hit('visitor-seen', d.id::text, 30, 3600) then
    perform private.visitor_touch(d.id);
  end if;
  return jsonb_build_object('known', true, 'name', v_name);
end $$;

-- ── Admin read path ────────────────────────────────────────────────────────
create or replace function public.admin_site_visitors(p_search text default null, p_limit integer default 100, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'visitors', count(*),
        'with_contact', count(*) filter (where contact is not null),
        'today', count(*) filter (where last_visit_on = v_today),
        'last_7_days', count(*) filter (where last_seen_at >= now() - interval '7 days'),
        'new_last_7_days', count(*) filter (where first_seen_at >= now() - interval '7 days'))
      from public.site_visitors),
    'rows', coalesce((
      select jsonb_agg(r order by r.last_seen_at desc)
      from (
        select v.display_name as name, v.contact, v.contact_kind, v.first_seen_at, v.last_seen_at, v.visit_days
        from public.site_visitors v
        where v_q is null or v.display_name ilike '%' || v_q || '%' or coalesce(v.contact, '') ilike '%' || v_q || '%'
        order by v.last_seen_at desc
        limit v_limit + 1 offset v_offset
      ) r), '[]'::jsonb));
end $$;

revoke execute on function
  public.service_visitor_state(text),
  public.service_visitor_join(text, text, text, text),
  public.service_visitor_seen(text),
  public.admin_site_visitors(text, integer, integer)
from public, anon, authenticated;
grant execute on function
  public.service_visitor_state(text),
  public.service_visitor_join(text, text, text, text),
  public.service_visitor_seen(text)
to service_role;
grant execute on function public.admin_site_visitors(text, integer, integer) to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
