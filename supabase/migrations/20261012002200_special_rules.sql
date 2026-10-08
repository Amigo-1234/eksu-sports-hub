-- ════════════════════════════════════════════════════════════════════════════
-- Special competition rules (isolated, per competition, off by default)
-- Built on the production schema (match duration 1850); independent of the
-- unreleased Competition Engine V2.
-- ════════════════════════════════════════════════════════════════════════════
-- A competition may carry `special_rules` (jsonb). NULL — every existing
-- competition — means normal football and every code path below falls
-- through to the unchanged behaviour. Recognised settings:
--
--   starters                     integer 4–11   exact number of starters (6 = six-a-side)
--   no_added_time                boolean        no stoppage time; events never carry +minutes
--   halftime_seconds             integer        length of the half-time break (display only)
--   rolling_subs                 boolean        unlimited substitutions, players may re-enter
--   red_card_suspension_seconds  integer        a red card (or second yellow) is a temporary
--                                               suspension of this many seconds of ACTIVE
--                                               playing time; the operator approves the return
--   offside                      boolean        display only
--   title / summary / regulations               public Rules & Regulations text (display only)
--
-- At kick-off the behavioural settings are copied onto the match
-- (matches.special_rules), so a match keeps the rules it was played under
-- even if the competition's configuration is changed or removed later.
--
-- New event types (accepted only where the rules allow them):
--   SUSPENSION_RETURN  operator-approved return after the suspension was served
--   EXCLUSION          permanent exclusion for serious or repeated misconduct
--                      (explicit, with a reason; audited)
--
-- To remove later: set special_rules to NULL (played matches keep their
-- snapshot), then drop this migration's objects.

-- ── 1. Settings and kick-off snapshot ───────────────────────────────────────
alter table public.competitions
  add column special_rules jsonb check (special_rules is null or jsonb_typeof(special_rules) = 'object');
alter table public.matches
  add column special_rules jsonb check (special_rules is null or jsonb_typeof(special_rules) = 'object');
grant select (special_rules) on public.matches to anon, authenticated;

insert into public.event_types (code, sport_id, name, requires_player)
select v.code, s.id, v.name, true
from (values ('SUSPENSION_RETURN', 'Return after suspension'), ('EXCLUSION', 'Permanent exclusion')) v(code, name)
cross join (select sport_id as id from public.event_types where code = 'RED_CARD') s
on conflict (code) do nothing;

-- Raises EK422 when a configuration is not valid. Unknown keys are refused.
create or replace function private.validate_special_rules(p jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare k text; r jsonb;
begin
  if p is null then
    return;
  end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'Special rules must be an object' using errcode = 'EK422';
  end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('starters', 'no_added_time', 'halftime_seconds', 'rolling_subs', 'red_card_suspension_seconds',
                 'offside', 'title', 'summary', 'regulations') then
      raise exception 'Unknown special rule "%"', k using errcode = 'EK422';
    end if;
  end loop;
  if p ? 'starters' and (jsonb_typeof(p -> 'starters') <> 'number' or (p ->> 'starters')::numeric not between 4 and 11
                         or (p ->> 'starters')::numeric % 1 <> 0) then
    raise exception 'starters must be a whole number between 4 and 11' using errcode = 'EK422';
  end if;
  if p ? 'halftime_seconds' and (jsonb_typeof(p -> 'halftime_seconds') <> 'number'
                                 or (p ->> 'halftime_seconds')::numeric not between 0 and 1800) then
    raise exception 'halftime_seconds must be between 0 and 1800' using errcode = 'EK422';
  end if;
  if p ? 'red_card_suspension_seconds' and (jsonb_typeof(p -> 'red_card_suspension_seconds') <> 'number'
      or (p ->> 'red_card_suspension_seconds')::numeric not between 10 and 1200
      or (p ->> 'red_card_suspension_seconds')::numeric % 1 <> 0) then
    raise exception 'red_card_suspension_seconds must be a whole number between 10 and 1200' using errcode = 'EK422';
  end if;
  foreach k in array array['no_added_time', 'rolling_subs', 'offside'] loop
    if p ? k and jsonb_typeof(p -> k) <> 'boolean' then
      raise exception '% must be true or false', k using errcode = 'EK422';
    end if;
  end loop;
  foreach k in array array['title', 'summary'] loop
    if p ? k and (jsonb_typeof(p -> k) <> 'string' or length(p ->> k) > 300) then
      raise exception '% must be text (at most 300 characters)', k using errcode = 'EK422';
    end if;
  end loop;
  if p ? 'regulations' then
    if jsonb_typeof(p -> 'regulations') <> 'array' or jsonb_array_length(p -> 'regulations') > 40 then
      raise exception 'regulations must be a list of at most 40 items' using errcode = 'EK422';
    end if;
    for r in select * from jsonb_array_elements(p -> 'regulations') loop
      if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'title') <> 'string' or jsonb_typeof(r -> 'body') <> 'string'
         or length(r ->> 'title') not between 1 and 120 or length(r ->> 'body') not between 1 and 2000 then
        raise exception 'Each regulation needs a title (≤120) and a body (≤2000)' using errcode = 'EK422';
      end if;
    end loop;
  end if;
end $$;

create or replace function private.competitions_validate_special_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.validate_special_rules(new.special_rules);
  return new;
end $$;
create trigger competitions_validate_special_rules before insert or update of special_rules on public.competitions
  for each row execute function private.competitions_validate_special_rules();

-- The match-behaviour part of a configuration (public text is not snapshotted).
create or replace function private.special_rules_behaviour(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select nullif(coalesce(p, '{}'::jsonb) - 'title' - 'summary' - 'regulations', '{}'::jsonb);
$$;

-- Kick-off copies the competition's rules onto the match (demo matches never take them).
create or replace function private.matches_snapshot_special_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'SCHEDULED' and new.status <> 'SCHEDULED' and new.special_rules is null and not new.is_demo then
    select private.special_rules_behaviour(c.special_rules) into new.special_rules
    from public.competitions c where c.id = new.competition_id;
  end if;
  return new;
end $$;
create trigger matches_snapshot_special_rules before update of status on public.matches
  for each row execute function private.matches_snapshot_special_rules();

-- The rules a match was played under are history: never rewritten after kick-off.
create or replace function private.guard_match_special_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.special_rules is distinct from old.special_rules and old.status <> 'SCHEDULED' then
    raise exception 'The rules a match was played under cannot be changed' using errcode = 'EK409';
  end if;
  return new;
end $$;
create trigger guard_match_special_rules before update of special_rules on public.matches
  for each row execute function private.guard_match_special_rules();

-- Effective behavioural rules of a match: its kick-off snapshot once started,
-- else (not yet started) its competition's. '{}' = normal football.
create or replace function private.match_rules(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(case when m.is_demo then null
                       when m.status = 'SCHEDULED' then private.special_rules_behaviour(c.special_rules)
                       else m.special_rules end, '{}'::jsonb)
  from public.matches m left join public.competitions c on c.id = m.competition_id
  where m.id = p_match_id;
$$;

-- Player-state rules (rolling substitutions / temporary red cards) in force?
create or replace function private.sr_player_rules(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select r ? 'red_card_suspension_seconds' or coalesce((r ->> 'rolling_subs')::boolean, false)
  from (select private.match_rules(p_match_id) r) x;
$$;

-- ── 2. Line-up size and six-a-side formations ───────────────────────────────
create or replace function private.lineup_rules_for_match(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when r ? 'starters'
    then private.lineup_rules() || jsonb_build_object('min_starters', (r ->> 'starters')::int, 'max_starters', (r ->> 'starters')::int)
    else private.lineup_rules() end
  from (select private.match_rules(p_match_id) r) x;
$$;

alter table public.formations drop constraint formations_slots_check;
alter table public.formations add constraint formations_slots_check
  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 4 and 11);

insert into public.formations (code, name, sort_order, slots) values
  ('2-2-1', '2-2-1 (six-a-side)', 101, '[
    {"position":"GK","x":50,"y":90},
    {"position":"LB","x":28,"y":70},{"position":"RB","x":72,"y":70},
    {"position":"LM","x":28,"y":45},{"position":"RM","x":72,"y":45},
    {"position":"ST","x":50,"y":20}]'),
  ('2-1-2', '2-1-2 (six-a-side)', 102, '[
    {"position":"GK","x":50,"y":90},
    {"position":"LB","x":28,"y":70},{"position":"RB","x":72,"y":70},
    {"position":"CM","x":50,"y":48},
    {"position":"ST","x":32,"y":22},{"position":"ST","x":68,"y":22}]'),
  ('3-1-1', '3-1-1 (six-a-side)', 103, '[
    {"position":"GK","x":50,"y":90},
    {"position":"LB","x":20,"y":68},{"position":"CB","x":50,"y":72},{"position":"RB","x":80,"y":68},
    {"position":"CM","x":50,"y":45},
    {"position":"ST","x":50,"y":20}]'),
  ('1-2-2', '1-2-2 (six-a-side)', 104, '[
    {"position":"GK","x":50,"y":90},
    {"position":"CB","x":50,"y":70},
    {"position":"LM","x":28,"y":47},{"position":"RM","x":72,"y":47},
    {"position":"ST","x":32,"y":22},{"position":"ST","x":68,"y":22}]')
on conflict (code) do nothing;

-- ── 3. Active playing time (the suspension clock) ───────────────────────────
-- Seconds of play so far: completed periods in full (pauses excluded) plus the
-- running period. Half-time, pauses and stoppages never count.
create or replace function private.active_base_seconds(p_match_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(0, extract(epoch from (p.ended_at - p.started_at)) - coalesce(p.accumulated_pause_seconds, 0))), 0)::integer
  from public.match_periods p
  where p.match_id = p_match_id and p.ended_at is not null;
$$;

create or replace function private.active_seconds_now(p_match_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select private.active_base_seconds(m.id)
    + case when m.period_started_at is not null and m.period_ended_at is null
           then greatest(0, private.clock_seconds_at(m, now()) - m.period_offset_seconds) else 0 end
  from public.matches m where m.id = p_match_id;
$$;

-- Active playing time at which an event happened (NULL: no exact clock, e.g. an admin correction).
create or replace function private.event_active_seconds(e public.match_events)
returns integer language sql stable security definer set search_path = '' as $$
  select case when e.clock_seconds is null then null else
    coalesce((select sum(greatest(0, extract(epoch from (p.ended_at - p.started_at)) - coalesce(p.accumulated_pause_seconds, 0)))
              from public.match_periods p where p.match_id = e.match_id and p.period < e.period and p.ended_at is not null), 0)::integer
    + greatest(0, e.clock_seconds - coalesce((select p.offset_seconds from public.match_periods p
                                              where p.match_id = e.match_id and p.period = e.period), 0)) end;
$$;

-- ── 4. Player state under special rules ─────────────────────────────────────
-- Event-sourced: a player's latest movement decides where they are.
--   ON / RETURN → on the pitch;  OFF (substituted) / RED (suspended) / EXCLUDED → off.
-- p_role: the line-up role (NULL without a confirmed line-up: position unknown).
create or replace function private.sr_player_state(p_match_id uuid, p_team_id uuid, p_player_id uuid, p_role public.lineup_role)
returns table (
  on_field boolean, suspended boolean, excluded boolean, suspension_seconds integer,
  suspension_ends_active integer, suspension_remaining integer,
  entries integer, exits integer, red_cards integer, yellow_cards integer, goals integer,
  on_minute smallint, on_extra smallint, off_minute smallint, off_extra smallint, last_move text
) language sql stable security definer set search_path = '' as $$
  with r as (select private.match_rules(p_match_id) r),
  ev as (
    select e.* from public.match_events e
    where e.match_id = p_match_id and e.team_id = p_team_id and e.voided_at is null
  ),
  moves as (
    select e.seq, e.minute, e.minute_extra, e.id,
      case e.type when 'SUBSTITUTION' then 'OFF'
                  when 'SUSPENSION_RETURN' then 'RETURN'
                  when 'EXCLUSION' then 'EXCLUDED'
                  else case when (select r ? 'red_card_suspension_seconds' from r) then 'RED' else 'EXCLUDED' end end as kind
    from ev e where e.player_id = p_player_id
      and e.type in ('SUBSTITUTION', 'RED_CARD', 'SECOND_YELLOW', 'SUSPENSION_RETURN', 'EXCLUSION')
    union all
    select e.seq, e.minute, e.minute_extra, e.id, 'ON' from ev e where e.type = 'SUBSTITUTION' and e.related_player_id = p_player_id
  ),
  last_move as (select * from moves order by seq desc limit 1),
  last_in as (select * from moves where kind in ('ON', 'RETURN') order by seq desc limit 1),
  last_out as (select * from moves where kind = 'OFF' order by seq desc limit 1),
  excl as (select exists (select 1 from moves where kind = 'EXCLUDED') x),
  susp as (
    select (select (r ->> 'red_card_suspension_seconds')::int from r) as secs,
      private.event_active_seconds(e) as at_active
    from last_move lm join public.match_events e on e.id = lm.id
    where lm.kind = 'RED' and not (select x from excl)
  )
  select
    case when (select x from excl) then false
         when (select kind from last_move) is null then case when p_role is null then null else p_role = 'STARTER' end
         else (select kind from last_move) in ('ON', 'RETURN') end,
    exists (select 1 from susp),
    (select x from excl),
    (select secs from susp),
    (select at_active + secs from susp),
    (select case when at_active is null then 0 else greatest(0, at_active + secs - private.active_seconds_now(p_match_id)) end from susp),
    (select count(*)::int from moves where kind = 'ON'),
    (select count(*)::int from moves where kind = 'OFF'),
    (select count(*)::int from ev where ev.player_id = p_player_id and ev.type in ('RED_CARD', 'SECOND_YELLOW')),
    (select count(*)::int from ev where ev.player_id = p_player_id and ev.type = 'YELLOW_CARD'),
    (select count(*)::int from ev where ev.player_id = p_player_id and ev.type in ('GOAL', 'PENALTY_GOAL')),
    (select minute from last_in), (select minute_extra from last_in),
    (select minute from last_out), (select minute_extra from last_out),
    (select kind from last_move);
$$;

-- Validation of a live event under special rules (replaces the one-way
-- substitution / permanent red-card checks for these matches only).
create or replace function private.sr_check_event(
  p_match_id uuid, p_team_id uuid, p_type text, p_player uuid, p_related uuid, p_payload jsonb
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_rules jsonb := private.match_rules(p_match_id);
  v_rolling boolean := coalesce((v_rules ->> 'rolling_subs')::boolean, false);
  v_lineup uuid := private.confirmed_lineup(p_match_id, p_team_id);
  v_role public.lineup_role; v_shirt smallint; v_rrole public.lineup_role; v_rshirt smallint;
  s record; r record; v_name text; v_rname text;
begin
  -- Line-up membership (and the generic membership messages) stay as for normal matches.
  perform private.check_lineup_event(p_match_id, p_team_id, p_type, p_player, p_related);
  if p_player is null then
    return;
  end if;
  if v_lineup is not null then
    select lp.role, lp.shirt_number into v_role, v_shirt from public.lineup_players lp where lp.lineup_id = v_lineup and lp.player_id = p_player;
  end if;
  v_name := btrim(private.player_label(p_player, v_shirt));
  select * into s from private.sr_player_state(p_match_id, p_team_id, p_player, v_role);

  if s.excluded then
    raise exception '% has been excluded from the match', v_name using errcode = 'EK422';
  end if;

  if p_type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'PENALTY_MISS') then
    if s.suspended then
      raise exception '% is serving a suspension', v_name using errcode = 'EK422';
    end if;
    if s.on_field is false then
      raise exception '% is not on the pitch', v_name using errcode = 'EK422';
    end if;
  elsif p_type = 'YELLOW_CARD' then
    if s.yellow_cards > 0 then
      raise exception '% is already booked — record a second yellow', v_name using errcode = 'EK422';
    end if;
  elsif p_type in ('RED_CARD', 'SECOND_YELLOW') then
    if p_type = 'SECOND_YELLOW' and s.yellow_cards = 0 then
      raise exception 'A second yellow needs an earlier yellow card' using errcode = 'EK422';
    end if;
    -- A temporary red is served off the pitch: the player must be on it (or already suspended).
    if v_rules ? 'red_card_suspension_seconds' and s.on_field is false and not s.suspended then
      raise exception '% is not on the pitch. For serious misconduct off the pitch, use a permanent exclusion.', v_name
        using errcode = 'EK422';
    end if;
  elsif p_type = 'SUSPENSION_RETURN' then
    if not (v_rules ? 'red_card_suspension_seconds') then
      raise exception 'Suspensions are not used in this competition' using errcode = 'EK422';
    end if;
    if not s.suspended then
      raise exception '% is not serving a suspension', v_name using errcode = 'EK422';
    end if;
    if s.suspension_remaining > 0 then
      raise exception '% still has % s of the suspension to serve', v_name, s.suspension_remaining using errcode = 'EK422';
    end if;
  elsif p_type = 'EXCLUSION' then
    if length(btrim(coalesce(p_payload ->> 'reason', ''))) < 3 then
      raise exception 'A permanent exclusion needs a reason' using errcode = 'EK422';
    end if;
  elsif p_type = 'SUBSTITUTION' then
    if p_related = p_player then
      raise exception 'Player on and player off must be different' using errcode = 'EK422';
    end if;
    if s.suspended then
      raise exception '% is serving a suspension and cannot be replaced — the team plays a player short until the return', v_name
        using errcode = 'EK422';
    end if;
    if s.on_field is false then
      raise exception '% is not on the pitch', v_name using errcode = 'EK422';
    end if;
    if v_lineup is not null then
      select lp.role, lp.shirt_number into v_rrole, v_rshirt from public.lineup_players lp where lp.lineup_id = v_lineup and lp.player_id = p_related;
    end if;
    v_rname := btrim(private.player_label(p_related, v_rshirt));
    select * into r from private.sr_player_state(p_match_id, p_team_id, p_related, v_rrole);
    if r.excluded then
      raise exception '% has been excluded from the match', v_rname using errcode = 'EK422';
    end if;
    if r.suspended then
      raise exception '% is serving a suspension', v_rname using errcode = 'EK422';
    end if;
    if r.on_field then
      raise exception '% is already on the pitch', v_rname using errcode = 'EK422';
    end if;
    if not v_rolling and (r.exits > 0 or (v_rrole is not null and v_rrole <> 'SUBSTITUTE')) then
      raise exception '% cannot return to the pitch', v_rname using errcode = 'EK422';
    end if;
  end if;
end $$;

-- Event types that only exist under special rules.
create or replace function private.sr_check_type(p_match_id uuid, p_type text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_type in ('SUSPENSION_RETURN', 'EXCLUSION') and not private.sr_player_rules(p_match_id) then
    raise exception '% is not used in this competition', initcap(replace(lower(p_type), '_', ' ')) using errcode = 'EK422';
  end if;
end $$;

-- No added time: +minutes are refused.
create or replace function private.sr_check_minute(p_match_id uuid, p_minute_extra integer)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(p_minute_extra, 0) > 0 and coalesce((private.match_rules(p_match_id) ->> 'no_added_time')::boolean, false) then
    raise exception 'There is no added time in this competition' using errcode = 'EK422';
  end if;
end $$;

-- ── 5. Admin: set / clear a competition's special rules (audited) ────────────
create or replace function public.admin_set_special_rules(p_competition_id uuid, p_rules jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.competitions;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if p_rules = '{}'::jsonb then
    p_rules := null;
  end if;
  perform private.validate_special_rules(p_rules);
  if c.special_rules is not distinct from p_rules then
    return;
  end if;
  update public.competitions set special_rules = p_rules where id = p_competition_id;
  perform private.audit('SPECIAL_RULES_CHANGED', 'competition', p_competition_id, null, null,
    jsonb_build_object('special_rules', c.special_rules), jsonb_build_object('special_rules', p_rules));
end $$;
revoke execute on function public.admin_set_special_rules(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_special_rules(uuid, jsonb) to authenticated;


-- ── 6. Hooks into the existing match engine (each falls through when no special rules apply) ──

create or replace function private.lineup_player_states_std(p_lineup_id uuid)
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

drop function private.lineup_player_states(uuid);
create function private.lineup_player_states(p_lineup_id uuid)
returns table (
  player_id uuid, shirt_number smallint, role public.lineup_role, "position" text, slot_index smallint,
  pitch_x numeric, pitch_y numeric, is_captain boolean, is_goalkeeper boolean, sort_order smallint,
  display_name text, subbed_on boolean, subbed_off boolean, sent_off boolean, booked boolean, goals integer,
  on_field boolean, on_minute smallint, on_extra smallint, off_minute smallint, off_extra smallint,
  suspended boolean, suspension_seconds integer, suspension_ends_active integer, suspension_remaining integer,
  excluded boolean, entries integer, exits integer, red_cards integer, yellow_cards integer
) language plpgsql stable security definer set search_path = '' as $$
declare l public.match_lineups;
begin
  select * into l from public.match_lineups where id = p_lineup_id;
  if l.id is null then
    return;
  end if;
  if not private.sr_player_rules(l.match_id) then
    -- Normal football: exactly the previous derivation.
    return query
      select s.*, false, null::int, null::int, null::int, false,
        s.subbed_on::int, s.subbed_off::int,
        (select count(*)::int from public.match_events e where e.match_id = l.match_id and e.team_id = l.team_id and e.voided_at is null
           and e.player_id = s.player_id and e.type in ('RED_CARD', 'SECOND_YELLOW')),
        (select count(*)::int from public.match_events e where e.match_id = l.match_id and e.team_id = l.team_id and e.voided_at is null
           and e.player_id = s.player_id and e.type = 'YELLOW_CARD')
      from private.lineup_player_states_std(p_lineup_id) s;
    return;
  end if;
  -- Special rules: subbed_on = has come on at least once; subbed_off = currently
  -- off after a substitution; sent_off = permanently excluded; minutes = latest.
  return query
    select lp.player_id, lp.shirt_number, lp.role, lp.position, lp.slot_index, lp.pitch_x, lp.pitch_y,
      lp.is_captain, lp.is_goalkeeper, lp.sort_order, p.display_name,
      st.entries > 0, st.last_move = 'OFF', st.excluded, st.yellow_cards > 0, st.goals,
      coalesce(st.on_field, false), st.on_minute, st.on_extra, st.off_minute, st.off_extra,
      st.suspended, st.suspension_seconds, st.suspension_ends_active, st.suspension_remaining,
      st.excluded, st.entries, st.exits, st.red_cards, st.yellow_cards
    from public.lineup_players lp
    join public.players p on p.id = lp.player_id
    cross join lateral private.sr_player_state(l.match_id, l.team_id, lp.player_id, lp.role) st
    where lp.lineup_id = p_lineup_id;
end $$;

create or replace function private.check_lineup_event(
  p_match_id uuid, p_team_id uuid, p_type text, p_player uuid, p_related uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
declare v_lineup uuid := private.confirmed_lineup(p_match_id, p_team_id); s record; r record;
begin
  if v_lineup is null then
    return;
  end if;
  if private.sr_player_rules(p_match_id) then
    if p_player is not null and not exists (select 1 from public.lineup_players lp where lp.lineup_id = v_lineup and lp.player_id = p_player) then
      raise exception 'That player is not in this team''s line-up' using errcode = 'EK422';
    end if;
    if p_related is not null and not exists (select 1 from public.lineup_players lp where lp.lineup_id = v_lineup and lp.player_id = p_related) then
      raise exception 'The player coming on is not in this team''s line-up' using errcode = 'EK422';
    end if;
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
  perform private.sr_check_type(p_match_id, p_type);
  perform private.sr_check_minute(p_match_id, p_minute_extra);
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
      p_client_ts, coalesce(p_client_queued, false), private.clock_seconds_at(m, least(now(), greatest(m.period_started_at, coalesce(p_client_ts, now()))))
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

  if private.sr_player_rules(p_match_id) then
    perform private.sr_check_event(p_match_id, p_team_id, p_type, p_player_id, p_related_player_id, p_payload);
  else
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
  end if;

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    payload, recorded_by, client_ts, client_queued, clock_seconds
  ) values (
    p_event_id, p_match_id, v_seq, p_type, m.current_period, p_minute, coalesce(p_minute_extra, 0),
    p_team_id, p_player_id, p_related_player_id, coalesce(p_payload, '{}'::jsonb), auth.uid(),
    p_client_ts, coalesce(p_client_queued, false), private.clock_seconds_at(m, least(now(), greatest(m.period_started_at, coalesce(p_client_ts, now()))))
  );
  if et.scores_for is not null then
    perform private.recompute_score(p_match_id);
  end if;
  if p_type = 'EXCLUSION' then
    perform private.audit('PLAYER_EXCLUDED', 'match_event', p_event_id, p_match_id, p_event_id, null,
      jsonb_build_object('player_id', p_player_id, 'team_id', p_team_id, 'minute', p_minute, 'reason', btrim(p_payload ->> 'reason')));
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
  if m.status not in ('1H', 'HT', '2H', 'FT', 'ABANDONED') then
    raise exception 'Events can only be added to started matches' using errcode = 'EK409';
  end if;
  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  perform private.sr_check_type(p_match_id, p_type);
  perform private.sr_check_minute(p_match_id, p_minute_extra);
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_period is null or p_period < 1 or p_period > coalesce(m.current_period, 0) then
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
  if p_minutes > 0 and coalesce((private.match_rules(p_match_id) ->> 'no_added_time')::boolean, false) then
    raise exception 'There is no added time in this competition' using errcode = 'EK422';
  end if;
  v_before := private.match_snapshot(p_match_id);

  -- Display only: the elapsed clock itself is never modified.
  update public.matches set stoppage_seconds = p_minutes * 60 where id = p_match_id;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'SET_STOPPAGE', 'STOPPAGE_SET', 'match', p_match_id, v_before, to_jsonb('+' || p_minutes));
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
    'special_rules', nullif(private.match_rules(m.id), '{}'::jsonb),
    'active_base_seconds', private.active_base_seconds(m.id),
    'paused_at', m.paused_at,
    'accumulated_pause_seconds', m.accumulated_pause_seconds,
    'stoppage_seconds', m.stoppage_seconds,
    'started_at', m.started_at,
    'finished_at', m.finished_at,
    'active_operator_id', m.active_operator_id
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
    'special_rules', nullif(private.match_rules(m.id), '{}'::jsonb),
    'active_base_seconds', private.active_base_seconds(m.id),
    'is_demo', m.is_demo
  );
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
        'player_id', coalesce(e.player_id, e.demo_player_id),
        'related_player_id', coalesce(e.related_player_id, e.demo_related_player_id),
        'shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_player_id)),
        'related_shirt_number', coalesce(private.shirt_for(e.match_id, e.team_id, e.related_player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = e.demo_related_player_id)),
        'recorded_at', e.recorded_at,
        'client_ts', e.client_ts,
        'voided_at', e.voided_at,
        'void_reason', e.void_reason,
        'active_at', private.event_active_seconds(e)
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
  r := private.lineup_rules_for_match(l.match_id);
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
  r := private.lineup_rules_for_match(l.match_id);
  select c.season_id into v_season from public.matches m join public.competitions c on c.id = m.competition_id where m.id = l.match_id;
  if p_formation is not null then
    select * into f from public.formations where code = p_formation and active;
    if not found then
      raise exception 'Unknown formation %', p_formation using errcode = 'EK422';
    end if;
    if jsonb_array_length(f.slots) <> (r ->> 'max_starters')::int then
      raise exception 'Formation % is for % players; this competition starts %', p_formation, jsonb_array_length(f.slots), r ->> 'max_starters'
        using errcode = 'EK422';
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
        if v_slot < 0 or v_slot >= jsonb_array_length(f.slots) then
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
    'rules', private.lineup_rules_for_match(p_match_id),
    'formations', coalesce((select jsonb_agg(jsonb_build_object('code', f.code, 'name', f.name, 'slots', f.slots) order by f.sort_order)
      from public.formations f where f.active
        and jsonb_array_length(f.slots) = (private.lineup_rules_for_match(p_match_id) ->> 'max_starters')::int), '[]'::jsonb),
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
        'on_field', s.on_field, 'subbed_on', s.subbed_on, 'subbed_off', s.subbed_off, 'sent_off', s.sent_off,
        'suspended', s.suspended, 'suspension_seconds', s.suspension_seconds,
        'suspension_ends_active', s.suspension_ends_active, 'suspension_remaining', s.suspension_remaining,
        'excluded', s.excluded, 'entries', s.entries, 'exits', s.exits, 'red_cards', s.red_cards, 'yellow_cards', s.yellow_cards)
        order by s.role, s.sort_order)
      from private.lineup_player_states(l.id) s), '[]'::jsonb)) end
  from (select 1) one
  left join public.match_lineups l on l.match_id = p_match_id and l.team_id = p_team_id) end;
$$;

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
          'sent_off', s.sent_off, 'booked', s.booked, 'goals', s.goals,
          'suspended', s.suspended, 'suspension_seconds', s.suspension_seconds,
        'suspension_ends_active', s.suspension_ends_active, 'suspension_remaining', s.suspension_remaining,
        'excluded', s.excluded, 'entries', s.entries, 'exits', s.exits, 'red_cards', s.red_cards, 'yellow_cards', s.yellow_cards)
          order by s.role, s.sort_order)
        from private.lineup_player_states(l.id) s), '[]'::jsonb)
    ) order by (l.team_id = m.home_team_id) desc), '[]'::jsonb)
  from public.match_lineups l
  join public.matches m on m.id = l.match_id
  where l.match_id = p_match_id and l.status = 'CONFIRMED';
$$;

create or replace function private.notification_content(p_match_id uuid, p_type text, p_event_id uuid, p_tag text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches; e public.match_events; home text; away text; comp text; venue text; prefix text := '';
  score text; who text; team text; title text; body text; mins int; sc integer[];
begin
  select * into m from public.matches where id = p_match_id;
  select name into home from public.teams where id = m.home_team_id;
  select name into away from public.teams where id = m.away_team_id;
  select short_name into comp from public.competitions where id = m.competition_id;
  select name into venue from public.venues where id = m.venue_id;
  if m.is_demo then
    prefix := case when coalesce(m.round_label, '') ~* 'test' then 'TEST · ' else 'DEMO · ' end;
  end if;
  if p_event_id is not null then
    select * into e from public.match_events where id = p_event_id;
  end if;
  -- A goal: the score at that goal. Anything else (incl. a correction): the score now.
  sc := private.notification_score(m.id, case when p_type = 'GOAL' then e.seq end);
  score := format('%s %s–%s %s', home, sc[1], sc[2], away);
  if p_event_id is not null then
    select name into team from public.teams where id = e.team_id;
    who := nullif(btrim(coalesce((select display_name from public.players where id = e.player_id),
      (select display_name from public.demo_lineup_players where id = e.demo_player_id), '')), '');
  end if;

  case p_type
    when 'GOAL' then
      title := case e.type when 'OWN_GOAL' then 'OWN GOAL ⚽' when 'PENALTY_GOAL' then 'PENALTY GOAL ⚽' else 'GOAL ⚽' end;
      body := score || E'\n' || private.notification_minute(e) || coalesce(' · ' || who || case when e.type = 'OWN_GOAL' then ' (own goal)' else '' end, '');
    when 'YELLOW_CARD' then
      title := 'YELLOW CARD 🟨';
      body := team || E'\n' || coalesce(who || ' · ', '') || private.notification_minute(e);
    when 'RED_CARD' then
      title := case e.type when 'SECOND_YELLOW' then 'SECOND YELLOW 🟥' when 'EXCLUSION' then 'SENT OFF 🟥' else 'RED CARD 🟥' end;
      if e.type = 'EXCLUSION' then
        body := team || E'\n' || coalesce(who || ' excluded from the match · ', 'Player excluded from the match · ') || private.notification_minute(e);
      elsif coalesce(m.special_rules, '{}'::jsonb) ? 'red_card_suspension_seconds' then
        body := team || E'\n' || coalesce(who || ' · ', '') || (m.special_rules ->> 'red_card_suspension_seconds') || '-second suspension · ' || private.notification_minute(e);
      else
        body := team || E'\n' || coalesce(who || ' sent off · ', 'Player sent off · ') || private.notification_minute(e);
      end if;
    when 'KICKOFF' then
      title := 'KICK-OFF';
      body := format('%s vs %s is under way', home, away);
    when 'HALF_TIME' then
      title := 'HALF-TIME';
      body := score;
    when 'SECOND_HALF' then
      title := 'SECOND HALF';
      body := score || E'\nThe second half is under way';
    when 'FULL_TIME' then
      title := 'FULL-TIME';
      body := score || coalesce(E'\nFull-time at ' || venue, '');
    when 'POSTPONED' then
      title := 'POSTPONED';
      body := format('%s vs %s has been postponed', home, away);
    when 'CANCELLED' then
      title := 'CANCELLED';
      body := format('%s vs %s has been cancelled', home, away);
    when 'ABANDONED' then
      title := 'ABANDONED';
      body := score || E'\nThe match has been abandoned';
    when 'MATCH_REMINDER' then
      mins := greatest(1, round(extract(epoch from (m.scheduled_at - now())) / 60)::int);
      title := upper(comp);
      body := format('%s vs %s starts in %s minute%s · %s', home, away, mins, case when mins = 1 then '' else 's' end,
        to_char(m.scheduled_at at time zone 'Africa/Lagos', 'HH24:MI'));
    when 'SCORE_CORRECTION' then
      title := 'SCORE CORRECTION';
      body := score || E'\nThe previous goal has been removed';
  end case;
  return jsonb_build_object('title', prefix || title, 'body', body, 'url', '/matches/' || m.id, 'tag', p_tag,
    'match_id', m.id, 'type', p_type);
end $$;

create or replace function private.notify_on_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.match_events; m public.matches; v_type text; v_goal public.notification_outbox;
begin
  begin
    select * into e from public.match_events where id = new.id;
    select * into m from public.matches where id = new.match_id;
    if e.id is null or m.id is null then
      return null;
    end if;
    v_type := case when e.type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL') then 'GOAL'
      when e.type = 'YELLOW_CARD' then 'YELLOW_CARD'
      when e.type in ('RED_CARD', 'SECOND_YELLOW', 'EXCLUSION') then 'RED_CARD' end;   -- substitutions / missed penalties: no push
    if v_type is null then
      return null;
    end if;

    if tg_op = 'INSERT' then
      -- Live events only: retroactive admin corrections after full-time do not alert anyone.
      if e.voided_at is null and m.status in ('1H', 'HT', '2H') then
        perform private.notification_enqueue('EVT:' || e.id, m.id, v_type, e.id);
      end if;
    elsif old.voided_at is null and new.voided_at is not null then
      select * into v_goal from public.notification_outbox where event_key = 'EVT:' || e.id;
      if v_goal.id is not null then
        -- Not delivered yet: simply never send it.
        update public.notification_outbox set status = 'CANCELLED', processed_at = now() where id = v_goal.id and status = 'PENDING';
        update public.notification_deliveries set status = 'CANCELLED' where outbox_id = v_goal.id and status in ('PENDING', 'SENDING');
        -- A goal some devices already saw: tell exactly those devices the score changed back.
        if v_type = 'GOAL' and exists (select 1 from public.notification_deliveries where outbox_id = v_goal.id and status = 'SENT') then
          perform private.notification_enqueue('VOID:' || e.id, m.id, 'SCORE_CORRECTION', e.id, v_goal.id);
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'notify_on_event failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- Internal helpers are never callable through the API.
revoke execute on function
  private.validate_special_rules(jsonb), private.competitions_validate_special_rules(), private.special_rules_behaviour(jsonb),
  private.matches_snapshot_special_rules(), private.guard_match_special_rules(), private.match_rules(uuid),
  private.sr_player_rules(uuid), private.lineup_rules_for_match(uuid), private.active_base_seconds(uuid),
  private.active_seconds_now(uuid), private.event_active_seconds(public.match_events),
  private.sr_player_state(uuid, uuid, uuid, public.lineup_role), private.sr_check_event(uuid, uuid, text, uuid, uuid, jsonb),
  private.sr_check_type(uuid, text), private.sr_check_minute(uuid, integer),
  private.lineup_player_states(uuid), private.lineup_player_states_std(uuid)
from public, anon, authenticated;
