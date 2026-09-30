-- Player screening, squads and matchday line-ups (football; additive).
--
-- The EKSU process this models:
--
--   PLAYER REGISTERED → SCREENING → ELIGIBILITY DECISION → SQUAD
--     → MATCHDAY LINE-UP → OPERATOR CONFIRMATION → PUBLIC LINE-UP
--
--   1. Registered players: `players` becomes a first-class record (name,
--      faculty/department). The private student identifier lives in its own
--      ADMIN-only table, so it can never leak through staff/public reads.
--   2. Screening: one current decision per player + team + season (optionally
--      narrowed to one competition), with append-only decision history.
--      A competition-scoped screening can only ADD restrictions: a player is
--      eligible for a competition only if the season screening is CLEARED and
--      the competition screening (when one exists) is CLEARED too.
--   3. Squads: memberships are deactivated, never deleted; only CLEARED
--      players can join (enforced by trigger, whatever the write path).
--      Squads stay team + season: a team's squad serves every competition the
--      team is entered in (competition_entries). A player may be in several
--      teams' squads in a season (e.g. a department team in the
--      inter-departmental cup and the faculty team in the inter-faculty
--      league), but never in two teams entered in the SAME competition,
--      unless that competition allows it (allow_multi_team_players).
--   4. Line-ups: one per match + team, DRAFT → CONFIRMED (confirmed = public).
--      Before kick-off the operator in control (matches.active_operator_id,
--      or the active PRIMARY while nobody has taken control) manages them; a
--      BACKUP views them until an audited take_over_match. ADMIN always may.
--      Formations are data (normalised pitch coordinates 0–100).
--   5. Match engine: kick-off requires confirmed, still-valid line-ups (or an
--      audited ADMIN override); line-ups lock at kick-off; substitutions,
--      cards and scorers are validated against the on-field state derived
--      from the confirmed line-up + non-voided events.
--   6. Public: confirmed line-ups (display name, shirt, position, captain,
--      on-field state) through the existing public_match_feed RPC and the
--      existing realtime hints. No identities, screening data or staff data.
--
-- Error codes follow 20260928000500: EK401 · EK403 · EK404 · EK409 · EK422.

-- ── 0. Types ───────────────────────────────────────────────────────────────
create type public.screening_status as enum ('PENDING', 'CLEARED', 'REJECTED', 'SUSPENDED');
create type public.lineup_status as enum ('DRAFT', 'CONFIRMED');
create type public.lineup_role as enum ('STARTER', 'SUBSTITUTE');

-- Append-only guard shared by history tables (see audit_log_immutable).
create or replace function private.append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

-- ── 1. Registered players ──────────────────────────────────────────────────
alter table public.players
  add column faculty_id uuid references public.faculties (id) on delete set null,
  add column department_id uuid references public.departments (id) on delete set null,
  add column registered_by uuid references public.profiles (id),
  add column updated_at timestamptz not null default now();
alter table public.players add constraint players_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 1 and 80);
create index players_faculty_idx on public.players (faculty_id);
create index players_department_idx on public.players (department_id);
create trigger players_touch before update on public.players
  for each row execute function private.touch_updated_at();

-- ── 2. Private student identity ────────────────────────────────────────────
-- Separate table: staff who may read player names (operators) never get this
-- row. Only ADMIN reads it; writes go through admin RPCs. Verification
-- documents/photos can later hang off player_id without schema changes here.
create table public.player_identities (
  player_id uuid primary key references public.players (id) on delete cascade,
  student_id text not null check (char_length(btrim(student_id)) between 3 and 40),
  -- Normalised for duplicate detection: case/space-insensitive.
  student_id_key text generated always as (upper(regexp_replace(student_id, '\s+', '', 'g'))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index player_identities_student_id_unique on public.player_identities (student_id_key);
create trigger player_identities_touch before update on public.player_identities
  for each row execute function private.touch_updated_at();

-- ── 3. Screening ───────────────────────────────────────────────────────────
create table public.player_screenings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  -- Null: applies to every competition of the team in that season.
  competition_id uuid references public.competitions (id) on delete restrict,
  status public.screening_status not null default 'PENDING',
  screened_on date,                                    -- when the physical screening happened
  screened_by uuid references public.profiles (id),    -- who made the current decision
  decided_at timestamptz,
  reason text,                                         -- current decision's reason
  notes text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('REJECTED', 'SUSPENDED') or coalesce(btrim(reason), '') <> ''),
  check (status = 'PENDING' or decided_at is not null)
);
create unique index player_screenings_scope_unique
  on public.player_screenings (player_id, team_id, season_id, competition_id) nulls not distinct;
create index player_screenings_status_idx on public.player_screenings (status, season_id);
create index player_screenings_team_idx on public.player_screenings (team_id, season_id);
create trigger player_screenings_touch before update on public.player_screenings
  for each row execute function private.touch_updated_at();

create table public.player_screening_decisions (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.player_screenings (id) on delete restrict,
  from_status public.screening_status,                 -- null: screening opened
  to_status public.screening_status not null,
  reason text,
  notes text not null default '',
  screened_on date,
  decided_by uuid references public.profiles (id),
  -- clock_timestamp: several decisions in one transaction still order correctly.
  decided_at timestamptz not null default clock_timestamp()
);
create index player_screening_decisions_idx on public.player_screening_decisions (screening_id, decided_at);
create trigger player_screening_decisions_append_only before update or delete on public.player_screening_decisions
  for each row execute function private.append_only();
create trigger player_screening_decisions_no_truncate before truncate on public.player_screening_decisions
  for each statement execute function private.append_only();

/*
 * Effective screening for a player in a team/season (and competition):
 * 'CLEARED' only when the season screening is CLEARED and the competition
 * screening, if any, is CLEARED too. Otherwise the blocking status, or
 * 'NOT_SCREENED' when no season screening exists.
 */
create or replace function private.screening_status(p_player uuid, p_team uuid, p_season uuid, p_competition uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_season public.screening_status; v_comp public.screening_status;
begin
  select status into v_season from public.player_screenings
  where player_id = p_player and team_id = p_team and season_id = p_season and competition_id is null;
  if v_season is null then
    return 'NOT_SCREENED';
  end if;
  if v_season <> 'CLEARED' then
    return v_season::text;
  end if;
  if p_competition is not null then
    select status into v_comp from public.player_screenings
    where player_id = p_player and team_id = p_team and season_id = p_season and competition_id = p_competition;
    if v_comp is not null and v_comp <> 'CLEARED' then
      return v_comp::text;
    end if;
  end if;
  return 'CLEARED';
end $$;

-- ── 4. Squads: active memberships, history kept ────────────────────────────
alter table public.squad_players
  add column active boolean not null default true,
  add column joined_at timestamptz not null default now(),
  add column left_at timestamptz,
  add column left_reason text,
  add constraint squad_players_left_consistent check (active = (left_at is null));

-- Shirt numbers / the armband are unique among ACTIVE members only, so a
-- deactivated player's history does not block reuse of the number.
alter table public.squad_players drop constraint squad_players_squad_id_shirt_number_key;
create unique index squad_players_active_shirt on public.squad_players (squad_id, shirt_number) where active;
drop index public.squad_players_one_captain;
create unique index squad_players_one_captain on public.squad_players (squad_id) where is_captain and active;

-- Competition rule: may one player represent more than one entered team?
alter table public.competitions add column allow_multi_team_players boolean not null default false;

/*
 * The conflict a membership of p_team would create: another team the player
 * is ACTIVE in (same season) that shares a competition with p_team where
 * multi-team players are not allowed (optionally only p_competition).
 * Returns e.g. "DEV Engineering (both in DEV Inter-Faculty League)", or null.
 */
create or replace function private.team_conflict(p_player uuid, p_team uuid, p_season uuid, p_competition uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  select format('%s (both in %s)', ot.name, c.name)
  from public.squad_players sp
  join public.squads os on os.id = sp.squad_id
  join public.teams ot on ot.id = os.team_id
  join public.competition_entries eo on eo.team_id = os.team_id
  join public.competition_entries et on et.competition_id = eo.competition_id and et.team_id = p_team
  join public.competitions c on c.id = eo.competition_id
  where sp.player_id = p_player and sp.active and os.team_id <> p_team and os.season_id = p_season
    and c.season_id = p_season and not c.allow_multi_team_players
    and (p_competition is null or c.id = p_competition)
  order by c.name, ot.name
  limit 1;
$$;

/* First player active in two teams entered in this competition (when it does not allow that), or null. */
create or replace function private.competition_conflict(p_competition uuid)
returns text language sql stable security definer set search_path = '' as $$
  select format('%s is in both the %s and %s squads', coalesce(p.display_name, 'a player'), t1.name, t2.name)
  from public.competitions c
  join public.competition_entries e1 on e1.competition_id = c.id
  join public.competition_entries e2 on e2.competition_id = c.id and e2.team_id > e1.team_id
  join public.squads s1 on s1.team_id = e1.team_id and s1.season_id = c.season_id
  join public.squads s2 on s2.team_id = e2.team_id and s2.season_id = c.season_id
  join public.squad_players a on a.squad_id = s1.id and a.active
  join public.squad_players b on b.squad_id = s2.id and b.active and b.player_id = a.player_id
  join public.players p on p.id = a.player_id
  join public.teams t1 on t1.id = e1.team_id
  join public.teams t2 on t2.id = e2.team_id
  where c.id = p_competition and not c.allow_multi_team_players
  limit 1;
$$;

-- Eligibility at the data layer: whatever writes squad_players, a player must
-- be CLEARED for the squad's team + season, and must not represent two teams
-- entered in the same competition (unless that competition allows it).
create or replace function private.guard_squad_player()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.squads; v_status text; v_other text;
begin
  if new.active and (tg_op = 'INSERT' or not old.active or new.player_id <> old.player_id or new.squad_id <> old.squad_id) then
    select * into s from public.squads where id = new.squad_id;
    v_status := private.screening_status(new.player_id, s.team_id, s.season_id, null);
    if v_status <> 'CLEARED' then
      raise exception 'Only screened and CLEARED players can join a squad (this player is %)',
        replace(lower(v_status), '_', ' ') using errcode = 'EK422';
    end if;
    v_other := private.team_conflict(new.player_id, s.team_id, s.season_id, null);
    if v_other is not null then
      raise exception 'This player is already active for %. A player cannot represent two teams in the same competition unless its rules allow it.',
        v_other using errcode = 'EK409';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.active and not new.active then
    new.left_at := coalesce(new.left_at, now());
  elsif tg_op = 'UPDATE' and not old.active and new.active then
    new.left_at := null;
    new.left_reason := null;
  end if;
  return new;
end $$;

create trigger squad_players_guard before insert or update on public.squad_players
  for each row execute function private.guard_squad_player();

-- The same rule from the other side: entering a team, or switching a
-- competition to "one team per player", must not create a conflict.
create or replace function private.guard_competition_players()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conflict text := private.competition_conflict(
  (to_jsonb(new) ->> case when tg_table_name = 'competitions' then 'id' else 'competition_id' end)::uuid);
begin
  if v_conflict is not null then
    raise exception '%: a player cannot represent two teams in the same competition unless its rules allow it', v_conflict
      using errcode = 'EK409';
  end if;
  return null;
end $$;

create trigger competition_entries_players after insert or update of competition_id, team_id on public.competition_entries
  for each row execute function private.guard_competition_players();
create trigger competitions_multi_team_players after update of allow_multi_team_players, season_id on public.competitions
  for each row execute function private.guard_competition_players();

-- ── 5. Formations (data, not CSS) ──────────────────────────────────────────
-- Coordinates are from the team's own perspective, attacking upwards:
-- x 0 = left touchline … 100 = right; y 0 = opponent goal line … 100 = own.
create table public.formations (
  code text primary key check (code ~ '^[0-9A-Z-]{1,16}$'),
  name text not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 11),
  sort_order smallint not null default 0,
  active boolean not null default true
);

insert into public.formations (code, name, sort_order, slots) values
  ('4-3-3', '4-3-3', 1, '[
    {"position":"GK","x":50,"y":92},
    {"position":"LB","x":12,"y":72},{"position":"CB","x":37,"y":76},{"position":"CB","x":63,"y":76},{"position":"RB","x":88,"y":72},
    {"position":"CM","x":25,"y":52},{"position":"CM","x":50,"y":56},{"position":"CM","x":75,"y":52},
    {"position":"LW","x":18,"y":26},{"position":"ST","x":50,"y":20},{"position":"RW","x":82,"y":26}]'),
  ('4-4-2', '4-4-2', 2, '[
    {"position":"GK","x":50,"y":92},
    {"position":"LB","x":12,"y":72},{"position":"CB","x":37,"y":76},{"position":"CB","x":63,"y":76},{"position":"RB","x":88,"y":72},
    {"position":"LM","x":12,"y":46},{"position":"CM","x":37,"y":50},{"position":"CM","x":63,"y":50},{"position":"RM","x":88,"y":46},
    {"position":"ST","x":35,"y":22},{"position":"ST","x":65,"y":22}]'),
  ('4-2-3-1', '4-2-3-1', 3, '[
    {"position":"GK","x":50,"y":92},
    {"position":"LB","x":12,"y":72},{"position":"CB","x":37,"y":76},{"position":"CB","x":63,"y":76},{"position":"RB","x":88,"y":72},
    {"position":"DM","x":35,"y":58},{"position":"DM","x":65,"y":58},
    {"position":"LW","x":16,"y":36},{"position":"AM","x":50,"y":38},{"position":"RW","x":84,"y":36},
    {"position":"ST","x":50,"y":16}]'),
  ('3-5-2', '3-5-2', 4, '[
    {"position":"GK","x":50,"y":92},
    {"position":"CB","x":25,"y":75},{"position":"CB","x":50,"y":78},{"position":"CB","x":75,"y":75},
    {"position":"LWB","x":9,"y":48},{"position":"CM","x":30,"y":52},{"position":"DM","x":50,"y":60},{"position":"CM","x":70,"y":52},{"position":"RWB","x":91,"y":48},
    {"position":"ST","x":35,"y":22},{"position":"ST","x":65,"y":22}]'),
  ('3-4-3', '3-4-3', 5, '[
    {"position":"GK","x":50,"y":92},
    {"position":"CB","x":25,"y":75},{"position":"CB","x":50,"y":78},{"position":"CB","x":75,"y":75},
    {"position":"LM","x":12,"y":50},{"position":"CM","x":37,"y":54},{"position":"CM","x":63,"y":54},{"position":"RM","x":88,"y":50},
    {"position":"LW","x":20,"y":26},{"position":"ST","x":50,"y":20},{"position":"RW","x":80,"y":26}]'),
  ('4-1-4-1', '4-1-4-1', 6, '[
    {"position":"GK","x":50,"y":92},
    {"position":"LB","x":12,"y":72},{"position":"CB","x":37,"y":76},{"position":"CB","x":63,"y":76},{"position":"RB","x":88,"y":72},
    {"position":"DM","x":50,"y":60},
    {"position":"LM","x":12,"y":40},{"position":"CM","x":37,"y":44},{"position":"CM","x":63,"y":44},{"position":"RM","x":88,"y":40},
    {"position":"ST","x":50,"y":17}]')
on conflict (code) do nothing;

-- ── 6. Match line-ups ──────────────────────────────────────────────────────
create table public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  status public.lineup_status not null default 'DRAFT',
  formation_code text references public.formations (code) on update cascade,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id),
  check ((status = 'CONFIRMED') = (confirmed_at is not null))
);
create trigger match_lineups_touch before update on public.match_lineups
  for each row execute function private.touch_updated_at();

create table public.lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.match_lineups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  -- Snapshot: the number worn in THIS match (history survives squad changes).
  shirt_number smallint not null check (shirt_number between 1 and 99),
  role public.lineup_role not null,
  position text check (position ~ '^[A-Z]{1,4}$'),
  slot_index smallint check (slot_index between 0 and 10),
  pitch_x numeric(5, 2) check (pitch_x between 0 and 100),
  pitch_y numeric(5, 2) check (pitch_y between 0 and 100),
  is_captain boolean not null default false,
  is_goalkeeper boolean not null default false,
  sort_order smallint not null default 0,
  unique (lineup_id, player_id),
  unique (lineup_id, shirt_number),
  check ((pitch_x is null) = (pitch_y is null)),
  check (role = 'STARTER' or (pitch_x is null and slot_index is null)),
  check (not is_captain or role = 'STARTER')
);
create unique index lineup_players_one_captain on public.lineup_players (lineup_id) where is_captain;
create unique index lineup_players_slot on public.lineup_players (lineup_id, slot_index) where slot_index is not null;
create index lineup_players_player_idx on public.lineup_players (player_id);

-- A line-up belongs to one of the match's two teams.
create or replace function private.guard_lineup_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.matches m where m.id = new.match_id and new.team_id in (m.home_team_id, m.away_team_id)) then
    raise exception 'That team is not playing in this match' using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger match_lineups_team before insert or update of match_id, team_id on public.match_lineups
  for each row execute function private.guard_lineup_team();

-- Line-ups are historical once the match has kicked off. Only the admin
-- correction RPC (which sets eksu.lineup_correction for its transaction)
-- may change them afterwards.
create or replace function private.guard_lineup_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_status public.match_status;
begin
  if tg_table_name = 'match_lineups' then
    v_match := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  else
    select l.match_id into v_match from public.match_lineups l
    where l.id = case when tg_op = 'DELETE' then old.lineup_id else new.lineup_id end;
  end if;
  select status into v_status from public.matches where id = v_match;
  if v_status is distinct from 'SCHEDULED' and coalesce(current_setting('eksu.lineup_correction', true), '') <> 'on' then
    raise exception 'Line-ups are locked once the match has started. Use an admin line-up correction.' using errcode = 'EK409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger match_lineups_lock before insert or update or delete on public.match_lineups
  for each row execute function private.guard_lineup_lock();
create trigger lineup_players_lock before insert or update or delete on public.lineup_players
  for each row execute function private.guard_lineup_lock();

-- ── 7. Kick-off override (ADMIN, audited) ──────────────────────────────────
alter table public.matches
  add column lineup_override_reason text,
  add column lineup_override_by uuid references public.profiles (id),
  add column lineup_override_at timestamptz,
  add constraint matches_lineup_override_consistent
    check ((lineup_override_at is null) = (lineup_override_reason is null));

-- ── 8. Line-up rules and derived state ─────────────────────────────────────
-- Project rules (Laws of the Game minimum of 7 to start; up to 12 named
-- substitutes). Kept in one place so they can become competition settings.
create or replace function private.lineup_rules()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('min_starters', 7, 'max_starters', 11, 'max_substitutes', 12);
$$;

create or replace function private.player_label(p_player uuid, p_shirt smallint)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce('No. ' || p_shirt::text || ' ', '') || coalesce((select display_name from public.players where id = p_player), '');
$$;

-- Active squad shirt of a player for a team in a season (null: not in squad).
create or replace function private.active_squad_shirt(p_player uuid, p_team uuid, p_season uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select sp.shirt_number from public.squad_players sp join public.squads s on s.id = sp.squad_id
  where s.team_id = p_team and s.season_id = p_season and sp.player_id = p_player and sp.active;
$$;

/*
 * Eligibility of a player for a match: active squad member, effective
 * CLEARED, and not representing another team in the match's competition.
 */
create or replace function private.match_eligibility(p_match_id uuid, p_team uuid, p_player uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_season uuid; v_comp uuid; v_status text;
begin
  select c.season_id, c.id into v_season, v_comp
  from public.matches m join public.competitions c on c.id = m.competition_id where m.id = p_match_id;
  if private.active_squad_shirt(p_player, p_team, v_season) is null then
    return 'NOT_IN_SQUAD';
  end if;
  v_status := private.screening_status(p_player, p_team, v_season, v_comp);
  if v_status <> 'CLEARED' then
    return v_status;
  end if;
  -- Defence in depth (the squad/entry triggers already prevent it).
  if private.team_conflict(p_player, p_team, v_season, v_comp) is not null then
    return 'CONFLICT';
  end if;
  return 'CLEARED';
end $$;

/*
 * Shirt number used for events and feeds: the CONFIRMED line-up's snapshot
 * when the team has one, otherwise the season squad (active membership first).
 */
create or replace function private.shirt_for(p_match_id uuid, p_team_id uuid, p_player_id uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select lp.shirt_number from public.match_lineups l join public.lineup_players lp on lp.lineup_id = l.id
     where l.match_id = p_match_id and l.team_id = p_team_id and l.status = 'CONFIRMED' and lp.player_id = p_player_id),
    (select sp.shirt_number
     from public.matches m
     join public.competitions c on c.id = m.competition_id
     join public.squads s on s.team_id = p_team_id and s.season_id = c.season_id
     join public.squad_players sp on sp.squad_id = s.id and sp.player_id = p_player_id
     where m.id = p_match_id
     order by sp.active desc limit 1)
  );
$$;

create or replace function private.confirmed_lineup(p_match_id uuid, p_team_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.match_lineups where match_id = p_match_id and team_id = p_team_id and status = 'CONFIRMED';
$$;

/*
 * Line-up players with their current match state, derived from the line-up
 * plus non-voided events. No rolling substitutions, so the end state is
 * order-independent: on the field = (starter or subbed on) and not subbed
 * off and not sent off.
 */
create or replace function private.lineup_player_states(p_lineup_id uuid)
returns table (
  player_id uuid, shirt_number smallint, role public.lineup_role, "position" text, slot_index smallint,
  pitch_x numeric, pitch_y numeric, is_captain boolean, is_goalkeeper boolean, sort_order smallint,
  display_name text, subbed_on boolean, subbed_off boolean, sent_off boolean, booked boolean, goals integer,
  on_field boolean, on_minute smallint, on_extra smallint, off_minute smallint, off_extra smallint
) language sql stable security definer set search_path = '' as $$
  with l as (select * from public.match_lineups where id = p_lineup_id),
  ev as (
    select e.* from public.match_events e, l
    where e.match_id = l.match_id and e.team_id = l.team_id and e.voided_at is null
  )
  select lp.player_id, lp.shirt_number, lp.role, lp.position, lp.slot_index, lp.pitch_x, lp.pitch_y,
    lp.is_captain, lp.is_goalkeeper, lp.sort_order, p.display_name,
    s_on.id is not null, s_off.id is not null,
    exists (select 1 from ev where ev.type in ('RED_CARD', 'SECOND_YELLOW') and ev.player_id = lp.player_id),
    exists (select 1 from ev where ev.type = 'YELLOW_CARD' and ev.player_id = lp.player_id),
    (select count(*)::int from ev where ev.type in ('GOAL', 'PENALTY_GOAL') and ev.player_id = lp.player_id),
    (lp.role = 'STARTER' or s_on.id is not null) and s_off.id is null
      and not exists (select 1 from ev where ev.type in ('RED_CARD', 'SECOND_YELLOW') and ev.player_id = lp.player_id),
    s_on.minute, s_on.minute_extra, s_off.minute, s_off.minute_extra
  from public.lineup_players lp
  join public.players p on p.id = lp.player_id
  left join lateral (select ev.id, ev.minute, ev.minute_extra from ev
    where ev.type = 'SUBSTITUTION' and ev.related_player_id = lp.player_id order by ev.seq limit 1) s_on on true
  left join lateral (select ev.id, ev.minute, ev.minute_extra from ev
    where ev.type = 'SUBSTITUTION' and ev.player_id = lp.player_id order by ev.seq limit 1) s_off on true
  where lp.lineup_id = p_lineup_id;
$$;

/*
 * Everything wrong with a stored line-up, as readable messages. p_mode:
 *   'confirm' — full rules (used by confirm and by kick-off)
 *   'draft'   — only what a draft may not contain (ineligible players)
 */
create or replace function private.lineup_problems(p_lineup_id uuid, p_mode text default 'confirm')
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  l public.match_lineups;
  r jsonb := private.lineup_rules();
  v text[] := '{}';
  v_starters int; v_subs int; v_gk int; v_unplaced int;
  p record;
begin
  select * into l from public.match_lineups where id = p_lineup_id;
  if not found then
    return array['No line-up has been prepared'];
  end if;
  for p in
    select lp.player_id, lp.shirt_number, private.match_eligibility(l.match_id, l.team_id, lp.player_id) as elig
    from public.lineup_players lp where lp.lineup_id = p_lineup_id order by lp.role, lp.sort_order
  loop
    if p.elig <> 'CLEARED' then
      v := v || format('%s is not eligible (%s)', btrim(private.player_label(p.player_id, p.shirt_number)),
        case p.elig when 'CONFLICT' then 'also represents another team in this competition' else replace(lower(p.elig), '_', ' ') end);
    end if;
  end loop;
  if p_mode = 'draft' then
    return v;
  end if;
  select count(*) filter (where role = 'STARTER'), count(*) filter (where role = 'SUBSTITUTE'),
         count(*) filter (where role = 'STARTER' and is_goalkeeper),
         count(*) filter (where role = 'STARTER' and pitch_x is null)
    into v_starters, v_subs, v_gk, v_unplaced
  from public.lineup_players where lineup_id = p_lineup_id;
  if v_starters < (r ->> 'min_starters')::int then
    v := v || format('The starting XI is incomplete: %s of at least %s players', v_starters, r ->> 'min_starters');
  end if;
  if v_starters > (r ->> 'max_starters')::int then
    v := v || format('The starting XI has %s players (maximum %s)', v_starters, r ->> 'max_starters');
  end if;
  if v_subs > (r ->> 'max_substitutes')::int then
    v := v || format('Too many substitutes: %s (maximum %s)', v_subs, r ->> 'max_substitutes');
  end if;
  if v_gk <> 1 then
    v := v || case when v_gk = 0 then 'Choose a starting goalkeeper' else 'Only one starting goalkeeper is allowed' end;
  end if;
  if v_unplaced > 0 then
    v := v || format('%s starter(s) have no position on the pitch', v_unplaced);
  end if;
  return v;
end $$;

-- ── 9. Authorisation helpers ───────────────────────────────────────────────
/*
 * Pre-kick-off line-up control reuses the match-control model: the operator
 * in control (matches.active_operator_id, set by the audited take_over_match)
 * manages line-ups; while nobody has taken control (or the controller is no
 * longer assigned) that is the active PRIMARY. A BACKUP only views until it
 * takes over, so two assigned operators never edit concurrently.
 */
create or replace function private.has_lineup_control(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.matches m
    join public.operator_assignments a on a.match_id = m.id and a.user_id = auth.uid() and a.active
    where m.id = p_match_id
      and (m.active_operator_id = auth.uid()
        or (a.role = 'PRIMARY' and not exists (
              select 1 from public.operator_assignments c
              where c.match_id = m.id and c.user_id = m.active_operator_id and c.active)))
  );
$$;

-- Line-up access: 'ADMIN' (any match), 'OPERATOR' (assigned and in control),
-- 'VIEWER' (assigned, not in control: read-only). Everyone else is refused.
create or replace function private.lineup_editor_role(p_match_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if private.has_role('ADMIN') then
    return 'ADMIN';
  end if;
  if private.is_staff() and exists (
    select 1 from public.operator_assignments a where a.match_id = p_match_id and a.user_id = auth.uid() and a.active
  ) then
    return case when private.has_lineup_control(p_match_id) then 'OPERATOR' else 'VIEWER' end;
  end if;
  raise exception 'Match not found or not assigned to you' using errcode = 'EK403';
end $$;

-- Masked student number for audit rows (audit is admin-only, but it is kept
-- forever, so it stores no more than needed to recognise the change).
create or replace function private.mask_student_id(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null
    when char_length(p) <= 3 then repeat('•', char_length(p))
    else repeat('•', char_length(p) - 3) || right(p, 3) end;
$$;

-- ── 10. Registration and screening RPCs (ADMIN) ────────────────────────────
create or replace function private.validate_player_scope(p_team uuid, p_season uuid, p_competition uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_team is null or p_season is null then
    raise exception 'Team and season are required' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'Team not found' using errcode = 'EK404';
  end if;
  if not exists (select 1 from public.seasons where id = p_season) then
    raise exception 'Season not found' using errcode = 'EK404';
  end if;
  if p_competition is not null and not exists (
    select 1 from public.competitions c join public.competition_entries ce on ce.competition_id = c.id
    where c.id = p_competition and c.season_id = p_season and ce.team_id = p_team
  ) then
    raise exception 'The team is not entered in that competition for this season' using errcode = 'EK422';
  end if;
end $$;

create or replace function private.validate_player_org(p_faculty uuid, p_department uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_department is not null and p_faculty is not null and not exists (
    select 1 from public.departments where id = p_department and faculty_id = p_faculty
  ) then
    raise exception 'The department does not belong to that faculty' using errcode = 'EK422';
  end if;
end $$;

create or replace function private.normalise_student_id(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '');
$$;

create or replace function private.open_screening(p_player uuid, p_team uuid, p_season uuid, p_competition uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.validate_player_scope(p_team, p_season, p_competition);
  if exists (select 1 from public.player_screenings where player_id = p_player and team_id = p_team
             and season_id = p_season and competition_id is not distinct from p_competition) then
    raise exception 'This player already has a screening for that team and season%',
      case when p_competition is null then '' else ' in that competition' end using errcode = 'EK409';
  end if;
  insert into public.player_screenings (player_id, team_id, season_id, competition_id, notes, created_by)
  values (p_player, p_team, p_season, p_competition, coalesce(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  insert into public.player_screening_decisions (screening_id, from_status, to_status, notes, decided_by)
  values (v_id, null, 'PENDING', coalesce(btrim(p_notes), ''), auth.uid());
  perform private.audit('SCREENING_OPENED', 'player_screening', v_id, null, null, null,
    (select to_jsonb(s) from public.player_screenings s where s.id = v_id));
  return v_id;
end $$;

/* Register a player and open their PENDING screening in one step. */
create or replace function public.admin_register_player(
  p_display_name text, p_student_id text, p_faculty_id uuid, p_department_id uuid,
  p_team_id uuid, p_season_id uuid, p_competition_id uuid default null, p_notes text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_player uuid; v_screening uuid; v_key text := private.normalise_student_id(p_student_id);
begin
  perform private.require_admin();
  if coalesce(btrim(p_display_name), '') = '' or char_length(btrim(p_display_name)) > 80 then
    raise exception 'Player name is required (at most 80 characters)' using errcode = 'EK422';
  end if;
  if v_key is null or char_length(v_key) < 3 or char_length(v_key) > 40 then
    raise exception 'A student / matric number is required (3–40 characters)' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.player_identities where student_id_key = v_key) then
    raise exception 'A player with this student number is already registered' using errcode = 'EK409';
  end if;
  perform private.validate_player_org(p_faculty_id, p_department_id);
  perform private.validate_player_scope(p_team_id, p_season_id, p_competition_id);

  insert into public.players (display_name, faculty_id, department_id, registered_by)
  values (btrim(p_display_name),
    coalesce(p_faculty_id, (select faculty_id from public.departments where id = p_department_id)),
    p_department_id, auth.uid())
  returning id into v_player;
  insert into public.player_identities (player_id, student_id) values (v_player, btrim(p_student_id));
  perform private.audit('PLAYER_REGISTERED', 'player', v_player, null, null, null,
    (select to_jsonb(p) from public.players p where p.id = v_player)
      || jsonb_build_object('student_id', private.mask_student_id(btrim(p_student_id))));
  v_screening := private.open_screening(v_player, p_team_id, p_season_id, p_competition_id, p_notes);
  return jsonb_build_object('player_id', v_player, 'screening_id', v_screening);
end $$;

create or replace function public.admin_update_player(
  p_player_id uuid, p_display_name text, p_student_id text, p_faculty_id uuid, p_department_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_old_sid text; v_key text := private.normalise_student_id(p_student_id);
begin
  perform private.require_admin();
  select to_jsonb(p) into v_before from public.players p where p.id = p_player_id for update;
  if v_before is null then
    raise exception 'Player not found' using errcode = 'EK404';
  end if;
  if coalesce(btrim(p_display_name), '') = '' or char_length(btrim(p_display_name)) > 80 then
    raise exception 'Player name is required (at most 80 characters)' using errcode = 'EK422';
  end if;
  if v_key is null or char_length(v_key) < 3 or char_length(v_key) > 40 then
    raise exception 'A student / matric number is required (3–40 characters)' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.player_identities where student_id_key = v_key and player_id <> p_player_id) then
    raise exception 'Another player is already registered with this student number' using errcode = 'EK409';
  end if;
  perform private.validate_player_org(p_faculty_id, p_department_id);
  select student_id into v_old_sid from public.player_identities where player_id = p_player_id;

  update public.players set display_name = btrim(p_display_name),
    faculty_id = coalesce(p_faculty_id, (select faculty_id from public.departments where id = p_department_id)),
    department_id = p_department_id
  where id = p_player_id;
  insert into public.player_identities (player_id, student_id) values (p_player_id, btrim(p_student_id))
  on conflict (player_id) do update set student_id = excluded.student_id
  where public.player_identities.student_id is distinct from excluded.student_id;

  perform private.audit('PLAYER_UPDATED', 'player', p_player_id, null, null,
    v_before || jsonb_build_object('student_id', private.mask_student_id(v_old_sid)),
    (select to_jsonb(p) from public.players p where p.id = p_player_id)
      || jsonb_build_object('student_id', private.mask_student_id(btrim(p_student_id))));
end $$;

/* New screening scope for an existing player (new season, new team, or a competition restriction). */
create or replace function public.admin_open_screening(
  p_player_id uuid, p_team_id uuid, p_season_id uuid, p_competition_id uuid default null, p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found' using errcode = 'EK404';
  end if;
  return private.open_screening(p_player_id, p_team_id, p_season_id, p_competition_id, p_notes);
end $$;

-- Reopen CONFIRMED line-ups of not-yet-started matches that a change made invalid.
create or replace function private.reopen_invalid_lineups(p_player uuid, p_team uuid, p_why text)
returns integer language plpgsql security definer set search_path = '' as $$
declare l record; n integer := 0; v_problems text[];
begin
  for l in
    select ml.id, ml.match_id from public.match_lineups ml
    join public.matches m on m.id = ml.match_id
    join public.lineup_players lp on lp.lineup_id = ml.id and lp.player_id = p_player
    where ml.team_id = p_team and ml.status = 'CONFIRMED' and m.status = 'SCHEDULED'
    order by m.scheduled_at
  loop
    v_problems := private.lineup_problems(l.id, 'confirm');
    if cardinality(v_problems) > 0 then
      perform 1 from public.matches where id = l.match_id for update;
      update public.match_lineups set status = 'DRAFT', confirmed_at = null, confirmed_by = null where id = l.id;
      perform private.bump_seq(l.match_id);
      perform private.audit('LINEUP_AUTO_REOPENED', 'match_lineup', l.id, l.match_id, null, null,
        jsonb_build_object('detail', p_why, 'problems', to_jsonb(v_problems)));
      perform private.after_match_change(l.match_id, 'LINEUP_REOPENED');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.admin_decide_screening(
  p_screening_id uuid, p_status public.screening_status, p_reason text default null,
  p_notes text default null, p_screened_on date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.player_screenings; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_reopened int := 0;
begin
  perform private.require_admin();
  select * into s from public.player_screenings where id = p_screening_id for update;
  if not found then
    raise exception 'Screening not found' using errcode = 'EK404';
  end if;
  if p_status is null then
    raise exception 'Choose a decision' using errcode = 'EK422';
  end if;
  if s.status = p_status then
    raise exception 'The screening is already %', lower(p_status::text) using errcode = 'EK409';
  end if;
  if p_status in ('REJECTED', 'SUSPENDED') and v_reason is null then
    raise exception 'A reason is required to % a player', case p_status when 'REJECTED' then 'reject' else 'suspend' end
      using errcode = 'EK422';
  end if;
  if p_status = 'CLEARED' and not exists (select 1 from public.player_identities where player_id = s.player_id) then
    raise exception 'Record the player''s student number before clearing them' using errcode = 'EK422';
  end if;
  if p_screened_on is not null and p_screened_on > (now() at time zone 'Africa/Lagos')::date then
    raise exception 'The screening date cannot be in the future' using errcode = 'EK422';
  end if;

  insert into public.player_screening_decisions (screening_id, from_status, to_status, reason, notes, screened_on, decided_by)
  values (s.id, s.status, p_status, v_reason, coalesce(btrim(p_notes), ''), coalesce(p_screened_on, s.screened_on), auth.uid());
  update public.player_screenings set
    status = p_status, reason = v_reason, screened_by = auth.uid(), decided_at = now(),
    screened_on = coalesce(p_screened_on, screened_on),
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
  where id = s.id;

  perform private.audit(
    case when p_status = 'PENDING' then 'SCREENING_RETURNED_TO_PENDING' else 'SCREENING_' || p_status::text end,
    'player_screening', s.id, null, null, to_jsonb(s),
    (select to_jsonb(x) from public.player_screenings x where x.id = s.id)
      || jsonb_build_object('reversal', s.status = 'CLEARED'));

  if p_status <> 'CLEARED' then
    v_reopened := private.reopen_invalid_lineups(s.player_id, s.team_id,
      format('%s is now %s', btrim(coalesce((select display_name from public.players where id = s.player_id), 'A player')), lower(p_status::text)));
  end if;
  return jsonb_build_object('status', p_status, 'reopened_lineups', v_reopened);
end $$;

-- ── 11. Squad RPCs (ADMIN) ─────────────────────────────────────────────────
create or replace function private.validate_squad_fields(p_shirt integer, p_position text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_shirt is null or p_shirt < 1 or p_shirt > 99 then
    raise exception 'Shirt number must be between 1 and 99' using errcode = 'EK422';
  end if;
  if p_position is not null and p_position not in ('GK', 'DF', 'MF', 'FW') then
    raise exception 'Choose a valid position' using errcode = 'EK422';
  end if;
end $$;

create or replace function public.admin_add_squad_player(
  p_squad_id uuid, p_player_id uuid, p_shirt_number integer, p_position text default null, p_is_captain boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.squads; v_existing public.squad_players; v_id uuid;
begin
  perform private.require_admin();
  select * into s from public.squads where id = p_squad_id for update;
  if not found then
    raise exception 'Squad not found' using errcode = 'EK404';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found' using errcode = 'EK404';
  end if;
  perform private.validate_squad_fields(p_shirt_number, p_position);
  select * into v_existing from public.squad_players where squad_id = p_squad_id and player_id = p_player_id;
  if found then
    raise exception '%', case when v_existing.active then 'That player is already in this squad'
      else 'That player was in this squad before. Reactivate their membership instead.' end using errcode = 'EK409';
  end if;
  if exists (select 1 from public.squad_players where squad_id = p_squad_id and shirt_number = p_shirt_number and active) then
    raise exception 'Shirt % is already taken in this squad', p_shirt_number using errcode = 'EK409';
  end if;
  if coalesce(p_is_captain, false) then
    update public.squad_players set is_captain = false where squad_id = p_squad_id and is_captain;
  end if;
  insert into public.squad_players (squad_id, player_id, shirt_number, position, is_captain)
  values (p_squad_id, p_player_id, p_shirt_number, p_position, coalesce(p_is_captain, false))
  returning id into v_id;
  perform private.audit('SQUAD_PLAYER_ADDED', 'squad_player', v_id, null, null, null,
    (select to_jsonb(x) from public.squad_players x where x.id = v_id));
  return v_id;
end $$;

create or replace function public.admin_update_squad_player(
  p_squad_player_id uuid, p_shirt_number integer, p_position text, p_is_captain boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare sp public.squad_players;
begin
  perform private.require_admin();
  select * into sp from public.squad_players where id = p_squad_player_id for update;
  if not found then
    raise exception 'Squad member not found' using errcode = 'EK404';
  end if;
  perform private.validate_squad_fields(p_shirt_number, p_position);
  if not sp.active and coalesce(p_is_captain, false) then
    raise exception 'An inactive member cannot be captain' using errcode = 'EK422';
  end if;
  if sp.active and exists (select 1 from public.squad_players where squad_id = sp.squad_id and shirt_number = p_shirt_number
                           and active and id <> sp.id) then
    raise exception 'Shirt % is already taken in this squad', p_shirt_number using errcode = 'EK409';
  end if;
  if coalesce(p_is_captain, false) and not sp.is_captain then
    update public.squad_players set is_captain = false where squad_id = sp.squad_id and is_captain;
  end if;
  update public.squad_players set shirt_number = p_shirt_number, position = p_position, is_captain = coalesce(p_is_captain, false)
  where id = sp.id;
  perform private.audit('SQUAD_PLAYER_UPDATED', 'squad_player', sp.id, null, null, to_jsonb(sp),
    (select to_jsonb(x) from public.squad_players x where x.id = sp.id));
end $$;

create or replace function public.admin_set_squad_player_active(p_squad_player_id uuid, p_active boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare sp public.squad_players; s public.squads;
begin
  perform private.require_admin();
  select * into sp from public.squad_players where id = p_squad_player_id for update;
  if not found then
    raise exception 'Squad member not found' using errcode = 'EK404';
  end if;
  if sp.active = p_active then
    raise exception 'The membership is already %', case when p_active then 'active' else 'inactive' end using errcode = 'EK409';
  end if;
  if not p_active and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to remove a player from the squad' using errcode = 'EK422';
  end if;
  if p_active and exists (select 1 from public.squad_players where squad_id = sp.squad_id and shirt_number = sp.shirt_number
                          and active and id <> sp.id) then
    raise exception 'Shirt % is now used by another player. Change the shirt number first.', sp.shirt_number using errcode = 'EK409';
  end if;
  update public.squad_players set
    active = p_active,
    is_captain = case when p_active then is_captain else false end,
    left_reason = case when p_active then null else btrim(p_reason) end
  where id = sp.id;
  perform private.audit(case when p_active then 'SQUAD_PLAYER_REACTIVATED' else 'SQUAD_PLAYER_DEACTIVATED' end,
    'squad_player', sp.id, null, null, to_jsonb(sp), (select to_jsonb(x) from public.squad_players x where x.id = sp.id));
  if not p_active then
    select * into s from public.squads where id = sp.squad_id;
    perform private.reopen_invalid_lineups(sp.player_id, s.team_id,
      format('%s left the squad', btrim(private.player_label(sp.player_id, sp.shirt_number))));
  end if;
end $$;

-- ── 12. Line-up RPCs ───────────────────────────────────────────────────────
/*
 * Validate a submitted line-up and store it (replacing the players).
 * p_mode 'draft': players must be active squad members and CLEARED.
 * p_mode 'correction': players must have been in the team's season squad
 * (history is corrected, not re-screened).
 */
create or replace function private.store_lineup(
  p_lineup_id uuid, p_formation text, p_players jsonb, p_mode text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.match_lineups;
  f public.formations;
  r jsonb := private.lineup_rules();
  v_season uuid;
  e jsonb;
  i integer := 0;
  v_player uuid; v_role public.lineup_role; v_shirt integer; v_slot integer; v_pos text;
  v_x numeric; v_y numeric; v_captain boolean; v_gk boolean; v_elig text; v_label text;
  v_seen_players uuid[] := '{}'; v_seen_shirts integer[] := '{}'; v_seen_slots integer[] := '{}';
  v_starters integer := 0; v_subs integer := 0; v_captains integer := 0; v_gks integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into l from public.match_lineups where id = p_lineup_id;
  select c.season_id into v_season from public.matches m join public.competitions c on c.id = m.competition_id where m.id = l.match_id;
  if p_formation is not null then
    select * into f from public.formations where code = p_formation and active;
    if not found then
      raise exception 'Unknown formation %', p_formation using errcode = 'EK422';
    end if;
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'Players must be a list' using errcode = 'EK422';
  end if;
  if jsonb_array_length(p_players) > (r ->> 'max_starters')::int + (r ->> 'max_substitutes')::int then
    raise exception 'Too many players in the line-up' using errcode = 'EK422';
  end if;

  for e in select * from jsonb_array_elements(p_players) loop
    i := i + 1;
    begin
      v_player := (e ->> 'player_id')::uuid;
      v_role := (e ->> 'role')::public.lineup_role;
      v_shirt := nullif(e ->> 'shirt_number', '')::integer;
      v_slot := nullif(e ->> 'slot', '')::integer;
      v_x := nullif(e ->> 'x', '')::numeric;
      v_y := nullif(e ->> 'y', '')::numeric;
    exception when others then
      raise exception 'Line-up entry % is not valid', i using errcode = 'EK422';
    end;
    if v_player is null or v_role is null then
      raise exception 'Line-up entry % needs a player and a role', i using errcode = 'EK422';
    end if;
    v_pos := nullif(upper(btrim(coalesce(e ->> 'position', ''))), '');
    v_captain := coalesce((e ->> 'captain')::boolean, false);
    v_gk := coalesce((e ->> 'goalkeeper')::boolean, false);

    -- Squad membership + eligibility.
    v_elig := case
      when p_mode = 'draft' then private.match_eligibility(l.match_id, l.team_id, v_player)
      when exists (select 1 from public.squad_players sp join public.squads s on s.id = sp.squad_id
                   where s.team_id = l.team_id and s.season_id = v_season and sp.player_id = v_player) then 'CLEARED'
      else 'NOT_IN_SQUAD' end;
    v_shirt := coalesce(v_shirt, private.active_squad_shirt(v_player, l.team_id, v_season),
      (select sp.shirt_number from public.squad_players sp join public.squads s on s.id = sp.squad_id
       where s.team_id = l.team_id and s.season_id = v_season and sp.player_id = v_player order by sp.active desc limit 1));
    v_label := btrim(private.player_label(v_player, v_shirt::smallint));
    if v_elig = 'NOT_IN_SQUAD' then
      raise exception '% is not in this team''s squad for the season', coalesce(nullif(v_label, ''), 'That player') using errcode = 'EK422';
    end if;
    if v_elig = 'CONFLICT' then
      raise exception '% also represents another team in this competition and cannot be selected', v_label using errcode = 'EK422';
    end if;
    if v_elig <> 'CLEARED' then
      raise exception '% is not eligible (%): only CLEARED players can be selected', v_label, replace(lower(v_elig), '_', ' ')
        using errcode = 'EK422';
    end if;

    if v_player = any (v_seen_players) then
      raise exception '% is selected twice — a player can be a starter or a substitute, not both', v_label using errcode = 'EK422';
    end if;
    v_seen_players := v_seen_players || v_player;
    if v_shirt is null or v_shirt < 1 or v_shirt > 99 then
      raise exception '% needs a shirt number between 1 and 99', v_label using errcode = 'EK422';
    end if;
    if v_shirt = any (v_seen_shirts) then
      raise exception 'Shirt % is used by more than one player in this line-up', v_shirt using errcode = 'EK422';
    end if;
    v_seen_shirts := v_seen_shirts || v_shirt;

    if v_role = 'STARTER' then
      v_starters := v_starters + 1;
      if v_slot is not null then
        if f.code is null then
          raise exception 'Choose a formation before placing players in formation slots' using errcode = 'EK422';
        end if;
        if v_slot < 0 or v_slot > 10 then
          raise exception 'Formation slot % does not exist', v_slot using errcode = 'EK422';
        end if;
        if v_slot = any (v_seen_slots) then
          raise exception 'Two starters are placed in the same position' using errcode = 'EK422';
        end if;
        v_seen_slots := v_seen_slots || v_slot;
        v_pos := coalesce(v_pos, f.slots -> v_slot ->> 'position');
        v_x := coalesce(v_x, (f.slots -> v_slot ->> 'x')::numeric);
        v_y := coalesce(v_y, (f.slots -> v_slot ->> 'y')::numeric);
        v_gk := v_gk or (f.slots -> v_slot ->> 'position') = 'GK';
      end if;
      if (v_x is null) <> (v_y is null) or v_x < 0 or v_x > 100 or v_y < 0 or v_y > 100 then
        raise exception 'Pitch position for % must be x and y between 0 and 100', v_label using errcode = 'EK422';
      end if;
      if v_gk then
        v_gks := v_gks + 1;
      end if;
    else
      v_subs := v_subs + 1;
      if v_captain then
        raise exception 'The captain must be in the starting XI' using errcode = 'EK422';
      end if;
      v_slot := null; v_x := null; v_y := null;
    end if;
    if v_pos is not null and v_pos !~ '^[A-Z]{1,4}$' then
      raise exception 'Position % is not valid', v_pos using errcode = 'EK422';
    end if;
    if v_captain then
      v_captains := v_captains + 1;
    end if;

    v_rows := v_rows || jsonb_build_object('player_id', v_player, 'shirt_number', v_shirt, 'role', v_role,
      'position', v_pos, 'slot_index', v_slot, 'pitch_x', v_x, 'pitch_y', v_y,
      'is_captain', v_captain, 'is_goalkeeper', v_gk, 'sort_order', i);
  end loop;

  if v_starters > (r ->> 'max_starters')::int then
    raise exception 'A starting XI has at most % players (you selected %)', r ->> 'max_starters', v_starters using errcode = 'EK422';
  end if;
  if v_subs > (r ->> 'max_substitutes')::int then
    raise exception 'At most % substitutes can be named (you selected %)', r ->> 'max_substitutes', v_subs using errcode = 'EK422';
  end if;
  if v_captains > 1 then
    raise exception 'Only one captain can be chosen' using errcode = 'EK422';
  end if;
  if v_gks > 1 then
    raise exception 'Only one starting goalkeeper is allowed' using errcode = 'EK422';
  end if;

  update public.match_lineups set formation_code = p_formation, updated_by = auth.uid() where id = p_lineup_id;
  delete from public.lineup_players where lineup_id = p_lineup_id;
  insert into public.lineup_players (lineup_id, player_id, shirt_number, role, position, slot_index, pitch_x, pitch_y,
                                     is_captain, is_goalkeeper, sort_order)
  select p_lineup_id, x.player_id, x.shirt_number, x.role, x.position, x.slot_index, x.pitch_x, x.pitch_y,
    x.is_captain, x.is_goalkeeper, x.sort_order
  from jsonb_to_recordset(v_rows) as x(player_id uuid, shirt_number smallint, role public.lineup_role, position text,
    slot_index smallint, pitch_x numeric, pitch_y numeric, is_captain boolean, is_goalkeeper boolean, sort_order smallint);
end $$;

create or replace function private.lineup_snapshot(p_lineup_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'match_id', l.match_id, 'team_id', l.team_id, 'status', l.status,
    'formation', l.formation_code, 'confirmed_at', l.confirmed_at, 'confirmed_by', l.confirmed_by,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', lp.player_id, 'shirt_number', lp.shirt_number, 'role', lp.role, 'position', lp.position,
        'slot', lp.slot_index, 'x', lp.pitch_x, 'y', lp.pitch_y, 'captain', lp.is_captain, 'goalkeeper', lp.is_goalkeeper)
        order by lp.role, lp.sort_order)
      from public.lineup_players lp where lp.lineup_id = l.id), '[]'::jsonb))
  from public.match_lineups l where l.id = p_lineup_id;
$$;

-- Lock the match row and check the caller may edit its line-ups before kick-off.
create or replace function private.begin_lineup_edit(p_match_id uuid, p_team_id uuid)
returns public.matches language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_role text;
begin
  -- Lock first so a concurrent take-over cannot interleave with the check.
  select * into m from public.matches where id = p_match_id for update;
  v_role := private.lineup_editor_role(p_match_id);
  if v_role = 'VIEWER' then
    raise exception 'Only the operator in control manages line-ups before kick-off. Take over the match first (audited).'
      using errcode = 'EK403';
  end if;
  if m.id is null then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'That team is not playing in this match' using errcode = 'EK422';
  end if;
  if m.status <> 'SCHEDULED' then
    raise exception 'Line-ups are locked once the match has started. Use an admin line-up correction.' using errcode = 'EK409';
  end if;
  return m;
end $$;

/* Save (or create) a DRAFT line-up. Drafts are private and not audited. */
create or replace function public.save_lineup(p_match_id uuid, p_team_id uuid, p_formation text, p_players jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; l public.match_lineups;
begin
  m := private.begin_lineup_edit(p_match_id, p_team_id);
  select * into l from public.match_lineups where match_id = p_match_id and team_id = p_team_id for update;
  if found and l.status = 'CONFIRMED' then
    raise exception 'This line-up is confirmed. Reopen it to make changes.' using errcode = 'EK409';
  end if;
  if not found then
    insert into public.match_lineups (match_id, team_id, updated_by) values (p_match_id, p_team_id, auth.uid())
    returning * into l;
  end if;
  perform private.store_lineup(l.id, nullif(btrim(coalesce(p_formation, '')), ''), p_players, 'draft');
  return public.lineup_editor_state(p_match_id, p_team_id);
end $$;

create or replace function public.confirm_lineup(p_match_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; l public.match_lineups; v_problems text[];
begin
  m := private.begin_lineup_edit(p_match_id, p_team_id);
  select * into l from public.match_lineups where match_id = p_match_id and team_id = p_team_id for update;
  if not found then
    raise exception 'Prepare the line-up before confirming it' using errcode = 'EK422';
  end if;
  if l.status = 'CONFIRMED' then
    raise exception 'This line-up is already confirmed' using errcode = 'EK409';
  end if;
  v_problems := private.lineup_problems(l.id, 'confirm');
  if cardinality(v_problems) > 0 then
    raise exception 'The line-up cannot be confirmed: %', array_to_string(v_problems, '; ') using errcode = 'EK422';
  end if;
  update public.match_lineups set status = 'CONFIRMED', confirmed_at = now(), confirmed_by = auth.uid(), updated_by = auth.uid()
  where id = l.id;
  perform private.bump_seq(p_match_id);
  perform private.audit('LINEUP_CONFIRMED', 'match_lineup', l.id, p_match_id, null, null, private.lineup_snapshot(l.id));
  perform private.after_match_change(p_match_id, 'LINEUP_CONFIRMED');
  return public.lineup_editor_state(p_match_id, p_team_id);
end $$;

/* CONFIRMED → DRAFT before kick-off (e.g. late change); unpublishes it. */
create or replace function public.reopen_lineup(p_match_id uuid, p_team_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; l public.match_lineups;
begin
  m := private.begin_lineup_edit(p_match_id, p_team_id);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to reopen a confirmed line-up' using errcode = 'EK422';
  end if;
  select * into l from public.match_lineups where match_id = p_match_id and team_id = p_team_id for update;
  if not found or l.status <> 'CONFIRMED' then
    raise exception 'Only a confirmed line-up can be reopened' using errcode = 'EK409';
  end if;
  update public.match_lineups set status = 'DRAFT', confirmed_at = null, confirmed_by = null, updated_by = auth.uid()
  where id = l.id;
  perform private.bump_seq(p_match_id);
  perform private.audit('LINEUP_REOPENED', 'match_lineup', l.id, p_match_id, null, private.lineup_snapshot(l.id),
    jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'LINEUP_REOPENED');
  return public.lineup_editor_state(p_match_id, p_team_id);
end $$;

/*
 * After kick-off: ADMIN-only correction with a reason. The corrected line-up
 * must still explain every recorded event of that team.
 */
create or replace function public.admin_correct_lineup(
  p_match_id uuid, p_team_id uuid, p_formation text, p_players jsonb, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; l public.match_lineups; v_before jsonb; v_problems text[]; v_bad text;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A correction reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'That team is not playing in this match' using errcode = 'EK422';
  end if;
  if m.status not in ('1H', 'HT', '2H', 'FT', 'ABANDONED') then
    raise exception 'Before kick-off, edit the line-up normally instead of correcting it' using errcode = 'EK409';
  end if;
  perform set_config('eksu.lineup_correction', 'on', true);
  select * into l from public.match_lineups where match_id = p_match_id and team_id = p_team_id for update;
  if not found then
    insert into public.match_lineups (match_id, team_id, updated_by) values (p_match_id, p_team_id, auth.uid()) returning * into l;
  end if;
  v_before := private.lineup_snapshot(l.id);
  perform private.store_lineup(l.id, nullif(btrim(coalesce(p_formation, '')), ''), p_players, 'correction');
  update public.match_lineups set status = 'CONFIRMED', confirmed_at = coalesce(confirmed_at, now()),
    confirmed_by = coalesce(confirmed_by, auth.uid()) where id = l.id;

  v_problems := array_remove(private.lineup_problems(l.id, 'confirm'), null);
  -- Eligibility is not re-screened for history; the shape still must be valid.
  v_problems := array(select x from unnest(v_problems) x where x not like '%is not eligible%');
  if cardinality(v_problems) > 0 then
    raise exception 'The corrected line-up is not valid: %', array_to_string(v_problems, '; ') using errcode = 'EK422';
  end if;
  select format('Recorded events involve %s, who is not in the corrected line-up',
           btrim(coalesce(private.player_label(x.pid, null), 'a player')))
    into v_bad
  from (
    select e.player_id as pid from public.match_events e where e.match_id = p_match_id and e.team_id = p_team_id and e.voided_at is null and e.player_id is not null
    union
    select e.related_player_id from public.match_events e where e.match_id = p_match_id and e.team_id = p_team_id and e.voided_at is null and e.related_player_id is not null
  ) x
  where not exists (select 1 from public.lineup_players lp where lp.lineup_id = l.id and lp.player_id = x.pid)
  limit 1;
  if v_bad is not null then
    raise exception '%. Void or correct those events first.', v_bad using errcode = 'EK422';
  end if;
  if exists (
    select 1 from public.match_events e join public.lineup_players lp on lp.lineup_id = l.id and lp.player_id = e.related_player_id
    where e.match_id = p_match_id and e.team_id = p_team_id and e.voided_at is null and e.type = 'SUBSTITUTION' and lp.role <> 'SUBSTITUTE'
  ) then
    raise exception 'A recorded substitution brings on a player listed as a starter' using errcode = 'EK422';
  end if;

  perform private.bump_seq(p_match_id);
  perform private.audit('LINEUP_CORRECTED', 'match_lineup', l.id, p_match_id, null, v_before,
    private.lineup_snapshot(l.id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'LINEUP_CORRECTED');
  return public.lineup_editor_state(p_match_id, p_team_id);
end $$;

/* ADMIN emergency override: allow kick-off without confirmed line-ups. */
create or replace function public.admin_set_lineup_override(p_match_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status <> 'SCHEDULED' then
    raise exception 'The override only applies before kick-off' using errcode = 'EK409';
  end if;
  update public.matches set
    lineup_override_reason = v_reason,
    lineup_override_by = case when v_reason is null then null else auth.uid() end,
    lineup_override_at = case when v_reason is null then null else now() end
  where id = p_match_id;
  perform private.audit(case when v_reason is null then 'LINEUP_OVERRIDE_CLEARED' else 'LINEUP_REQUIREMENT_OVERRIDDEN' end,
    'match', p_match_id, p_match_id, null,
    jsonb_build_object('reason', m.lineup_override_reason, 'at', m.lineup_override_at),
    jsonb_build_object('reason', v_reason, 'detail', v_reason));
end $$;

/*
 * Everything a line-up editor needs for one team of one match. ADMIN sees
 * every squad member with their eligibility; operators see only players
 * eligible to play (screening outcomes, never screening details).
 */
create or replace function public.lineup_editor_state(p_match_id uuid, p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text; m public.matches; c public.competitions; t public.teams; l public.match_lineups;
begin
  v_role := private.lineup_editor_role(p_match_id);
  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'That team is not playing in this match' using errcode = 'EK422';
  end if;
  select * into c from public.competitions where id = m.competition_id;
  select * into t from public.teams where id = p_team_id;
  select * into l from public.match_lineups where match_id = p_match_id and team_id = p_team_id;
  return jsonb_build_object(
    'viewer_role', v_role,
    'match', jsonb_build_object('id', m.id, 'status', m.status, 'scheduled_at', m.scheduled_at,
      'side', case when p_team_id = m.home_team_id then 'home' else 'away' end,
      'competition', c.name, 'season_id', c.season_id,
      'lineup_override', m.lineup_override_reason),
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name, 'code', t.code,
      'color_primary', t.color_primary, 'color_secondary', t.color_secondary),
    'editable', m.status = 'SCHEDULED' and v_role <> 'VIEWER',
    'in_control', (select display_name from public.profiles p where p.id = m.active_operator_id
                   and exists (select 1 from public.operator_assignments a where a.match_id = m.id and a.user_id = p.id and a.active)),
    'rules', private.lineup_rules(),
    'formations', coalesce((select jsonb_agg(jsonb_build_object('code', f.code, 'name', f.name, 'slots', f.slots) order by f.sort_order)
      from public.formations f where f.active), '[]'::jsonb),
    'lineup', case when l.id is null then null else jsonb_build_object(
      'id', l.id, 'status', l.status, 'formation', l.formation_code, 'confirmed_at', l.confirmed_at,
      'confirmed_by', (select display_name from public.profiles where id = l.confirmed_by),
      'updated_at', l.updated_at,
      'problems', to_jsonb(private.lineup_problems(l.id, case when l.status = 'CONFIRMED' then 'confirm' else 'draft' end)),
      'confirm_problems', to_jsonb(private.lineup_problems(l.id, 'confirm')),
      'players', coalesce((select jsonb_agg(jsonb_build_object(
          'player_id', s.player_id, 'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role,
          'position', s.position, 'slot', s.slot_index, 'x', s.pitch_x, 'y', s.pitch_y,
          'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
          'eligibility', case when v_role = 'ADMIN' then private.match_eligibility(p_match_id, p_team_id, s.player_id)
                              when private.match_eligibility(p_match_id, p_team_id, s.player_id) = 'CLEARED' then 'CLEARED'
                              else 'INELIGIBLE' end,
          'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off, 'sent_off', s.sent_off)
          order by s.role, s.sort_order)
        from private.lineup_player_states(l.id) s), '[]'::jsonb)) end,
    'squad', coalesce((select jsonb_agg(x.j order by x.shirt) from (
        select sp.shirt_number as shirt, jsonb_build_object(
          'player_id', sp.player_id, 'name', p.display_name, 'shirt_number', sp.shirt_number,
          'position', sp.position, 'captain', sp.is_captain,
          'eligibility', private.match_eligibility(p_match_id, p_team_id, sp.player_id)) as j
        from public.squads s
        join public.squad_players sp on sp.squad_id = s.id and sp.active
        join public.players p on p.id = sp.player_id
        where s.team_id = p_team_id and s.season_id = c.season_id
          and (v_role = 'ADMIN' or private.match_eligibility(p_match_id, p_team_id, sp.player_id) = 'CLEARED')
      ) x), '[]'::jsonb)
  );
end $$;

-- ── 13. Match engine: kick-off guard + line-up-aware events ─────────────────
create or replace function private.require_lineups_for_kickoff(m public.matches)
returns void language plpgsql stable security definer set search_path = '' as $$
declare t record; l public.match_lineups; v_problems text[];
begin
  if m.lineup_override_at is not null then
    return;
  end if;
  for t in select x.id, x.short_name from public.teams x where x.id in (m.home_team_id, m.away_team_id)
           order by (x.id = m.home_team_id) desc loop
    select * into l from public.match_lineups where match_id = m.id and team_id = t.id;
    if not found or l.status <> 'CONFIRMED' then
      raise exception 'Line-ups must be confirmed before kick-off: the % line-up is %', t.short_name,
        case when l.id is null then 'missing' else 'still a draft' end using errcode = 'EK409';
    end if;
    v_problems := private.lineup_problems(l.id, 'confirm');
    if cardinality(v_problems) > 0 then
      raise exception 'The % line-up needs attention before kick-off: %', t.short_name, array_to_string(v_problems, '; ')
        using errcode = 'EK409';
    end if;
  end loop;
end $$;

create or replace function public.start_match(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'START_MATCH');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['SCHEDULED']::public.match_status[], 'Starting the match');
  perform private.require_lineups_for_kickoff(m);
  v_before := private.match_snapshot(p_match_id);

  update public.matches set
    status = '1H', current_period = 1, started_at = now(),
    period_started_at = now(), period_ended_at = null, period_offset_seconds = 0,
    clock_running = true, paused_at = null, accumulated_pause_seconds = 0, stoppage_seconds = 0,
    active_operator_id = auth.uid()
  where id = p_match_id;
  insert into public.match_periods (match_id, period, offset_seconds, started_at)
  values (p_match_id, 1, 0, now());
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'START_MATCH', 'MATCH_STARTED', 'match', p_match_id, v_before,
    case when m.lineup_override_at is not null then to_jsonb('Started without confirmed line-ups (admin override)'::text) end);
  return private.canonical_state(p_match_id);
end $$;

/*
 * Player checks against a team's CONFIRMED line-up (no-op without one, e.g.
 * after an admin override: the season squad check applies instead).
 */
create or replace function private.check_lineup_event(
  p_match_id uuid, p_team_id uuid, p_type text, p_player uuid, p_related uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
declare v_lineup uuid := private.confirmed_lineup(p_match_id, p_team_id); s record; r record;
begin
  if v_lineup is null then
    return;
  end if;
  if p_player is not null then
    select * into s from private.lineup_player_states(v_lineup) x where x.player_id = p_player;
    if not found then
      raise exception '%', case when p_type = 'SUBSTITUTION' then 'The player going off is not in this team''s line-up'
        else 'That player is not in this team''s line-up' end using errcode = 'EK422';
    end if;
    if p_type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'PENALTY_MISS', 'SUBSTITUTION') and not s.on_field then
      raise exception '% is not on the pitch%', btrim(private.player_label(p_player, s.shirt_number)),
        case when s.sent_off then ' (sent off)' when s.subbed_off then ' (substituted off)' when s.role = 'SUBSTITUTE' then ' (on the bench)' else '' end
        using errcode = 'EK422';
    end if;
  end if;
  if p_type = 'SUBSTITUTION' and p_related is not null then
    select * into r from private.lineup_player_states(v_lineup) x where x.player_id = p_related;
    if not found then
      raise exception 'The player coming on is not in this team''s line-up' using errcode = 'EK422';
    end if;
    if r.role <> 'SUBSTITUTE' then
      raise exception '% is in the starting XI, not on the bench', btrim(private.player_label(p_related, r.shirt_number)) using errcode = 'EK422';
    end if;
    if r.sent_off then
      raise exception '% has been sent off and cannot come on', btrim(private.player_label(p_related, r.shirt_number)) using errcode = 'EK422';
    end if;
    if r.subbed_on then
      raise exception '% is already on the pitch', btrim(private.player_label(p_related, r.shirt_number)) using errcode = 'EK422';
    end if;
  end if;
end $$;

create or replace function public.record_event(
  p_match_id uuid,
  p_event_id uuid,
  p_type text,
  p_team_id uuid,
  p_minute integer,
  p_minute_extra integer default 0,
  p_player_id uuid default null,
  p_related_player_id uuid default null,
  p_client_ts timestamptz default null,
  p_client_queued boolean default false,
  p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  et public.event_types;
  v_existing public.match_events;
  v_seq bigint;
  p record;
  r record;
  v_min_lo integer;
  v_min_hi integer;
begin
  -- The event id is the idempotency key. A retry of an already-stored event
  -- returns canonical state without inserting anything.
  select * into v_existing from public.match_events where id = p_event_id;
  if found then
    perform private.begin_command(p_match_id, p_event_id, 'RECORD_EVENT');
    if v_existing.match_id <> p_match_id then
      raise exception 'Event id % belongs to a different match', p_event_id using errcode = 'EK422';
    end if;
    return private.canonical_state(p_match_id, true);
  end if;

  m := private.begin_command(p_match_id, p_event_id, 'RECORD_EVENT');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H']::public.match_status[], 'Recording events');
  perform private.require_control(m);

  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;

  v_min_lo := case m.current_period when 1 then 0 else 45 end;
  v_min_hi := case m.current_period when 1 then 45 else 90 end;
  if p_minute is null or p_minute < v_min_lo or p_minute > v_min_hi
     or coalesce(p_minute_extra, 0) < 0 or coalesce(p_minute_extra, 0) > 60
     or (coalesce(p_minute_extra, 0) > 0 and p_minute <> v_min_hi) then
    raise exception 'Minute %+% is not valid for period %', p_minute, coalesce(p_minute_extra, 0), m.current_period
      using errcode = 'EK422';
  end if;

  if et.requires_player and p_player_id is null then
    raise exception '% requires a player', et.name using errcode = 'EK422';
  end if;
  if et.requires_related_player and p_related_player_id is null then
    raise exception '% requires the player coming on', et.name using errcode = 'EK422';
  end if;
  if not et.requires_related_player and p_related_player_id is not null then
    raise exception '% does not take a second player', et.name using errcode = 'EK422';
  end if;
  if p_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_player_id) is null then
    raise exception 'Player is not in this team''s squad' using errcode = 'EK422';
  end if;
  if p_related_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_related_player_id) is null then
    raise exception 'Player coming on is not in this team''s squad' using errcode = 'EK422';
  end if;

  if p_player_id is not null then
    select * into p from private.player_flags(p_match_id, p_player_id);
    if p.sent_off then
      raise exception 'That player has already been sent off' using errcode = 'EK422';
    end if;
    if p.subbed_off then
      raise exception 'That player has already been substituted off' using errcode = 'EK422';
    end if;
    if p_type = 'SECOND_YELLOW' and not p.booked then
      raise exception 'A second yellow needs an earlier yellow card' using errcode = 'EK422';
    end if;
    if p_type = 'YELLOW_CARD' and p.booked then
      raise exception 'That player is already booked — record a second yellow' using errcode = 'EK422';
    end if;
  end if;
  if p_type = 'SUBSTITUTION' then
    if p_related_player_id = p_player_id then
      raise exception 'Player on and player off must be different' using errcode = 'EK422';
    end if;
    select * into r from private.player_flags(p_match_id, p_related_player_id);
    if r.sent_off or r.subbed_off then
      raise exception 'The player coming on cannot return to the pitch' using errcode = 'EK422';
    end if;
    if r.subbed_on then
      raise exception 'The player coming on is already on the pitch' using errcode = 'EK422';
    end if;
  end if;
  -- The confirmed line-up decides who is on the pitch / on the bench.
  perform private.check_lineup_event(p_match_id, p_team_id, p_type, p_player_id, p_related_player_id);

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    payload, recorded_by, client_ts, client_queued
  ) values (
    p_event_id, p_match_id, v_seq, p_type, m.current_period, p_minute, coalesce(p_minute_extra, 0),
    p_team_id, p_player_id, p_related_player_id, coalesce(p_payload, '{}'::jsonb), auth.uid(),
    p_client_ts, coalesce(p_client_queued, false)
  );
  if et.scores_for is not null then
    perform private.recompute_score(p_match_id);
  end if;

  perform private.finish_command(p_match_id, p_event_id, 'RECORD_EVENT', 'EVENT_RECORDED', 'match_event', p_event_id, null);
  return private.canonical_state(p_match_id);
end $$;

-- Admin-added events (corrections) respect the confirmed line-up too.
create or replace function public.admin_add_event(
  p_match_id uuid, p_event_id uuid, p_type text, p_team_id uuid, p_period integer,
  p_minute integer, p_minute_extra integer, p_player_id uuid, p_related_player_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; et public.event_types; v_seq bigint; v_lo int; v_hi int;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A correction reason is required' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.match_events where id = p_event_id) then
    if not exists (select 1 from public.match_events where id = p_event_id and match_id = p_match_id) then
      raise exception 'Event id already used on another match' using errcode = 'EK422';
    end if;
    return private.canonical_state(p_match_id, true);
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status not in ('1H', 'HT', '2H', 'FT', 'ABANDONED') then
    raise exception 'Events can only be added to started matches' using errcode = 'EK409';
  end if;
  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_period is null or p_period < 1 or p_period > coalesce(m.current_period, 0) then
    raise exception 'Period % has not been played', p_period using errcode = 'EK422';
  end if;
  v_lo := case p_period when 1 then 0 else 45 end;
  v_hi := case p_period when 1 then 45 else 90 end;
  if p_minute is null or p_minute < v_lo or p_minute > v_hi
     or coalesce(p_minute_extra, 0) < 0 or coalesce(p_minute_extra, 0) > 60
     or (coalesce(p_minute_extra, 0) > 0 and p_minute <> v_hi) then
    raise exception 'Minute %+% is not valid for period %', p_minute, coalesce(p_minute_extra, 0), p_period using errcode = 'EK422';
  end if;
  if et.requires_player and p_player_id is null then
    raise exception '% requires a player', et.name using errcode = 'EK422';
  end if;
  if et.requires_related_player and p_related_player_id is null then
    raise exception '% requires the player coming on', et.name using errcode = 'EK422';
  end if;
  if not et.requires_related_player and p_related_player_id is not null then
    raise exception '% does not take a second player', et.name using errcode = 'EK422';
  end if;
  if p_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_player_id) is null then
    raise exception 'Player is not in this team''s squad' using errcode = 'EK422';
  end if;
  if p_related_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_related_player_id) is null then
    raise exception 'Player coming on is not in this team''s squad' using errcode = 'EK422';
  end if;
  if p_type = 'SUBSTITUTION' and p_related_player_id = p_player_id then
    raise exception 'Player on and player off must be different' using errcode = 'EK422';
  end if;
  perform private.check_lineup_event(p_match_id, p_team_id, p_type, p_player_id, p_related_player_id);

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    payload, recorded_by
  ) values (
    p_event_id, p_match_id, v_seq, p_type, p_period, p_minute, coalesce(p_minute_extra, 0), p_team_id,
    p_player_id, p_related_player_id, jsonb_build_object('admin_correction', btrim(p_reason)), auth.uid()
  );
  perform private.after_correction(p_match_id);
  perform private.audit('ADMIN_EVENT_ADDED', 'match_event', p_event_id, p_match_id, null, null,
    (select to_jsonb(x) from public.match_events x where x.id = p_event_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'ADMIN_EVENT_ADDED');
  return private.canonical_state(p_match_id);
end $$;

-- Line-ups for the operator console (names + shirts + on-field state).
create or replace function private.team_lineup_json(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when l.id is null then null else jsonb_build_object(
    'status', l.status, 'formation', l.formation_code, 'confirmed_at', l.confirmed_at,
    'problems', to_jsonb(private.lineup_problems(l.id, 'confirm')),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', s.player_id, 'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role,
        'position', s.position, 'x', s.pitch_x, 'y', s.pitch_y, 'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
        'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off, 'sent_off', s.sent_off)
        order by s.role, s.sort_order)
      from private.lineup_player_states(l.id) s), '[]'::jsonb)) end
  from (select 1) one
  left join public.match_lineups l on l.match_id = p_match_id and l.team_id = p_team_id;
$$;

-- Shirt ↔ player map for the console: the confirmed line-up, else the active squad.
create or replace function private.console_players(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.confirmed_lineup(p_match_id, p_team_id) is not null then
    coalesce((select jsonb_agg(jsonb_build_object('player_id', lp.player_id, 'shirt_number', lp.shirt_number, 'name', p.display_name)
        order by lp.shirt_number)
      from public.lineup_players lp join public.players p on p.id = lp.player_id
      where lp.lineup_id = private.confirmed_lineup(p_match_id, p_team_id)), '[]'::jsonb)
  else
    coalesce((select jsonb_agg(jsonb_build_object('player_id', sp.player_id, 'shirt_number', sp.shirt_number, 'name', p.display_name)
        order by sp.shirt_number)
      from public.matches m
      join public.competitions c on c.id = m.competition_id
      join public.squads s on s.season_id = c.season_id and s.team_id = p_team_id
      join public.squad_players sp on sp.squad_id = s.id and sp.active
      join public.players p on p.id = sp.player_id
      where m.id = p_match_id), '[]'::jsonb)
  end;
$$;

create or replace function public.operator_match_state(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if not private.is_staff() or not exists (
    select 1 from public.operator_assignments a
    where a.match_id = p_match_id and a.user_id = auth.uid() and a.active
  ) then
    raise exception 'Match not found or not assigned to you' using errcode = 'EK403';
  end if;
  select * into m from public.matches where id = p_match_id;
  return private.canonical_state(p_match_id) || jsonb_build_object(
    'you', auth.uid(),
    'in_control', m.active_operator_id = auth.uid(),
    'squads', jsonb_build_object(
      'home', private.console_players(p_match_id, m.home_team_id),
      'away', private.console_players(p_match_id, m.away_team_id)
    ),
    'lineups', jsonb_build_object(
      'home', private.team_lineup_json(p_match_id, m.home_team_id),
      'away', private.team_lineup_json(p_match_id, m.away_team_id)
    ),
    'lineup_override', m.lineup_override_reason,
    'lineup_control', private.has_lineup_control(p_match_id)
  );
end $$;

-- ── 14. Public line-ups (confirmed only, public-safe fields) ────────────────
create or replace function private.public_lineups(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', l.team_id,
      'formation', l.formation_code,
      'players', coalesce((select jsonb_agg(jsonb_build_object(
          'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role, 'position', s.position,
          'x', s.pitch_x, 'y', s.pitch_y, 'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
          'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off,
          'on_minute', s.on_minute, 'on_extra', s.on_extra, 'off_minute', s.off_minute, 'off_extra', s.off_extra,
          'sent_off', s.sent_off, 'booked', s.booked, 'goals', s.goals)
          order by s.role, s.sort_order)
        from private.lineup_player_states(l.id) s), '[]'::jsonb)
    ) order by (l.team_id = m.home_team_id) desc), '[]'::jsonb)
  from public.match_lineups l
  join public.matches m on m.id = l.match_id
  where l.match_id = p_match_id and l.status = 'CONFIRMED';
$$;

create or replace function public.public_match_feed(p_match_id uuid, p_after_seq bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches;
begin
  if not private.match_is_public(p_match_id) then
    return null;
  end if;
  select * into m from public.matches where id = p_match_id;
  return jsonb_build_object(
    'match', private.public_match_row(m),
    'events', coalesce((
      select jsonb_agg(private.public_event(e) order by e.seq)
      from public.match_events e where e.match_id = p_match_id and e.seq > coalesce(p_after_seq, 0)
    ), '[]'::jsonb),
    'voided_ids', coalesce((
      select jsonb_agg(e.id order by e.seq)
      from public.match_events e where e.match_id = p_match_id and e.voided_at is not null
    ), '[]'::jsonb),
    -- Always complete (small): clients replace their line-ups on every fetch.
    'lineups', private.public_lineups(p_match_id),
    'server_time', clock_timestamp()
  );
end $$;

-- ── 15. Admin read models ──────────────────────────────────────────────────
create or replace function public.admin_list_screenings(
  p_status public.screening_status default null, p_team_id uuid default null, p_season_id uuid default null,
  p_competition_id uuid default null, p_faculty_id uuid default null, p_department_id uuid default null,
  p_name text default null, p_student_id text default null, p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_sid text := private.normalise_student_id(p_student_id);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'counts', (select jsonb_object_agg(st, n) from (
        select s.status::text as st, count(*) as n from public.player_screenings s
        where (p_season_id is null or s.season_id = p_season_id) and (p_team_id is null or s.team_id = p_team_id)
        group by s.status) c),
    'rows', coalesce((select jsonb_agg(r.j order by r.sort1, r.sort2) from (
      select (s.status <> 'PENDING') as sort1, s.created_at as sort2, jsonb_build_object(
        'id', s.id, 'status', s.status, 'player_id', p.id, 'name', p.display_name,
        'student_id', pi.student_id,
        'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name, 'code', t.code),
        'season', jsonb_build_object('id', se.id, 'name', se.name),
        'competition', case when co.id is null then null else jsonb_build_object('id', co.id, 'name', co.short_name) end,
        'faculty', f.name, 'department', d.name,
        'reason', s.reason, 'decided_at', s.decided_at, 'screened_on', s.screened_on,
        'decided_by', (select display_name from public.profiles where id = s.screened_by),
        'created_at', s.created_at) as j
      from public.player_screenings s
      join public.players p on p.id = s.player_id
      join public.teams t on t.id = s.team_id
      join public.seasons se on se.id = s.season_id
      left join public.competitions co on co.id = s.competition_id
      left join public.player_identities pi on pi.player_id = p.id
      left join public.faculties f on f.id = p.faculty_id
      left join public.departments d on d.id = p.department_id
      where (p_status is null or s.status = p_status)
        and (p_team_id is null or s.team_id = p_team_id)
        and (p_season_id is null or s.season_id = p_season_id)
        and (p_competition_id is null or s.competition_id = p_competition_id or (s.competition_id is null and exists (
              select 1 from public.competition_entries ce join public.competitions cc on cc.id = ce.competition_id
              where ce.competition_id = p_competition_id and ce.team_id = s.team_id and cc.season_id = s.season_id)))
        and (p_faculty_id is null or p.faculty_id = p_faculty_id)
        and (p_department_id is null or p.department_id = p_department_id)
        and (v_name is null or p.display_name ilike '%' || v_name || '%')
        and (v_sid is null or pi.student_id_key like '%' || v_sid || '%')
      order by (s.status <> 'PENDING'), s.created_at
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) r), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_player_detail(p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found' using errcode = 'EK404';
  end if;
  return jsonb_build_object(
    'player', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'created_at', p.created_at, 'updated_at', p.updated_at,
        'faculty_id', p.faculty_id, 'department_id', p.department_id, 'faculty', f.name, 'department', d.name,
        'student_id', pi.student_id, 'registered_by', (select display_name from public.profiles where id = p.registered_by))
      from public.players p
      left join public.player_identities pi on pi.player_id = p.id
      left join public.faculties f on f.id = p.faculty_id
      left join public.departments d on d.id = p.department_id
      where p.id = p_player_id),
    'screenings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'reason', s.reason, 'notes', s.notes, 'screened_on', s.screened_on,
        'decided_at', s.decided_at, 'decided_by', (select display_name from public.profiles where id = s.screened_by),
        'created_at', s.created_at,
        'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name),
        'season', jsonb_build_object('id', se.id, 'name', se.name),
        'competition', case when co.id is null then null else jsonb_build_object('id', co.id, 'name', co.name) end,
        'history', coalesce((select jsonb_agg(jsonb_build_object(
            'from', dd.from_status, 'to', dd.to_status, 'reason', dd.reason, 'notes', dd.notes,
            'screened_on', dd.screened_on, 'at', dd.decided_at,
            'by', (select display_name from public.profiles where id = dd.decided_by)) order by dd.decided_at desc)
          from public.player_screening_decisions dd where dd.screening_id = s.id), '[]'::jsonb))
        order by se.starts_on desc, s.competition_id nulls first, s.created_at desc)
      from public.player_screenings s
      join public.teams t on t.id = s.team_id
      join public.seasons se on se.id = s.season_id
      left join public.competitions co on co.id = s.competition_id
      where s.player_id = p_player_id), '[]'::jsonb),
    'squads', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'squad_id', s.id, 'active', sp.active, 'shirt_number', sp.shirt_number, 'position', sp.position,
        'captain', sp.is_captain, 'joined_at', sp.joined_at, 'left_at', sp.left_at, 'left_reason', sp.left_reason,
        'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name),
        'season', jsonb_build_object('id', se.id, 'name', se.name),
        'eligibility', private.screening_status(sp.player_id, s.team_id, s.season_id, null))
        order by se.starts_on desc, sp.active desc)
      from public.squad_players sp
      join public.squads s on s.id = sp.squad_id
      join public.teams t on t.id = s.team_id
      join public.seasons se on se.id = s.season_id
      where sp.player_id = p_player_id), '[]'::jsonb),
    'lineups', coalesce((select jsonb_agg(jsonb_build_object(
        'match_id', m.id, 'scheduled_at', m.scheduled_at, 'match_status', m.status, 'lineup_status', l.status,
        'team', t.short_name, 'opponent', (select short_name from public.teams where id =
          case when m.home_team_id = l.team_id then m.away_team_id else m.home_team_id end),
        'role', lp.role, 'shirt_number', lp.shirt_number, 'captain', lp.is_captain,
        'eligibility', private.match_eligibility(m.id, l.team_id, lp.player_id))
        order by m.scheduled_at desc)
      from public.lineup_players lp
      join public.match_lineups l on l.id = lp.lineup_id
      join public.matches m on m.id = l.match_id
      join public.teams t on t.id = l.team_id
      where lp.player_id = p_player_id), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_list_players(
  p_name text default null, p_student_id text default null, p_team_id uuid default null, p_season_id uuid default null,
  p_faculty_id uuid default null, p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_name text := nullif(btrim(coalesce(p_name, '')), ''); v_sid text := private.normalise_student_id(p_student_id);
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(x.j order by x.n) from (
    select p.display_name as n, jsonb_build_object(
      'id', p.id, 'name', p.display_name, 'student_id', pi.student_id, 'faculty', f.name, 'department', d.name,
      'screenings', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'team', t.short_name,
          'season', se.name, 'competition', co.short_name) order by se.starts_on desc, s.competition_id nulls first)
        from public.player_screenings s join public.teams t on t.id = s.team_id join public.seasons se on se.id = s.season_id
        left join public.competitions co on co.id = s.competition_id
        where s.player_id = p.id and (p_season_id is null or s.season_id = p_season_id)), '[]'::jsonb),
      'squads', coalesce((select jsonb_agg(jsonb_build_object('team', t.short_name, 'season', se.name, 'shirt_number', sp.shirt_number))
        from public.squad_players sp join public.squads s on s.id = sp.squad_id join public.teams t on t.id = s.team_id
        join public.seasons se on se.id = s.season_id
        where sp.player_id = p.id and sp.active and (p_season_id is null or s.season_id = p_season_id)), '[]'::jsonb)) as j
    from public.players p
    left join public.player_identities pi on pi.player_id = p.id
    left join public.faculties f on f.id = p.faculty_id
    left join public.departments d on d.id = p.department_id
    where (v_name is null or p.display_name ilike '%' || v_name || '%')
      and (v_sid is null or pi.student_id_key like '%' || v_sid || '%')
      and (p_faculty_id is null or p.faculty_id = p_faculty_id)
      and (p_team_id is null or exists (select 1 from public.player_screenings s where s.player_id = p.id and s.team_id = p_team_id
             and (p_season_id is null or s.season_id = p_season_id)))
      and (p_season_id is null or p_team_id is not null or exists (select 1 from public.player_screenings s where s.player_id = p.id and s.season_id = p_season_id))
    order by p.display_name nulls last
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) x), '[]'::jsonb);
end $$;

/* Squad for one team + season with each member's live eligibility. */
create or replace function public.admin_squad(p_team_id uuid, p_season_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.squads;
begin
  perform private.require_admin();
  select * into s from public.squads where team_id = p_team_id and season_id = p_season_id;
  return jsonb_build_object(
    'squad', case when s.id is null then null else jsonb_build_object('id', s.id) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'player_id', sp.player_id, 'name', p.display_name, 'shirt_number', sp.shirt_number,
        'position', sp.position, 'captain', sp.is_captain, 'active', sp.active, 'joined_at', sp.joined_at,
        'left_at', sp.left_at, 'left_reason', sp.left_reason,
        'eligibility', private.screening_status(sp.player_id, s.team_id, s.season_id, null))
        order by sp.active desc, sp.shirt_number)
      from public.squad_players sp join public.players p on p.id = sp.player_id where sp.squad_id = s.id), '[]'::jsonb),
    -- CLEARED for this team + season and not yet in the squad: ready to add.
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('player_id', p.id, 'name', p.display_name,
        'conflict', private.team_conflict(p.id, p_team_id, p_season_id, null)) order by p.display_name)
      from public.player_screenings ps join public.players p on p.id = ps.player_id
      where ps.team_id = p_team_id and ps.season_id = p_season_id and ps.competition_id is null and ps.status = 'CLEARED'
        and not exists (select 1 from public.squad_players sp where sp.squad_id = s.id and sp.player_id = p.id)), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_match_detail(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches;
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  return jsonb_build_object(
    'state', private.canonical_state(p_match_id),
    'match', (select to_jsonb(x) || jsonb_build_object(
        'active_operator_name', (select display_name from public.profiles where id = x.active_operator_id),
        'lineup_override_by_name', (select display_name from public.profiles where id = x.lineup_override_by))
      from public.matches x where x.id = p_match_id),
    'periods', coalesce((select jsonb_agg(to_jsonb(p) order by p.period) from public.match_periods p where p.match_id = p_match_id), '[]'::jsonb),
    'recorders', coalesce((select jsonb_object_agg(e.id, pr.display_name)
      from public.match_events e join public.profiles pr on pr.id = e.recorded_by where e.match_id = p_match_id), '{}'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', a.user_id, 'role', a.role, 'active', a.active, 'assigned_at', a.assigned_at,
        'revoked_at', a.revoked_at, 'prep_completed_at', a.prep_completed_at,
        'display_name', pr.display_name, 'email', u.email) order by a.active desc, a.role)
      from public.operator_assignments a join public.profiles pr on pr.id = a.user_id join auth.users u on u.id = a.user_id
      where a.match_id = p_match_id), '[]'::jsonb),
    'lineups', jsonb_build_object(
      'home', private.team_lineup_json(p_match_id, m.home_team_id),
      'away', private.team_lineup_json(p_match_id, m.away_team_id)),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'at', a.created_at, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
        'actor', pr.display_name, 'before', a.before_state, 'after', a.after_state) order by a.created_at desc)
      from public.audit_log a left join public.profiles pr on pr.id = a.actor_id
      where a.match_id = p_match_id), '[]'::jsonb)
  );
end $$;

-- ── 16. Row level security and privileges ──────────────────────────────────
alter table public.player_identities enable row level security;
alter table public.player_identities force row level security;
alter table public.player_screenings enable row level security;
alter table public.player_screenings force row level security;
alter table public.player_screening_decisions enable row level security;
alter table public.player_screening_decisions force row level security;
alter table public.formations enable row level security;
alter table public.formations force row level security;
alter table public.match_lineups enable row level security;
alter table public.match_lineups force row level security;
alter table public.lineup_players enable row level security;
alter table public.lineup_players force row level security;

revoke all on public.player_identities, public.player_screenings, public.player_screening_decisions,
  public.formations, public.match_lineups, public.lineup_players from anon, authenticated;

-- Private identity + screening: ADMIN reads; every write is an audited RPC.
grant select on public.player_identities, public.player_screenings, public.player_screening_decisions to authenticated;
create policy "admins read identities" on public.player_identities for select to authenticated using (private.has_role('ADMIN'));
create policy "admins read screenings" on public.player_screenings for select to authenticated using (private.has_role('ADMIN'));
create policy "admins read screening decisions" on public.player_screening_decisions for select to authenticated using (private.has_role('ADMIN'));

-- Formations are harmless reference data.
grant select on public.formations to anon, authenticated;
create policy "formations are public" on public.formations for select to anon, authenticated using (true);

-- Line-ups: no anonymous table access at all (public reads go through
-- public_match_feed, which returns CONFIRMED line-ups only). ADMIN may read
-- the tables; operators use lineup_editor_state / operator_match_state.
grant select on public.match_lineups, public.lineup_players to authenticated;
create policy "admins read lineups" on public.match_lineups for select to authenticated using (private.has_role('ADMIN'));
create policy "admins read lineup players" on public.lineup_players for select to authenticated using (private.has_role('ADMIN'));

-- Players and squad memberships are now written only through the audited
-- RPCs above (eligibility integrity), never by direct table writes.
drop policy if exists "admins insert players" on public.players;
drop policy if exists "admins update players" on public.players;
drop policy if exists "admins delete players" on public.players;
drop policy if exists "admins insert squad_players" on public.squad_players;
drop policy if exists "admins update squad_players" on public.squad_players;
drop policy if exists "admins delete squad_players" on public.squad_players;
revoke insert, update, delete on public.players, public.squad_players from authenticated;
-- The RPCs write semantic audit entries; the generic row trigger would duplicate them.
drop trigger if exists audit_admin_change on public.players;
drop trigger if exists audit_admin_change on public.squad_players;

-- The kick-off override is internal: keep it out of anonymous column grants
-- (public.matches uses an explicit column list, so nothing to revoke).

-- Functions: nothing is executable unless granted below.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.public_match_feed(uuid, bigint), public.public_live_scores() to anon, authenticated;
grant execute on function
  public.start_match(uuid, uuid),
  public.end_period(uuid, uuid),
  public.start_period(uuid, uuid),
  public.pause_match(uuid, uuid, text),
  public.resume_match(uuid, uuid),
  public.set_stoppage(uuid, uuid, integer),
  public.record_event(uuid, uuid, text, uuid, integer, integer, uuid, uuid, timestamptz, boolean, jsonb),
  public.void_event(uuid, uuid, uuid, text),
  public.finalise_match(uuid, uuid, integer, integer),
  public.take_over_match(uuid, uuid),
  public.operator_match_state(uuid),
  public.update_assignment_prep(uuid, jsonb),
  public.admin_recompute_standings(uuid),
  public.admin_set_current_season(uuid),
  public.admin_create_match(uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz),
  public.admin_update_fixture(uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz),
  public.admin_set_match_outcome(uuid, public.match_status, text),
  public.admin_reschedule_match(uuid, timestamptz, text),
  public.admin_assign_operators(uuid, uuid, uuid),
  public.admin_clear_assignments(uuid),
  public.admin_void_event(uuid, uuid, text),
  public.admin_add_event(uuid, uuid, text, uuid, integer, integer, integer, uuid, uuid, text),
  public.admin_grant_role(uuid, text),
  public.admin_revoke_role(uuid, text),
  public.admin_set_staff_active(uuid, boolean),
  public.admin_list_staff(),
  public.admin_match_detail(uuid),
  public.admin_live_matches(),
  -- This phase
  public.admin_register_player(text, text, uuid, uuid, uuid, uuid, uuid, text),
  public.admin_update_player(uuid, text, text, uuid, uuid),
  public.admin_open_screening(uuid, uuid, uuid, uuid, text),
  public.admin_decide_screening(uuid, public.screening_status, text, text, date),
  public.admin_add_squad_player(uuid, uuid, integer, text, boolean),
  public.admin_update_squad_player(uuid, integer, text, boolean),
  public.admin_set_squad_player_active(uuid, boolean, text),
  public.admin_list_screenings(public.screening_status, uuid, uuid, uuid, uuid, uuid, text, text, integer),
  public.admin_player_detail(uuid),
  public.admin_list_players(text, text, uuid, uuid, uuid, integer),
  public.admin_squad(uuid, uuid),
  public.admin_correct_lineup(uuid, uuid, text, jsonb, text),
  public.admin_set_lineup_override(uuid, text),
  public.lineup_editor_state(uuid, uuid),
  public.save_lineup(uuid, uuid, text, jsonb),
  public.confirm_lineup(uuid, uuid),
  public.reopen_lineup(uuid, uuid, text)
to authenticated;
