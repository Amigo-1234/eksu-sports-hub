-- DEMO SHOWCASE matches: demonstration-only participants, events and stats.
--
-- Purpose: show the Sports Directorate a complete match experience (named
-- goals, line-ups, stats) with registered players whose real screening is
-- still PENDING — without touching the official eligibility pipeline.
--
-- Isolation guarantees (enforced here, tested in 06_demo_showcase):
--   * A demo match is flagged `matches.is_demo` by an audited ADMIN RPC. The
--     flag can never be cleared, and a demo match must stay visibly labelled
--     DEMO (round label + competition name). Demo competitions hold only demo
--     matches, so official competitions and standings are never affected.
--   * Demo participants live in their own tables (demo_match_lineups,
--     demo_lineup_players), scoped to one demo match. Screening, squads,
--     official line-ups and match_eligibility() never read them, so a demo
--     appearance cannot make anyone eligible, CLEARED or a squad member.
--   * Demo events are ordinary match_events with player_id NULL and a
--     demo_player_id pointing at a participant of the SAME demo match and
--     team (trigger-enforced). The score is still derived from non-voided
--     goal events by recompute_score().
--   * Demo statistics exist only for demo matches and are labelled as
--     demonstration data in the public feed.
--   * The new tables are FORCE RLS with no client grants: reads go through
--     public_match_feed (public-safe fields only), writes through ADMIN RPCs
--     that audit as DEMO_*.

-- ── 1. Demo flag on matches ────────────────────────────────────────────────
alter table public.matches
  add column is_demo boolean not null default false,
  add column demo_reason text,
  add column demo_marked_by uuid references public.profiles (id),
  add column demo_marked_at timestamptz,
  add constraint matches_demo_reason check (not is_demo or coalesce(btrim(demo_reason), '') <> '');

create or replace function private.guard_demo_match()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_demo and not new.is_demo then
    raise exception 'A demo match stays a demo match' using errcode = 'EK409';
  end if;
  if new.is_demo and coalesce(new.round_label, '') !~* 'demo' then
    raise exception 'A demo match must keep a visible DEMO label in its round' using errcode = 'EK422';
  end if;
  -- Demo competitions hold only demo matches (official standings stay clean).
  if not new.is_demo and exists (
    select 1 from public.matches x where x.competition_id = new.competition_id and x.is_demo and x.id <> new.id
  ) then
    raise exception 'This competition is a demo competition: it can only hold demo matches' using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger matches_guard_demo before insert or update of is_demo, round_label, competition_id on public.matches
  for each row execute function private.guard_demo_match();

create or replace function private.guard_demo_competition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name !~* 'demo' and exists (select 1 from public.matches m where m.competition_id = new.id and m.is_demo) then
    raise exception 'A competition with demo matches must keep DEMO in its name' using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger competitions_guard_demo before update of name on public.competitions
  for each row execute function private.guard_demo_competition();

-- ── 2. Demo participants (one demo match only) ─────────────────────────────
create table public.demo_match_lineups (
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  formation text not null check (formation ~ '^[0-9](-[0-9]){1,4}$'),
  updated_at timestamptz not null default now(),
  primary key (match_id, team_id)
);

create table public.demo_lineup_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  team_id uuid not null,
  -- Source registration (name only). Never implies screening or eligibility.
  player_id uuid not null references public.players (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  shirt_number smallint not null check (shirt_number between 1 and 99),
  role public.lineup_role not null,
  "position" text check ("position" is null or char_length("position") between 1 and 4),
  pitch_x numeric(5, 2) check (pitch_x between 0 and 100),
  pitch_y numeric(5, 2) check (pitch_y between 0 and 100),
  is_captain boolean not null default false,
  is_goalkeeper boolean not null default false,
  sort_order smallint not null default 0,
  foreign key (match_id, team_id) references public.demo_match_lineups (match_id, team_id) on delete cascade,
  unique (match_id, team_id, shirt_number),
  unique (match_id, player_id),
  check (role = 'STARTER' or (pitch_x is null and pitch_y is null))
);
create index demo_lineup_players_player_idx on public.demo_lineup_players (player_id);

create table public.demo_match_stats (
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  possession smallint not null check (possession between 0 and 100),
  shots smallint not null check (shots between 0 and 99),
  shots_on_target smallint not null check (shots_on_target between 0 and 99),
  corners smallint not null check (corners between 0 and 99),
  fouls smallint not null check (fouls between 0 and 99),
  updated_at timestamptz not null default now(),
  primary key (match_id, team_id),
  check (shots_on_target <= shots)
);

-- Every demo row must belong to a demo match and one of its two teams.
create or replace function private.guard_demo_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.matches m
    where m.id = new.match_id and m.is_demo and new.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'Demo data can only be attached to a team of a DEMO SHOWCASE match' using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger demo_match_lineups_guard before insert or update on public.demo_match_lineups
  for each row execute function private.guard_demo_row();
create trigger demo_lineup_players_guard before insert or update on public.demo_lineup_players
  for each row execute function private.guard_demo_row();
create trigger demo_match_stats_guard before insert or update on public.demo_match_stats
  for each row execute function private.guard_demo_row();

-- ── 3. Demo events ─────────────────────────────────────────────────────────
alter table public.match_events
  add column demo_player_id uuid references public.demo_lineup_players (id) on delete restrict,
  add column demo_related_player_id uuid references public.demo_lineup_players (id) on delete restrict,
  add constraint match_events_demo_or_official check (
    (demo_player_id is null and demo_related_player_id is null)
    or (player_id is null and related_player_id is null)
  );

create or replace function private.guard_demo_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.demo_player_id is null and new.demo_related_player_id is null then
    return new;
  end if;
  if not exists (select 1 from public.matches m where m.id = new.match_id and m.is_demo) then
    raise exception 'Demo participants can only appear in a DEMO SHOWCASE match' using errcode = 'EK422';
  end if;
  if exists (
    select 1 from public.demo_lineup_players d
    where d.id in (new.demo_player_id, new.demo_related_player_id)
      and (d.match_id <> new.match_id or d.team_id <> new.team_id)
  ) then
    raise exception 'That demo participant belongs to another match or team' using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger match_events_guard_demo before insert or update of demo_player_id, demo_related_player_id, match_id, team_id
  on public.match_events for each row execute function private.guard_demo_event();

-- ── 4. RLS: no direct client access to demo tables ─────────────────────────
alter table public.demo_match_lineups enable row level security;
alter table public.demo_match_lineups force row level security;
alter table public.demo_lineup_players enable row level security;
alter table public.demo_lineup_players force row level security;
alter table public.demo_match_stats enable row level security;
alter table public.demo_match_stats force row level security;
revoke all on public.demo_match_lineups, public.demo_lineup_players, public.demo_match_stats from public, anon, authenticated;
-- demo_player_id / demo_related_player_id are internal: public.match_events uses
-- an explicit column grant list, so they stay unreadable by clients.

-- ── 5. Derived demo state ──────────────────────────────────────────────────
-- Sortable instant for (minute, stoppage) within a match.
create or replace function private.demo_instant(p_minute integer, p_extra integer)
returns numeric language sql immutable set search_path = '' as $$
  select p_minute + coalesce(p_extra, 0) / 100.0;
$$;

/*
 * Demo participants with their match state, derived from the demo line-up
 * plus non-voided demo events (same semantics as lineup_player_states).
 */
create or replace function private.demo_lineup_states(p_match_id uuid, p_team_id uuid)
returns table (
  participant_id uuid, shirt_number smallint, role public.lineup_role, "position" text,
  pitch_x numeric, pitch_y numeric, is_captain boolean, is_goalkeeper boolean, sort_order smallint,
  display_name text, subbed_on boolean, subbed_off boolean, sent_off boolean, booked boolean, goals integer,
  on_field boolean, on_minute smallint, on_extra smallint, off_minute smallint, off_extra smallint
) language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.* from public.match_events e
    where e.match_id = p_match_id and e.team_id = p_team_id and e.voided_at is null
  )
  select d.id, d.shirt_number, d.role, d.position, d.pitch_x, d.pitch_y, d.is_captain, d.is_goalkeeper,
    d.sort_order, d.display_name,
    s_on.id is not null, s_off.id is not null,
    exists (select 1 from ev where ev.type in ('RED_CARD', 'SECOND_YELLOW') and ev.demo_player_id = d.id),
    exists (select 1 from ev where ev.type = 'YELLOW_CARD' and ev.demo_player_id = d.id),
    (select count(*)::int from ev where ev.type in ('GOAL', 'PENALTY_GOAL') and ev.demo_player_id = d.id),
    (d.role = 'STARTER' or s_on.id is not null) and s_off.id is null
      and not exists (select 1 from ev where ev.type in ('RED_CARD', 'SECOND_YELLOW') and ev.demo_player_id = d.id),
    s_on.minute, s_on.minute_extra, s_off.minute, s_off.minute_extra
  from public.demo_lineup_players d
  left join lateral (select ev.id, ev.minute, ev.minute_extra from ev
    where ev.type = 'SUBSTITUTION' and ev.demo_related_player_id = d.id order by ev.seq limit 1) s_on on true
  left join lateral (select ev.id, ev.minute, ev.minute_extra from ev
    where ev.type = 'SUBSTITUTION' and ev.demo_player_id = d.id order by ev.seq limit 1) s_off on true
  where d.match_id = p_match_id and d.team_id = p_team_id;
$$;

-- Public line-ups of a demo match (same shape as public_lineups; no ids).
create or replace function private.demo_public_lineups(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', l.team_id,
      'formation', l.formation,
      'demo', true,
      'players', coalesce((select jsonb_agg(jsonb_build_object(
          'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role, 'position', s.position,
          'x', s.pitch_x, 'y', s.pitch_y, 'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
          'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off,
          'on_minute', s.on_minute, 'on_extra', s.on_extra, 'off_minute', s.off_minute, 'off_extra', s.off_extra,
          'sent_off', s.sent_off, 'booked', s.booked, 'goals', s.goals)
          order by s.role, s.sort_order, s.shirt_number)
        from private.demo_lineup_states(l.match_id, l.team_id) s), '[]'::jsonb)
    ) order by (l.team_id = m.home_team_id) desc), '[]'::jsonb)
  from public.demo_match_lineups l
  join public.matches m on m.id = l.match_id and m.is_demo
  where l.match_id = p_match_id;
$$;

-- Demo statistics (both teams or nothing); cards are derived from the events.
create or replace function private.demo_stats_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with m as (select * from public.matches where id = p_match_id and is_demo),
  side as (
    select t.side, t.team_id, s.possession, s.shots, s.shots_on_target, s.corners, s.fouls
    from m cross join lateral (values ('home', m.home_team_id), ('away', m.away_team_id)) t(side, team_id)
    left join public.demo_match_stats s on s.match_id = m.id and s.team_id = t.team_id
  )
  select case when (select count(*) from side where possession is not null) = 2 then jsonb_build_object(
    'demo', true,
    'note', 'Demonstration statistics for this DEMO SHOWCASE match — not officially collected EKSU statistics.',
    'home', (select to_jsonb(x) from (select possession, shots, shots_on_target, corners, fouls from side where side = 'home') x),
    'away', (select to_jsonb(x) from (select possession, shots, shots_on_target, corners, fouls from side where side = 'away') x)
  ) || jsonb_build_object(
    'cards', (select jsonb_object_agg(side.side, jsonb_build_object(
        'yellow', (select count(*) from public.match_events e where e.match_id = p_match_id and e.team_id = side.team_id
                   and e.voided_at is null and e.type = 'YELLOW_CARD'),
        'red', (select count(*) from public.match_events e where e.match_id = p_match_id and e.team_id = side.team_id
                and e.voided_at is null and e.type in ('RED_CARD', 'SECOND_YELLOW'))))
      from side)
  ) end;
$$;

-- ── 6. Public surface: demo names on events, demo line-ups, demo stats ─────
create or replace function private.public_match_row(m public.matches)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'status', m.status, 'seq', m.seq,
    'home_score', m.home_score, 'away_score', m.away_score,
    'scheduled_at', m.scheduled_at, 'status_note', m.status_note,
    'started_at', m.started_at, 'finished_at', m.finished_at,
    'current_period', m.current_period,
    'period_started_at', m.period_started_at, 'period_ended_at', m.period_ended_at,
    'period_offset_seconds', m.period_offset_seconds, 'clock_running', m.clock_running,
    'paused_at', m.paused_at, 'accumulated_pause_seconds', m.accumulated_pause_seconds,
    'stoppage_seconds', m.stoppage_seconds,
    'is_demo', m.is_demo
  );
$$;

create or replace function private.public_event(e public.match_events)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'seq', e.seq, 'type', e.type, 'period', e.period,
    'minute', e.minute, 'minute_extra', e.minute_extra, 'team_id', e.team_id,
    'shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.player_id),
      (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_player_id)),
    'related_shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.related_player_id),
      (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_related_player_id)),
    'player_name', coalesce((select p.display_name from public.players p where p.id = e.player_id),
      (select d.display_name from public.demo_lineup_players d where d.id = e.demo_player_id)),
    'related_player_name', coalesce((select p.display_name from public.players p where p.id = e.related_player_id),
      (select d.display_name from public.demo_lineup_players d where d.id = e.demo_related_player_id)),
    'voided', e.voided_at is not null
  );
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
    -- A demo match shows its demo team sheets, never official ones.
    'lineups', case when m.is_demo then private.demo_public_lineups(p_match_id) else private.public_lineups(p_match_id) end,
    'stats', case when m.is_demo then private.demo_stats_json(p_match_id) end,
    'server_time', clock_timestamp()
  );
end $$;

-- ── 7. ADMIN RPCs (audited as DEMO_*) ──────────────────────────────────────
create or replace function private.require_demo_match(p_match_id uuid)
returns public.matches language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if not m.is_demo then
    raise exception 'Only a DEMO SHOWCASE match can hold demo data' using errcode = 'EK422';
  end if;
  return m;
end $$;

/* Flag a match as a DEMO SHOWCASE (irreversible). */
create or replace function public.admin_mark_demo_match(p_match_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; c public.competitions; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_admin();
  if v_reason is null then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.is_demo then
    raise exception 'This match is already a DEMO SHOWCASE match' using errcode = 'EK409';
  end if;
  select * into c from public.competitions where id = m.competition_id;
  if c.name !~* 'demo' or coalesce(m.round_label, '') !~* 'demo' then
    raise exception 'Label the competition and the round as DEMO first, so it cannot be mistaken for an official result'
      using errcode = 'EK422';
  end if;
  if exists (select 1 from public.matches x where x.competition_id = m.competition_id and x.id <> m.id and not x.is_demo) then
    raise exception 'The competition also holds official matches; use a dedicated DEMO competition' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.match_lineups where match_id = p_match_id)
     or exists (select 1 from public.match_events where match_id = p_match_id and voided_at is null and (player_id is not null or related_player_id is not null)) then
    raise exception 'The match already has official line-ups or player events' using errcode = 'EK409';
  end if;
  update public.matches set is_demo = true, demo_reason = v_reason, demo_marked_by = auth.uid(), demo_marked_at = now()
  where id = p_match_id;
  perform private.audit('DEMO_MATCH_MARKED', 'match', p_match_id, p_match_id, null,
    jsonb_build_object('is_demo', false), jsonb_build_object('is_demo', true, 'detail', v_reason));
  perform private.after_match_change(p_match_id, 'DEMO_MATCH_MARKED');
end $$;

/*
 * Replace one team's demo line-up. p_players: [{player_id, shirt_number, role,
 * position, x, y, captain, goalkeeper}]. Players must be registered for that
 * team (any screening status: this is demonstration data and does not touch
 * screening, squads or official line-ups).
 */
create or replace function public.admin_demo_set_lineup(p_match_id uuid, p_team_id uuid, p_formation text, p_players jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_season uuid; v_before jsonb; p jsonb; i int := 0;
  v_starters int; v_gk int; v_caps int;
begin
  m := private.require_demo_match(p_match_id);
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_formation is null or p_formation !~ '^[0-9](-[0-9]){1,4}$' then
    raise exception 'Formation must look like 3-3-2' using errcode = 'EK422';
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) = 0 then
    raise exception 'Name at least one player' using errcode = 'EK422';
  end if;
  select season_id into v_season from public.competitions where id = m.competition_id;
  select count(*) filter (where x ->> 'role' = 'STARTER'),
         count(*) filter (where x ->> 'role' = 'STARTER' and coalesce((x ->> 'goalkeeper')::boolean, false)),
         count(*) filter (where coalesce((x ->> 'captain')::boolean, false))
    into v_starters, v_gk, v_caps from jsonb_array_elements(p_players) x;
  if v_starters < 7 or v_starters > 11 then
    raise exception 'A demo line-up needs 7–11 starters (got %)', v_starters using errcode = 'EK422';
  end if;
  if v_gk <> 1 then
    raise exception 'Exactly one starting goalkeeper is required' using errcode = 'EK422';
  end if;
  if v_caps > 1 then
    raise exception 'Only one captain' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.match_events e join public.demo_lineup_players d on d.id in (e.demo_player_id, e.demo_related_player_id)
             where e.match_id = p_match_id and d.team_id = p_team_id and e.voided_at is null) then
    raise exception 'Void this team''s demo events before replacing its demo line-up' using errcode = 'EK409';
  end if;

  v_before := private.demo_public_lineups(p_match_id);
  delete from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id
    and not exists (select 1 from public.match_events e where e.demo_player_id = demo_lineup_players.id or e.demo_related_player_id = demo_lineup_players.id);
  if exists (select 1 from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id) then
    raise exception 'Voided demo events still reference this line-up; it can no longer be replaced' using errcode = 'EK409';
  end if;
  insert into public.demo_match_lineups (match_id, team_id, formation) values (p_match_id, p_team_id, p_formation)
  on conflict (match_id, team_id) do update set formation = excluded.formation, updated_at = now();

  for p in select * from jsonb_array_elements(p_players) loop
    i := i + 1;
    if not exists (select 1 from public.player_screenings s where s.player_id = (p ->> 'player_id')::uuid
                   and s.team_id = p_team_id and s.season_id = v_season) then
      raise exception 'Player % is not registered for this team this season', p ->> 'player_id' using errcode = 'EK422';
    end if;
    insert into public.demo_lineup_players (match_id, team_id, player_id, display_name, shirt_number, role, position,
      pitch_x, pitch_y, is_captain, is_goalkeeper, sort_order)
    values (p_match_id, p_team_id, (p ->> 'player_id')::uuid,
      (select display_name from public.players where id = (p ->> 'player_id')::uuid),
      (p ->> 'shirt_number')::smallint, (p ->> 'role')::public.lineup_role, nullif(p ->> 'position', ''),
      case when p ->> 'role' = 'STARTER' then (p ->> 'x')::numeric end,
      case when p ->> 'role' = 'STARTER' then (p ->> 'y')::numeric end,
      coalesce((p ->> 'captain')::boolean, false), coalesce((p ->> 'goalkeeper')::boolean, false), i);
  end loop;
  if exists (select 1 from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id
             and role = 'STARTER' and (pitch_x is null or pitch_y is null)) then
    raise exception 'Every starter needs a pitch position' using errcode = 'EK422';
  end if;

  perform private.bump_seq(p_match_id);
  perform private.audit('DEMO_LINEUP_SET', 'match', p_match_id, p_match_id, null, v_before,
    private.demo_public_lineups(p_match_id) || jsonb_build_object('detail', 'DEMO SHOWCASE line-up (not an official team sheet)'));
  perform private.after_match_change(p_match_id, 'DEMO_LINEUP_SET');
  return private.demo_public_lineups(p_match_id);
end $$;

-- Is a demo participant on the pitch at (minute, extra)? Order-aware.
create or replace function private.demo_on_pitch_at(p_match_id uuid, d public.demo_lineup_players, p_at numeric)
returns boolean language sql stable security definer set search_path = '' as $$
  select (d.role = 'STARTER' or exists (
      select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null and e.type = 'SUBSTITUTION'
        and e.demo_related_player_id = d.id and private.demo_instant(e.minute, e.minute_extra) <= p_at))
    and not exists (
      select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
        and e.demo_player_id = d.id and private.demo_instant(e.minute, e.minute_extra) < p_at
        and e.type in ('SUBSTITUTION', 'RED_CARD', 'SECOND_YELLOW'));
$$;

/*
 * Add a demo event naming demo participants (by their registered player id).
 * Stored with player_id NULL: the official player history is untouched.
 */
create or replace function public.admin_demo_add_event(
  p_match_id uuid, p_event_id uuid, p_type text, p_team_id uuid, p_period integer, p_minute integer,
  p_minute_extra integer, p_player_id uuid, p_related_player_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; et public.event_types; d public.demo_lineup_players; r public.demo_lineup_players;
  v_seq bigint; v_at numeric; v_lo int; v_hi int;
begin
  m := private.require_demo_match(p_match_id);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  if p_event_id is null then
    raise exception 'Event id is required' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.match_events where id = p_event_id) then
    if exists (select 1 from public.match_events where id = p_event_id and match_id = p_match_id) then
      return private.canonical_state(p_match_id, true);
    end if;
    raise exception 'Event id % belongs to a different match', p_event_id using errcode = 'EK422';
  end if;
  if m.status in ('SCHEDULED', 'POSTPONED', 'CANCELLED') then
    raise exception 'The match has not been played' using errcode = 'EK409';
  end if;
  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  v_lo := case p_period when 1 then 0 when 2 then 45 end;
  v_hi := case p_period when 1 then 45 when 2 then 90 end;
  if v_lo is null or p_minute is null or p_minute < v_lo or p_minute > v_hi
     or coalesce(p_minute_extra, 0) < 0 or coalesce(p_minute_extra, 0) > 60
     or (coalesce(p_minute_extra, 0) > 0 and p_minute <> v_hi) then
    raise exception 'Minute %+% is not valid for period %', p_minute, coalesce(p_minute_extra, 0), p_period using errcode = 'EK422';
  end if;
  v_at := private.demo_instant(p_minute, p_minute_extra);

  if p_player_id is not null then
    select * into d from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id and player_id = p_player_id;
    if not found then
      raise exception 'That player is not in this team''s demo line-up' using errcode = 'EK422';
    end if;
  end if;
  if p_related_player_id is not null then
    select * into r from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id and player_id = p_related_player_id;
    if not found then
      raise exception 'The player coming on is not in this team''s demo line-up' using errcode = 'EK422';
    end if;
  end if;
  if et.requires_player and d.id is null then
    raise exception '% requires a player', et.name using errcode = 'EK422';
  end if;
  if et.requires_related_player and r.id is null then
    raise exception '% requires the player coming on', et.name using errcode = 'EK422';
  end if;
  if not et.requires_related_player and r.id is not null then
    raise exception '% does not take a second player', et.name using errcode = 'EK422';
  end if;
  if d.id is not null then
    if exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and e.demo_player_id = d.id and e.type in ('RED_CARD', 'SECOND_YELLOW')) then
      raise exception '% has already been sent off', d.display_name using errcode = 'EK422';
    end if;
    if p_type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'PENALTY_MISS', 'SUBSTITUTION') and not private.demo_on_pitch_at(p_match_id, d, v_at) then
      raise exception '% is not on the pitch at %''', d.display_name, p_minute using errcode = 'EK422';
    end if;
    if p_type = 'YELLOW_CARD' and exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and e.demo_player_id = d.id and e.type = 'YELLOW_CARD') then
      raise exception '% is already booked — record a second yellow', d.display_name using errcode = 'EK422';
    end if;
    if p_type = 'SECOND_YELLOW' and not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and e.demo_player_id = d.id and e.type = 'YELLOW_CARD') then
      raise exception 'A second yellow needs an earlier yellow card' using errcode = 'EK422';
    end if;
  end if;
  if p_type = 'SUBSTITUTION' then
    if r.id = d.id then
      raise exception 'Player on and player off must be different' using errcode = 'EK422';
    end if;
    if r.role <> 'SUBSTITUTE' then
      raise exception '% started the match, not on the bench', r.display_name using errcode = 'EK422';
    end if;
    if exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and (e.demo_related_player_id = r.id or (e.demo_player_id = r.id and e.type in ('RED_CARD', 'SECOND_YELLOW')))) then
      raise exception '% cannot come on', r.display_name using errcode = 'EK422';
    end if;
  end if;

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    demo_player_id, demo_related_player_id, payload, recorded_by
  ) values (
    p_event_id, p_match_id, v_seq, p_type, p_period, p_minute, coalesce(p_minute_extra, 0), p_team_id, null, null,
    d.id, r.id, jsonb_build_object('demo', true, 'admin_correction', 'DEMO SHOWCASE: ' || btrim(p_reason)), auth.uid()
  );
  perform private.after_correction(p_match_id);
  perform private.audit('DEMO_EVENT_ADDED', 'match_event', p_event_id, p_match_id, null, null,
    (select to_jsonb(x) from public.match_events x where x.id = p_event_id)
      || jsonb_build_object('detail', 'DEMO SHOWCASE: ' || btrim(p_reason), 'demo_player', d.display_name, 'demo_related_player', r.display_name));
  perform private.after_match_change(p_match_id, 'DEMO_EVENT_ADDED');
  return private.canonical_state(p_match_id);
end $$;

/* Demonstration statistics for one team of a demo match. */
create or replace function public.admin_demo_set_stats(
  p_match_id uuid, p_team_id uuid, p_possession integer, p_shots integer, p_shots_on_target integer,
  p_corners integer, p_fouls integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.require_demo_match(p_match_id);
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_shots_on_target > p_shots then
    raise exception 'Shots on target cannot exceed shots' using errcode = 'EK422';
  end if;
  v_before := private.demo_stats_json(p_match_id);
  insert into public.demo_match_stats (match_id, team_id, possession, shots, shots_on_target, corners, fouls)
  values (p_match_id, p_team_id, p_possession, p_shots, p_shots_on_target, p_corners, p_fouls)
  on conflict (match_id, team_id) do update set possession = excluded.possession, shots = excluded.shots,
    shots_on_target = excluded.shots_on_target, corners = excluded.corners, fouls = excluded.fouls, updated_at = now();
  if (select count(*) from public.demo_match_stats where match_id = p_match_id) = 2
     and (select sum(possession) from public.demo_match_stats where match_id = p_match_id) <> 100 then
    raise exception 'Possession of both teams must add up to 100%%' using errcode = 'EK422';
  end if;
  perform private.bump_seq(p_match_id);
  perform private.audit('DEMO_STATS_SET', 'match', p_match_id, p_match_id, null, v_before,
    coalesce(private.demo_stats_json(p_match_id), '{}'::jsonb)
      || jsonb_build_object('team_id', p_team_id, 'detail', 'DEMO SHOWCASE statistics (not officially collected)'));
  perform private.after_match_change(p_match_id, 'DEMO_STATS_SET');
  return private.demo_stats_json(p_match_id);
end $$;

-- ── 8. Function privileges (nothing executable unless granted) ─────────────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on function
  public.admin_mark_demo_match(uuid, text),
  public.admin_demo_set_lineup(uuid, uuid, text, jsonb),
  public.admin_demo_add_event(uuid, uuid, text, uuid, integer, integer, integer, uuid, uuid, text),
  public.admin_demo_set_stats(uuid, uuid, integer, integer, integer, integer, integer),
  public.public_match_feed(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.public_match_feed(uuid, bigint) to anon, authenticated;
grant execute on function
  public.admin_mark_demo_match(uuid, text),
  public.admin_demo_set_lineup(uuid, uuid, text, jsonb),
  public.admin_demo_add_event(uuid, uuid, text, uuid, integer, integer, integer, uuid, uuid, text),
  public.admin_demo_set_stats(uuid, uuid, integer, integer, integer, integer, integer)
to authenticated;
