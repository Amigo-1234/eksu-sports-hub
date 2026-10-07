-- ════════════════════════════════════════════════════════════════════════════
-- Configurable match duration (short formats such as 2 × 7:30 six-a-side)
-- ════════════════════════════════════════════════════════════════════════════
-- The clock was already authoritative in seconds (timestamps + offsets); only
-- the period LENGTHS were hard-coded (45:00 halves, 15:00 extra-time halves).
-- This migration makes them a competition setting:
--
--   competitions.half_seconds     default 2700 (45:00)  — every existing
--   competitions.et_half_seconds  default  900 (15:00)    competition keeps the
--                                                         normal football clock
--   matches.half_seconds / et_half_seconds — copied from the competition at
--     kick-off, so a live or finished match never changes length afterwards.
--
-- Period offsets become 0 / H / 2H / 2H+E / 2H+2E (unchanged for 45:00), and
-- the accepted event minutes follow the conventional labels: a half ending
-- at 7:30 accepts 1'–8' (+ added time at 8'), the second half 8'–15'.
-- Events also store clock_seconds: the exact match-clock second, derived on
-- the server from the authoritative clock (the public keeps minute labels).

-- ── Settings ─────────────────────────────────────────────────────────────────
alter table public.competitions
  add column half_seconds integer not null default 2700
    check (half_seconds between 60 and 3600 and half_seconds % 30 = 0),
  add column et_half_seconds integer not null default 900
    check (et_half_seconds between 60 and 1800 and et_half_seconds % 30 = 0);

alter table public.matches
  add column half_seconds integer check (half_seconds between 60 and 3600),
  add column et_half_seconds integer check (et_half_seconds between 60 and 1800);
grant select (half_seconds, et_half_seconds) on public.matches to anon, authenticated;

alter table public.match_events
  add column clock_seconds integer check (clock_seconds >= 0);

-- Effective lengths of a match: its kick-off snapshot, else its competition's.
create or replace function private.match_durations(p_match_id uuid)
returns table (half_seconds integer, et_half_seconds integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(m.half_seconds, c.half_seconds, 2700), coalesce(m.et_half_seconds, c.et_half_seconds, 900)
  from public.matches m left join public.competitions c on c.id = m.competition_id
  where m.id = p_match_id;
$$;

-- Match-clock second at which a period starts (5 = shoot-out, no clock).
create or replace function private.period_offset_seconds(p_half integer, p_et_half integer, p_period integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_period when 1 then 0 when 2 then p_half when 3 then 2 * p_half
    when 4 then 2 * p_half + p_et_half when 5 then 2 * p_half + 2 * p_et_half end;
$$;

-- Accepted minute labels for a period of this match. Regulation ends at the
-- (rounded-up) minute in which the period ends; added time is only allowed
-- on that last minute (45+2', 8+1'). 45:00 halves → 0–45 / 45–90 / 90–105 / 105–120.
create or replace function private.period_minute_lo(p_match_id uuid, p_period integer)
returns integer language sql stable security definer set search_path = '' as $$
  select (floor(private.period_offset_seconds(d.half_seconds, d.et_half_seconds, p_period) / 60.0))::integer
  from private.match_durations(p_match_id) d;
$$;
create or replace function private.period_minute_hi(p_match_id uuid, p_period integer)
returns integer language sql stable security definer set search_path = '' as $$
  select (ceil(private.period_offset_seconds(d.half_seconds, d.et_half_seconds, p_period + 1) / 60.0))::integer
  from private.match_durations(p_match_id) d;
$$;

-- Exact match-clock second at p_at (server clock fields, pauses folded in).
create or replace function private.clock_seconds_at(m public.matches, p_at timestamptz)
returns integer language sql stable set search_path = '' as $$
  select case when m.period_started_at is null then null else
    (m.period_offset_seconds + greatest(0,
      extract(epoch from (least(coalesce(m.period_ended_at, p_at), p_at) - m.period_started_at))
      - coalesce(m.accumulated_pause_seconds, 0)
      - case when m.paused_at is not null and p_at > m.paused_at then extract(epoch from (p_at - m.paused_at)) else 0 end
    ))::integer end;
$$;

-- Kick-off fixes the match's length (later competition edits never move a live clock).
create or replace function private.matches_snapshot_duration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'SCHEDULED' and new.status <> 'SCHEDULED' and (new.half_seconds is null or new.et_half_seconds is null) then
    select coalesce(new.half_seconds, c.half_seconds), coalesce(new.et_half_seconds, c.et_half_seconds)
    into new.half_seconds, new.et_half_seconds
    from public.competitions c where c.id = new.competition_id;
  end if;
  return new;
end $$;
create trigger matches_snapshot_duration before update of status on public.matches
  for each row execute function private.matches_snapshot_duration();

-- Match length is a competition rule: frozen once any of its matches has kicked off.
create or replace function private.guard_match_duration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.half_seconds is distinct from old.half_seconds or new.et_half_seconds is distinct from old.et_half_seconds)
     and not private.lock_overridden()
     and exists (select 1 from public.matches m where m.competition_id = old.id and m.status <> 'SCHEDULED') then
    raise exception 'Match length is locked once a match of this competition has kicked off. Use an override with a reason.' using errcode = 'EK409';
  end if;
  return new;
end $$;
create trigger guard_match_duration before update of half_seconds, et_half_seconds on public.competitions
  for each row execute function private.guard_match_duration();

-- Admin: set the match length (seconds, multiples of 30). Audited.
create or replace function public.admin_set_match_duration(
  p_competition_id uuid, p_half_seconds integer, p_et_half_seconds integer, p_override_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.competitions;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if p_half_seconds is null or p_half_seconds not between 60 and 3600 or p_half_seconds % 30 <> 0 then
    raise exception 'Half length must be between 1:00 and 60:00, in steps of 30 seconds' using errcode = 'EK422';
  end if;
  if p_et_half_seconds is null or p_et_half_seconds not between 60 and 1800 or p_et_half_seconds % 30 <> 0 then
    raise exception 'Extra-time half length must be between 1:00 and 30:00, in steps of 30 seconds' using errcode = 'EK422';
  end if;
  if c.half_seconds = p_half_seconds and c.et_half_seconds = p_et_half_seconds then
    return;
  end if;
  if coalesce(btrim(p_override_reason), '') <> '' then
    perform private.begin_override(p_override_reason, 'competition', p_competition_id, 'match length');
  end if;
  update public.competitions set half_seconds = p_half_seconds, et_half_seconds = p_et_half_seconds where id = p_competition_id;
  perform private.end_override();
  perform private.audit('MATCH_DURATION_CHANGED', 'competition', p_competition_id, null, null,
    jsonb_build_object('half_seconds', c.half_seconds, 'et_half_seconds', c.et_half_seconds),
    jsonb_build_object('half_seconds', p_half_seconds, 'et_half_seconds', p_et_half_seconds));
end $$;

revoke execute on function private.match_durations(uuid), private.period_offset_seconds(integer, integer, integer),
  private.period_minute_lo(uuid, integer), private.period_minute_hi(uuid, integer),
  private.clock_seconds_at(public.matches, timestamptz), private.matches_snapshot_duration(),
  private.guard_match_duration() from public, anon, authenticated;
revoke execute on function public.admin_set_match_duration(uuid, integer, integer, text) from public, anon;
grant execute on function public.admin_set_match_duration(uuid, integer, integer, text) to authenticated;

-- ── Clock functions, now driven by the match's length ───────────────────────


create or replace function public.start_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb; v_period smallint; v_offset integer; v_status public.match_status; d record;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'START_PERIOD');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['HT', 'ET_BREAK']::public.match_status[], 'Starting the next period');
  perform private.require_control(m);
  if m.status = 'HT' then
    v_period := 2; v_status := '2H';
  elsif m.current_period = 2 then
    v_period := 3; v_status := 'ET1';
  else
    v_period := 4; v_status := 'ET2';
  end if;
  select * into d from private.match_durations(p_match_id);
  v_offset := private.period_offset_seconds(d.half_seconds, d.et_half_seconds, v_period);
  v_before := private.match_snapshot(p_match_id);

  update public.matches set
    status = v_status, current_period = v_period,
    period_started_at = now(), period_ended_at = null, period_offset_seconds = v_offset,
    clock_running = true, paused_at = null, accumulated_pause_seconds = 0, stoppage_seconds = 0
  where id = p_match_id;
  insert into public.match_periods (match_id, period, offset_seconds, started_at)
  values (p_match_id, v_period, v_offset, now());
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'START_PERIOD', 'PERIOD_STARTED', 'match', p_match_id, v_before, to_jsonb(v_status::text));
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.end_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb; r record; v_level boolean; v_next public.match_status; v_from text; d record; v_pens_offset integer;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'END_PERIOD');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H', 'ET1', 'ET2']::public.match_status[], 'Ending the period');
  perform private.require_control(m);
  select * into r from private.match_rules(p_match_id);
  v_level := m.home_score = m.away_score;
  v_from := m.status::text;
  if m.status = '1H' then
    v_next := 'HT';
  elsif m.status = '2H' then
    if not (r.needs_winner and v_level) then
      raise exception 'This match does not need extra time or penalties — end the match instead' using errcode = 'EK409';
    end if;
    if r.extra_time then
      v_next := 'ET_BREAK';
    elsif r.penalties then
      v_next := 'PENS';
    else
      raise exception 'Level after normal time, but this stage has no extra time or penalties. End the match; an administrator decides the tie.' using errcode = 'EK409';
    end if;
  elsif m.status = 'ET1' then
    v_next := 'ET_BREAK';
  else -- ET2
    if not (r.needs_winner and v_level and r.penalties) then
      raise exception 'No penalty shoot-out is needed — end the match instead' using errcode = 'EK409';
    end if;
    v_next := 'PENS';
  end if;
  v_before := private.match_snapshot(p_match_id);

  perform private.fold_pause(p_match_id);
  update public.matches set status = v_next, clock_running = false, period_ended_at = now()
  where id = p_match_id returning * into m;
  update public.match_periods set
    ended_at = now(), accumulated_pause_seconds = m.accumulated_pause_seconds, stoppage_seconds = m.stoppage_seconds
  where match_id = p_match_id and period = m.current_period;
  if v_next = 'PENS' then
    select * into d from private.match_durations(p_match_id);
    v_pens_offset := private.period_offset_seconds(d.half_seconds, d.et_half_seconds, 5);
    -- The shoot-out has no running clock.
    update public.matches set current_period = 5, period_started_at = now(), period_ended_at = now(),
      period_offset_seconds = v_pens_offset, clock_running = false, paused_at = null, accumulated_pause_seconds = 0, stoppage_seconds = 0
    where id = p_match_id;
    insert into public.match_periods (match_id, period, offset_seconds, started_at)
    values (p_match_id, 5, v_pens_offset, now()) on conflict (match_id, period) do nothing;
    perform private.audit('SHOOTOUT_STARTED', 'match', p_match_id, p_match_id, p_intent_id, null,
      jsonb_build_object('detail', 'Penalty shoot-out'));
  end if;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'END_PERIOD', 'PERIOD_ENDED', 'match', p_match_id, v_before, to_jsonb(v_from));
  return private.canonical_state(p_match_id);
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
  perform private.require_status(m, array['1H', '2H', 'ET1', 'ET2']::public.match_status[], 'Recording events');
  perform private.require_control(m);

  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;

  v_min_lo := private.period_minute_lo(p_match_id, m.current_period);
  v_min_hi := private.period_minute_hi(p_match_id, m.current_period);
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
      demo_player_id, demo_related_player_id, payload, recorded_by, client_ts, client_queued, clock_seconds
    ) values (
      p_event_id, p_match_id, v_seq, p_type, m.current_period, p_minute, coalesce(p_minute_extra, 0),
      p_team_id, null, null, dp.id, dr.id, coalesce(p_payload, '{}'::jsonb) || '{"demo": true}'::jsonb, auth.uid(),
      p_client_ts, coalesce(p_client_queued, false),
      private.clock_seconds_at(m, least(now(), greatest(m.period_started_at, coalesce(p_client_ts, now()))))
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
    payload, recorded_by, client_ts, client_queued, clock_seconds
  ) values (
    p_event_id, p_match_id, v_seq, p_type, m.current_period, p_minute, coalesce(p_minute_extra, 0),
    p_team_id, p_player_id, p_related_player_id, coalesce(p_payload, '{}'::jsonb), auth.uid(),
    p_client_ts, coalesce(p_client_queued, false),
    private.clock_seconds_at(m, least(now(), greatest(m.period_started_at, coalesce(p_client_ts, now()))))
  );
  if et.scores_for is not null then
    perform private.recompute_score(p_match_id);
  end if;

  perform private.finish_command(p_match_id, p_event_id, 'RECORD_EVENT', 'EVENT_RECORDED', 'match_event', p_event_id, null);
  return private.canonical_state(p_match_id);
end $$;

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
  if not (m.status = any (private.in_progress_statuses()) or m.status in ('FT', 'ABANDONED')) then
    raise exception 'Events can only be added to started matches' using errcode = 'EK409';
  end if;
  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_period is null or p_period < 1 or p_period > least(coalesce(m.current_period, 0), 4) then
    raise exception 'Period % has not been played', p_period using errcode = 'EK422';
  end if;
  v_lo := private.period_minute_lo(p_match_id, p_period);
  v_hi := private.period_minute_hi(p_match_id, p_period);
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
    'half_seconds', (select d.half_seconds from private.match_durations(m.id) d),
    'et_half_seconds', (select d.et_half_seconds from private.match_durations(m.id) d),
    'clock_running', m.clock_running,
    'paused_at', m.paused_at,
    'accumulated_pause_seconds', m.accumulated_pause_seconds,
    'stoppage_seconds', m.stoppage_seconds,
    'started_at', m.started_at,
    'finished_at', m.finished_at,
    'active_operator_id', m.active_operator_id,
    'home_score_90', m.home_score_90,
    'away_score_90', m.away_score_90,
    'home_pens', m.home_pens,
    'away_pens', m.away_pens,
    'winner_team_id', m.winner_team_id,
    'decided_by', m.decided_by,
    'tie_id', m.tie_id
  )
  from public.matches m where m.id = p_match_id;
$$;

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
    'half_seconds', (select d.half_seconds from private.match_durations(m.id) d),
    'et_half_seconds', (select d.et_half_seconds from private.match_durations(m.id) d),
    'is_demo', m.is_demo,
    'home_score_90', m.home_score_90, 'away_score_90', m.away_score_90,
    'home_pens', m.home_pens, 'away_pens', m.away_pens,
    'winner_team_id', m.winner_team_id, 'decided_by', m.decided_by,
    'matchday', m.matchday, 'tie_id', m.tie_id
  );
$$;
