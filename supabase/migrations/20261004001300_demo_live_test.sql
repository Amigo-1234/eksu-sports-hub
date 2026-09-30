-- DEMO / TEST matches controlled live from /op, with synthetic test participants.
--
-- Builds on 20261002001100 (demo showcase) without weakening official rules:
--   * Synthetic participants: demo_lineup_players.player_id may be NULL for a
--     test-only participant that exists ONLY in the demo layer (no players,
--     identity, screening or squad row). Their name must be obviously synthetic
--     (contains TEST or DEMO). Registered players can still be used as before.
--   * A demo/test match may be labelled TEST or DEMO (round + competition).
--   * record_event on a demo/test match takes that match's demo participant ids
--     (served to /op by operator_match_state) and stores them as
--     demo_player_id with player_id NULL. Official matches: unchanged path.
--   * Kick-off of a demo/test match needs complete demo test line-ups.
--   * Official line-ups can never be created for a demo/test match.
--   * canonical_state resolves demo shirts so the console timeline is complete.

-- ── 1. Synthetic, demo-layer-only participants ─────────────────────────────
alter table public.demo_lineup_players alter column player_id drop not null;
alter table public.demo_lineup_players add constraint demo_lineup_players_synthetic_named
  check (player_id is not null or display_name ~* '(test|demo)');

-- ── 2. TEST labels accepted alongside DEMO ─────────────────────────────────
create or replace function private.guard_demo_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_demo and not new.is_demo then
    raise exception 'A demo match stays a demo match' using errcode = 'EK409';
  end if;
  if new.is_demo and coalesce(new.round_label, '') !~* '(demo|test)' then
    raise exception 'A demo/test match must keep a visible DEMO or TEST label in its round' using errcode = 'EK422';
  end if;
  -- Demo competitions hold only demo matches (official standings stay clean).
  if not new.is_demo and exists (
    select 1 from public.matches x where x.competition_id = new.competition_id and x.is_demo and x.id <> new.id
  ) then
    raise exception 'This competition is a demo/test competition: it can only hold demo/test matches' using errcode = 'EK422';
  end if;
  return new;
end $$;

create or replace function private.guard_demo_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.name !~* '(demo|test)' and exists (select 1 from public.matches m where m.competition_id = new.id and m.is_demo) then
    raise exception 'A competition with demo/test matches must keep DEMO or TEST in its name' using errcode = 'EK422';
  end if;
  return new;
end $$;

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
    raise exception 'This match is already a demo/test match' using errcode = 'EK409';
  end if;
  select * into c from public.competitions where id = m.competition_id;
  if c.name !~* '(demo|test)' or coalesce(m.round_label, '') !~* '(demo|test)' then
    raise exception 'Label the competition and the round as DEMO or TEST first, so it cannot be mistaken for an official result'
      using errcode = 'EK422';
  end if;
  if exists (select 1 from public.matches x where x.competition_id = m.competition_id and x.id <> m.id and not x.is_demo) then
    raise exception 'The competition also holds official matches; use a dedicated DEMO/TEST competition' using errcode = 'EK422';
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

-- ── 3. No official line-ups on a demo/test match ───────────────────────────
create or replace function private.guard_lineup_not_demo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.matches m where m.id = new.match_id and m.is_demo) then
    raise exception 'This is a DEMO/TEST match: it uses demo test line-ups prepared by an admin, not official team sheets'
      using errcode = 'EK422';
  end if;
  return new;
end $$;
create trigger match_lineups_not_demo before insert on public.match_lineups
  for each row execute function private.guard_lineup_not_demo();

-- ── 4. Demo line-ups: registered players or synthetic test participants ────
create or replace function public.admin_demo_set_lineup(p_match_id uuid, p_team_id uuid, p_formation text, p_players jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_season uuid; v_before jsonb; p jsonb; i int := 0;
  v_starters int; v_gk int; v_caps int; v_player uuid; v_name text;
begin
  m := private.require_demo_match(p_match_id);
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_formation is null or p_formation !~ '^[0-9](-[0-9]){1,4}$' then
    raise exception 'Formation must look like 4-4-2' using errcode = 'EK422';
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
    v_player := nullif(p ->> 'player_id', '')::uuid;
    if v_player is not null then
      -- A registered player (name only; any screening status; nothing official changes).
      if not exists (select 1 from public.player_screenings s where s.player_id = v_player
                     and s.team_id = p_team_id and s.season_id = v_season) then
        raise exception 'Player % is not registered for this team this season', v_player using errcode = 'EK422';
      end if;
      select display_name into v_name from public.players where id = v_player;
    else
      -- A synthetic test participant: exists only in this demo line-up.
      v_name := nullif(btrim(coalesce(p ->> 'name', '')), '');
      if v_name is null or v_name !~* '(test|demo)' then
        raise exception 'Synthetic participants need an obviously synthetic name containing TEST or DEMO (got %)', coalesce(v_name, 'none')
          using errcode = 'EK422';
      end if;
    end if;
    insert into public.demo_lineup_players (match_id, team_id, player_id, display_name, shirt_number, role, position,
      pitch_x, pitch_y, is_captain, is_goalkeeper, sort_order)
    values (p_match_id, p_team_id, v_player, v_name,
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
    private.demo_public_lineups(p_match_id) || jsonb_build_object('detail', 'DEMO/TEST line-up (not an official team sheet)'));
  perform private.after_match_change(p_match_id, 'DEMO_LINEUP_SET');
  return private.demo_public_lineups(p_match_id);
end $$;

-- ── 5. Shared demo event rules (admin path and live /op path) ──────────────
create or replace function private.demo_check_event(
  p_match_id uuid, et public.event_types, d public.demo_lineup_players, r public.demo_lineup_players, p_at numeric
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
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
    if et.code in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'PENALTY_MISS', 'SUBSTITUTION') and not private.demo_on_pitch_at(p_match_id, d, p_at) then
      raise exception '% is not on the pitch', d.display_name using errcode = 'EK422';
    end if;
    if et.code = 'YELLOW_CARD' and exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and e.demo_player_id = d.id and e.type = 'YELLOW_CARD') then
      raise exception '% is already booked — record a second yellow', d.display_name using errcode = 'EK422';
    end if;
    if et.code = 'SECOND_YELLOW' and not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.voided_at is null
               and e.demo_player_id = d.id and e.type = 'YELLOW_CARD') then
      raise exception 'A second yellow needs an earlier yellow card' using errcode = 'EK422';
    end if;
  end if;
  if et.code = 'SUBSTITUTION' then
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
end $$;

-- Admin demo events: participants by registered player id or by participant id.
create or replace function public.admin_demo_add_event(
  p_match_id uuid, p_event_id uuid, p_type text, p_team_id uuid, p_period integer, p_minute integer,
  p_minute_extra integer, p_player_id uuid, p_related_player_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; et public.event_types; d public.demo_lineup_players; r public.demo_lineup_players;
  v_seq bigint; v_lo int; v_hi int;
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
  if p_player_id is not null then
    select * into d from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id
      and (player_id = p_player_id or id = p_player_id);
    if not found then
      raise exception 'That player is not in this team''s demo line-up' using errcode = 'EK422';
    end if;
  end if;
  if p_related_player_id is not null then
    select * into r from public.demo_lineup_players where match_id = p_match_id and team_id = p_team_id
      and (player_id = p_related_player_id or id = p_related_player_id);
    if not found then
      raise exception 'The player coming on is not in this team''s demo line-up' using errcode = 'EK422';
    end if;
  end if;
  perform private.demo_check_event(p_match_id, et, d, r, private.demo_instant(p_minute, p_minute_extra));

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    demo_player_id, demo_related_player_id, payload, recorded_by
  ) values (
    p_event_id, p_match_id, v_seq, p_type, p_period, p_minute, coalesce(p_minute_extra, 0), p_team_id, null, null,
    d.id, r.id, jsonb_build_object('demo', true, 'admin_correction', 'DEMO/TEST: ' || btrim(p_reason)), auth.uid()
  );
  perform private.after_correction(p_match_id);
  perform private.audit('DEMO_EVENT_ADDED', 'match_event', p_event_id, p_match_id, null, null,
    (select to_jsonb(x) from public.match_events x where x.id = p_event_id)
      || jsonb_build_object('detail', 'DEMO/TEST: ' || btrim(p_reason), 'demo_player', d.display_name, 'demo_related_player', r.display_name));
  perform private.after_match_change(p_match_id, 'DEMO_EVENT_ADDED');
  return private.canonical_state(p_match_id);
end $$;

-- ── 6. Operator console: demo test line-ups in the official shapes ─────────
create or replace function private.demo_team_lineup_json(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when l.match_id is null then null else jsonb_build_object(
    'status', 'CONFIRMED', 'formation', l.formation, 'confirmed_at', null, 'demo', true,
    'problems', '[]'::jsonb,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', s.participant_id, 'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role,
        'position', s.position, 'x', s.pitch_x, 'y', s.pitch_y, 'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
        'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off, 'sent_off', s.sent_off)
        order by s.role, s.sort_order)
      from private.demo_lineup_states(p_match_id, p_team_id) s), '[]'::jsonb)) end
  from (select 1) one
  left join public.demo_match_lineups l on l.match_id = p_match_id and l.team_id = p_team_id;
$$;

create or replace function private.demo_console_players(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id', d.id, 'shirt_number', d.shirt_number, 'name', d.display_name)
    order by d.shirt_number), '[]'::jsonb)
  from public.demo_lineup_players d where d.match_id = p_match_id and d.team_id = p_team_id;
$$;

create or replace function private.team_lineup_json(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.matches where id = p_match_id and is_demo)
    then private.demo_team_lineup_json(p_match_id, p_team_id)
    else (select case when l.id is null then null else jsonb_build_object(
    'status', l.status, 'formation', l.formation_code, 'confirmed_at', l.confirmed_at,
    'problems', to_jsonb(private.lineup_problems(l.id, 'confirm')),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', s.player_id, 'name', s.display_name, 'shirt_number', s.shirt_number, 'role', s.role,
        'position', s.position, 'x', s.pitch_x, 'y', s.pitch_y, 'captain', s.is_captain, 'goalkeeper', s.is_goalkeeper,
        'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off, 'sent_off', s.sent_off)
        order by s.role, s.sort_order)
      from private.lineup_player_states(l.id) s), '[]'::jsonb)) end
  from (select 1) one
  left join public.match_lineups l on l.match_id = p_match_id and l.team_id = p_team_id) end;
$$;

create or replace function private.console_players(p_match_id uuid, p_team_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.matches where id = p_match_id and is_demo)
    then private.demo_console_players(p_match_id, p_team_id)
    else (select case when private.confirmed_lineup(p_match_id, p_team_id) is not null then
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
  end) end;
$$;

-- ── 7. Kick-off, live events, console timeline ─────────────────────────────
create or replace function private.require_lineups_for_kickoff(m public.matches)
returns void language plpgsql stable security definer set search_path = '' as $$
declare t record; l public.match_lineups; v_problems text[];
begin
  if m.lineup_override_at is not null then
    return;
  end if;
  -- DEMO / TEST match: kick-off needs both demo test line-ups (7–11 starters, one goalkeeper).
  if m.is_demo then
    for t in select x.id, x.short_name from public.teams x where x.id in (m.home_team_id, m.away_team_id) loop
      if not exists (select 1 from public.demo_match_lineups dl where dl.match_id = m.id and dl.team_id = t.id)
         or (select count(*) from public.demo_lineup_players d where d.match_id = m.id and d.team_id = t.id and d.role = 'STARTER') not between 7 and 11
         or (select count(*) from public.demo_lineup_players d where d.match_id = m.id and d.team_id = t.id and d.role = 'STARTER' and d.is_goalkeeper) <> 1 then
        raise exception 'The % test line-up is missing or incomplete (7–11 starters and one goalkeeper)', t.short_name using errcode = 'EK409';
      end if;
    end loop;
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
  dp public.demo_lineup_players;
  dr public.demo_lineup_players;
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

  -- DEMO / TEST match: the players are that match's demo participants (ids from
  -- operator_match_state), never official players; screening and squads are
  -- not involved. Stored with player_id NULL. Official matches skip this.
  if m.is_demo then
    if p_player_id is not null then
      select * into dp from public.demo_lineup_players
      where id = p_player_id and match_id = p_match_id and team_id = p_team_id;
      if not found then
        raise exception 'That player is not in this team''s test line-up' using errcode = 'EK422';
      end if;
    end if;
    if p_related_player_id is not null then
      select * into dr from public.demo_lineup_players
      where id = p_related_player_id and match_id = p_match_id and team_id = p_team_id;
      if not found then
        raise exception 'The player coming on is not in this team''s test line-up' using errcode = 'EK422';
      end if;
    end if;
    perform private.demo_check_event(p_match_id, et, dp, dr, private.demo_instant(p_minute, p_minute_extra));
    v_seq := private.bump_seq(p_match_id);
    insert into public.match_events (
      id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
      demo_player_id, demo_related_player_id, payload, recorded_by, client_ts, client_queued
    ) values (
      p_event_id, p_match_id, v_seq, p_type, m.current_period, p_minute, coalesce(p_minute_extra, 0),
      p_team_id, null, null, dp.id, dr.id, coalesce(p_payload, '{}'::jsonb) || '{"demo": true}'::jsonb, auth.uid(),
      p_client_ts, coalesce(p_client_queued, false)
    );
    if et.scores_for is not null then
      perform private.recompute_score(p_match_id);
    end if;
    perform private.finish_command(p_match_id, p_event_id, 'RECORD_EVENT', 'EVENT_RECORDED', 'match_event', p_event_id, null);
    return private.canonical_state(p_match_id);
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

create or replace function private.canonical_state(p_match_id uuid, p_replayed boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'match', private.match_snapshot(p_match_id),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'seq', e.seq,
        'type', e.type,
        'period', e.period,
        'minute', e.minute,
        'minute_extra', e.minute_extra,
        'team_id', e.team_id,
        'player_id', coalesce(e.player_id, e.demo_player_id),
        'related_player_id', coalesce(e.related_player_id, e.demo_related_player_id),
        'shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_player_id)),
        'related_shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.related_player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_related_player_id)),
        'recorded_at', e.recorded_at,
        'client_ts', e.client_ts,
        'voided_at', e.voided_at,
        'void_reason', e.void_reason
      ) order by e.seq)
      from public.match_events e where e.match_id = p_match_id
    ), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'at', a.created_at, 'action', a.action,
        'detail', a.after_state -> 'detail'
      ) order by a.created_at)
      from public.audit_log a
      where a.match_id = p_match_id
        and a.action in ('MATCH_STARTED', 'PERIOD_ENDED', 'PERIOD_STARTED', 'MATCH_FINALISED',
                         'PAUSED', 'RESUMED', 'STOPPAGE_SET', 'OPERATOR_TAKEOVER')
    ), '[]'::jsonb),
    'server_time', clock_timestamp(),
    'replayed', p_replayed
  );
$$;


-- ── 8. Function privileges (nothing executable unless granted) ─────────────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
