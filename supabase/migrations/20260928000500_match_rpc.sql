-- Authoritative match write path.
--
-- Every match-changing RPC follows the same shape:
--   1. private.begin_command(): auth.uid(), staff role, active assignment,
--      row lock (SELECT ... FOR UPDATE), idempotency replay, active operator
--   2. state-machine check for the command
--   3. validation of teams/players against the match context
--   4. the mutation (single transaction), canonical score recompute,
--      sequence bump
--   5. private.finish_command(): idempotency ledger + audit + change hook
--   6. return private.canonical_state()
--
-- Error codes (SQLSTATE, surfaced to clients as error.code):
--   EK401 not signed in · EK403 not allowed · EK404 not found
--   EK409 not allowed in the current match state · EK422 invalid input

-- ── Snapshots and canonical state ──────────────────────────────────────────

create or replace function private.match_snapshot(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'status', m.status,
    'home_team_id', m.home_team_id,
    'away_team_id', m.away_team_id,
    'home_score', m.home_score,
    'away_score', m.away_score,
    'seq', m.seq,
    'current_period', m.current_period,
    'period_started_at', m.period_started_at,
    'period_ended_at', m.period_ended_at,
    'period_offset_seconds', m.period_offset_seconds,
    'clock_running', m.clock_running,
    'paused_at', m.paused_at,
    'accumulated_pause_seconds', m.accumulated_pause_seconds,
    'stoppage_seconds', m.stoppage_seconds,
    'started_at', m.started_at,
    'finished_at', m.finished_at,
    'active_operator_id', m.active_operator_id
  )
  from public.matches m where m.id = p_match_id;
$$;

-- Shirt number of a player in a team's squad for the match's season.
create or replace function private.shirt_for(p_match_id uuid, p_team_id uuid, p_player_id uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select sp.shirt_number
  from public.matches m
  join public.competitions c on c.id = m.competition_id
  join public.squads s on s.team_id = p_team_id and s.season_id = c.season_id
  join public.squad_players sp on sp.squad_id = s.id and sp.player_id = p_player_id
  where m.id = p_match_id;
$$;

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
        'player_id', e.player_id,
        'related_player_id', e.related_player_id,
        'shirt_number', private.shirt_for(e.match_id, e.team_id, e.player_id),
        'related_shirt_number', private.shirt_for(e.match_id, e.team_id, e.related_player_id),
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

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_match_id uuid,
  p_intent_id uuid, p_before jsonb, p_after jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, match_id, intent_id, before_state, after_state)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_match_id, p_intent_id, p_before, p_after);
$$;

-- Single hook for change fan-out. Today: pg_notify. Next phase: broadcast to
-- Realtime topics `match:{id}` and `scores:live` from here — no RPC changes.
create or replace function private.after_match_change(p_match_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match_id;
  perform pg_notify('match_changes', jsonb_build_object(
    'match_id', m.id, 'seq', m.seq, 'kind', p_kind, 'status', m.status,
    'home_score', m.home_score, 'away_score', m.away_score
  )::text);
end $$;

-- ── Command scaffolding ────────────────────────────────────────────────────

/*
 * Authorise and lock (control is checked separately by require_control,
 * after the state check, so state errors are reported first). Returns the locked match row, or a row with id NULL
 * when p_intent_id was already processed (the caller returns canonical state).
 */
create or replace function private.begin_command(
  p_match_id uuid, p_intent_id uuid, p_command text
) returns public.matches language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.matches;
  v_intent public.match_intents;
begin
  if v_uid is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if p_match_id is null or p_intent_id is null then
    raise exception 'Match and intent are required' using errcode = 'EK422';
  end if;
  if not private.is_staff() then
    raise exception 'Your account is not an operator' using errcode = 'EK403';
  end if;
  -- Assignment check BEFORE revealing whether the match exists.
  if not exists (
    select 1 from public.operator_assignments a
    where a.match_id = p_match_id and a.user_id = v_uid and a.active
  ) then
    raise exception 'Match not found or not assigned to you' using errcode = 'EK403';
  end if;

  -- Serialises every command for this match (sequence + state transitions).
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;

  select * into v_intent from public.match_intents where id = p_intent_id;
  if found then
    if v_intent.match_id <> p_match_id or v_intent.command <> p_command then
      raise exception 'Intent id % was already used for a different command', p_intent_id using errcode = 'EK422';
    end if;
    m.id := null; -- replay
    return m;
  end if;

  return m;
end $$;

-- Only the operator currently in control may make live changes.
create or replace function private.require_control(m public.matches)
returns void language plpgsql stable set search_path = '' as $$
begin
  if m.active_operator_id is distinct from auth.uid() then
    raise exception 'Another operator is in control of this match. Take over to continue.' using errcode = 'EK403';
  end if;
end $$;

create or replace function private.require_status(m public.matches, p_allowed public.match_status[], p_action text)
returns void language plpgsql set search_path = '' as $$
begin
  if not (m.status = any (p_allowed)) then
    raise exception '% is not allowed while the match is %', p_action, m.status using errcode = 'EK409';
  end if;
end $$;

create or replace function private.bump_seq(p_match_id uuid)
returns bigint language sql security definer set search_path = '' as $$
  update public.matches set seq = seq + 1 where id = p_match_id returning seq;
$$;

create or replace function private.finish_command(
  p_match_id uuid, p_intent_id uuid, p_command text, p_action text,
  p_entity_type text, p_entity_id uuid, p_before jsonb, p_detail jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_seq bigint;
begin
  select seq into v_seq from public.matches where id = p_match_id;
  insert into public.match_intents (id, match_id, command, actor_id, match_seq)
  values (p_intent_id, p_match_id, p_command, auth.uid(), v_seq);
  perform private.audit(
    p_action, p_entity_type, p_entity_id, p_match_id, p_intent_id, p_before,
    case when p_entity_type = 'match'
      then private.match_snapshot(p_match_id) || jsonb_build_object('detail', p_detail)
      else (select to_jsonb(e) from public.match_events e where e.id = p_entity_id) || jsonb_build_object('detail', p_detail)
    end
  );
  perform private.after_match_change(p_match_id, p_action);
end $$;

-- Score is always recomputed from non-voided scoring events.
create or replace function private.recompute_score(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches m set
    home_score = s.home, away_score = s.away
  from (
    select
      count(*) filter (where (et.scores_for = 'SELF' and e.team_id = mm.home_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.away_team_id)) as home,
      count(*) filter (where (et.scores_for = 'SELF' and e.team_id = mm.away_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.home_team_id)) as away
    from public.matches mm
    left join public.match_events e on e.match_id = mm.id and e.voided_at is null
    left join public.event_types et on et.code = e.type and et.scores_for is not null
    where mm.id = p_match_id
  ) s
  where m.id = p_match_id;
$$;

-- Fold an open pause into the accumulated total (used before stopping).
create or replace function private.fold_pause(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches set
    accumulated_pause_seconds = accumulated_pause_seconds + extract(epoch from (now() - paused_at)),
    paused_at = null
  where id = p_match_id and paused_at is not null;
$$;

-- ── Public RPCs ────────────────────────────────────────────────────────────

create or replace function public.server_time()
returns timestamptz language sql volatile set search_path = '' as $$
  select clock_timestamp();
$$;

create or replace function public.start_match(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'START_MATCH');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['SCHEDULED']::public.match_status[], 'Starting the match');
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

  perform private.finish_command(p_match_id, p_intent_id, 'START_MATCH', 'MATCH_STARTED', 'match', p_match_id, v_before);
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.end_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'END_PERIOD');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H']::public.match_status[], 'Ending the first half');
  perform private.require_control(m);
  v_before := private.match_snapshot(p_match_id);

  perform private.fold_pause(p_match_id);
  update public.matches set status = 'HT', clock_running = false, period_ended_at = now()
  where id = p_match_id returning * into m;
  update public.match_periods set
    ended_at = now(), accumulated_pause_seconds = m.accumulated_pause_seconds, stoppage_seconds = m.stoppage_seconds
  where match_id = p_match_id and period = 1;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'END_PERIOD', 'PERIOD_ENDED', 'match', p_match_id, v_before, '"1H"');
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.start_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'START_PERIOD');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['HT']::public.match_status[], 'Starting the second half');
  perform private.require_control(m);
  v_before := private.match_snapshot(p_match_id);

  update public.matches set
    status = '2H', current_period = 2,
    period_started_at = now(), period_ended_at = null, period_offset_seconds = 2700,
    clock_running = true, paused_at = null, accumulated_pause_seconds = 0, stoppage_seconds = 0
  where id = p_match_id;
  insert into public.match_periods (match_id, period, offset_seconds, started_at)
  values (p_match_id, 2, 2700, now());
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'START_PERIOD', 'PERIOD_STARTED', 'match', p_match_id, v_before, '"2H"');
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.pause_match(p_match_id uuid, p_intent_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'PAUSE');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H']::public.match_status[], 'Pausing');
  perform private.require_control(m);
  if m.paused_at is not null then
    raise exception 'Clock is already paused' using errcode = 'EK409';
  end if;
  if p_reason is null or p_reason not in ('INJURY', 'WEATHER', 'CROWD', 'TECHNICAL', 'OTHER') then
    raise exception 'A valid pause reason is required' using errcode = 'EK422';
  end if;
  v_before := private.match_snapshot(p_match_id);

  update public.matches set paused_at = now() where id = p_match_id;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'PAUSE', 'PAUSED', 'match', p_match_id, v_before, to_jsonb(p_reason));
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.resume_match(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'RESUME');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H']::public.match_status[], 'Resuming');
  perform private.require_control(m);
  if m.paused_at is null then
    raise exception 'Clock is not paused' using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);

  perform private.fold_pause(p_match_id);
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'RESUME', 'RESUMED', 'match', p_match_id, v_before);
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.set_stoppage(p_match_id uuid, p_intent_id uuid, p_minutes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'SET_STOPPAGE');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H']::public.match_status[], 'Setting stoppage time');
  perform private.require_control(m);
  if p_minutes is null or p_minutes < 0 or p_minutes > 30 then
    raise exception 'Stoppage must be between 0 and 30 minutes' using errcode = 'EK422';
  end if;
  v_before := private.match_snapshot(p_match_id);

  -- Display only: the elapsed clock itself is never modified.
  update public.matches set stoppage_seconds = p_minutes * 60 where id = p_match_id;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'SET_STOPPAGE', 'STOPPAGE_SET', 'match', p_match_id, v_before, to_jsonb('+' || p_minutes));
  return private.canonical_state(p_match_id);
end $$;

-- Discipline/substitution status of a player from non-voided events.
create or replace function private.player_flags(p_match_id uuid, p_player_id uuid)
returns table (booked boolean, sent_off boolean, subbed_off boolean, subbed_on boolean)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(bool_or(e.type = 'YELLOW_CARD' and e.player_id = p_player_id), false),
    coalesce(bool_or(e.type in ('RED_CARD', 'SECOND_YELLOW') and e.player_id = p_player_id), false),
    coalesce(bool_or(e.type = 'SUBSTITUTION' and e.player_id = p_player_id), false),
    coalesce(bool_or(e.type = 'SUBSTITUTION' and e.related_player_id = p_player_id), false)
  from public.match_events e
  where e.match_id = p_match_id and e.voided_at is null;
$$;

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
  v_season uuid;
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

  -- Minute must be plausible for the current period.
  v_min_lo := case m.current_period when 1 then 0 else 45 end;
  v_min_hi := case m.current_period when 1 then 45 else 90 end;
  if p_minute is null or p_minute < v_min_lo or p_minute > v_min_hi
     or coalesce(p_minute_extra, 0) < 0 or coalesce(p_minute_extra, 0) > 60
     or (coalesce(p_minute_extra, 0) > 0 and p_minute <> v_min_hi) then
    raise exception 'Minute %+% is not valid for period %', p_minute, coalesce(p_minute_extra, 0), m.current_period
      using errcode = 'EK422';
  end if;

  -- Players must belong to the event team's squad for this season.
  select c.season_id into v_season from public.competitions c where c.id = m.competition_id;
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

create or replace function public.void_event(p_match_id uuid, p_intent_id uuid, p_event_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; e public.match_events; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'VOID_EVENT');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', 'HT', '2H']::public.match_status[], 'Voiding events');
  perform private.require_control(m);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into e from public.match_events where id = p_event_id and match_id = p_match_id for update;
  if not found then
    raise exception 'Event not found in this match' using errcode = 'EK404';
  end if;
  if e.voided_at is not null then
    raise exception 'This event has already been voided' using errcode = 'EK409';
  end if;
  v_before := to_jsonb(e);

  -- Never deleted: marked void, then the score is recomputed.
  update public.match_events set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_event_id;
  perform private.recompute_score(p_match_id);
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'VOID_EVENT', 'EVENT_VOIDED', 'match_event', p_event_id, v_before, to_jsonb(btrim(p_reason)));
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.finalise_match(
  p_match_id uuid, p_intent_id uuid, p_confirmed_home integer, p_confirmed_away integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'FINALISE_MATCH');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['2H']::public.match_status[], 'Ending the match');
  perform private.require_control(m);
  -- The operator only CONFIRMS the score; it is never set from the client.
  if p_confirmed_home is distinct from m.home_score or p_confirmed_away is distinct from m.away_score then
    raise exception 'The score has changed (now %–%). Check it again.', m.home_score, m.away_score using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);

  perform private.fold_pause(p_match_id);
  update public.matches set status = 'FT', clock_running = false, period_ended_at = now(), finished_at = now()
  where id = p_match_id returning * into m;
  update public.match_periods set
    ended_at = now(), accumulated_pause_seconds = m.accumulated_pause_seconds, stoppage_seconds = m.stoppage_seconds
  where match_id = p_match_id and period = m.current_period;
  perform private.bump_seq(p_match_id);
  perform private.recompute_standings(m.competition_id);

  perform private.finish_command(p_match_id, p_intent_id, 'FINALISE_MATCH', 'MATCH_FINALISED', 'match', p_match_id, v_before,
    to_jsonb(m.home_score || '-' || m.away_score));
  return private.canonical_state(p_match_id);
end $$;

-- Backup (or primary) takes control. Requires an active assignment; audited.
create or replace function public.take_over_match(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'TAKE_OVER');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['SCHEDULED', '1H', 'HT', '2H']::public.match_status[], 'Taking over');
  if m.active_operator_id = auth.uid() then
    raise exception 'You are already in control of this match' using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);

  update public.matches set active_operator_id = auth.uid() where id = p_match_id;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'TAKE_OVER', 'OPERATOR_TAKEOVER', 'match', p_match_id, v_before,
    jsonb_build_object('from', m.active_operator_id, 'to', auth.uid()));
  return private.canonical_state(p_match_id);
end $$;

-- Read the canonical state + squads for an assigned match (no lock, no write).
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
      'home', coalesce((select jsonb_agg(jsonb_build_object('player_id', sp.player_id, 'shirt_number', sp.shirt_number) order by sp.shirt_number)
        from public.competitions c
        join public.squads s on s.season_id = c.season_id and s.team_id = m.home_team_id
        join public.squad_players sp on sp.squad_id = s.id
        where c.id = m.competition_id), '[]'::jsonb),
      'away', coalesce((select jsonb_agg(jsonb_build_object('player_id', sp.player_id, 'shirt_number', sp.shirt_number) order by sp.shirt_number)
        from public.competitions c
        join public.squads s on s.season_id = c.season_id and s.team_id = m.away_team_id
        join public.squad_players sp on sp.squad_id = s.id
        where c.id = m.competition_id), '[]'::jsonb)
    )
  );
end $$;

-- Operator's own match-prep checklist (not match state; not audited).
create or replace function public.update_assignment_prep(p_match_id uuid, p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.operator_assignments;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if jsonb_typeof(p_checks) <> 'object' then
    raise exception 'Checks must be an object' using errcode = 'EK422';
  end if;
  update public.operator_assignments set
    prep_checks = p_checks,
    prep_completed_at = case
      when coalesce((p_checks ->> 'atVenue')::boolean, false)
       and coalesce((p_checks ->> 'teamsPresent')::boolean, false)
       and coalesce((p_checks ->> 'officialsReady')::boolean, false)
      then coalesce(prep_completed_at, now()) end
  where match_id = p_match_id and user_id = auth.uid() and active
  returning * into a;
  if not found then
    raise exception 'Match not found or not assigned to you' using errcode = 'EK403';
  end if;
  return jsonb_build_object('prep_checks', a.prep_checks, 'prep_completed_at', a.prep_completed_at);
end $$;

-- ── Execute grants: signed-in users only; anon gets server_time ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;
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
  public.update_assignment_prep(uuid, jsonb)
to authenticated;
grant execute on function public.server_time() to anon, authenticated;
