-- Player / team registration intake (football; additive).
--
-- A registration is a REQUEST, never eligibility:
--
--   REGISTRATION SUBMITTED → DIRECTORATE REVIEW → ACCEPTED FOR SCREENING
--     → PENDING screening (existing player_screenings) → CLEARED / REJECTED /
--       SUSPENDED (existing admin_decide_screening) → SQUAD → MATCH LINE-UP
--
--   * registration_windows: an admin-managed intake for one competition
--     (and its season). Only OPEN windows inside their dates accept entries.
--   * registrations: one submission with an unguessable public reference,
--     either a player registering themself (PLAYER_SELF) or a captain/manager
--     sending a roster (TEAM_ROSTER). Its own status — it never reuses or
--     changes player_screenings.status.
--   * registration_players: the people in a submission. No official player,
--     identity or screening exists until an admin accepts the submission.
--   * registration_events: append-only history of every status change.
--   * Documents: private Storage bucket `registration-documents`, opaque
--     paths {registration uuid}/{player uuid}/{photo|id}.{ext}. No client
--     write policy at all (uploads go through the server with the secret
--     key); ADMIN may read (signed URLs) through a storage policy.
--   * Anonymous visitors get exactly three things: the list/detail of open
--     windows (public_registration_windows / public_registration_window) —
--     and, only through the Next.js server (service_role), submitting and a
--     safe status lookup. They can never read the tables.
--
-- Accepting (admin_accept_registration) is the single, atomic bridge into
-- the official records: it re-validates, links or creates the player and
-- private identity, opens (or links) the PENDING season screening, and
-- audits everything. It never clears anyone.
--
-- Error codes follow 20260928000500: EK401 · EK403 · EK404 · EK409 · EK422
-- (EK429: rate limited).

-- ── 0. Types ───────────────────────────────────────────────────────────────
create type public.registration_window_status as enum ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');
create type public.registration_status as enum (
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'ACCEPTED_FOR_SCREENING', 'REJECTED', 'WITHDRAWN');
create type public.registration_type as enum ('PLAYER_SELF', 'TEAM_ROSTER');
create type public.registration_player_status as enum ('SUBMITTED', 'ACCEPTED_FOR_SCREENING', 'REJECTED', 'WITHDRAWN');

-- ── 1. Windows ─────────────────────────────────────────────────────────────
create table public.registration_windows (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  -- Middle part of public references, e.g. FC26 → EKSU-FC26-7K4P2D.
  reference_code text not null check (reference_code ~ '^[A-Z0-9]{2,6}$'),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  opens_at timestamptz not null,
  closes_at timestamptz,
  status public.registration_window_status not null default 'DRAFT',
  allow_player_self_registration boolean not null default true,
  allow_team_registration boolean not null default true,
  instructions text not null default '' check (char_length(instructions) <= 4000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or closes_at > opens_at),
  check (allow_player_self_registration or allow_team_registration)
);
create unique index registration_windows_slug_unique on public.registration_windows (slug);
create index registration_windows_competition_idx on public.registration_windows (competition_id);
create trigger registration_windows_touch before update on public.registration_windows
  for each row execute function private.touch_updated_at();

-- ── 2. Registrations ───────────────────────────────────────────────────────
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null check (reference ~ '^EKSU-[A-Z0-9]{2,6}-[2-9A-HJ-NP-Z]{6}$'),
  registration_window_id uuid not null references public.registration_windows (id) on delete restrict,
  competition_id uuid not null references public.competitions (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  team_id uuid references public.teams (id) on delete restrict,
  submission_type public.registration_type not null,
  submitter_name text not null check (char_length(btrim(submitter_name)) between 2 and 80),
  submitter_phone text not null check (submitter_phone ~ '^\+?[0-9]{10,15}$'),
  submitter_email text check (submitter_email is null or (submitter_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(submitter_email) <= 120)),
  status public.registration_status not null default 'SUBMITTED',
  status_reason text,                   -- reason of the current correction/rejection (admin-only)
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  admin_notes text not null default '',
  -- Reserved for a later "fix your registration" link: only a hash is ever
  -- stored, never the token itself. Unused in v1.
  correction_token_hash text,
  correction_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((submission_type = 'TEAM_ROSTER') <= (team_id is not null)),
  check (status not in ('NEEDS_CORRECTION', 'REJECTED') or coalesce(btrim(status_reason), '') <> ''),
  check ((correction_token_hash is null) = (correction_expires_at is null))
);
create unique index registrations_reference_unique on public.registrations (reference);
create index registrations_window_idx on public.registrations (registration_window_id, status);
create index registrations_status_idx on public.registrations (status, submitted_at);
create trigger registrations_touch before update on public.registrations
  for each row execute function private.touch_updated_at();

-- ── 3. People in a registration ────────────────────────────────────────────
create table public.registration_players (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  -- Copied from the registration so the duplicate index can be scoped.
  competition_id uuid not null references public.competitions (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  matric_number text not null check (char_length(btrim(matric_number)) between 3 and 40),
  -- Same normalisation as player_identities.student_id_key:
  -- "csc / 22 / 1234" and "CSC/22/1234" are the same student.
  matric_key text generated always as (upper(regexp_replace(matric_number, '\s+', '', 'g'))) stored,
  faculty_id uuid not null references public.faculties (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  level text not null check (level in ('100', '200', '300', '400', '500', '600', '700', 'PG', 'OTHER')),
  phone_number text check (phone_number is null or phone_number ~ '^\+?[0-9]{10,15}$'),
  preferred_position text not null check (preferred_position in ('GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'OTHER')),
  team_id uuid not null references public.teams (id) on delete restrict,
  passport_photo_path text not null,
  student_id_document_path text not null,
  status public.registration_player_status not null default 'SUBMITTED',
  status_reason text,
  official_player_id uuid references public.players (id) on delete restrict,
  screening_id uuid references public.player_screenings (id) on delete restrict,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'REJECTED' or coalesce(btrim(status_reason), '') <> ''),
  check ((status = 'ACCEPTED_FOR_SCREENING') = (official_player_id is not null and screening_id is not null))
);
create index registration_players_registration_idx on public.registration_players (registration_id, sort_order);
create index registration_players_matric_idx on public.registration_players (matric_key);
create index registration_players_player_idx on public.registration_players (official_player_id);
-- One live registration per student per competition (rejected/withdrawn
-- entries do not block a fresh application).
create unique index registration_players_active_unique on public.registration_players (competition_id, matric_key)
  where status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING');
create trigger registration_players_touch before update on public.registration_players
  for each row execute function private.touch_updated_at();

-- ── 4. History (append-only) ───────────────────────────────────────────────
create table public.registration_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete restrict,
  registration_player_id uuid references public.registration_players (id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default clock_timestamp()
);
create index registration_events_idx on public.registration_events (registration_id, created_at);
create trigger registration_events_append_only before update or delete on public.registration_events
  for each row execute function private.append_only();
create trigger registration_events_no_truncate before truncate on public.registration_events
  for each statement execute function private.append_only();

-- ── 5. Rate limits (private schema: never exposed through the API) ─────────
create table private.rate_limits (
  bucket text not null,
  key text not null,                     -- a server-side hash (never a raw IP)
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key, window_start)
);

/* Count one hit; false when the caller is over p_max hits per p_window_seconds. */
create or replace function private.rate_hit(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if coalesce(p_key, '') = '' then
    return true;
  end if;
  insert into private.rate_limits as r (bucket, key, window_start, hits) values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- Opportunistic clean-up of old windows.
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end $$;

-- ── 6. Private document bucket ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-documents', 'registration-documents', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ADMIN may read (and so sign URLs for) registration documents. There is no
-- insert/update/delete policy: clients can never write to the bucket — the
-- Next.js server uploads with the secret key after validating each file.
drop policy if exists "admins read registration documents" on storage.objects;
create policy "admins read registration documents" on storage.objects for select to authenticated
  using (bucket_id = 'registration-documents' and private.has_role('ADMIN'));

-- ── 7. Helpers ─────────────────────────────────────────────────────────────
/* Unguessable reference: EKSU-{code}-{6 chars from a 31-symbol alphabet without 0/O/1/I}. */
create or replace function private.new_registration_reference(p_code text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare a constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; b bytea; s text; i int; v_ref text;
begin
  loop
    s := '';
    while char_length(s) < 6 loop
      b := extensions.gen_random_bytes(12);
      for i in 0 .. 11 loop
        -- Rejection sampling: 248 = 8 × 31 keeps every symbol equally likely.
        if get_byte(b, i) < 248 and char_length(s) < 6 then
          s := s || substr(a, get_byte(b, i) % 31 + 1, 1);
        end if;
      end loop;
    end loop;
    v_ref := 'EKSU-' || p_code || '-' || s;
    exit when not exists (select 1 from public.registrations where reference = v_ref);
  end loop;
  return v_ref;
end $$;

/* Last ten digits: "+234 803 …" and "0803 …" are the same phone. */
create or replace function private.phone_key(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10), '');
$$;

/* A window accepts entries now. */
create or replace function private.window_is_open(w public.registration_windows)
returns boolean language sql stable set search_path = '' as $$
  select w.status = 'OPEN' and now() >= w.opens_at and (w.closes_at is null or now() < w.closes_at);
$$;

create or replace function private.registration_event(
  p_registration uuid, p_player uuid, p_from text, p_to text, p_reason text
) returns void language sql security definer set search_path = '' as $$
  insert into public.registration_events (registration_id, registration_player_id, from_status, to_status, reason, actor_id)
  values (p_registration, p_player, p_from, p_to, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
$$;

/* Audit-safe summary of a registration (no matric numbers, phones or documents). */
create or replace function private.registration_summary(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status,
    'competition_id', r.competition_id, 'season_id', r.season_id, 'team_id', r.team_id,
    'window_id', r.registration_window_id, 'reason', r.status_reason,
    'players', (select count(*) from public.registration_players p where p.registration_id = r.id))
  from public.registrations r where r.id = p_id;
$$;

/*
 * Why a registration person may be a duplicate (admin view). Each item:
 * {kind, detail}. kind: OFFICIAL_PLAYER (an official identity already has
 * this matric number), OTHER_REGISTRATION (another live submission, any
 * competition), REJECTED_BEFORE (an earlier submission for the same
 * competition was rejected/withdrawn).
 */
create or replace function private.registration_duplicates(p_row uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select * from public.registration_players where id = p_row)
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'OFFICIAL_PLAYER', 'player_id', p.id,
      'detail', format('Matches official player %s', coalesce(p.display_name, '(unnamed)'))) as j
    from me join public.player_identities pi on pi.student_id_key = me.matric_key
    join public.players p on p.id = pi.player_id
    where me.official_player_id is distinct from p.id
    union all
    select jsonb_build_object('kind', 'OTHER_REGISTRATION', 'registration_id', r.id,
      'detail', format('Also in %s (%s, %s)', r.reference, c.short_name, lower(replace(o.status::text, '_', ' '))))
    from me join public.registration_players o on o.matric_key = me.matric_key and o.id <> me.id
      and o.status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING')
    join public.registrations r on r.id = o.registration_id
    join public.competitions c on c.id = o.competition_id
    union all
    select jsonb_build_object('kind', 'REJECTED_BEFORE', 'registration_id', r.id,
      'detail', format('Earlier %s submission %s', lower(o.status::text), r.reference))
    from me join public.registration_players o on o.matric_key = me.matric_key and o.id <> me.id
      and o.competition_id = me.competition_id and o.status in ('REJECTED', 'WITHDRAWN')
    join public.registrations r on r.id = o.registration_id
  ) x;
$$;

-- ── 8. Public reads (anon): open windows only, no personal data ────────────
create or replace function public.public_registration_windows()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'slug', w.slug, 'title', w.title, 'opens_at', w.opens_at, 'closes_at', w.closes_at,
      'allow_player', w.allow_player_self_registration, 'allow_team', w.allow_team_registration,
      'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name),
      'season', jsonb_build_object('id', s.id, 'name', s.name))
    order by w.closes_at nulls last, w.title), '[]'::jsonb)
  from public.registration_windows w
  join public.competitions c on c.id = w.competition_id
  join public.seasons s on s.id = w.season_id
  where private.window_is_open(w) and c.status = 'ACTIVE';
$$;

/* One open window by slug, with what the form needs (teams, faculties, departments). */
create or replace function public.public_registration_window(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', w.id, 'slug', w.slug, 'title', w.title, 'opens_at', w.opens_at, 'closes_at', w.closes_at,
    'instructions', w.instructions,
    'allow_player', w.allow_player_self_registration, 'allow_team', w.allow_team_registration,
    'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name),
    'season', jsonb_build_object('id', s.id, 'name', s.name),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name,
        'faculty_id', t.faculty_id, 'department_id', t.department_id) order by t.name)
      from public.competition_entries ce join public.teams t on t.id = ce.team_id
      where ce.competition_id = c.id and t.active), '[]'::jsonb),
    'faculties', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'code', f.code,
        'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
          from public.departments d where d.faculty_id = f.id), '[]'::jsonb)) order by f.name)
      from public.faculties f), '[]'::jsonb))
  from public.registration_windows w
  join public.competitions c on c.id = w.competition_id
  join public.seasons s on s.id = w.season_id
  where w.slug = lower(btrim(p_slug)) and private.window_is_open(w) and c.status = 'ACTIVE';
$$;

-- ── 9. Server-only (service_role) entry points ─────────────────────────────
-- The Next.js server calls these with the secret key after validating and
-- storing the documents; browsers never can (no anon/authenticated grant).

/* Rate limiting for public endpoints; p_key is a server-side hash of the caller. */
create or replace function public.service_rate_hit(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
returns boolean language sql security definer set search_path = '' as $$
  select private.rate_hit(p_bucket, p_key, p_max, p_window_seconds);
$$;

/* Has this draft id already been submitted? (Uploads stop being accepted once it has.) */
create or replace function public.service_registration_exists(p_registration_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registrations where id = p_registration_id);
$$;

/*
 * Documents of drafts that were never submitted (no registration row) and
 * are older than p_older_than: the server deletes them through the Storage
 * API, so abandoned ID photos are not kept.
 */
create or replace function public.service_orphan_documents(p_older_than interval default '24 hours', p_limit integer default 100)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(o.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'registration-documents' and o.created_at < now() - p_older_than
      and not exists (select 1 from public.registrations r where r.id::text = split_part(o.name, '/', 1))
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))) o;
$$;

/*
 * Submit a registration. p jsonb:
 *   { id, window_id, type: PLAYER_SELF|TEAM_ROSTER, team_id?,
 *     submitter: {name, phone, email?},
 *     players: [{ id, full_name, matric_number, faculty_id, department_id?, level,
 *                 phone?, position, team_id?, photo_path, id_path }] }
 * Document paths must be the opaque {id}/{player id}/(photo|id).ext objects the
 * server already stored. Returns { reference, status, players }.
 */
create or replace function public.service_submit_registration(p jsonb, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.registration_windows; c public.competitions;
  v_id uuid; v_type public.registration_type; v_team uuid; v_ref text;
  v_name text := btrim(coalesce(p -> 'submitter' ->> 'name', ''));
  v_phone text := regexp_replace(coalesce(p -> 'submitter' ->> 'phone', ''), '[\s()-]', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p -> 'submitter' ->> 'email', ''))), '');
  x jsonb; i int := 0; v_pid uuid; v_pteam uuid; v_fac uuid; v_dep uuid; v_key text; v_n int;
  v_photo text; v_doc text; v_pphone text;
begin
  if not private.rate_hit('register-submit', p_rate_key, 5, 600) then
    raise exception 'Too many submissions from this connection. Please wait a few minutes and try again.' using errcode = 'EK429';
  end if;
  begin
    v_id := (p ->> 'id')::uuid;
    v_type := (p ->> 'type')::public.registration_type;
    v_team := nullif(p ->> 'team_id', '')::uuid;
  exception when others then
    raise exception 'The registration is incomplete' using errcode = 'EK422';
  end;
  if v_id is null or v_type is null then
    raise exception 'The registration is incomplete' using errcode = 'EK422';
  end if;

  select * into w from public.registration_windows where id = nullif(p ->> 'window_id', '')::uuid for share;
  if not found then
    raise exception 'Registration window not found' using errcode = 'EK404';
  end if;
  select * into c from public.competitions where id = w.competition_id;
  if not private.window_is_open(w) or c.status <> 'ACTIVE' then
    raise exception 'Registration for % is not open', c.name using errcode = 'EK409';
  end if;
  if v_type = 'PLAYER_SELF' and not w.allow_player_self_registration then
    raise exception 'Individual player registration is not open for this competition' using errcode = 'EK409';
  end if;
  if v_type = 'TEAM_ROSTER' and not w.allow_team_registration then
    raise exception 'Team registration is not open for this competition' using errcode = 'EK409';
  end if;
  if exists (select 1 from public.registrations where id = v_id) then
    raise exception 'This registration was already submitted' using errcode = 'EK409';
  end if;

  if char_length(v_name) not between 2 and 80 then
    raise exception 'Enter your full name' using errcode = 'EK422';
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Enter a valid phone number' using errcode = 'EK422';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 120) then
    raise exception 'Enter a valid email address, or leave it empty' using errcode = 'EK422';
  end if;
  if jsonb_typeof(p -> 'players') <> 'array' or jsonb_array_length(p -> 'players') = 0 then
    raise exception 'Add at least one player' using errcode = 'EK422';
  end if;
  v_n := jsonb_array_length(p -> 'players');
  if v_type = 'PLAYER_SELF' and v_n <> 1 then
    raise exception 'An individual registration has exactly one player' using errcode = 'EK422';
  end if;
  if v_n > 40 then
    raise exception 'A roster can have at most 40 players' using errcode = 'EK422';
  end if;
  if v_type = 'TEAM_ROSTER' and v_team is null then
    raise exception 'Choose the team' using errcode = 'EK422';
  end if;
  if v_team is not null and not exists (select 1 from public.competition_entries ce join public.teams t on t.id = ce.team_id
      where ce.competition_id = c.id and ce.team_id = v_team and t.active) then
    raise exception 'That team is not entered in %', c.name using errcode = 'EK422';
  end if;

  v_ref := private.new_registration_reference(w.reference_code);
  insert into public.registrations (id, reference, registration_window_id, competition_id, season_id, team_id,
    submission_type, submitter_name, submitter_phone, submitter_email, status, submitted_at)
  values (v_id, v_ref, w.id, c.id, w.season_id, v_team, v_type, v_name, v_phone, v_email, 'SUBMITTED', now());

  for x in select value from jsonb_array_elements(p -> 'players') loop
    i := i + 1;
    begin
      v_pid := (x ->> 'id')::uuid;
      v_fac := nullif(x ->> 'faculty_id', '')::uuid;
      v_dep := nullif(x ->> 'department_id', '')::uuid;
      v_pteam := coalesce(nullif(x ->> 'team_id', '')::uuid, v_team);
    exception when others then
      raise exception 'Player %: some details are invalid', i using errcode = 'EK422';
    end;
    if v_pid is null then
      raise exception 'Player %: some details are invalid', i using errcode = 'EK422';
    end if;
    if char_length(btrim(coalesce(x ->> 'full_name', ''))) not between 2 and 80 then
      raise exception 'Player %: enter the full name', i using errcode = 'EK422';
    end if;
    v_key := private.normalise_student_id(x ->> 'matric_number');
    if v_key is null or char_length(v_key) not between 3 and 40 then
      raise exception 'Player %: enter the matric / student number', i using errcode = 'EK422';
    end if;
    if v_fac is null or not exists (select 1 from public.faculties where id = v_fac) then
      raise exception 'Player %: choose the faculty', i using errcode = 'EK422';
    end if;
    if v_dep is not null and not exists (select 1 from public.departments where id = v_dep and faculty_id = v_fac) then
      raise exception 'Player %: the department does not belong to that faculty', i using errcode = 'EK422';
    end if;
    if v_dep is null and exists (select 1 from public.departments where faculty_id = v_fac) then
      raise exception 'Player %: choose the department', i using errcode = 'EK422';
    end if;
    if v_pteam is null then
      raise exception 'Player %: choose the team', i using errcode = 'EK422';
    end if;
    if v_type = 'TEAM_ROSTER' and v_pteam <> v_team then
      raise exception 'Player %: every roster player must be in the roster''s team', i using errcode = 'EK422';
    end if;
    if not exists (select 1 from public.competition_entries ce join public.teams t on t.id = ce.team_id
        where ce.competition_id = c.id and ce.team_id = v_pteam and t.active) then
      raise exception 'Player %: that team is not entered in %', i, c.name using errcode = 'EK422';
    end if;
    if coalesce(x ->> 'level', '') not in ('100', '200', '300', '400', '500', '600', '700', 'PG', 'OTHER') then
      raise exception 'Player %: choose the level', i using errcode = 'EK422';
    end if;
    if coalesce(x ->> 'position', '') not in ('GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'OTHER') then
      raise exception 'Player %: choose a preferred position', i using errcode = 'EK422';
    end if;
    v_pphone := nullif(regexp_replace(coalesce(x ->> 'phone', ''), '[\s()-]', '', 'g'), '');
    if v_pphone is not null and v_pphone !~ '^\+?[0-9]{10,15}$' then
      raise exception 'Player %: enter a valid phone number', i using errcode = 'EK422';
    end if;
    -- Documents: exactly the opaque objects the server stored for this person.
    v_photo := x ->> 'photo_path';
    v_doc := x ->> 'id_path';
    if v_photo is null or v_photo !~ ('^' || v_id || '/' || v_pid || '/photo\.(jpg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'registration-documents' and o.name = v_photo) then
      raise exception 'Player %: upload a passport photograph', i using errcode = 'EK422';
    end if;
    if v_doc is null or v_doc !~ ('^' || v_id || '/' || v_pid || '/id\.(jpg|png|webp|pdf)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'registration-documents' and o.name = v_doc) then
      raise exception 'Player %: upload a student ID card, course form or admission letter', i using errcode = 'EK422';
    end if;
    -- Duplicates within this roster, and against live submissions for this competition.
    if exists (select 1 from public.registration_players where registration_id = v_id and matric_key = v_key) then
      raise exception 'Player %: this matric number appears twice in the roster', i using errcode = 'EK409';
    end if;
    if exists (select 1 from public.registration_players where competition_id = c.id and matric_key = v_key
               and status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING')) then
      raise exception 'Player %: This student number may already have a registration. Please contact the Sports Directorate.', i
        using errcode = 'EK409';
    end if;

    insert into public.registration_players (id, registration_id, competition_id, full_name, matric_number, faculty_id,
      department_id, level, phone_number, preferred_position, team_id, passport_photo_path, student_id_document_path, sort_order)
    values (v_pid, v_id, c.id, btrim(x ->> 'full_name'), btrim(x ->> 'matric_number'), v_fac, v_dep,
      coalesce(x ->> 'level', ''), v_pphone, coalesce(x ->> 'position', ''), v_pteam, v_photo, v_doc, i);
  end loop;

  perform private.registration_event(v_id, null, null, 'SUBMITTED', null);
  perform private.audit('REGISTRATION_SUBMITTED', 'registration', v_id, null, null, null, private.registration_summary(v_id));
  return jsonb_build_object('reference', v_ref, 'status', 'SUBMITTED', 'players', v_n,
    'competition', c.name, 'submitted_at', now());
exception
  when check_violation then
    raise exception 'Some details are invalid. Please review the form.' using errcode = 'EK422';
  when unique_violation then
    raise exception 'This student number may already have a registration. Please contact the Sports Directorate.' using errcode = 'EK409';
end $$;

/*
 * Public status lookup (through the server): reference + a phone number on
 * the registration (the submitter's or one of its players'). Safe fields
 * only — never matric numbers, documents, notes, reasons or staff names.
 */
create or replace function public.service_registration_status(p_reference text, p_phone text, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.registrations; v_phone text := private.phone_key(p_phone); v_name text; v_match boolean;
begin
  if not private.rate_hit('register-status', p_rate_key, 20, 600) then
    raise exception 'Too many lookups. Please wait a few minutes and try again.' using errcode = 'EK429';
  end if;
  select * into r from public.registrations where reference = upper(btrim(coalesce(p_reference, '')));
  v_match := found and v_phone is not null and char_length(v_phone) = 10;
  if v_match and private.phone_key(r.submitter_phone) = v_phone then
    v_name := r.submitter_name;
  elsif v_match then
    select full_name into v_name from public.registration_players
    where registration_id = r.id and private.phone_key(phone_number) = v_phone order by sort_order limit 1;
    v_match := v_name is not null;
  end if;
  if not v_match then
    -- Same answer for "no such reference" and "wrong phone": nothing to enumerate.
    return null;
  end if;
  return jsonb_build_object(
    'reference', r.reference,
    'competition', (select name from public.competitions where id = r.competition_id),
    'season', (select name from public.seasons where id = r.season_id),
    'team', (select name from public.teams where id = r.team_id),
    'type', r.submission_type,
    'status', r.status,
    'submitted_at', r.submitted_at,
    'players', (select count(*) from public.registration_players where registration_id = r.id),
    'name', v_name);
end $$;

-- ── 10. Admin: windows ─────────────────────────────────────────────────────
create or replace function private.validate_window(
  p_competition uuid, p_slug text, p_code text, p_title text, p_opens timestamptz, p_closes timestamptz,
  p_allow_player boolean, p_allow_team boolean, p_except uuid
) returns public.competitions language plpgsql stable security definer set search_path = '' as $$
declare c public.competitions;
begin
  select * into c from public.competitions where id = p_competition;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if c.status = 'ARCHIVED' then
    raise exception 'That competition is archived' using errcode = 'EK409';
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 then
    raise exception 'The link name may use lower-case letters, numbers and single hyphens' using errcode = 'EK422';
  end if;
  if p_slug in ('status', 'new', 'windows') then
    raise exception 'That link name is reserved' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.registration_windows where slug = p_slug and id is distinct from p_except) then
    raise exception 'Another registration window already uses that link name' using errcode = 'EK409';
  end if;
  if coalesce(p_code, '') !~ '^[A-Z0-9]{2,6}$' then
    raise exception 'The reference code is 2–6 capital letters or digits (e.g. FC26)' using errcode = 'EK422';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120 then
    raise exception 'Enter a title (3–120 characters)' using errcode = 'EK422';
  end if;
  if p_opens is null then
    raise exception 'Choose when registration opens' using errcode = 'EK422';
  end if;
  if p_closes is not null and p_closes <= p_opens then
    raise exception 'Registration must close after it opens' using errcode = 'EK422';
  end if;
  if not (coalesce(p_allow_player, false) or coalesce(p_allow_team, false)) then
    raise exception 'Allow individual players, teams, or both' using errcode = 'EK422';
  end if;
  return c;
end $$;

create or replace function public.admin_create_registration_window(
  p_competition_id uuid, p_title text, p_slug text, p_reference_code text, p_opens_at timestamptz, p_closes_at timestamptz,
  p_allow_player boolean, p_allow_team boolean, p_instructions text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.competitions; v_id uuid;
begin
  perform private.require_admin();
  c := private.validate_window(p_competition_id, lower(btrim(p_slug)), upper(btrim(p_reference_code)), p_title,
    p_opens_at, p_closes_at, p_allow_player, p_allow_team, null);
  insert into public.registration_windows (competition_id, season_id, slug, reference_code, title, opens_at, closes_at,
    allow_player_self_registration, allow_team_registration, instructions, created_by)
  values (c.id, c.season_id, lower(btrim(p_slug)), upper(btrim(p_reference_code)), btrim(p_title), p_opens_at, p_closes_at,
    p_allow_player, p_allow_team, coalesce(btrim(p_instructions), ''), auth.uid())
  returning id into v_id;
  perform private.audit('REGISTRATION_WINDOW_CREATED', 'registration_window', v_id, null, null, null,
    (select to_jsonb(w) from public.registration_windows w where w.id = v_id));
  return v_id;
end $$;

create or replace function public.admin_update_registration_window(
  p_window_id uuid, p_title text, p_slug text, p_reference_code text, p_opens_at timestamptz, p_closes_at timestamptz,
  p_allow_player boolean, p_allow_team boolean, p_instructions text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare w public.registration_windows;
begin
  perform private.require_admin();
  select * into w from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration window not found' using errcode = 'EK404';
  end if;
  if w.status = 'ARCHIVED' then
    raise exception 'An archived window cannot be edited' using errcode = 'EK409';
  end if;
  if upper(btrim(p_reference_code)) <> w.reference_code and exists (select 1 from public.registrations where registration_window_id = w.id) then
    raise exception 'The reference code cannot change once registrations exist' using errcode = 'EK409';
  end if;
  perform private.validate_window(w.competition_id, lower(btrim(p_slug)), upper(btrim(p_reference_code)), p_title,
    p_opens_at, p_closes_at, p_allow_player, p_allow_team, w.id);
  update public.registration_windows set title = btrim(p_title), slug = lower(btrim(p_slug)),
    reference_code = upper(btrim(p_reference_code)), opens_at = p_opens_at, closes_at = p_closes_at,
    allow_player_self_registration = p_allow_player, allow_team_registration = p_allow_team,
    instructions = coalesce(btrim(p_instructions), '')
  where id = w.id;
  perform private.audit('REGISTRATION_WINDOW_UPDATED', 'registration_window', w.id, null, null, to_jsonb(w),
    (select to_jsonb(x) from public.registration_windows x where x.id = w.id));
end $$;

create or replace function public.admin_set_registration_window_status(p_window_id uuid, p_status public.registration_window_status)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.registration_windows;
begin
  perform private.require_admin();
  select * into w from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration window not found' using errcode = 'EK404';
  end if;
  if p_status is null or p_status = w.status then
    raise exception 'The window is already %', lower(w.status::text) using errcode = 'EK409';
  end if;
  if w.status = 'ARCHIVED' then
    raise exception 'An archived window cannot be reopened' using errcode = 'EK409';
  end if;
  if p_status = 'DRAFT' then
    raise exception 'A window cannot go back to draft' using errcode = 'EK409';
  end if;
  if p_status = 'OPEN' and exists (select 1 from public.competitions where id = w.competition_id and status <> 'ACTIVE') then
    raise exception 'Only an active competition can open registration' using errcode = 'EK409';
  end if;
  update public.registration_windows set status = p_status where id = w.id;
  perform private.audit('REGISTRATION_WINDOW_' || case p_status when 'OPEN' then 'OPENED' when 'CLOSED' then 'CLOSED' else 'ARCHIVED' end,
    'registration_window', w.id, null, null, to_jsonb(w), (select to_jsonb(x) from public.registration_windows x where x.id = w.id));
end $$;

create or replace function public.admin_list_registration_windows()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id, 'slug', w.slug, 'title', w.title, 'reference_code', w.reference_code, 'status', w.status,
      'open_now', private.window_is_open(w), 'opens_at', w.opens_at, 'closes_at', w.closes_at,
      'allow_player', w.allow_player_self_registration, 'allow_team', w.allow_team_registration,
      'instructions', w.instructions, 'created_at', w.created_at,
      'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'status', c.status),
      'season', jsonb_build_object('id', s.id, 'name', s.name),
      'counts', coalesce((select jsonb_object_agg(st, n) from (select r.status::text st, count(*) n from public.registrations r
        where r.registration_window_id = w.id group by r.status) q), '{}'::jsonb),
      'players', (select count(*) from public.registration_players rp join public.registrations r on r.id = rp.registration_id
        where r.registration_window_id = w.id))
    order by (w.status = 'ARCHIVED'), w.opens_at desc)
  from public.registration_windows w
  join public.competitions c on c.id = w.competition_id
  join public.seasons s on s.id = w.season_id), '[]'::jsonb);
end $$;

-- ── 11. Admin: inbox and detail ────────────────────────────────────────────
create or replace function public.admin_list_registrations(
  p_window_id uuid default null, p_competition_id uuid default null, p_season_id uuid default null,
  p_team_id uuid default null, p_faculty_id uuid default null, p_department_id uuid default null,
  p_type public.registration_type default null, p_status public.registration_status default null,
  p_from date default null, p_to date default null, p_search text default null, p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_key text := private.normalise_student_id(p_search);
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
begin
  perform private.require_admin();
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(st, n) from (
        select r.status::text st, count(*) n from public.registrations r
        where (p_window_id is null or r.registration_window_id = p_window_id)
          and (p_competition_id is null or r.competition_id = p_competition_id)
          and (p_season_id is null or r.season_id = p_season_id)
        group by r.status) q), '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select r.submitted_at as at, jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status,
        'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
        'submitter', r.submitter_name, 'submitter_phone', r.submitter_phone,
        'competition', jsonb_build_object('id', c.id, 'short_name', c.short_name),
        'season', se.name,
        'team', case when t.id is null then (select jsonb_build_object('id', pt.id, 'short_name', pt.short_name)
            from public.registration_players rp join public.teams pt on pt.id = rp.team_id where rp.registration_id = r.id limit 1)
          else jsonb_build_object('id', t.id, 'short_name', t.short_name) end,
        'players', (select count(*) from public.registration_players rp where rp.registration_id = r.id),
        'first_player', (select rp.full_name from public.registration_players rp where rp.registration_id = r.id order by rp.sort_order limit 1),
        'flags', (select count(*) from public.registration_players rp where rp.registration_id = r.id
          and jsonb_array_length(private.registration_duplicates(rp.id)) > 0)) as j
      from public.registrations r
      join public.competitions c on c.id = r.competition_id
      join public.seasons se on se.id = r.season_id
      left join public.teams t on t.id = r.team_id
      where (p_window_id is null or r.registration_window_id = p_window_id)
        and (p_competition_id is null or r.competition_id = p_competition_id)
        and (p_season_id is null or r.season_id = p_season_id)
        and (p_type is null or r.submission_type = p_type)
        and (p_status is null or r.status = p_status)
        and (p_from is null or (r.submitted_at at time zone 'Africa/Lagos')::date >= p_from)
        and (p_to is null or (r.submitted_at at time zone 'Africa/Lagos')::date <= p_to)
        and (p_team_id is null or r.team_id = p_team_id
             or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.team_id = p_team_id))
        and (p_faculty_id is null or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.faculty_id = p_faculty_id))
        and (p_department_id is null or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.department_id = p_department_id))
        and (v_q is null or r.reference ilike '%' || v_q || '%' or r.submitter_name ilike '%' || v_q || '%'
             or (v_digits is not null and char_length(v_digits) >= 4 and regexp_replace(r.submitter_phone, '[^0-9]', '', 'g') like '%' || v_digits || '%')
             or exists (select 1 from public.registration_players rp where rp.registration_id = r.id
                        and (rp.full_name ilike '%' || v_q || '%' or rp.matric_key like '%' || v_key || '%')))
      order by r.submitted_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) x), '[]'::jsonb));
end $$;

create or replace function public.admin_registration_detail(p_registration_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.registrations where id = p_registration_id) then
    raise exception 'Registration not found' using errcode = 'EK404';
  end if;
  return (select jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status, 'status_reason', r.status_reason,
    'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
    'reviewed_by', (select display_name from public.profiles where id = r.reviewed_by),
    'admin_notes', r.admin_notes,
    'submitter', jsonb_build_object('name', r.submitter_name, 'phone', r.submitter_phone, 'email', r.submitter_email),
    'window', jsonb_build_object('id', w.id, 'title', w.title, 'slug', w.slug),
    'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name),
    'season', jsonb_build_object('id', se.id, 'name', se.name),
    'team', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rp.id, 'full_name', rp.full_name, 'matric_number', rp.matric_number, 'level', rp.level,
        'phone', rp.phone_number, 'position', rp.preferred_position, 'status', rp.status, 'status_reason', rp.status_reason,
        'faculty', jsonb_build_object('id', f.id, 'name', f.name),
        'department', case when d.id is null then null else jsonb_build_object('id', d.id, 'name', d.name) end,
        'team', jsonb_build_object('id', pt.id, 'name', pt.name, 'short_name', pt.short_name),
        'photo_path', rp.passport_photo_path, 'id_path', rp.student_id_document_path,
        'duplicates', private.registration_duplicates(rp.id),
        'official_player', case when rp.official_player_id is null then null else jsonb_build_object(
          'id', rp.official_player_id, 'name', (select display_name from public.players where id = rp.official_player_id)) end,
        'screening', (select jsonb_build_object('id', s.id, 'status', s.status, 'decided_at', s.decided_at)
          from public.player_screenings s where s.id = rp.screening_id))
        order by rp.sort_order)
      from public.registration_players rp
      join public.faculties f on f.id = rp.faculty_id
      left join public.departments d on d.id = rp.department_id
      join public.teams pt on pt.id = rp.team_id
      where rp.registration_id = r.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'from', e.from_status, 'to', e.to_status, 'reason', e.reason, 'at', e.created_at,
        'player', (select full_name from public.registration_players where id = e.registration_player_id),
        'by', (select display_name from public.profiles where id = e.actor_id)) order by e.created_at desc)
      from public.registration_events e where e.registration_id = r.id), '[]'::jsonb))
  from public.registrations r
  join public.registration_windows w on w.id = r.registration_window_id
  join public.competitions c on c.id = r.competition_id
  join public.seasons se on se.id = r.season_id
  left join public.teams t on t.id = r.team_id
  where r.id = p_registration_id);
end $$;

-- ── 12. Admin: review decisions ────────────────────────────────────────────
/* Lock a registration that is still awaiting a decision. */
create or replace function private.open_registration_for_update(p_id uuid)
returns public.registrations language plpgsql security definer set search_path = '' as $$
declare r public.registrations;
begin
  select * into r from public.registrations where id = p_id for update;
  if not found then
    raise exception 'Registration not found' using errcode = 'EK404';
  end if;
  if r.status not in ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION') then
    raise exception 'This registration is already %', lower(replace(r.status::text, '_', ' ')) using errcode = 'EK409';
  end if;
  return r;
end $$;

/*
 * Review step without acceptance: UNDER_REVIEW, NEEDS_CORRECTION (reason
 * required; v1 contacts the submitter outside the system) or REJECTED
 * (reason required; every still-submitted person is rejected with it).
 */
create or replace function public.admin_review_registration(
  p_registration_id uuid, p_status public.registration_status, p_reason text default null, p_notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.registrations; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_before jsonb; rp record;
begin
  perform private.require_admin();
  r := private.open_registration_for_update(p_registration_id);
  if p_status is null or p_status not in ('UNDER_REVIEW', 'NEEDS_CORRECTION', 'REJECTED') then
    raise exception 'Choose Under review, Request correction or Reject' using errcode = 'EK422';
  end if;
  if p_status = r.status then
    raise exception 'This registration is already %', lower(replace(r.status::text, '_', ' ')) using errcode = 'EK409';
  end if;
  if p_status in ('NEEDS_CORRECTION', 'REJECTED') and v_reason is null then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  v_before := private.registration_summary(r.id);
  update public.registrations set status = p_status, status_reason = case when p_status = 'UNDER_REVIEW' then null else v_reason end,
    reviewed_at = now(), reviewed_by = auth.uid(),
    admin_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), admin_notes)
  where id = r.id;
  perform private.registration_event(r.id, null, r.status::text, p_status::text, v_reason);
  if p_status = 'REJECTED' then
    for rp in select id from public.registration_players where registration_id = r.id and status = 'SUBMITTED' loop
      update public.registration_players set status = 'REJECTED', status_reason = v_reason where id = rp.id;
      perform private.registration_event(r.id, rp.id, 'SUBMITTED', 'REJECTED', v_reason);
    end loop;
  end if;
  perform private.audit(case p_status when 'UNDER_REVIEW' then 'REGISTRATION_UNDER_REVIEW'
      when 'NEEDS_CORRECTION' then 'REGISTRATION_CORRECTION_REQUESTED' else 'REGISTRATION_REJECTED' end,
    'registration', r.id, null, null, v_before, private.registration_summary(r.id));
end $$;

/* Leave one person of a roster out (the rest can still be accepted). */
create or replace function public.admin_reject_registration_player(p_registration_player_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare rp public.registration_players; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_admin();
  select * into rp from public.registration_players where id = p_registration_player_id;
  if not found then
    raise exception 'Registration entry not found' using errcode = 'EK404';
  end if;
  perform private.open_registration_for_update(rp.registration_id);
  if rp.status <> 'SUBMITTED' then
    raise exception 'This person is already %', lower(replace(rp.status::text, '_', ' ')) using errcode = 'EK409';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  update public.registration_players set status = 'REJECTED', status_reason = v_reason where id = rp.id;
  perform private.registration_event(rp.registration_id, rp.id, 'SUBMITTED', 'REJECTED', v_reason);
  perform private.audit('REGISTRATION_PLAYER_REJECTED', 'registration', rp.registration_id, null, null, null,
    jsonb_build_object('registration_player_id', rp.id, 'reason', v_reason));
end $$;

/*
 * Accept for screening — atomic. For every person still SUBMITTED:
 *   1. re-validate team/competition/season and faculty→department;
 *   2. link the official player whose identity has the same normalised
 *      matric number, or create the player + private identity;
 *   3. link the existing season screening for that team, or open a PENDING
 *      one (private.open_screening, which records the decision + audit);
 *   4. mark the person ACCEPTED_FOR_SCREENING.
 * Nobody is ever cleared, and nobody is added to a squad.
 */
create or replace function public.admin_accept_registration(p_registration_id uuid, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.registrations; rp public.registration_players; v_player uuid; v_screening uuid;
  v_created int := 0; v_linked int := 0; v_opened int := 0; v_before jsonb; v_other text;
begin
  perform private.require_admin();
  r := private.open_registration_for_update(p_registration_id);
  if not exists (select 1 from public.registration_players where registration_id = r.id and status = 'SUBMITTED') then
    raise exception 'Nobody in this registration is left to accept' using errcode = 'EK409';
  end if;
  if not exists (select 1 from public.competitions where id = r.competition_id and season_id = r.season_id and status <> 'ARCHIVED') then
    raise exception 'The competition is archived or has moved season' using errcode = 'EK409';
  end if;
  v_before := private.registration_summary(r.id);

  for rp in select * from public.registration_players where registration_id = r.id and status = 'SUBMITTED'
            order by sort_order for update loop
    perform private.validate_player_org(rp.faculty_id, rp.department_id);
    begin
      perform private.validate_player_scope(rp.team_id, r.season_id, r.competition_id);
    exception when sqlstate 'EK422' then
      raise exception '%: % is no longer entered in this competition', rp.full_name,
        (select name from public.teams where id = rp.team_id) using errcode = 'EK422';
    end;
    -- Another live submission for the same competition (cannot normally exist: unique index).
    select r2.reference into v_other from public.registration_players o join public.registrations r2 on r2.id = o.registration_id
    where o.competition_id = rp.competition_id and o.matric_key = rp.matric_key and o.id <> rp.id
      and o.status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING') limit 1;
    if v_other is not null then
      raise exception '%: this matric number is also in %', rp.full_name, v_other using errcode = 'EK409';
    end if;

    select pi.player_id into v_player from public.player_identities pi where pi.student_id_key = rp.matric_key;
    if v_player is not null then
      v_linked := v_linked + 1;
      perform private.audit('PLAYER_LINKED_FROM_REGISTRATION', 'player', v_player, null, null, null,
        jsonb_build_object('registration_id', r.id, 'reference', r.reference, 'registration_player_id', rp.id,
          'student_id', private.mask_student_id(rp.matric_number)));
    else
      insert into public.players (display_name, faculty_id, department_id, registered_by)
      values (btrim(rp.full_name), rp.faculty_id, rp.department_id, auth.uid())
      returning id into v_player;
      insert into public.player_identities (player_id, student_id) values (v_player, btrim(rp.matric_number));
      v_created := v_created + 1;
      perform private.audit('PLAYER_CREATED_FROM_REGISTRATION', 'player', v_player, null, null, null,
        (select to_jsonb(p) from public.players p where p.id = v_player)
          || jsonb_build_object('registration_id', r.id, 'reference', r.reference, 'registration_player_id', rp.id,
               'student_id', private.mask_student_id(btrim(rp.matric_number))));
    end if;

    select id into v_screening from public.player_screenings
    where player_id = v_player and team_id = rp.team_id and season_id = r.season_id and competition_id is null;
    if v_screening is null then
      v_screening := private.open_screening(v_player, rp.team_id, r.season_id, null,
        format('From registration %s', r.reference));
      v_opened := v_opened + 1;
    end if;

    update public.registration_players set status = 'ACCEPTED_FOR_SCREENING', status_reason = null,
      official_player_id = v_player, screening_id = v_screening
    where id = rp.id;
    perform private.registration_event(r.id, rp.id, 'SUBMITTED', 'ACCEPTED_FOR_SCREENING', null);
  end loop;

  update public.registrations set status = 'ACCEPTED_FOR_SCREENING', status_reason = null,
    reviewed_at = now(), reviewed_by = auth.uid(),
    admin_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), admin_notes)
  where id = r.id;
  perform private.registration_event(r.id, null, r.status::text, 'ACCEPTED_FOR_SCREENING', null);
  perform private.audit('REGISTRATION_ACCEPTED_FOR_SCREENING', 'registration', r.id, null, null, v_before,
    private.registration_summary(r.id) || jsonb_build_object('players_created', v_created, 'players_linked', v_linked,
      'screenings_opened', v_opened));
  return jsonb_build_object('created', v_created, 'linked', v_linked, 'screenings_opened', v_opened);
end $$;

-- ── 13. Row level security ─────────────────────────────────────────────────
alter table public.registration_windows enable row level security;
alter table public.registration_windows force row level security;
alter table public.registrations enable row level security;
alter table public.registrations force row level security;
alter table public.registration_players enable row level security;
alter table public.registration_players force row level security;
alter table public.registration_events enable row level security;
alter table public.registration_events force row level security;
alter table private.rate_limits enable row level security;
alter table private.rate_limits force row level security;

-- No client reads or writes at all: anonymous visitors use the public_* RPCs
-- and the server-only service_* RPCs; admins use the admin_* RPCs.
revoke all on public.registration_windows, public.registrations, public.registration_players, public.registration_events
  from public, anon, authenticated;
revoke all on private.rate_limits from public, anon, authenticated;

-- ── 14. Function privileges (nothing executable unless granted) ────────────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on function
  public.public_registration_windows(),
  public.public_registration_window(text),
  public.service_rate_hit(text, text, integer, integer),
  public.service_registration_exists(uuid),
  public.service_orphan_documents(interval, integer),
  public.service_submit_registration(jsonb, text),
  public.service_registration_status(text, text, text),
  public.admin_create_registration_window(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text),
  public.admin_update_registration_window(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text),
  public.admin_set_registration_window_status(uuid, public.registration_window_status),
  public.admin_list_registration_windows(),
  public.admin_list_registrations(uuid, uuid, uuid, uuid, uuid, uuid, public.registration_type, public.registration_status, date, date, text, integer),
  public.admin_registration_detail(uuid),
  public.admin_review_registration(uuid, public.registration_status, text, text),
  public.admin_reject_registration_player(uuid, text),
  public.admin_accept_registration(uuid, text)
from public, anon, authenticated;

grant execute on function public.public_registration_windows(), public.public_registration_window(text) to anon, authenticated;
grant execute on function
  public.service_rate_hit(text, text, integer, integer),
  public.service_registration_exists(uuid),
  public.service_orphan_documents(interval, integer),
  public.service_submit_registration(jsonb, text),
  public.service_registration_status(text, text, text)
to service_role;
grant execute on function
  public.admin_create_registration_window(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text),
  public.admin_update_registration_window(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text),
  public.admin_set_registration_window_status(uuid, public.registration_window_status),
  public.admin_list_registration_windows(),
  public.admin_list_registrations(uuid, uuid, uuid, uuid, uuid, uuid, public.registration_type, public.registration_status, date, date, text, integer),
  public.admin_registration_detail(uuid),
  public.admin_review_registration(uuid, public.registration_status, text, text),
  public.admin_reject_registration_player(uuid, text),
  public.admin_accept_registration(uuid, text)
to authenticated;
