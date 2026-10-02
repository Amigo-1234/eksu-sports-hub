-- Competition Engine V2 (additive).
--
-- Runs a complete competition from entries through group stages, standings,
-- qualification, a knockout bracket (with extra time and penalties),
-- discipline and final honours — data-driven, never hard-coded around one
-- competition. Existing competitions keep working unchanged:
--   * existing stages are backfilled as LEAGUE (or GROUP when they have
--     groups) stages; their standings are computed exactly as before for the
--     tie-breakers they already use (points, goal_difference, goals_for);
--   * discipline is OFF until an admin enables it for a competition;
--   * the fixture generator refuses stages that already have fixtures, so
--     hand-made fixture lists (e.g. Freshers Cup 2026) are never regenerated;
--   * extra time / penalties only apply to knockout matches.
--
-- Sections
--   1. Helpers
--   2. Schema: competitions, stages, entries, matches, standings
--   3. New tables: fixture generations + schedule history, knockout ties,
--      qualification decisions, discipline rules + suspensions, shoot-out
--   4. Guards: stage locking, competition rules, schedule history
--   5. Standings V2 (tie-breakers incl. head-to-head + fair play) and
--      qualification
--   6. Fixture generator (round robin) — preview / confirm / clear
--   7. Scheduling
--   8. Knockout bracket — preview / confirm, resolution, advancement,
--      reconciliation
--   9. Match engine: extra time + penalty shoot-out
--  10. Discipline + eligibility
--  11. Competition lifecycle (stages, completion, honours)
--  12. Read models: public competition page, admin control centre
--  13. RLS + privileges
--
-- Error codes as elsewhere: EK401/EK403/EK404/EK409/EK422.

-- ── 1. Helpers ─────────────────────────────────────────────────────────────
create or replace function private.stage_is_knockout(p_type text)
returns boolean language sql immutable set search_path = '' as $$
  select p_type in ('ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL', 'KNOCKOUT');
$$;

-- Statuses of a match that is under way (any period, breaks, shoot-out).
create or replace function private.in_progress_statuses()
returns public.match_status[] language sql immutable set search_path = '' as $$
  select array['1H', 'HT', '2H', 'ET1', 'ET_BREAK', 'ET2', 'PENS']::public.match_status[];
$$;

-- A match has "begun" (its stage/competition is now locked) once it left the
-- pre-match states.
create or replace function private.match_has_begun(p_status public.match_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_status not in ('SCHEDULED', 'POSTPONED', 'CANCELLED');
$$;

-- Explicit, audited admin override of a lock (set only by RPCs that took a
-- reason; transaction-local).
create or replace function private.lock_overridden()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('eksu.lock_override', true), '') = 'on';
$$;

create or replace function private.begin_override(p_reason text, p_entity_type text, p_entity_id uuid, p_what text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'An override reason is required' using errcode = 'EK422';
  end if;
  perform set_config('eksu.lock_override', 'on', true);
  perform private.audit('LOCK_OVERRIDE', p_entity_type, p_entity_id, null, null, null,
    jsonb_build_object('detail', btrim(p_reason), 'action', p_what));
end $$;

create or replace function private.end_override()
returns void language sql set search_path = '' as $$
  select set_config('eksu.lock_override', '', true);
$$;

-- Minute range of a period (football baseline; extra time is 2 × 15).
create or replace function private.period_minute_lo(p_period integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_period when 1 then 0 when 2 then 45 when 3 then 90 when 4 then 105 end;
$$;
create or replace function private.period_minute_hi(p_period integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_period when 1 then 45 when 2 then 90 when 3 then 105 when 4 then 120 end;
$$;

-- ── 2. Schema ──────────────────────────────────────────────────────────────
-- Competition lifecycle. Existing values (DRAFT/ACTIVE/ARCHIVED) keep their
-- meaning; nothing becomes ACTIVE just because it exists.
alter table public.competitions drop constraint if exists competitions_status_check;
alter table public.competitions add constraint competitions_status_check
  check (status in ('DRAFT', 'REGISTRATION', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'));

alter table public.competitions
  -- OFFICIAL competitions feed official honours; FRIENDLY / TEST / DEMO never
  -- mix with them (every table and statistic is scoped per competition).
  add column kind text not null default 'OFFICIAL' check (kind in ('OFFICIAL', 'FRIENDLY', 'TEST', 'DEMO')),
  add column champion_team_id uuid references public.teams (id) on delete restrict,
  add column runner_up_team_id uuid references public.teams (id) on delete restrict,
  add column third_place_team_id uuid references public.teams (id) on delete restrict,
  add column completed_at timestamptz,
  add column completed_by uuid references public.profiles (id);

alter table public.competition_stages
  add column stage_type text not null default 'LEAGUE' check (stage_type in (
    'LEAGUE', 'GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL', 'KNOCKOUT')),
  -- LEAGUE/GROUP: 1 = single round robin, 2 = double. Knockout ties: 1 leg.
  add column legs smallint not null default 1 check (legs in (1, 2)),
  -- NULL = the competition default (competitions.extra_time_enabled / penalties_enabled).
  add column extra_time_allowed boolean,
  add column penalties_allowed boolean,
  -- GROUP: {"per_group": 2, "best_ranked": {"rank": 3, "count": 2}}
  -- LEAGUE: {"top": 4}
  add column qualification jsonb not null default '{}'::jsonb check (jsonb_typeof(qualification) = 'object'),
  add column status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'COMPLETED')),
  add column locked_at timestamptz,
  add column completed_at timestamptz,
  add constraint competition_stages_knockout_one_leg check (stage_type in ('LEAGUE', 'GROUP') or legs = 1);

-- Backfill: stages with groups are GROUP stages; table-less stages of knockout
-- competitions are KNOCKOUT rounds; everything else stays LEAGUE.
update public.competition_stages s set stage_type = 'GROUP'
where exists (select 1 from public.competition_groups g where g.stage_id = s.id);
update public.competition_stages s set stage_type = 'KNOCKOUT'
from public.competitions c
where c.id = s.competition_id and not s.has_table and c.format = 'KNOCKOUT' and s.stage_type = 'LEAGUE';
-- Stages that already have a started match are locked (as they would be now).
update public.competition_stages s set status = 'ACTIVE', locked_at = now()
where exists (select 1 from public.matches m where m.stage_id = s.id and private.match_has_begun(m.status));

alter table public.competition_entries add column seed smallint check (seed between 1 and 256);

alter table public.matches
  add column matchday smallint check (matchday between 1 and 200),
  add column generation_id uuid,
  add column tie_id uuid,
  add column original_scheduled_at timestamptz,
  -- Derived (never accepted from clients): score after 90 minutes, shoot-out
  -- score, and the winner once the match is final.
  add column home_score_90 smallint check (home_score_90 >= 0),
  add column away_score_90 smallint check (away_score_90 >= 0),
  add column home_pens smallint check (home_pens >= 0),
  add column away_pens smallint check (away_pens >= 0),
  add column winner_team_id uuid references public.teams (id) on delete restrict,
  add column decided_by text check (decided_by in ('REGULATION', 'EXTRA_TIME', 'PENALTIES'));
update public.matches set original_scheduled_at = scheduled_at where original_scheduled_at is null;
update public.matches set home_score_90 = home_score, away_score_90 = away_score where status <> 'SCHEDULED';
update public.matches set winner_team_id = case when home_score > away_score then home_team_id when away_score > home_score then away_team_id end,
  decided_by = case when home_score <> away_score then 'REGULATION' end
where status = 'FT';
create index matches_stage_idx on public.matches (stage_id);
create index matches_tie_idx on public.matches (tie_id) where tie_id is not null;

grant select (matchday, generation_id, tie_id, original_scheduled_at, home_score_90, away_score_90,
  home_pens, away_pens, winner_team_id, decided_by) on public.matches to anon, authenticated;

alter table public.standings
  add column stage_id uuid references public.competition_stages (id) on delete cascade,
  add column fair_play_points smallint not null default 0,
  -- QUALIFIED / ELIMINATED / PENDING (null: the stage has no qualification rules).
  add column qualification text check (qualification in ('QUALIFIED', 'ELIMINATED', 'PENDING')),
  -- Still level with another team after every configured tie-breaker.
  add column tied boolean not null default false;
drop index if exists public.standings_unique;
create unique index standings_unique on public.standings (competition_id, stage_id, group_id, team_id) nulls not distinct;

-- ── 3. New tables ──────────────────────────────────────────────────────────
-- One row per confirmed fixture generation (the preview is never stored).
create table public.fixture_generations (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.competition_stages (id) on delete cascade,
  kind text not null check (kind in ('ROUND_ROBIN', 'KNOCKOUT')),
  config jsonb not null,
  config_hash text not null,
  match_count integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles (id),
  clear_reason text
);
create unique index fixture_generations_active on public.fixture_generations (stage_id, kind) where cleared_at is null;
alter table public.matches add constraint matches_generation_fk
  foreign key (generation_id) references public.fixture_generations (id) on delete set null;

-- Append-only history of every kick-off / venue / matchday / status change.
create table public.fixture_schedule_history (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  action text not null,
  from_scheduled_at timestamptz,
  to_scheduled_at timestamptz,
  from_venue_id uuid,
  to_venue_id uuid,
  from_matchday smallint,
  to_matchday smallint,
  from_status public.match_status,
  to_status public.match_status,
  reason text,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index fixture_schedule_history_match_idx on public.fixture_schedule_history (match_id, changed_at);
create trigger fixture_schedule_history_append_only before update or delete on public.fixture_schedule_history
  for each row when (pg_trigger_depth() < 1) execute function private.append_only();

-- Knockout bracket. A tie knows where its teams come from (so future
-- participants can be shown as "Winner QF1" / "Runner-up Group A"); its match
-- is created once both teams are known and a kick-off is set.
create table public.knockout_ties (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  stage_id uuid not null references public.competition_stages (id) on delete cascade,
  generation_id uuid references public.fixture_generations (id) on delete set null,
  code text not null check (code ~ '^[A-Z0-9-]{1,12}$'),
  position smallint not null check (position >= 1),
  home_source_type text not null check (home_source_type in ('TEAM', 'GROUP_RANK', 'LEAGUE_RANK', 'BEST_RANKED', 'WINNER', 'LOSER')),
  home_source_team_id uuid references public.teams (id) on delete restrict,
  home_source_group_id uuid references public.competition_groups (id) on delete restrict,
  home_source_stage_id uuid references public.competition_stages (id) on delete restrict,
  home_source_rank smallint,
  home_source_tie_id uuid references public.knockout_ties (id) on delete restrict,
  home_label text not null,
  away_source_type text not null check (away_source_type in ('TEAM', 'GROUP_RANK', 'LEAGUE_RANK', 'BEST_RANKED', 'WINNER', 'LOSER')),
  away_source_team_id uuid references public.teams (id) on delete restrict,
  away_source_group_id uuid references public.competition_groups (id) on delete restrict,
  away_source_stage_id uuid references public.competition_stages (id) on delete restrict,
  away_source_rank smallint,
  away_source_tie_id uuid references public.knockout_ties (id) on delete restrict,
  away_label text not null,
  home_team_id uuid references public.teams (id) on delete restrict,
  away_team_id uuid references public.teams (id) on delete restrict,
  match_id uuid unique references public.matches (id) on delete set null,
  scheduled_at timestamptz,
  venue_id uuid references public.venues (id) on delete set null,
  winner_team_id uuid references public.teams (id) on delete restrict,
  loser_team_id uuid references public.teams (id) on delete restrict,
  decided_by text check (decided_by in ('REGULATION', 'EXTRA_TIME', 'PENALTIES', 'ADMIN')),
  decision_reason text,
  advanced_at timestamptz,
  -- A corrected result no longer matches the recorded advancement.
  needs_reconciliation boolean not null default false,
  reconciliation_note text,
  created_at timestamptz not null default now(),
  unique (stage_id, position),
  unique (stage_id, code),
  check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);
create index knockout_ties_competition_idx on public.knockout_ties (competition_id);
alter table public.matches add constraint matches_tie_fk foreign key (tie_id) references public.knockout_ties (id) on delete set null;

-- Explicit admin qualification decisions (drawing of lots, play-off, manual
-- override of an unfinished group). Revocable, never deleted.
create table public.stage_qualification_decisions (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.competition_stages (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  decision text not null check (decision in ('QUALIFIED', 'ELIMINATED')),
  reason text not null check (btrim(reason) <> ''),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id)
);
create unique index stage_qualification_decisions_active on public.stage_qualification_decisions (stage_id, team_id) where revoked_at is null;

-- Discipline rules per competition (no row / enabled = false: no automatic
-- suspensions — existing competitions are unaffected).
create table public.competition_discipline_rules (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  enabled boolean not null default false,
  red_card_matches smallint not null default 1 check (red_card_matches between 0 and 10),
  second_yellow_matches smallint not null default 1 check (second_yellow_matches between 0 and 10),
  -- Every N yellow cards (across matches) → a suspension. NULL: no accumulation.
  yellow_threshold smallint check (yellow_threshold between 2 and 10),
  yellow_suspension_matches smallint not null default 1 check (yellow_suspension_matches between 1 and 10),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.player_suspensions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  player_id uuid not null references public.players (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  -- Automatic suspensions have a stable key (card event / yellow count);
  -- manual ones have none.
  source_key text,
  source_match_id uuid references public.matches (id) on delete restrict,
  source_event_id uuid references public.match_events (id) on delete restrict,
  reason text not null check (reason in ('RED_CARD', 'SECOND_YELLOW', 'YELLOW_ACCUMULATION', 'ADMIN')),
  note text,
  matches_total smallint not null check (matches_total between 1 and 20),
  matches_served smallint not null default 0,
  served_match_ids uuid[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SERVED', 'CANCELLED')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  served_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  -- Cancelled by an admin decision: never reinstated automatically.
  admin_cancelled boolean not null default false,
  check (reason = 'ADMIN' or source_key is not null),
  check (status <> 'CANCELLED' or coalesce(cancelled_reason, '') <> '')
);
create unique index player_suspensions_source_key on public.player_suspensions (competition_id, source_key) where source_key is not null;
create index player_suspensions_player_idx on public.player_suspensions (player_id, competition_id) where status = 'ACTIVE';

-- Penalty shoot-out kicks: never match events, so they can never change the
-- match score or a player's goals.
create table public.match_shootout_attempts (
  -- Client-generated: the idempotency key.
  id uuid primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  seq bigint not null,
  team_id uuid not null references public.teams (id) on delete restrict,
  player_id uuid references public.players (id) on delete restrict,
  demo_player_id uuid references public.demo_lineup_players (id) on delete restrict,
  outcome text not null check (outcome in ('SCORED', 'MISSED', 'SAVED')),
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or coalesce(void_reason, '') <> ''),
  check (player_id is null or demo_player_id is null)
);
create index match_shootout_attempts_match_idx on public.match_shootout_attempts (match_id, seq);

-- ── 4. Guards ──────────────────────────────────────────────────────────────
-- Engine-managed columns (stage status/lock/completion, competition honours)
-- change only inside engine functions, which set eksu.engine for the
-- duration of the write.
create or replace function private.engine_on()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('eksu.engine', true), '') = 'on';
$$;

create or replace function private.stage_is_locked(p_stage_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competition_stages s where s.id = p_stage_id and s.locked_at is not null)
      or exists (select 1 from public.matches m where m.stage_id = p_stage_id and private.match_has_begun(m.status));
$$;

-- Group membership / entries: frozen once the stage's matches begin.
create or replace function private.guard_entry_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_stages uuid[] := '{}'; s uuid;
begin
  if private.lock_overridden() then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_stages := v_stages || old.stage_id || (select g.stage_id from public.competition_groups g where g.id = old.group_id);
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    v_stages := v_stages || new.stage_id || (select g.stage_id from public.competition_groups g where g.id = new.group_id);
  end if;
  if tg_op = 'UPDATE' and old.stage_id is not distinct from new.stage_id and old.group_id is not distinct from new.group_id
     and old.team_id = new.team_id then
    return new; -- seed or other metadata only
  end if;
  foreach s in array v_stages loop
    if s is not null and private.stage_is_locked(s) then
      raise exception 'This stage is locked because its matches have started. Use an override with a reason.' using errcode = 'EK409';
    end if;
  end loop;
  -- Entering or withdrawing a team once a league/group stage of the
  -- competition is under way would rewrite its table.
  if tg_op in ('INSERT', 'DELETE') and exists (
    select 1 from public.competition_stages st
    where st.competition_id = coalesce(new.competition_id, old.competition_id)
      and st.stage_type in ('LEAGUE', 'GROUP') and private.stage_is_locked(st.id)
  ) then
    raise exception 'Teams cannot be entered or withdrawn once the competition''s table stage has started. Use an override with a reason.' using errcode = 'EK409';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_entry_lock before insert or update or delete on public.competition_entries
  for each row execute function private.guard_entry_lock();

create or replace function private.guard_group_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.lock_overridden() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and old.stage_id = new.stage_id then
    return new; -- renaming is harmless
  end if;
  if private.stage_is_locked(coalesce(new.stage_id, old.stage_id))
     or (tg_op = 'UPDATE' and private.stage_is_locked(old.stage_id)) then
    raise exception 'Groups of a stage that has started cannot be added, moved or removed.' using errcode = 'EK409';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_group_lock before insert or update or delete on public.competition_groups
  for each row execute function private.guard_group_lock();

create or replace function private.guard_stage_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.engine_on() and (
    new.status is distinct from old.status or new.locked_at is distinct from old.locked_at
    or new.completed_at is distinct from old.completed_at
  ) then
    raise exception 'Stage progress is managed by the competition engine' using errcode = 'EK403';
  end if;
  -- Qualification feeds a generated bracket: frozen once a bracket refers to it.
  if new.qualification is distinct from old.qualification and exists (
    select 1 from public.knockout_ties t
    where t.home_source_stage_id = old.id or t.away_source_stage_id = old.id
       or t.home_source_group_id in (select g.id from public.competition_groups g where g.stage_id = old.id)
       or t.away_source_group_id in (select g.id from public.competition_groups g where g.stage_id = old.id)
  ) then
    raise exception 'Qualification rules are locked because a knockout bracket already uses them.' using errcode = 'EK409';
  end if;
  if private.lock_overridden() then
    return new;
  end if;
  if private.stage_is_locked(old.id) and (
    new.stage_type is distinct from old.stage_type or new.legs is distinct from old.legs
    or new.has_table is distinct from old.has_table
    or new.extra_time_allowed is distinct from old.extra_time_allowed
    or new.penalties_allowed is distinct from old.penalties_allowed
    or new.qualification is distinct from old.qualification
  ) then
    raise exception 'The rules of a stage that has started are locked. Use an override with a reason.' using errcode = 'EK409';
  end if;
  return new;
end $$;
create trigger guard_stage_rules before update on public.competition_stages
  for each row execute function private.guard_stage_rules();

create or replace function private.guard_competition_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_begun boolean;
begin
  if not private.engine_on() and (
    new.champion_team_id is distinct from old.champion_team_id
    or new.runner_up_team_id is distinct from old.runner_up_team_id
    or new.third_place_team_id is distinct from old.third_place_team_id
    or new.completed_at is distinct from old.completed_at
    or (new.status = 'COMPLETED' and old.status <> 'COMPLETED')
  ) then
    raise exception 'Completing a competition is done with "Complete competition" (honours are derived from results)' using errcode = 'EK403';
  end if;
  if old.status = 'COMPLETED' and new.status not in ('COMPLETED', 'ARCHIVED') and not private.lock_overridden() then
    raise exception 'A completed competition can only be archived (or reopened with an override and a reason).' using errcode = 'EK409';
  end if;
  if new.format is distinct from old.format or new.points_win is distinct from old.points_win
     or new.points_draw is distinct from old.points_draw or new.points_loss is distinct from old.points_loss
     or new.tiebreakers is distinct from old.tiebreakers then
    select exists (select 1 from public.matches m where m.competition_id = old.id and private.match_has_begun(m.status)) into v_begun;
    if v_begun and not private.lock_overridden() then
      raise exception 'Format, points and tie-breakers are locked once matches have started. Use an override with a reason.' using errcode = 'EK409';
    end if;
    if new.format is distinct from old.format then
      perform private.audit('COMPETITION_FORMAT_CHANGED', 'competition', old.id, null, null,
        jsonb_build_object('format', old.format), jsonb_build_object('format', new.format));
    end if;
  end if;
  return new;
end $$;
create trigger guard_competition_rules before update on public.competitions
  for each row execute function private.guard_competition_rules();

-- Original kick-off is remembered; every schedule change is history.
create or replace function private.matches_set_original_kickoff()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.original_scheduled_at := coalesce(new.original_scheduled_at, new.scheduled_at);
  return new;
end $$;
create trigger matches_original_kickoff before insert on public.matches
  for each row execute function private.matches_set_original_kickoff();

create or replace function private.record_schedule_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_status_relevant boolean;
begin
  v_status_relevant := new.status is distinct from old.status and (
    new.status in ('POSTPONED', 'CANCELLED', 'ABANDONED') or (old.status = 'POSTPONED' and new.status = 'SCHEDULED'));
  if not v_status_relevant and new.scheduled_at is not distinct from old.scheduled_at
     and new.venue_id is not distinct from old.venue_id and new.matchday is not distinct from old.matchday then
    return null;
  end if;
  v_action := case
    when v_status_relevant and new.status <> 'SCHEDULED' then new.status::text
    when new.scheduled_at is distinct from old.scheduled_at then 'RESCHEDULED'
    when v_status_relevant then 'RESCHEDULED'
    when new.venue_id is distinct from old.venue_id then 'VENUE_CHANGED'
    else 'MATCHDAY_CHANGED' end;
  insert into public.fixture_schedule_history (
    match_id, action, from_scheduled_at, to_scheduled_at, from_venue_id, to_venue_id,
    from_matchday, to_matchday, from_status, to_status, reason, changed_by
  ) values (
    new.id, v_action, old.scheduled_at, new.scheduled_at, old.venue_id, new.venue_id,
    old.matchday, new.matchday, old.status, new.status,
    coalesce(nullif(current_setting('eksu.change_reason', true), ''), new.status_note), auth.uid()
  );
  return null;
end $$;
create trigger matches_schedule_history after update of scheduled_at, venue_id, matchday, status on public.matches
  for each row execute function private.record_schedule_history();

-- First kick-off of a stage locks it (and a SCHEDULED competition becomes ACTIVE).
create or replace function private.lock_stage_on_kickoff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_stage public.competition_stages;
begin
  if private.match_has_begun(new.status) and not private.match_has_begun(old.status) then
    perform set_config('eksu.engine', 'on', true);
    update public.competition_stages set locked_at = now(), status = case when status = 'PENDING' then 'ACTIVE' else status end
    where id = new.stage_id and locked_at is null
    returning * into v_stage;
    if v_stage.id is not null then
      perform private.audit('STAGE_LOCKED', 'competition_stage', v_stage.id, null, null, null,
        jsonb_build_object('detail', 'First match kicked off', 'match_id', new.id));
    end if;
    update public.competitions set status = 'ACTIVE' where id = new.competition_id and status = 'SCHEDULED';
    perform set_config('eksu.engine', '', true);
  end if;
  return null;
end $$;
create trigger matches_lock_stage after update of status on public.matches
  for each row execute function private.lock_stage_on_kickoff();

-- ── 5. Standings V2 ────────────────────────────────────────────────────────
-- Fair-play points (lower is better): yellow 1, second yellow 3, red 4.
create or replace function private.fair_play_weight(p_type text)
returns integer language sql immutable set search_path = '' as $$
  select case p_type when 'YELLOW_CARD' then 1 when 'SECOND_YELLOW' then 3 when 'RED_CARD' then 4 else 0 end;
$$;

-- FT matches that count for a table stage (legacy fixtures without a stage
-- belong to the competition's first table stage).
create or replace function private.stage_matches(p_stage_id uuid)
returns setof public.matches language sql stable security definer set search_path = '' as $$
  select m.* from public.matches m
  join public.competition_stages s on s.id = p_stage_id
  where m.competition_id = s.competition_id
    and (m.stage_id = s.id or (m.stage_id is null and s.id = (
      select s2.id from public.competition_stages s2
      where s2.competition_id = s.competition_id and s2.has_table and s2.stage_type in ('LEAGUE', 'GROUP')
      order by s2.stage_order limit 1)));
$$;

create or replace function private.compute_stage_table(c public.competitions, st public.competition_stages)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_groups boolean := exists (select 1 from public.competition_groups g where g.stage_id = st.id);
  t text;
begin
  if to_regclass('pg_temp._eksu_st') is null then
    create temp table _eksu_st (
    team_id uuid primary key, group_id uuid, gkey text, name text,
    played int default 0, wins int default 0, draws int default 0, losses int default 0,
    gf int default 0, ga int default 0, gd int default 0, points int default 0, fair_play int default 0,
    v numeric default 0, block int default 1
  ) on commit drop;
  end if;
  truncate pg_temp._eksu_st;

  insert into pg_temp._eksu_st (team_id, group_id, gkey, name)
  select ce.team_id, case when v_groups then ce.group_id end, coalesce(case when v_groups then ce.group_id end::text, ''), tm.name
  from public.competition_entries ce join public.teams tm on tm.id = ce.team_id
  where ce.competition_id = c.id
    and (not v_groups or ce.group_id in (select g.id from public.competition_groups g where g.stage_id = st.id));

  -- Results: FT stage matches between two teams of the same table (group).
  with ms as (select * from private.stage_matches(st.id) m where m.status = 'FT'),
  rows as (
    select h.team_id, m.home_score as gf, m.away_score as ga from ms m
    join pg_temp._eksu_st h on h.team_id = m.home_team_id join pg_temp._eksu_st a on a.team_id = m.away_team_id
    where h.gkey = a.gkey
    union all
    select a.team_id, m.away_score, m.home_score from ms m
    join pg_temp._eksu_st h on h.team_id = m.home_team_id join pg_temp._eksu_st a on a.team_id = m.away_team_id
    where h.gkey = a.gkey
  ),
  agg as (
    select team_id, count(*) played, count(*) filter (where gf > ga) w, count(*) filter (where gf = ga) d,
      count(*) filter (where gf < ga) l, sum(gf) gf, sum(ga) ga
    from rows group by team_id
  )
  update pg_temp._eksu_st s set played = agg.played, wins = agg.w, draws = agg.d, losses = agg.l, gf = agg.gf, ga = agg.ga
  from agg where agg.team_id = s.team_id;

  update pg_temp._eksu_st s set fair_play = coalesce((
    select sum(private.fair_play_weight(e.type)) from public.match_events e
    join private.stage_matches(st.id) m on m.id = e.match_id and m.status = 'FT'
    where e.team_id = s.team_id and e.voided_at is null and e.type in ('YELLOW_CARD', 'SECOND_YELLOW', 'RED_CARD')
  ), 0);
  update pg_temp._eksu_st set gd = gf - ga, points = wins * c.points_win + draws * c.points_draw + losses * c.points_loss;

  -- Ordered tie-breakers refine "blocks" of teams that are still level.
  -- Head-to-head criteria use only the matches between the teams of the block.
  foreach t in array c.tiebreakers loop
    if t = 'alphabetical' then
      update pg_temp._eksu_st s set block = x.nb from (
        select team_id, dense_rank() over (partition by gkey order by block, name, team_id) nb from pg_temp._eksu_st
      ) x where x.team_id = s.team_id;
      continue;
    end if;
    if t in ('h2h_points', 'h2h_goal_difference', 'h2h_goals_for') then
      update pg_temp._eksu_st s set v = coalesce((
        select sum(case t
          when 'h2h_points' then case when r.gf > r.ga then c.points_win when r.gf = r.ga then c.points_draw else c.points_loss end
          when 'h2h_goal_difference' then r.gf - r.ga
          else r.gf end)
        from (
          select m.home_score gf, m.away_score ga from private.stage_matches(st.id) m
          where m.status = 'FT' and m.home_team_id = s.team_id
            and m.away_team_id in (select o.team_id from pg_temp._eksu_st o where o.gkey = s.gkey and o.block = s.block and o.team_id <> s.team_id)
          union all
          select m.away_score, m.home_score from private.stage_matches(st.id) m
          where m.status = 'FT' and m.away_team_id = s.team_id
            and m.home_team_id in (select o.team_id from pg_temp._eksu_st o where o.gkey = s.gkey and o.block = s.block and o.team_id <> s.team_id)
        ) r), 0);
    else
      update pg_temp._eksu_st set v = case t
        when 'points' then points when 'goal_difference' then gd when 'goals_for' then gf
        when 'wins' then wins when 'fair_play' then -fair_play end;
    end if;
    update pg_temp._eksu_st s set block = x.nb from (
      select team_id, dense_rank() over (partition by gkey order by block, v desc) nb from pg_temp._eksu_st
    ) x where x.team_id = s.team_id;
  end loop;

  insert into public.standings (
    competition_id, stage_id, group_id, team_id, played, wins, draws, losses,
    goals_for, goals_against, goal_difference, points, fair_play_points, rank, tied
  )
  select c.id, st.id, s.group_id, s.team_id, s.played, s.wins, s.draws, s.losses, s.gf, s.ga, s.gd, s.points, s.fair_play,
    rank() over (partition by s.gkey order by s.block)::smallint,
    count(*) over (partition by s.gkey, s.block) > 1
  from pg_temp._eksu_st s;
end $$;

-- A group (or a whole league stage) is complete when it has fixtures and
-- every one is FT or CANCELLED.
create or replace function private.group_complete(p_stage_id uuid, p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.stage_matches(p_stage_id) m where p_group_id is null or m.group_id = p_group_id)
     and not exists (select 1 from private.stage_matches(p_stage_id) m
                     where (p_group_id is null or m.group_id = p_group_id) and m.status not in ('FT', 'CANCELLED'));
$$;

create or replace function private.compute_qualification(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  st public.competition_stages;
  v_n int; v_best_rank int; v_best_count int; v_all_complete boolean;
begin
  for st in select * from public.competition_stages where competition_id = p_competition_id and has_table
    and stage_type in ('LEAGUE', 'GROUP') order by stage_order loop
    v_n := coalesce((st.qualification ->> 'per_group')::int, (st.qualification ->> 'top')::int);
    v_best_rank := (st.qualification -> 'best_ranked' ->> 'rank')::int;
    v_best_count := (st.qualification -> 'best_ranked' ->> 'count')::int;
    if v_n is null and v_best_rank is null then
      continue;
    end if;
    -- Rank blocks entirely inside / outside the qualifying places.
    update public.standings s set qualification = case
      when not private.group_complete(st.id, s.group_id) then 'PENDING'
      when v_n is not null and s.rank + (select count(*) from public.standings x
        where x.stage_id = st.id and x.group_id is not distinct from s.group_id and x.rank = s.rank) - 1 <= v_n then 'QUALIFIED'
      when v_n is not null and s.rank <= v_n then 'PENDING' -- level across the cut: needs a decision
      when v_best_rank is not null and s.rank = v_best_rank then 'PENDING' -- resolved below
      else 'ELIMINATED' end
    where s.stage_id = st.id;

    -- Best-ranked teams across groups (e.g. best two third-placed teams).
    if v_best_rank is not null and coalesce(v_best_count, 0) > 0 then
      select bool_and(private.group_complete(st.id, g.id)) into v_all_complete
      from public.competition_groups g where g.stage_id = st.id;
      if coalesce(v_all_complete, private.group_complete(st.id, null)) then
        with cand as (
          select s.*, dense_rank() over (order by s.points desc, s.goal_difference desc, s.goals_for desc, s.fair_play_points) pos
          from public.standings s where s.stage_id = st.id and s.rank = v_best_rank and not s.tied
        ),
        cut as (
          select c.id,
            (select count(*) from cand x where x.pos < c.pos) as before,
            (select count(*) from cand x where x.pos <= c.pos) as incl
          from cand c
        )
        update public.standings s set qualification = case
          when cut.incl <= v_best_count then 'QUALIFIED'
          when cut.before >= v_best_count then 'ELIMINATED'
          else 'PENDING' end -- level across the cut: needs a decision
        from cut where cut.id = s.id;
      end if;
    end if;

    -- Explicit admin decisions win (lots, play-off, manual override).
    update public.standings s set qualification = d.decision
    from public.stage_qualification_decisions d
    where s.stage_id = st.id and d.stage_id = st.id and d.team_id = s.team_id and d.revoked_at is null;
  end loop;
end $$;

-- Same signature as before; now stage-aware with configurable tie-breakers.
create or replace function private.recompute_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.competitions;
  st public.competition_stages;
  t text;
begin
  select * into c from public.competitions where id = p_competition_id;
  if not found then
    return;
  end if;
  foreach t in array c.tiebreakers loop
    if t not in ('points', 'goal_difference', 'goals_for', 'wins', 'h2h_points', 'h2h_goal_difference',
                 'h2h_goals_for', 'fair_play', 'alphabetical') then
      raise exception 'Unsupported tie-breaker %', t using errcode = 'EK422';
    end if;
  end loop;
  delete from public.standings where competition_id = p_competition_id;
  for st in select * from public.competition_stages where competition_id = p_competition_id and has_table
    and stage_type in ('LEAGUE', 'GROUP') order by stage_order loop
    perform private.compute_stage_table(c, st);
  end loop;
  perform private.compute_qualification(p_competition_id);
end $$;

-- Tie-breakers are validated on write too (the admin form sends a list).
alter table public.competitions add constraint competitions_tiebreakers_known check (
  tiebreakers <@ array['points', 'goal_difference', 'goals_for', 'wins', 'h2h_points', 'h2h_goal_difference',
    'h2h_goals_for', 'fair_play', 'alphabetical']::text[] and cardinality(tiebreakers) between 1 and 9);

-- ── 6. Fixture generator ───────────────────────────────────────────────────
/*
 * Single round robin by the circle (Berger) method: the last team is fixed,
 * the others rotate; an odd field gets a bye (that team rests that round).
 * Deterministic for a given team order. Home/away alternates so every team's
 * home count differs by at most one and nobody plays more than two home (or
 * away) matches in a row.
 */
create or replace function private.round_robin_pairs(p_teams uuid[])
returns table (round integer, idx integer, home uuid, away uuid)
language plpgsql immutable set search_path = '' as $$
declare
  t uuid[] := p_teams;
  n integer;
  r integer; k integer;
  a uuid; x uuid; y uuid; fixed uuid;
begin
  if coalesce(cardinality(t), 0) < 2 then
    return;
  end if;
  if cardinality(t) % 2 = 1 then
    t := t || null::uuid;
  end if;
  n := cardinality(t);
  fixed := t[n];
  for r in 0 .. n - 2 loop
    a := t[(r % (n - 1)) + 1];
    if a is not null and fixed is not null then
      round := r + 1; idx := 0;
      if r % 2 = 0 then home := a; away := fixed; else home := fixed; away := a; end if;
      return next;
    end if;
    for k in 1 .. n / 2 - 1 loop
      x := t[((r + k) % (n - 1)) + 1];
      y := t[((r - k + 2 * (n - 1)) % (n - 1)) + 1];
      if x is not null and y is not null then
        round := r + 1; idx := k;
        if k % 2 = 1 then home := x; away := y; else home := y; away := x; end if;
        return next;
      end if;
    end loop;
  end loop;
end $$;

/*
 * Preview of a stage's round-robin fixtures (nothing is stored).
 * Config: start_date (YYYY-MM-DD, required), kickoff_time ("16:00"),
 *   days_between (7), spacing_minutes (120: staggered kick-offs on one
 *   matchday), legs (stage default; 2 = double round robin), venue_id.
 * Teams are ordered by seed, then name (deterministic).
 */
create or replace function private.fixture_preview(p_stage_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st public.competition_stages;
  c public.competitions;
  v_legs int; v_start date; v_time time; v_days int; v_spacing int; v_venue uuid;
  v_groups boolean;
  v_rows jsonb;
  v_rounds int;
  v_issues text[] := '{}';
  g record;
begin
  select * into st from public.competition_stages where id = p_stage_id;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  select * into c from public.competitions where id = st.competition_id;
  if st.stage_type not in ('LEAGUE', 'GROUP') then
    raise exception 'Round-robin fixtures are generated for league or group stages; knockout rounds come from the bracket.' using errcode = 'EK422';
  end if;
  begin
    v_legs := coalesce((p_config ->> 'legs')::int, st.legs);
    v_start := (p_config ->> 'start_date')::date;
    v_time := coalesce((p_config ->> 'kickoff_time')::time, '16:00'::time);
    v_days := coalesce((p_config ->> 'days_between')::int, 7);
    v_spacing := coalesce((p_config ->> 'spacing_minutes')::int, 120);
    v_venue := nullif(p_config ->> 'venue_id', '')::uuid;
  exception when others then
    raise exception 'Invalid fixture settings' using errcode = 'EK422';
  end;
  if v_start is null then
    raise exception 'Choose the date of the first matchday' using errcode = 'EK422';
  end if;
  if v_legs not in (1, 2) or v_days not between 1 and 60 or v_spacing not between 0 and 720 then
    raise exception 'Legs must be 1 or 2, days between matchdays 1–60, spacing 0–720 minutes' using errcode = 'EK422';
  end if;
  if v_venue is not null and not exists (select 1 from public.venues where id = v_venue) then
    raise exception 'Venue not found' using errcode = 'EK404';
  end if;

  v_groups := exists (select 1 from public.competition_groups where stage_id = st.id);
  if st.stage_type = 'GROUP' and not v_groups then
    raise exception 'Create the groups and draw the teams into them first' using errcode = 'EK422';
  end if;

  -- Teams per table (one "group" with id NULL for a league stage).
  if to_regclass('pg_temp._eksu_fx') is null then
    create temp table _eksu_fx (
    group_id uuid, group_name text, round int, idx int, home uuid, away uuid
  ) on commit drop;
  end if;
  truncate pg_temp._eksu_fx;
  for g in
    select gr.id, gr.name from public.competition_groups gr where gr.stage_id = st.id
    union all select null::uuid, null::text where not v_groups
    order by 2 nulls first
  loop
    insert into pg_temp._eksu_fx (group_id, group_name, round, idx, home, away)
    select g.id, g.name, p.round, p.idx, p.home, p.away
    from private.round_robin_pairs(array(
      select ce.team_id from public.competition_entries ce join public.teams t on t.id = ce.team_id
      where ce.competition_id = c.id and (g.id is null or ce.group_id = g.id)
      order by ce.seed nulls last, t.name, t.id
    )) p;
    if (select count(*) from public.competition_entries ce where ce.competition_id = c.id and (g.id is null or ce.group_id = g.id)) < 2 then
      v_issues := v_issues || format('%s needs at least two teams', coalesce(g.name, 'The league'));
    end if;
  end loop;
  if v_groups and exists (select 1 from public.competition_entries ce where ce.competition_id = c.id and ce.group_id is null) then
    v_issues := v_issues || 'Some entered teams are not drawn into a group (they get no fixtures)';
  end if;
  select coalesce(max(round), 0) into v_rounds from pg_temp._eksu_fx;
  if v_legs = 2 then
    insert into pg_temp._eksu_fx (group_id, group_name, round, idx, home, away)
    select group_id, group_name, round + v_rounds, idx, away, home from pg_temp._eksu_fx;
  end if;

  select coalesce(jsonb_agg(f order by (f ->> 'matchday')::int, (f ->> 'slot')::int), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'matchday', x.round,
      'slot', x.slot,
      'group_id', x.group_id,
      'group_name', x.group_name,
      'home_team_id', x.home, 'away_team_id', x.away,
      'home', ht.short_name, 'away', at.short_name,
      'home_code', ht.code, 'away_code', at.code,
      'round_label', case when x.group_name is null then 'Matchday ' || x.round else x.group_name || ' · Matchday ' || x.round end,
      'scheduled_at', ((v_start + (x.round - 1) * v_days) + v_time + make_interval(mins => x.slot * v_spacing)) at time zone 'Africa/Lagos',
      'venue_id', v_venue
    ) f
    from (
      select fx.*, (row_number() over (partition by fx.round order by fx.group_name nulls first, fx.idx) - 1)::int slot
      from pg_temp._eksu_fx fx
    ) x
    join public.teams ht on ht.id = x.home join public.teams at on at.id = x.away
  ) q;

  return jsonb_build_object(
    'stage_id', st.id,
    'legs', v_legs,
    'match_count', jsonb_array_length(v_rows),
    'matchdays', (select count(distinct round) from pg_temp._eksu_fx),
    'existing_fixtures', (select count(*) from public.matches m where m.stage_id = st.id),
    'issues', to_jsonb(v_issues),
    'fixtures', v_rows,
    -- What the admin saw: confirm must reproduce exactly this.
    'hash', md5(v_rows::text)
  );
end $$;

create or replace function public.admin_preview_fixtures(p_stage_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.fixture_preview(p_stage_id, coalesce(p_config, '{}'::jsonb));
end $$;

/*
 * Creates the previewed fixtures — once. A repeated confirm with the same
 * preview returns the existing generation (idempotent). Refuses stages that
 * already have fixtures (hand-made fixture lists are never replaced) and a
 * stale preview (teams or settings changed since it was shown).
 */
create or replace function public.admin_confirm_fixtures(p_stage_id uuid, p_config jsonb, p_preview_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st public.competition_stages;
  gen public.fixture_generations;
  v_preview jsonb;
  v_id uuid;
  f jsonb;
  v_n int := 0;
begin
  perform private.require_admin();
  select * into st from public.competition_stages where id = p_stage_id for update;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  select * into gen from public.fixture_generations where stage_id = p_stage_id and kind = 'ROUND_ROBIN' and cleared_at is null;
  if found then
    if gen.config_hash = p_preview_hash then
      return jsonb_build_object('generation_id', gen.id, 'created', 0, 'idempotent', true, 'match_count', gen.match_count);
    end if;
    raise exception 'Fixtures were already generated for this stage. Clear them before generating again.' using errcode = 'EK409';
  end if;
  if exists (select 1 from public.matches where stage_id = p_stage_id) then
    raise exception 'This stage already has fixtures; the generator never replaces an existing fixture list.' using errcode = 'EK409';
  end if;
  v_preview := private.fixture_preview(p_stage_id, coalesce(p_config, '{}'::jsonb));
  if v_preview ->> 'hash' is distinct from p_preview_hash then
    raise exception 'The preview is out of date (teams or settings changed). Preview the fixtures again.' using errcode = 'EK409';
  end if;
  if jsonb_array_length(v_preview -> 'issues') > 0 then
    raise exception 'Fix these first: %', (select string_agg(x, '; ') from jsonb_array_elements_text(v_preview -> 'issues') x) using errcode = 'EK422';
  end if;
  if (v_preview ->> 'match_count')::int = 0 then
    raise exception 'There are no fixtures to create' using errcode = 'EK422';
  end if;

  insert into public.fixture_generations (stage_id, kind, config, config_hash, created_by)
  values (p_stage_id, 'ROUND_ROBIN', coalesce(p_config, '{}'::jsonb), p_preview_hash, auth.uid())
  returning id into v_id;
  for f in select * from jsonb_array_elements(v_preview -> 'fixtures') loop
    insert into public.matches (competition_id, stage_id, group_id, round_label, home_team_id, away_team_id,
      venue_id, scheduled_at, matchday, generation_id)
    values (st.competition_id, st.id, nullif(f ->> 'group_id', '')::uuid, f ->> 'round_label',
      (f ->> 'home_team_id')::uuid, (f ->> 'away_team_id')::uuid, nullif(f ->> 'venue_id', '')::uuid,
      (f ->> 'scheduled_at')::timestamptz, (f ->> 'matchday')::smallint, v_id);
    v_n := v_n + 1;
  end loop;
  update public.fixture_generations set match_count = v_n where id = v_id;
  perform private.recompute_standings(st.competition_id);
  perform private.audit('FIXTURES_GENERATED', 'competition_stage', st.id, null, null, null,
    jsonb_build_object('generation_id', v_id, 'match_count', v_n, 'legs', v_preview -> 'legs',
      'matchdays', v_preview -> 'matchdays', 'config', p_config, 'hash', p_preview_hash));
  return jsonb_build_object('generation_id', v_id, 'created', v_n, 'idempotent', false, 'match_count', v_n);
end $$;

/*
 * Regeneration path: removes a generated fixture list that is still untouched
 * (nothing kicked off, no operators, line-ups, followers, audience or audited
 * edits). Anything else must be rescheduled or cancelled instead.
 */
create or replace function public.admin_clear_generated_fixtures(p_stage_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gen public.fixture_generations; v_ids uuid[]; v_snapshot jsonb;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into gen from public.fixture_generations
  where stage_id = p_stage_id and kind = 'ROUND_ROBIN' and cleared_at is null for update;
  if not found then
    raise exception 'This stage has no generated fixtures to clear' using errcode = 'EK404';
  end if;
  select array_agg(id) into v_ids from public.matches where generation_id = gen.id;
  v_ids := coalesce(v_ids, '{}');
  if exists (select 1 from public.matches where id = any (v_ids) and status not in ('SCHEDULED', 'POSTPONED')) then
    raise exception 'Matches of this stage have already started; regenerating is not possible. Reschedule or cancel fixtures instead.' using errcode = 'EK409';
  end if;
  if exists (select 1 from public.audit_log where match_id = any (v_ids))
     or exists (select 1 from public.operator_assignments where match_id = any (v_ids))
     or exists (select 1 from public.match_lineups where match_id = any (v_ids))
     or exists (select 1 from public.match_notification_preferences where match_id = any (v_ids))
     or exists (select 1 from public.match_audience where match_id = any (v_ids)) then
    raise exception 'Some fixtures already have operators, line-ups, followers or audited edits. Reschedule or cancel them instead of regenerating.' using errcode = 'EK409';
  end if;
  select jsonb_agg(jsonb_build_object('home', home_team_id, 'away', away_team_id, 'matchday', matchday,
    'scheduled_at', scheduled_at, 'venue_id', venue_id) order by matchday, scheduled_at)
  into v_snapshot from public.matches where id = any (v_ids);
  delete from public.matches where id = any (v_ids);
  update public.fixture_generations set cleared_at = now(), cleared_by = auth.uid(), clear_reason = btrim(p_reason) where id = gen.id;
  perform private.recompute_standings((select competition_id from public.competition_stages where id = p_stage_id));
  perform private.audit('FIXTURES_CLEARED', 'competition_stage', p_stage_id, null, null,
    jsonb_build_object('generation_id', gen.id, 'fixtures', v_snapshot), jsonb_build_object('detail', btrim(p_reason)));
  return jsonb_build_object('cleared', cardinality(v_ids));
end $$;

-- ── 7. Scheduling ──────────────────────────────────────────────────────────
/*
 * Kick-off / venue / matchday of a fixture that has not started. A postponed
 * fixture given a new kick-off becomes SCHEDULED again. History is recorded
 * by trigger (fixture_schedule_history) with this reason.
 */
create or replace function public.admin_schedule_fixture(
  p_match_id uuid, p_scheduled_at timestamptz, p_venue_id uuid, p_matchday integer, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status not in ('SCHEDULED', 'POSTPONED') then
    raise exception 'Only fixtures that have not started can be rescheduled (match is %)', m.status using errcode = 'EK409';
  end if;
  if p_scheduled_at is null then
    raise exception 'A kick-off time is required' using errcode = 'EK422';
  end if;
  if p_venue_id is not null and not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'Venue not found' using errcode = 'EK404';
  end if;
  if p_matchday is not null and p_matchday not between 1 and 200 then
    raise exception 'Matchday must be between 1 and 200' using errcode = 'EK422';
  end if;
  if m.status = 'POSTPONED' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to reschedule a postponed match' using errcode = 'EK422';
  end if;
  v_before := private.match_snapshot(p_match_id) || jsonb_build_object('venue_id', m.venue_id, 'matchday', m.matchday);
  perform set_config('eksu.change_reason', coalesce(btrim(p_reason), ''), true);
  update public.matches set scheduled_at = p_scheduled_at, venue_id = p_venue_id, matchday = p_matchday,
    status = 'SCHEDULED', status_note = case when m.status = 'POSTPONED' then nullif(btrim(coalesce(p_reason, '')), '') else status_note end
  where id = p_match_id;
  perform set_config('eksu.change_reason', '', true);
  if m.tie_id is not null then
    update public.knockout_ties set scheduled_at = p_scheduled_at, venue_id = p_venue_id where id = m.tie_id;
  end if;
  perform private.bump_seq(p_match_id);
  perform private.audit('FIXTURE_RESCHEDULED', 'match', p_match_id, p_match_id, null, v_before,
    private.match_snapshot(p_match_id) || jsonb_build_object('venue_id', p_venue_id, 'matchday', p_matchday,
      'detail', nullif(btrim(coalesce(p_reason, '')), '')));
  perform private.after_match_change(p_match_id, 'FIXTURE_RESCHEDULED');
end $$;

-- ── 8. Knockout bracket ────────────────────────────────────────────────────
create or replace function private.ko_prefix(p_type text, p_order smallint)
returns text language sql immutable set search_path = '' as $$
  select case p_type when 'ROUND_OF_32' then 'R32' when 'ROUND_OF_16' then 'R16' when 'QUARTER_FINAL' then 'QF'
    when 'SEMI_FINAL' then 'SF' when 'THIRD_PLACE' then '3P' when 'FINAL' then 'F' else 'K' || p_order end;
$$;

create or replace function private.ordinal(p_n integer)
returns text language sql immutable set search_path = '' as $$
  select p_n || case when p_n % 100 in (11, 12, 13) then 'th' when p_n % 10 = 1 then 'st'
    when p_n % 10 = 2 then 'nd' when p_n % 10 = 3 then 'rd' else 'th' end;
$$;

create or replace function private.group_rank_label(p_rank integer, p_group text)
returns text language sql immutable set search_path = '' as $$
  select case p_rank when 1 then 'Winner ' when 2 then 'Runner-up ' else private.ordinal(p_rank) || ' ' end || p_group;
$$;

-- Standard seeded bracket order: 1 and 2 can only meet in the final.
create or replace function private.seed_order(p_size integer)
returns integer[] language plpgsql immutable set search_path = '' as $$
declare o integer[] := array[1, 2]; n integer := 2; nxt integer[]; s integer;
begin
  while n < p_size loop
    nxt := '{}';
    foreach s in array o loop
      nxt := nxt || s || (2 * n + 1 - s);
    end loop;
    o := nxt; n := n * 2;
  end loop;
  return o;
end $$;

/*
 * Bracket preview for a competition's knockout phase, starting at p_stage_id
 * (the first knockout round). Nothing is stored.
 *
 * Qualifiers come from the latest table stage before it (group ranks /
 * league ranks, per its qualification rules) or, for a pure knockout, from the
 * entered teams (by seed). The number of qualifiers must be 2, 4, 8, 16 or 32
 * (no byes in this version).
 *
 * Config:
 *   pairing: CROSS_GROUPS — A1 v B2, B1 v A2 … (placeholders allowed before the
 *            groups finish; requires 2 qualifiers per group)
 *            SEEDED — 1 v N, 2 v N-1 … in a standard bracket (qualification
 *            must be complete; seeds by group finish, then record)
 *   avoid_same_group (SEEDED, default true), third_place (default: when a
 *   THIRD_PLACE stage exists)
 */
create or replace function private.knockout_preview(p_stage_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s1 public.competition_stages;
  src public.competition_stages;
  c public.competitions;
  v_pairing text := coalesce(nullif(p_config ->> 'pairing', ''), 'SEEDED');
  v_avoid boolean := coalesce((p_config ->> 'avoid_same_group')::boolean, true);
  v_third boolean;
  v_q int; v_n int; v_best_rank int; v_best_count int; v_groups int;
  v_rounds int;
  v_chain uuid[];
  v_third_stage public.competition_stages;
  v_slots jsonb := '[]'::jsonb;   -- first-round sources, in bracket order (2 per tie)
  v_seeds jsonb;
  v_order int[];
  v_out jsonb := '[]'::jsonb;
  v_ties jsonb;
  st public.competition_stages;
  r int; i int; k int;
  v_prev_codes text[]; v_codes text[];
  g record;
  a jsonb; b jsonb; tmp jsonb;
begin
  select * into s1 from public.competition_stages where id = p_stage_id;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  if not private.stage_is_knockout(s1.stage_type) or s1.stage_type = 'THIRD_PLACE' then
    raise exception 'Choose the first knockout round (e.g. the quarter-finals)' using errcode = 'EK422';
  end if;
  select * into c from public.competitions where id = s1.competition_id;
  if v_pairing not in ('CROSS_GROUPS', 'SEEDED') then
    raise exception 'Unknown pairing rule %', v_pairing using errcode = 'EK422';
  end if;

  select * into src from public.competition_stages
  where competition_id = c.id and stage_type in ('LEAGUE', 'GROUP') and has_table and stage_order < s1.stage_order
  order by stage_order desc limit 1;

  if src.id is null then
    -- Pure knockout: the entered teams, by seed.
    select count(*) into v_q from public.competition_entries where competition_id = c.id;
    if v_pairing = 'CROSS_GROUPS' then
      raise exception 'Cross-group pairing needs a group stage' using errcode = 'EK422';
    end if;
    select jsonb_agg(jsonb_build_object('type', 'TEAM', 'team_id', ce.team_id, 'label', t.short_name, 'group', null)
      order by ce.seed nulls last, t.name, t.id)
    into v_seeds from public.competition_entries ce join public.teams t on t.id = ce.team_id where ce.competition_id = c.id;
  else
    v_n := coalesce((src.qualification ->> 'per_group')::int, (src.qualification ->> 'top')::int);
    v_best_rank := (src.qualification -> 'best_ranked' ->> 'rank')::int;
    v_best_count := coalesce((src.qualification -> 'best_ranked' ->> 'count')::int, 0);
    if v_n is null then
      raise exception 'Set the qualification rules of "%" first (e.g. top 2 per group)', src.name using errcode = 'EK422';
    end if;
    select count(*) into v_groups from public.competition_groups where stage_id = src.id;
    v_q := case when v_groups > 0 then v_groups * v_n + v_best_count else v_n end;

    if v_pairing = 'CROSS_GROUPS' then
      if v_groups = 0 or v_n <> 2 or v_best_count > 0 or (v_groups > 1 and v_groups % 2 = 1) then
        raise exception 'Cross-group pairing needs an even number of groups with exactly 2 qualifiers each' using errcode = 'EK422';
      end if;
    else
      -- SEEDED: qualification must be final so seeds are known.
      if exists (select 1 from public.standings where stage_id = src.id and coalesce(qualification, 'PENDING') = 'PENDING') then
        raise exception 'Qualification from "%" is not complete yet. Finish the stage (or record decisions) first.', src.name using errcode = 'EK409';
      end if;
      if (select count(*) from public.standings where stage_id = src.id and qualification = 'QUALIFIED') <> v_q then
        raise exception 'Expected % qualified teams from "%"', v_q, src.name using errcode = 'EK409';
      end if;
      select jsonb_agg(jsonb_build_object('type', 'TEAM', 'team_id', s.team_id, 'label', t.short_name, 'group', s.group_id)
        order by s.rank, s.points desc, s.goal_difference desc, s.goals_for desc, s.fair_play_points, t.name, t.id)
      into v_seeds from public.standings s join public.teams t on t.id = s.team_id
      where s.stage_id = src.id and s.qualification = 'QUALIFIED';
    end if;
  end if;

  if v_q not in (2, 4, 8, 16, 32) then
    raise exception 'A knockout bracket needs 2, 4, 8, 16 or 32 teams (got %); byes are not supported', v_q using errcode = 'EK422';
  end if;
  v_rounds := round(log(2, v_q))::int;

  select array_agg(id order by stage_order) into v_chain from (
    select id, stage_order from public.competition_stages
    where competition_id = c.id and stage_order >= s1.stage_order
      and private.stage_is_knockout(stage_type) and stage_type <> 'THIRD_PLACE'
    order by stage_order limit v_rounds) x;
  if coalesce(cardinality(v_chain), 0) < v_rounds then
    raise exception '% teams need % knockout rounds from "%" onwards (e.g. % ); add the missing stages', v_q, v_rounds, s1.name,
      case v_rounds when 1 then 'Final' when 2 then 'Semi-final, Final' when 3 then 'Quarter-final, Semi-final, Final'
        when 4 then 'Round of 16 … Final' else 'Round of 32 … Final' end using errcode = 'EK422';
  end if;
  select * into v_third_stage from public.competition_stages where competition_id = c.id and stage_type = 'THIRD_PLACE' order by stage_order limit 1;
  v_third := coalesce((p_config ->> 'third_place')::boolean, v_third_stage.id is not null) and v_q >= 4;
  if v_third and v_third_stage.id is null then
    raise exception 'Add a third-place stage to play a third-place match' using errcode = 'EK422';
  end if;

  -- First-round sources in bracket order.
  if v_pairing = 'CROSS_GROUPS' then
    if to_regclass('pg_temp._eksu_grp') is null then
    create temp table _eksu_grp (n int, id uuid, name text) on commit drop;
  end if;
    truncate pg_temp._eksu_grp;
    insert into pg_temp._eksu_grp select row_number() over (order by name, id), id, name from public.competition_groups where stage_id = src.id;
    if v_groups = 1 then
      select jsonb_build_array(
        jsonb_build_object('type', 'GROUP_RANK', 'group_id', id, 'stage_id', src.id, 'rank', 1, 'label', private.group_rank_label(1, name)),
        jsonb_build_object('type', 'GROUP_RANK', 'group_id', id, 'stage_id', src.id, 'rank', 2, 'label', private.group_rank_label(2, name)))
      into v_slots from pg_temp._eksu_grp;
    else
      for k in 0 .. 1 loop
        for g in select x.id gx, x.name nx, y.id gy, y.name ny from pg_temp._eksu_grp x join pg_temp._eksu_grp y on y.n = x.n + 1
          where x.n % 2 = 1 order by x.n loop
          if k = 0 then
            v_slots := v_slots
              || jsonb_build_object('type', 'GROUP_RANK', 'group_id', g.gx, 'stage_id', src.id, 'rank', 1, 'label', private.group_rank_label(1, g.nx))
              || jsonb_build_object('type', 'GROUP_RANK', 'group_id', g.gy, 'stage_id', src.id, 'rank', 2, 'label', private.group_rank_label(2, g.ny));
          else
            v_slots := v_slots
              || jsonb_build_object('type', 'GROUP_RANK', 'group_id', g.gy, 'stage_id', src.id, 'rank', 1, 'label', private.group_rank_label(1, g.ny))
              || jsonb_build_object('type', 'GROUP_RANK', 'group_id', g.gx, 'stage_id', src.id, 'rank', 2, 'label', private.group_rank_label(2, g.nx));
          end if;
        end loop;
      end loop;
    end if;
  else
    v_order := private.seed_order(v_q);
    for i in 1 .. v_q loop
      v_slots := v_slots || (v_seeds -> (v_order[i] - 1));
    end loop;
    -- Avoid first-round rematches from the same group: swap the away team
    -- with a later tie's away team when that leaves both ties valid.
    if v_avoid and src.id is not null and exists (select 1 from public.competition_groups where stage_id = src.id) then
      for i in 0 .. v_q / 2 - 1 loop
        a := v_slots -> (2 * i); b := v_slots -> (2 * i + 1);
        if a ->> 'group' is not null and a ->> 'group' = b ->> 'group' then
          for k in i + 1 .. v_q / 2 - 1 loop
            if (v_slots -> (2 * k)) ->> 'group' is distinct from b ->> 'group'
               and (v_slots -> (2 * k + 1)) ->> 'group' is distinct from a ->> 'group' then
              tmp := v_slots -> (2 * k + 1);
              v_slots := jsonb_set(jsonb_set(v_slots, array[(2 * k + 1)::text], b), array[(2 * i + 1)::text], tmp);
              exit;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;

  -- Rounds.
  for r in 1 .. v_rounds loop
    select * into st from public.competition_stages where id = v_chain[r];
    v_ties := '[]'::jsonb; v_codes := '{}';
    for i in 1 .. (v_q / (2 ^ r))::int loop
      v_codes := v_codes || (private.ko_prefix(st.stage_type, st.stage_order) || case when (v_q / (2 ^ r))::int = 1 then '' else i::text end);
      if r = 1 then
        a := v_slots -> (2 * i - 2); b := v_slots -> (2 * i - 1);
      else
        a := jsonb_build_object('type', 'WINNER', 'tie_code', v_prev_codes[2 * i - 1], 'label', 'Winner ' || v_prev_codes[2 * i - 1]);
        b := jsonb_build_object('type', 'WINNER', 'tie_code', v_prev_codes[2 * i], 'label', 'Winner ' || v_prev_codes[2 * i]);
      end if;
      v_ties := v_ties || jsonb_build_object('position', i, 'code', v_codes[i], 'home', a - 'group', 'away', b - 'group');
    end loop;
    v_out := v_out || jsonb_build_object('stage_id', st.id, 'name', st.name, 'stage_type', st.stage_type, 'ties', v_ties);
    if v_third and (v_q / (2 ^ r))::int = 2 then
      -- Semi-final losers meet in the third-place match.
      v_out := v_out || jsonb_build_object('stage_id', v_third_stage.id, 'name', v_third_stage.name, 'stage_type', 'THIRD_PLACE',
        'third_place', true,
        'ties', jsonb_build_array(jsonb_build_object('position', 1, 'code', '3P',
          'home', jsonb_build_object('type', 'LOSER', 'tie_code', v_codes[1], 'label', 'Loser ' || v_codes[1]),
          'away', jsonb_build_object('type', 'LOSER', 'tie_code', v_codes[2], 'label', 'Loser ' || v_codes[2]))));
    end if;
    v_prev_codes := v_codes;
  end loop;

  return jsonb_build_object(
    'first_stage_id', s1.id,
    'source_stage_id', src.id,
    'qualifiers', v_q,
    'pairing', v_pairing,
    'third_place', v_third,
    'stages', v_out,
    'existing_ties', (select count(*) from public.knockout_ties t where t.competition_id = c.id),
    'hash', md5(v_out::text)
  );
end $$;

create or replace function public.admin_preview_knockout(p_stage_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.knockout_preview(p_stage_id, coalesce(p_config, '{}'::jsonb));
end $$;

-- Team for a tie side from its source, or NULL while still unknown.
create or replace function private.resolve_tie_source(
  p_type text, p_team uuid, p_group uuid, p_stage uuid, p_rank smallint, p_tie uuid
) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid; src public.knockout_ties;
begin
  if p_type = 'TEAM' then
    return p_team;
  elsif p_type in ('GROUP_RANK', 'LEAGUE_RANK') then
    -- Only a final, untied, qualified position resolves automatically.
    select s.team_id into v from public.standings s
    where s.stage_id = p_stage and s.group_id is not distinct from p_group and s.rank = p_rank
      and not s.tied and s.qualification = 'QUALIFIED';
    return v;
  elsif p_type in ('WINNER', 'LOSER') then
    select * into src from public.knockout_ties where id = p_tie;
    if src.needs_reconciliation then
      return null;
    end if;
    return case p_type when 'WINNER' then src.winner_team_id else src.loser_team_id end;
  end if;
  return null;
end $$;

/*
 * Fills tie sides whose source is now known and creates a tie's match once
 * both teams are known and a kick-off is set. Idempotent; repeat until stable
 * (a resolved side can unlock the next round).
 */
create or replace function private.resolve_bracket(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties; v_home uuid; v_away uuid; v_changed boolean := true; v_pass int := 0; v_match uuid; st public.competition_stages;
begin
  while v_changed and v_pass < 8 loop
    v_changed := false; v_pass := v_pass + 1;
    for t in select * from public.knockout_ties where competition_id = p_competition_id order by created_at, position for update loop
      v_home := coalesce(t.home_team_id, private.resolve_tie_source(t.home_source_type, t.home_source_team_id, t.home_source_group_id,
        t.home_source_stage_id, t.home_source_rank, t.home_source_tie_id));
      v_away := coalesce(t.away_team_id, private.resolve_tie_source(t.away_source_type, t.away_source_team_id, t.away_source_group_id,
        t.away_source_stage_id, t.away_source_rank, t.away_source_tie_id));
      if v_home is not distinct from t.home_team_id and v_away is not distinct from t.away_team_id then
        null;
      elsif v_home is not null and v_home = v_away then
        raise warning 'tie % would pair a team with itself; left unresolved', t.id;
        continue;
      else
        update public.knockout_ties set home_team_id = v_home, away_team_id = v_away where id = t.id;
        v_changed := true;
      end if;
      if v_home is not null and v_away is not null and t.match_id is null and t.scheduled_at is not null then
        select * into st from public.competition_stages where id = t.stage_id;
        insert into public.matches (competition_id, stage_id, round_label, home_team_id, away_team_id, venue_id, scheduled_at, tie_id)
        values (t.competition_id, t.stage_id, st.name || case when t.code ~ '[0-9]$' then ' · ' || t.code else '' end,
          v_home, v_away, t.venue_id, t.scheduled_at, t.id)
        returning id into v_match;
        update public.knockout_ties set match_id = v_match where id = t.id;
        perform private.audit('KNOCKOUT_FIXTURE_CREATED', 'knockout_tie', t.id, null, null, null,
          jsonb_build_object('match_id', v_match, 'code', t.code, 'home', v_home, 'away', v_away));
        v_changed := true;
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.admin_confirm_knockout(p_stage_id uuid, p_config jsonb, p_preview_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s1 public.competition_stages;
  gen public.fixture_generations;
  v_preview jsonb; v_gen uuid; sg jsonb; tj jsonb; side text;
  v_codes jsonb := '{}'::jsonb; -- code → tie id
  v_id uuid; v_n int := 0;
  src jsonb;
begin
  perform private.require_admin();
  select * into s1 from public.competition_stages where id = p_stage_id for update;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  select * into gen from public.fixture_generations where stage_id = p_stage_id and kind = 'KNOCKOUT' and cleared_at is null;
  if found then
    if gen.config_hash = p_preview_hash then
      return jsonb_build_object('generation_id', gen.id, 'created', 0, 'idempotent', true);
    end if;
    raise exception 'The knockout bracket was already generated' using errcode = 'EK409';
  end if;
  v_preview := private.knockout_preview(p_stage_id, coalesce(p_config, '{}'::jsonb));
  if v_preview ->> 'hash' is distinct from p_preview_hash then
    raise exception 'The preview is out of date (results or settings changed). Preview the bracket again.' using errcode = 'EK409';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_preview -> 'stages') x
    where exists (select 1 from public.knockout_ties t where t.stage_id = (x ->> 'stage_id')::uuid)
       or exists (select 1 from public.matches m where m.stage_id = (x ->> 'stage_id')::uuid)
  ) then
    raise exception 'A knockout stage already has ties or fixtures' using errcode = 'EK409';
  end if;

  insert into public.fixture_generations (stage_id, kind, config, config_hash, created_by)
  values (p_stage_id, 'KNOCKOUT', coalesce(p_config, '{}'::jsonb), p_preview_hash, auth.uid()) returning id into v_gen;

  for sg in select * from jsonb_array_elements(v_preview -> 'stages') loop
    for tj in select * from jsonb_array_elements(sg -> 'ties') loop
      insert into public.knockout_ties (competition_id, stage_id, generation_id, code, position,
        home_source_type, home_source_team_id, home_source_group_id, home_source_stage_id, home_source_rank, home_source_tie_id, home_label,
        away_source_type, away_source_team_id, away_source_group_id, away_source_stage_id, away_source_rank, away_source_tie_id, away_label)
      values (s1.competition_id, (sg ->> 'stage_id')::uuid, v_gen, tj ->> 'code', (tj ->> 'position')::smallint,
        tj -> 'home' ->> 'type', nullif(tj -> 'home' ->> 'team_id', '')::uuid, nullif(tj -> 'home' ->> 'group_id', '')::uuid,
        nullif(tj -> 'home' ->> 'stage_id', '')::uuid, nullif(tj -> 'home' ->> 'rank', '')::smallint,
        nullif(v_codes ->> (tj -> 'home' ->> 'tie_code'), '')::uuid, tj -> 'home' ->> 'label',
        tj -> 'away' ->> 'type', nullif(tj -> 'away' ->> 'team_id', '')::uuid, nullif(tj -> 'away' ->> 'group_id', '')::uuid,
        nullif(tj -> 'away' ->> 'stage_id', '')::uuid, nullif(tj -> 'away' ->> 'rank', '')::smallint,
        nullif(v_codes ->> (tj -> 'away' ->> 'tie_code'), '')::uuid, tj -> 'away' ->> 'label')
      returning id into v_id;
      v_codes := v_codes || jsonb_build_object(tj ->> 'code', v_id);
      v_n := v_n + 1;
    end loop;
  end loop;
  update public.fixture_generations set match_count = v_n where id = v_gen;
  perform private.resolve_bracket(s1.competition_id);
  perform private.audit('KNOCKOUT_GENERATED', 'competition_stage', s1.id, null, null, null,
    jsonb_build_object('generation_id', v_gen, 'ties', v_n, 'qualifiers', v_preview -> 'qualifiers',
      'pairing', v_preview -> 'pairing', 'third_place', v_preview -> 'third_place', 'hash', p_preview_hash));
  return jsonb_build_object('generation_id', v_gen, 'created', v_n, 'idempotent', false);
end $$;

-- Kick-off / venue for a tie. Creates the match when both teams are known.
create or replace function public.admin_schedule_tie(p_tie_id uuid, p_scheduled_at timestamptz, p_venue_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties;
begin
  perform private.require_admin();
  select * into t from public.knockout_ties where id = p_tie_id for update;
  if not found then
    raise exception 'Tie not found' using errcode = 'EK404';
  end if;
  if p_scheduled_at is null then
    raise exception 'A kick-off time is required' using errcode = 'EK422';
  end if;
  if t.match_id is not null then
    perform public.admin_schedule_fixture(t.match_id, p_scheduled_at, p_venue_id, null, p_reason);
    return;
  end if;
  if p_venue_id is not null and not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'Venue not found' using errcode = 'EK404';
  end if;
  update public.knockout_ties set scheduled_at = p_scheduled_at, venue_id = p_venue_id where id = p_tie_id;
  perform private.audit('TIE_SCHEDULED', 'knockout_tie', p_tie_id, null, null,
    jsonb_build_object('scheduled_at', t.scheduled_at, 'venue_id', t.venue_id),
    jsonb_build_object('scheduled_at', p_scheduled_at, 'venue_id', p_venue_id, 'detail', nullif(btrim(coalesce(p_reason, '')), '')));
  perform private.resolve_bracket(t.competition_id);
end $$;

/*
 * Advancement after a knockout match is final. Idempotent: the first settle
 * records the winner (TEAM_ADVANCED); a later correction that changes the
 * winner never rewrites the bracket silently — it flags the tie for
 * reconciliation instead.
 */
create or replace function private.settle_tie(p_tie_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties; m public.matches; v_loser uuid;
begin
  select * into t from public.knockout_ties where id = p_tie_id for update;
  if not found or t.match_id is null then
    return;
  end if;
  select * into m from public.matches where id = t.match_id;
  if m.status <> 'FT' then
    return;
  end if;
  if t.winner_team_id is null then
    if m.winner_team_id is null then
      return; -- level with no shoot-out: an admin decides (replay / lots)
    end if;
    v_loser := case when m.winner_team_id = m.home_team_id then m.away_team_id else m.home_team_id end;
    update public.knockout_ties set winner_team_id = m.winner_team_id, loser_team_id = v_loser,
      decided_by = m.decided_by, advanced_at = now(), needs_reconciliation = false, reconciliation_note = null
    where id = t.id;
    perform private.audit('TEAM_ADVANCED', 'knockout_tie', t.id, m.id, null, null,
      jsonb_build_object('code', t.code, 'winner', m.winner_team_id, 'loser', v_loser, 'decided_by', m.decided_by));
    perform private.resolve_bracket(t.competition_id);
  elsif m.winner_team_id is distinct from t.winner_team_id then
    if not t.needs_reconciliation then
      update public.knockout_ties set needs_reconciliation = true,
        reconciliation_note = 'The corrected result no longer matches the recorded advancement'
      where id = t.id;
      perform private.audit('KNOCKOUT_RECONCILIATION_REQUIRED', 'knockout_tie', t.id, m.id, null,
        jsonb_build_object('recorded_winner', t.winner_team_id), jsonb_build_object('result_winner', m.winner_team_id));
    end if;
  elsif t.needs_reconciliation then
    update public.knockout_ties set needs_reconciliation = false, reconciliation_note = null where id = t.id;
  end if;
end $$;

-- Replace a team in a downstream tie (and its unstarted match).
create or replace function private.replace_downstream_team(p_tie public.knockout_ties, p_kind text, p_old uuid, p_new uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.knockout_ties; dm public.matches;
begin
  for d in select * from public.knockout_ties
    where (home_source_tie_id = p_tie.id and home_source_type = p_kind) or (away_source_tie_id = p_tie.id and away_source_type = p_kind)
    for update loop
    if d.winner_team_id is not null then
      raise exception 'Cannot reconcile: % has already been decided. Correct it first.', d.code using errcode = 'EK409';
    end if;
    if d.match_id is not null then
      select * into dm from public.matches where id = d.match_id for update;
      if dm.status not in ('SCHEDULED', 'POSTPONED') then
        raise exception 'Cannot reconcile: % has already started.', d.code using errcode = 'EK409';
      end if;
      if exists (select 1 from public.match_lineups l where l.match_id = dm.id and l.team_id = p_old) then
        raise exception 'Cannot reconcile automatically: % already has a line-up for the team being replaced.', d.code using errcode = 'EK409';
      end if;
    end if;
    if d.home_source_tie_id = p_tie.id and d.home_source_type = p_kind and d.home_team_id is not distinct from p_old then
      update public.knockout_ties set home_team_id = p_new where id = d.id;
      if d.match_id is not null then
        update public.matches set home_team_id = p_new where id = d.match_id;
      end if;
    end if;
    if d.away_source_tie_id = p_tie.id and d.away_source_type = p_kind and d.away_team_id is not distinct from p_old then
      update public.knockout_ties set away_team_id = p_new where id = d.id;
      if d.match_id is not null then
        update public.matches set away_team_id = p_new where id = d.match_id;
      end if;
    end if;
  end loop;
end $$;

-- Safe reconciliation of a tie whose corrected result changed the winner.
create or replace function public.admin_reconcile_tie(p_tie_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties; m public.matches; v_loser uuid; c public.competitions;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into t from public.knockout_ties where id = p_tie_id for update;
  if not found then
    raise exception 'Tie not found' using errcode = 'EK404';
  end if;
  if not t.needs_reconciliation then
    raise exception 'This tie does not need reconciliation' using errcode = 'EK409';
  end if;
  select * into c from public.competitions where id = t.competition_id;
  if c.status = 'COMPLETED' then
    raise exception 'The competition is completed; reopen it (with an override) before changing its bracket' using errcode = 'EK409';
  end if;
  select * into m from public.matches where id = t.match_id;
  if m.winner_team_id is null then
    raise exception 'The corrected result is level; decide the tie instead' using errcode = 'EK409';
  end if;
  v_loser := case when m.winner_team_id = m.home_team_id then m.away_team_id else m.home_team_id end;
  perform private.replace_downstream_team(t, 'WINNER', t.winner_team_id, m.winner_team_id);
  perform private.replace_downstream_team(t, 'LOSER', t.loser_team_id, v_loser);
  update public.knockout_ties set winner_team_id = m.winner_team_id, loser_team_id = v_loser, decided_by = m.decided_by,
    advanced_at = now(), needs_reconciliation = false, reconciliation_note = null
  where id = t.id;
  perform private.audit('KNOCKOUT_RECONCILED', 'knockout_tie', t.id, m.id, null,
    jsonb_build_object('winner', t.winner_team_id, 'loser', t.loser_team_id),
    jsonb_build_object('winner', m.winner_team_id, 'loser', v_loser, 'detail', btrim(p_reason)));
  perform private.resolve_bracket(t.competition_id);
end $$;

/*
 * Explicit admin decision of a tie: level with no shoot-out (replay / lots),
 * a walkover, or a cancelled/abandoned tie. Audited TEAM_ADVANCED.
 */
create or replace function public.admin_decide_tie(p_tie_id uuid, p_winner_team_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties; m public.matches; v_loser uuid;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into t from public.knockout_ties where id = p_tie_id for update;
  if not found then
    raise exception 'Tie not found' using errcode = 'EK404';
  end if;
  if t.home_team_id is null or t.away_team_id is null then
    raise exception 'Both teams of the tie must be known first' using errcode = 'EK409';
  end if;
  if p_winner_team_id is null or p_winner_team_id not in (t.home_team_id, t.away_team_id) then
    raise exception 'The winner must be one of the two teams' using errcode = 'EK422';
  end if;
  if t.winner_team_id is not null then
    raise exception 'This tie is already decided%', case when t.needs_reconciliation then ' — reconcile it instead' else '' end using errcode = 'EK409';
  end if;
  if t.match_id is not null then
    select * into m from public.matches where id = t.match_id;
    if m.status = any (private.in_progress_statuses()) then
      raise exception 'The match is in progress' using errcode = 'EK409';
    end if;
    if m.status = 'FT' and m.winner_team_id is not null then
      raise exception 'The match already has a winner; advancement is automatic' using errcode = 'EK409';
    end if;
  end if;
  v_loser := case when p_winner_team_id = t.home_team_id then t.away_team_id else t.home_team_id end;
  update public.knockout_ties set winner_team_id = p_winner_team_id, loser_team_id = v_loser, decided_by = 'ADMIN',
    decision_reason = btrim(p_reason), advanced_at = now()
  where id = t.id;
  perform private.audit('TEAM_ADVANCED', 'knockout_tie', t.id, t.match_id, null, null,
    jsonb_build_object('code', t.code, 'winner', p_winner_team_id, 'loser', v_loser, 'decided_by', 'ADMIN', 'detail', btrim(p_reason)));
  perform private.resolve_bracket(t.competition_id);
end $$;

-- Manual placement of a team into an unresolved slot (e.g. lots between
-- teams still level for a group position). Audited.
create or replace function public.admin_resolve_tie_side(p_tie_id uuid, p_side text, p_team_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.knockout_ties;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  if p_side not in ('HOME', 'AWAY') then
    raise exception 'Side must be HOME or AWAY' using errcode = 'EK422';
  end if;
  select * into t from public.knockout_ties where id = p_tie_id for update;
  if not found then
    raise exception 'Tie not found' using errcode = 'EK404';
  end if;
  if t.match_id is not null or (p_side = 'HOME' and t.home_team_id is not null) or (p_side = 'AWAY' and t.away_team_id is not null) then
    raise exception 'That side is already known' using errcode = 'EK409';
  end if;
  if not exists (select 1 from public.competition_entries where competition_id = t.competition_id and team_id = p_team_id) then
    raise exception 'The team is not entered in this competition' using errcode = 'EK422';
  end if;
  if p_team_id in (t.home_team_id, t.away_team_id) then
    raise exception 'A team cannot play itself' using errcode = 'EK422';
  end if;
  if p_side = 'HOME' then
    update public.knockout_ties set home_team_id = p_team_id where id = t.id;
  else
    update public.knockout_ties set away_team_id = p_team_id where id = t.id;
  end if;
  perform private.audit('TEAM_ADVANCED', 'knockout_tie', t.id, null, null, null,
    jsonb_build_object('code', t.code, 'side', p_side, 'team', p_team_id, 'decided_by', 'ADMIN', 'detail', btrim(p_reason)));
  perform private.resolve_bracket(t.competition_id);
end $$;

-- ── 9. Match engine: extra time + penalty shoot-out ────────────────────────
/*
 * Regulation 1H → HT → 2H. A knockout match level after 90 minutes continues
 * (when its stage allows) with ET_BREAK → ET1 → ET_BREAK → ET2, then PENS.
 * Group/league matches never do: a level result there is a draw.
 */
create or replace function private.match_rules(p_match_id uuid)
returns table (needs_winner boolean, extra_time boolean, penalties boolean)
language sql stable security definer set search_path = '' as $$
  select x.nw, x.nw and x.et, x.nw and x.pen
  from (
    select (m.tie_id is not null or coalesce(private.stage_is_knockout(s.stage_type), false)) as nw,
      coalesce(s.extra_time_allowed, c.extra_time_enabled) as et,
      coalesce(s.penalties_allowed, c.penalties_enabled) as pen
    from public.matches m
    join public.competitions c on c.id = m.competition_id
    left join public.competition_stages s on s.id = m.stage_id
    where m.id = p_match_id
  ) x;
$$;

create or replace function private.match_rules_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('needs_winner', r.needs_winner, 'extra_time', r.extra_time, 'penalties', r.penalties)
  from private.match_rules(p_match_id) r;
$$;

-- Shoot-out state from non-voided kicks. Best of five, then sudden death.
create or replace function private.shootout_state(p_match_id uuid)
returns table (home_taken integer, away_taken integer, home_scored integer, away_scored integer, decided boolean, winner_team_id uuid)
language sql stable security definer set search_path = '' as $$
  with m as (select * from public.matches where id = p_match_id),
  k as (
    select
      count(*) filter (where a.team_id = m.home_team_id)::int ht,
      count(*) filter (where a.team_id = m.away_team_id)::int at,
      count(*) filter (where a.team_id = m.home_team_id and a.outcome = 'SCORED')::int hs,
      count(*) filter (where a.team_id = m.away_team_id and a.outcome = 'SCORED')::int as_
    from m left join public.match_shootout_attempts a on a.match_id = m.id and a.voided_at is null
  ),
  d as (
    select k.*, (
      (k.ht <= 5 and k.at <= 5 and (k.hs + (5 - k.ht) < k.as_ or k.as_ + (5 - k.at) < k.hs))
      or (k.ht = k.at and k.ht >= 5 and k.hs <> k.as_)
    ) as decided
    from k
  )
  select d.ht, d.at, d.hs, d.as_, d.decided,
    case when d.decided then case when d.hs > d.as_ then m.home_team_id else m.away_team_id end end
  from d, m;
$$;

create or replace function private.recompute_shootout(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches m set
    home_pens = case when s.home_taken + s.away_taken > 0 then s.home_scored end,
    away_pens = case when s.home_taken + s.away_taken > 0 then s.away_scored end
  from private.shootout_state(p_match_id) s
  where m.id = p_match_id;
$$;

-- Score (always from non-voided events), the 90-minute score, and — once
-- final — the winner and how it was decided.
create or replace function private.recompute_score(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.matches; s record;
begin
  update public.matches m set
    home_score = x.home, away_score = x.away, home_score_90 = x.home90, away_score_90 = x.away90
  from (
    select
      count(*) filter (where (et.scores_for = 'SELF' and e.team_id = mm.home_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.away_team_id)) as home,
      count(*) filter (where (et.scores_for = 'SELF' and e.team_id = mm.away_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.home_team_id)) as away,
      count(*) filter (where e.period <= 2 and ((et.scores_for = 'SELF' and e.team_id = mm.home_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.away_team_id))) as home90,
      count(*) filter (where e.period <= 2 and ((et.scores_for = 'SELF' and e.team_id = mm.away_team_id)
                          or (et.scores_for = 'OPPONENT' and e.team_id = mm.home_team_id))) as away90
    from public.matches mm
    left join public.match_events e on e.match_id = mm.id and e.voided_at is null
    left join public.event_types et on et.code = e.type and et.scores_for is not null
    where mm.id = p_match_id
  ) x
  where m.id = p_match_id
  returning m.* into v;

  if v.status <> 'FT' then
    update public.matches set winner_team_id = null, decided_by = null
    where id = p_match_id and (winner_team_id is not null or decided_by is not null);
    return;
  end if;
  select * into s from private.shootout_state(p_match_id);
  update public.matches set
    winner_team_id = case
      when v.home_score > v.away_score then v.home_team_id
      when v.away_score > v.home_score then v.away_team_id
      when s.decided then s.winner_team_id end,
    decided_by = case
      when v.home_score <> v.away_score then
        case when v.home_score_90 is distinct from v.away_score_90 then 'REGULATION' else 'EXTRA_TIME' end
      when s.decided then 'PENALTIES' end
  where id = p_match_id;
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

create or replace function private.shootout_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.match_shootout_attempts where match_id = p_match_id)
    and (select status from public.matches where id = p_match_id) <> 'PENS' then null else
  (select jsonb_build_object(
    'home_taken', s.home_taken, 'away_taken', s.away_taken,
    'home_scored', s.home_scored, 'away_scored', s.away_scored,
    'decided', s.decided, 'winner_team_id', s.winner_team_id,
    'kicks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'seq', a.seq, 'team_id', a.team_id, 'outcome', a.outcome,
        'player_id', coalesce(a.player_id, a.demo_player_id),
        'shirt_number', coalesce(private.shirt_for(a.match_id, a.team_id, a.player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = a.demo_player_id)),
        'recorded_at', a.recorded_at, 'voided_at', a.voided_at, 'void_reason', a.void_reason
      ) order by a.seq)
      from public.match_shootout_attempts a where a.match_id = p_match_id
    ), '[]'::jsonb)
  ) from private.shootout_state(p_match_id) s) end;
$$;

-- Public shoot-out: valid kicks only, shirt numbers and names as in feeds.
create or replace function private.public_shootout_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.match_shootout_attempts where match_id = p_match_id and voided_at is null)
    and (select status from public.matches where id = p_match_id) <> 'PENS' then null else
  (select jsonb_build_object(
    'home_scored', s.home_scored, 'away_scored', s.away_scored,
    'home_taken', s.home_taken, 'away_taken', s.away_taken,
    'decided', s.decided, 'winner_team_id', s.winner_team_id,
    'kicks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'seq', a.seq, 'team_id', a.team_id, 'outcome', a.outcome,
        'shirt_number', coalesce(private.shirt_for(a.match_id, a.team_id, a.player_id),
          (select d.shirt_number from public.demo_lineup_players d where d.id = a.demo_player_id)),
        'player_name', coalesce((select p.display_name from public.players p where p.id = a.player_id),
          (select d.display_name from public.demo_lineup_players d where d.id = a.demo_player_id))
      ) order by a.seq)
      from public.match_shootout_attempts a where a.match_id = p_match_id and a.voided_at is null
    ), '[]'::jsonb)
  ) from private.shootout_state(p_match_id) s) end;
$$;

create or replace function public.end_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb; r record; v_level boolean; v_next public.match_status; v_from text;
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
      raise exception 'Level after 90 minutes, but this stage has no extra time or penalties. End the match; an administrator decides the tie.' using errcode = 'EK409';
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
    -- The shoot-out has no running clock.
    update public.matches set current_period = 5, period_started_at = now(), period_ended_at = now(),
      period_offset_seconds = 7200, clock_running = false, paused_at = null, accumulated_pause_seconds = 0, stoppage_seconds = 0
    where id = p_match_id;
    insert into public.match_periods (match_id, period, offset_seconds, started_at)
    values (p_match_id, 5, 7200, now()) on conflict (match_id, period) do nothing;
    perform private.audit('SHOOTOUT_STARTED', 'match', p_match_id, p_match_id, p_intent_id, null,
      jsonb_build_object('detail', 'Penalty shoot-out'));
  end if;
  perform private.bump_seq(p_match_id);

  perform private.finish_command(p_match_id, p_intent_id, 'END_PERIOD', 'PERIOD_ENDED', 'match', p_match_id, v_before, to_jsonb(v_from));
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.start_period(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb; v_period smallint; v_offset integer; v_status public.match_status;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'START_PERIOD');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['HT', 'ET_BREAK']::public.match_status[], 'Starting the next period');
  perform private.require_control(m);
  if m.status = 'HT' then
    v_period := 2; v_offset := 2700; v_status := '2H';
  elsif m.current_period = 2 then
    v_period := 3; v_offset := 5400; v_status := 'ET1';
  else
    v_period := 4; v_offset := 6300; v_status := 'ET2';
  end if;
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

create or replace function public.finalise_match(
  p_match_id uuid, p_intent_id uuid, p_confirmed_home integer, p_confirmed_away integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb; r record; s record; v_level boolean;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'FINALISE_MATCH');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['2H', 'ET2', 'PENS']::public.match_status[], 'Ending the match');
  perform private.require_control(m);
  select * into r from private.match_rules(p_match_id);
  v_level := m.home_score = m.away_score;
  if m.status = '2H' and r.needs_winner and v_level and (r.extra_time or r.penalties) then
    raise exception 'The tie is level — continue to % before ending the match', case when r.extra_time then 'extra time' else 'penalties' end
      using errcode = 'EK409';
  end if;
  if m.status = 'ET2' and r.needs_winner and v_level and r.penalties then
    raise exception 'The tie is still level — go to penalties before ending the match' using errcode = 'EK409';
  end if;
  if m.status = 'PENS' then
    select * into s from private.shootout_state(p_match_id);
    if not s.decided then
      raise exception 'The shoot-out is not decided yet (%–%)', s.home_scored, s.away_scored using errcode = 'EK409';
    end if;
  end if;
  -- The operator only CONFIRMS the score; it is never set from the client.
  if p_confirmed_home is distinct from m.home_score or p_confirmed_away is distinct from m.away_score then
    raise exception 'The score has changed (now %–%). Check it again.', m.home_score, m.away_score using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);

  perform private.fold_pause(p_match_id);
  update public.matches set status = 'FT', clock_running = false,
    period_ended_at = coalesce(case when status = 'PENS' then period_ended_at end, now()), finished_at = now()
  where id = p_match_id returning * into m;
  update public.match_periods set
    ended_at = now(), accumulated_pause_seconds = m.accumulated_pause_seconds, stoppage_seconds = m.stoppage_seconds
  where match_id = p_match_id and period = m.current_period;
  perform private.recompute_score(p_match_id);
  select * into m from public.matches where id = p_match_id;
  perform private.bump_seq(p_match_id);
  perform private.recompute_standings(m.competition_id);

  perform private.finish_command(p_match_id, p_intent_id, 'FINALISE_MATCH', 'MATCH_FINALISED', 'match', p_match_id, v_before,
    to_jsonb(m.home_score || '-' || m.away_score || case when m.home_pens is not null then ' (' || m.home_pens || '-' || m.away_pens || ' pens)' else '' end));
  return private.canonical_state(p_match_id);
end $$;

/*
 * One shoot-out kick. The kick id is the idempotency key. Teams alternate
 * (a team may not be more than one kick ahead); nothing is accepted once the
 * shoot-out is decided. Kicks are never match events: goals, scores and
 * statistics are unaffected.
 */
create or replace function public.record_shootout_attempt(
  p_match_id uuid, p_attempt_id uuid, p_team_id uuid, p_player_id uuid, p_outcome text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; s record; v_mine int; v_other int; v_seq bigint; v_demo uuid; v_player uuid; p record;
begin
  if exists (select 1 from public.match_shootout_attempts where id = p_attempt_id) then
    perform private.begin_command(p_match_id, p_attempt_id, 'SHOOTOUT_KICK');
    if not exists (select 1 from public.match_shootout_attempts where id = p_attempt_id and match_id = p_match_id) then
      raise exception 'Kick id % belongs to a different match', p_attempt_id using errcode = 'EK422';
    end if;
    return private.canonical_state(p_match_id, true);
  end if;
  m := private.begin_command(p_match_id, p_attempt_id, 'SHOOTOUT_KICK');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['PENS']::public.match_status[], 'Recording a shoot-out kick');
  perform private.require_control(m);
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_outcome is null or p_outcome not in ('SCORED', 'MISSED', 'SAVED') then
    raise exception 'Outcome must be SCORED, MISSED or SAVED' using errcode = 'EK422';
  end if;
  select * into s from private.shootout_state(p_match_id);
  if s.decided then
    raise exception 'The shoot-out is already decided' using errcode = 'EK409';
  end if;
  v_mine := case when p_team_id = m.home_team_id then s.home_taken else s.away_taken end;
  v_other := case when p_team_id = m.home_team_id then s.away_taken else s.home_taken end;
  if v_mine > v_other then
    raise exception 'It is the other team''s kick' using errcode = 'EK409';
  end if;
  if p_player_id is not null then
    if m.is_demo then
      select d.id into v_demo from public.demo_lineup_players d where d.id = p_player_id and d.match_id = p_match_id and d.team_id = p_team_id;
      if v_demo is null then
        raise exception 'That player is not in this team''s test line-up' using errcode = 'EK422';
      end if;
    else
      if private.shirt_for(p_match_id, p_team_id, p_player_id) is null then
        raise exception 'Player is not in this team''s squad' using errcode = 'EK422';
      end if;
      select * into p from private.player_flags(p_match_id, p_player_id);
      if p.sent_off then
        raise exception 'A sent-off player cannot take a kick' using errcode = 'EK422';
      end if;
      v_player := p_player_id;
    end if;
  end if;

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_shootout_attempts (id, match_id, seq, team_id, player_id, demo_player_id, outcome, recorded_by)
  values (p_attempt_id, p_match_id, v_seq, p_team_id, v_player, v_demo, p_outcome, auth.uid());
  perform private.recompute_shootout(p_match_id);
  perform private.finish_command(p_match_id, p_attempt_id, 'SHOOTOUT_KICK', 'SHOOTOUT_KICK', 'match', p_match_id, null,
    jsonb_build_object('team_id', p_team_id, 'outcome', p_outcome));
  return private.canonical_state(p_match_id);
end $$;

create or replace function public.void_shootout_attempt(p_match_id uuid, p_intent_id uuid, p_attempt_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; a public.match_shootout_attempts;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'VOID_SHOOTOUT_KICK');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['PENS']::public.match_status[], 'Voiding a shoot-out kick');
  perform private.require_control(m);
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into a from public.match_shootout_attempts where id = p_attempt_id and match_id = p_match_id for update;
  if not found then
    raise exception 'Kick not found in this match' using errcode = 'EK404';
  end if;
  if a.voided_at is not null then
    raise exception 'This kick has already been voided' using errcode = 'EK409';
  end if;
  update public.match_shootout_attempts set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = a.id;
  perform private.recompute_shootout(p_match_id);
  perform private.bump_seq(p_match_id);
  perform private.finish_command(p_match_id, p_intent_id, 'VOID_SHOOTOUT_KICK', 'SHOOTOUT_KICK_VOIDED', 'match', p_match_id, null,
    jsonb_build_object('attempt_id', a.id, 'reason', btrim(p_reason)));
  return private.canonical_state(p_match_id);
end $$;

-- Admin correction of a finished shoot-out (void a wrongly recorded kick or
-- add a missing one). The winner is re-derived; a changed knockout winner is
-- flagged for reconciliation, never applied silently.
create or replace function public.admin_correct_shootout(
  p_match_id uuid, p_action text, p_attempt_id uuid, p_team_id uuid, p_outcome text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; a public.match_shootout_attempts; v_seq bigint;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A correction reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status not in ('PENS', 'FT') or (m.status = 'FT' and m.home_pens is null) then
    raise exception 'This match has no penalty shoot-out' using errcode = 'EK409';
  end if;
  if p_action = 'VOID' then
    select * into a from public.match_shootout_attempts where id = p_attempt_id and match_id = p_match_id for update;
    if not found or a.voided_at is not null then
      raise exception 'Kick not found (or already voided)' using errcode = 'EK404';
    end if;
    update public.match_shootout_attempts set voided_at = now(), voided_by = auth.uid(), void_reason = 'Admin correction: ' || btrim(p_reason)
    where id = a.id;
  elsif p_action = 'ADD' then
    if p_team_id not in (m.home_team_id, m.away_team_id) or p_outcome not in ('SCORED', 'MISSED', 'SAVED') then
      raise exception 'A team of this match and an outcome are required' using errcode = 'EK422';
    end if;
    if exists (select 1 from public.match_shootout_attempts where id = p_attempt_id) then
      return private.canonical_state(p_match_id, true);
    end if;
    v_seq := private.bump_seq(p_match_id);
    insert into public.match_shootout_attempts (id, match_id, seq, team_id, outcome, recorded_by)
    values (p_attempt_id, p_match_id, v_seq, p_team_id, p_outcome, auth.uid());
  else
    raise exception 'Action must be VOID or ADD' using errcode = 'EK422';
  end if;
  perform private.recompute_shootout(p_match_id);
  perform private.after_correction(p_match_id);
  perform private.audit('ADMIN_SHOOTOUT_CORRECTED', 'match', p_match_id, p_match_id, null, null,
    jsonb_build_object('action', p_action, 'attempt_id', p_attempt_id, 'detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'ADMIN_SHOOTOUT_CORRECTED');
  return private.canonical_state(p_match_id);
end $$;

-- ── 9b. Existing match RPCs, extended to extra time (generated from their

--         latest definitions; only the status lists / minute ranges change) ──

create or replace function public.pause_match(p_match_id uuid, p_intent_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'PAUSE');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', '2H', 'ET1', 'ET2']::public.match_status[], 'Pausing');
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
  perform private.require_status(m, array['1H', '2H', 'ET1', 'ET2']::public.match_status[], 'Resuming');
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
  perform private.require_status(m, array['1H', '2H', 'ET1', 'ET2']::public.match_status[], 'Setting stoppage time');
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

create or replace function public.void_event(p_match_id uuid, p_intent_id uuid, p_event_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; e public.match_events; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'VOID_EVENT');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['1H', 'HT', '2H', 'ET1', 'ET_BREAK', 'ET2', 'PENS']::public.match_status[], 'Voiding events');
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

create or replace function public.take_over_match(p_match_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  m := private.begin_command(p_match_id, p_intent_id, 'TAKE_OVER');
  if m.id is null then return private.canonical_state(p_match_id, true); end if;
  perform private.require_status(m, array['SCHEDULED', '1H', 'HT', '2H', 'ET1', 'ET_BREAK', 'ET2', 'PENS']::public.match_status[], 'Taking over');
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

create or replace function public.admin_set_match_outcome(p_match_id uuid, p_status public.match_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if not (
    (p_status = 'POSTPONED' and m.status = 'SCHEDULED') or
    (p_status = 'CANCELLED' and m.status in ('SCHEDULED', 'POSTPONED')) or
    (p_status = 'ABANDONED' and m.status = any (private.in_progress_statuses()))
  ) then
    raise exception 'Cannot mark a % match as %', m.status, p_status using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);
  if p_status = 'ABANDONED' then
    perform private.fold_pause(p_match_id);
    update public.matches set clock_running = false, period_ended_at = now(), finished_at = now() where id = p_match_id;
    update public.match_periods set ended_at = now() where match_id = p_match_id and ended_at is null;
  end if;
  update public.matches set status = p_status, status_note = btrim(p_reason) where id = p_match_id;
  perform private.bump_seq(p_match_id);
  perform private.audit('MATCH_' || p_status::text, 'match', p_match_id, p_match_id, null, v_before,
    private.match_snapshot(p_match_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'MATCH_' || p_status::text);
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

  v_min_lo := private.period_minute_lo(m.current_period);
  v_min_hi := private.period_minute_hi(m.current_period);
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
  v_lo := private.period_minute_lo(p_period);
  v_hi := private.period_minute_hi(p_period);
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

create or replace function public.public_live_scores()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_time', clock_timestamp(),
    'matches', coalesce((
      select jsonb_agg(private.public_match_row(m) || jsonb_build_object(
        'last_event', (
          select private.public_event(e) from public.match_events e
          where e.match_id = m.id and e.voided_at is null order by e.seq desc limit 1)
      ) order by m.scheduled_at)
      from public.matches m join public.competitions c on c.id = m.competition_id
      where m.status = any (private.in_progress_statuses()) and c.status <> 'DRAFT'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.admin_live_matches()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'match', private.match_snapshot(m.id),
      'scheduled_at', m.scheduled_at,
      'round_label', m.round_label,
      'competition', c.short_name,
      'home', ht.short_name, 'home_code', ht.code, 'away', at.short_name, 'away_code', at.code,
      'venue', v.short_name,
      'operator', (select display_name from public.profiles where id = m.active_operator_id),
      'last_event', (select jsonb_build_object('type', e.type, 'minute', e.minute, 'minute_extra', e.minute_extra,
                       'recorded_at', e.recorded_at, 'voided', e.voided_at is not null)
                     from public.match_events e where e.match_id = m.id order by e.seq desc limit 1),
      'last_activity_at', (select max(a.created_at) from public.audit_log a where a.match_id = m.id)
    ) order by m.scheduled_at)
    from public.matches m
    join public.competitions c on c.id = m.competition_id
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
    left join public.venues v on v.id = m.venue_id
    where m.status = any (private.in_progress_statuses())
  ), '[]'::jsonb);
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
                         'PAUSED', 'RESUMED', 'STOPPAGE_SET', 'OPERATOR_TAKEOVER',
                         'SHOOTOUT_STARTED', 'SHOOTOUT_KICK', 'SHOOTOUT_KICK_VOIDED')
    ), '[]'::jsonb),
    'shootout', private.shootout_json(p_match_id),
    'rules', private.match_rules_json(p_match_id),
    'server_time', clock_timestamp(),
    'replayed', p_replayed
  );
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
    'is_demo', m.is_demo,
    'home_score_90', m.home_score_90, 'away_score_90', m.away_score_90,
    'home_pens', m.home_pens, 'away_pens', m.away_pens,
    'winner_team_id', m.winner_team_id, 'decided_by', m.decided_by,
    'matchday', m.matchday, 'tie_id', m.tie_id
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
    'shootout', private.public_shootout_json(p_match_id),
    'server_time', clock_timestamp()
  );
end $$;

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
  -- Discipline: an active suspension in this competition (the player stays in
  -- the squad; they are just unavailable until it is served).
  if private.player_suspended(p_player, v_comp, p_match_id) then
    return 'SUSPENDED';
  end if;
  return 'CLEARED';
end $$;

-- ── 10. Discipline + eligibility ───────────────────────────────────────────
-- Active suspension that still applies to this match.
create or replace function private.player_suspended(p_player uuid, p_competition uuid, p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.player_suspensions s
    where s.player_id = p_player and s.competition_id = p_competition and s.status = 'ACTIVE'
      and s.source_match_id is distinct from p_match_id
      and not (p_match_id = any (s.served_match_ids))
  );
$$;

/*
 * Derives automatic suspensions from cards in this competition's final
 * (FT/ABANDONED) official matches, then works out which fixtures served them:
 * the team's next FT competition matches after the source match. Postponed,
 * cancelled or abandoned fixtures never serve a suspension. Idempotent; every
 * change is audited (PLAYER_SUSPENDED / SUSPENSION_SERVED /
 * SUSPENSION_CANCELLED / SUSPENSION_REOPENED).
 */
create or replace function private.recompute_discipline(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.competition_discipline_rules;
  d record; v_s public.player_suspensions;
  v_id uuid; v_served uuid[]; v_n int; v_from timestamptz;
begin
  select * into r from public.competition_discipline_rules where competition_id = p_competition_id;
  if not found or not r.enabled then
    return;
  end if;
  if to_regclass('pg_temp._eksu_ds') is null then
    create temp table _eksu_ds (
    source_key text primary key, player_id uuid, team_id uuid, source_match_id uuid, source_event_id uuid,
    reason text, matches_total smallint
  ) on commit drop;
  end if;
  truncate pg_temp._eksu_ds;

  insert into pg_temp._eksu_ds
  select 'EVENT:' || e.id, e.player_id, e.team_id, e.match_id, e.id,
    case e.type when 'RED_CARD' then 'RED_CARD' else 'SECOND_YELLOW' end,
    case e.type when 'RED_CARD' then r.red_card_matches else r.second_yellow_matches end
  from public.match_events e join public.matches m on m.id = e.match_id
  where m.competition_id = p_competition_id and m.status in ('FT', 'ABANDONED') and not m.is_demo
    and e.voided_at is null and e.player_id is not null and e.type in ('RED_CARD', 'SECOND_YELLOW')
    and case e.type when 'RED_CARD' then r.red_card_matches else r.second_yellow_matches end > 0;

  -- Every N-th yellow card across matches (yellows that led to a second-yellow
  -- dismissal in the same match are part of that dismissal instead).
  if r.yellow_threshold is not null then
    insert into pg_temp._eksu_ds
    select 'YELLOWS:' || y.player_id || ':' || y.team_id || ':' || (y.n / r.yellow_threshold), y.player_id, y.team_id,
      y.match_id, y.id, 'YELLOW_ACCUMULATION', r.yellow_suspension_matches
    from (
      select e.id, e.player_id, e.team_id, e.match_id,
        row_number() over (partition by e.player_id, e.team_id order by coalesce(m.finished_at, m.scheduled_at), m.id, e.seq) n
      from public.match_events e join public.matches m on m.id = e.match_id
      where m.competition_id = p_competition_id and m.status in ('FT', 'ABANDONED') and not m.is_demo
        and e.voided_at is null and e.player_id is not null and e.type = 'YELLOW_CARD'
        and not exists (select 1 from public.match_events x where x.match_id = e.match_id and x.player_id = e.player_id
                          and x.type = 'SECOND_YELLOW' and x.voided_at is null)
    ) y
    where y.n % r.yellow_threshold = 0;
  end if;

  for d in select * from pg_temp._eksu_ds x
    where not exists (select 1 from public.player_suspensions ps where ps.competition_id = p_competition_id and ps.source_key = x.source_key)
  loop
    insert into public.player_suspensions (competition_id, player_id, team_id, source_key, source_match_id, source_event_id, reason, matches_total)
    values (p_competition_id, d.player_id, d.team_id, d.source_key, d.source_match_id, d.source_event_id, d.reason, d.matches_total)
    returning id into v_id;
    perform private.audit('PLAYER_SUSPENDED', 'player_suspension', v_id, d.source_match_id, null, null,
      (select to_jsonb(x) from public.player_suspensions x where x.id = v_id));
  end loop;

  -- Rules re-enabled / a card restored: bring back automatic suspensions that
  -- were cancelled by the engine (never ones an admin cancelled).
  for v_s in select * from public.player_suspensions x where x.competition_id = p_competition_id and x.status = 'CANCELLED'
    and not x.admin_cancelled and x.source_key in (select source_key from pg_temp._eksu_ds) loop
    update public.player_suspensions set status = 'ACTIVE', cancelled_at = null, cancelled_reason = null where id = v_s.id;
    perform private.audit('SUSPENSION_REINSTATED', 'player_suspension', v_s.id, v_s.source_match_id, null, null, null);
  end loop;

  for v_s in select * from public.player_suspensions x where x.competition_id = p_competition_id and x.source_key is not null
    and x.status <> 'CANCELLED' and x.source_key not in (select source_key from pg_temp._eksu_ds) loop
    update public.player_suspensions set status = 'CANCELLED', cancelled_at = now(),
      cancelled_reason = 'The card was voided or the discipline rules changed' where id = v_s.id;
    perform private.audit('SUSPENSION_CANCELLED', 'player_suspension', v_s.id, v_s.source_match_id, null, to_jsonb(v_s),
      jsonb_build_object('detail', 'The card was voided or the discipline rules changed'));
  end loop;

  for v_s in select * from public.player_suspensions x where x.competition_id = p_competition_id and x.status in ('ACTIVE', 'SERVED') loop
    select coalesce(sm.finished_at, sm.scheduled_at) into v_from from public.matches sm where sm.id = v_s.source_match_id;
    v_from := coalesce(v_from, v_s.created_at);
    select coalesce(array_agg(x.id order by x.at, x.id), '{}') into v_served from (
      select m.id, coalesce(m.finished_at, m.scheduled_at) at from public.matches m
      where m.competition_id = p_competition_id and not m.is_demo and m.status = 'FT'
        and v_s.team_id in (m.home_team_id, m.away_team_id) and m.id is distinct from v_s.source_match_id
        and coalesce(m.finished_at, m.scheduled_at) > v_from
      order by 2, 1 limit v_s.matches_total
    ) x;
    v_n := cardinality(v_served);
    if v_served is distinct from v_s.served_match_ids then
      update public.player_suspensions set served_match_ids = v_served, matches_served = v_n,
        status = case when v_n >= v_s.matches_total then 'SERVED' else 'ACTIVE' end,
        served_at = case when v_n >= v_s.matches_total then coalesce(served_at, now()) end
      where id = v_s.id;
      if v_n >= v_s.matches_total and v_s.status <> 'SERVED' then
        perform private.audit('SUSPENSION_SERVED', 'player_suspension', v_s.id, v_served[v_n], null, null,
          jsonb_build_object('served_match_ids', v_served));
      elsif v_n < v_s.matches_total and v_s.status = 'SERVED' then
        perform private.audit('SUSPENSION_REOPENED', 'player_suspension', v_s.id, null, null, null,
          jsonb_build_object('served_match_ids', v_served, 'detail', 'A serving match was corrected'));
      end if;
    end if;
  end loop;
end $$;

create or replace function public.admin_set_discipline_rules(
  p_competition_id uuid, p_enabled boolean, p_red_card_matches integer, p_second_yellow_matches integer,
  p_yellow_threshold integer, p_yellow_suspension_matches integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  perform private.require_admin();
  if not exists (select 1 from public.competitions where id = p_competition_id) then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  select to_jsonb(r) into v_before from public.competition_discipline_rules r where competition_id = p_competition_id;
  begin
    insert into public.competition_discipline_rules (competition_id, enabled, red_card_matches, second_yellow_matches,
      yellow_threshold, yellow_suspension_matches, updated_at, updated_by)
    values (p_competition_id, coalesce(p_enabled, false), coalesce(p_red_card_matches, 1), coalesce(p_second_yellow_matches, 1),
      p_yellow_threshold, coalesce(p_yellow_suspension_matches, 1), now(), auth.uid())
    on conflict (competition_id) do update set enabled = excluded.enabled, red_card_matches = excluded.red_card_matches,
      second_yellow_matches = excluded.second_yellow_matches, yellow_threshold = excluded.yellow_threshold,
      yellow_suspension_matches = excluded.yellow_suspension_matches, updated_at = now(), updated_by = auth.uid();
  exception when check_violation then
    raise exception 'Suspensions are 0–10 matches; yellow-card thresholds are 2–10' using errcode = 'EK422';
  end;
  perform private.audit('DISCIPLINARY_RULE_CHANGED', 'competition', p_competition_id, null, null, v_before,
    (select to_jsonb(r) from public.competition_discipline_rules r where competition_id = p_competition_id));
  perform private.recompute_discipline(p_competition_id);
end $$;

create or replace function public.admin_add_suspension(
  p_competition_id uuid, p_player_id uuid, p_team_id uuid, p_matches integer, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  if p_matches is null or p_matches not between 1 and 20 then
    raise exception 'A suspension is 1–20 matches' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.competition_entries where competition_id = p_competition_id and team_id = p_team_id) then
    raise exception 'The team is not entered in this competition' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found' using errcode = 'EK404';
  end if;
  insert into public.player_suspensions (competition_id, player_id, team_id, reason, note, matches_total, created_by)
  values (p_competition_id, p_player_id, p_team_id, 'ADMIN', btrim(p_reason), p_matches, auth.uid()) returning id into v_id;
  perform private.audit('PLAYER_SUSPENDED', 'player_suspension', v_id, null, null, null,
    (select to_jsonb(x) from public.player_suspensions x where x.id = v_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.recompute_discipline(p_competition_id);
  return v_id;
end $$;

-- Sanctioned correction: the history row stays (CANCELLED, with the reason).
create or replace function public.admin_cancel_suspension(p_suspension_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.player_suspensions;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into s from public.player_suspensions where id = p_suspension_id for update;
  if not found then
    raise exception 'Suspension not found' using errcode = 'EK404';
  end if;
  if s.status = 'CANCELLED' then
    raise exception 'This suspension is already cancelled' using errcode = 'EK409';
  end if;
  update public.player_suspensions set status = 'CANCELLED', cancelled_at = now(), cancelled_reason = btrim(p_reason),
    admin_cancelled = true where id = s.id;
  perform private.audit('SUSPENSION_CANCELLED', 'player_suspension', s.id, null, null, to_jsonb(s),
    jsonb_build_object('detail', btrim(p_reason), 'by_admin', true));
end $$;

-- ── 11. Engine hook + lifecycle ────────────────────────────────────────────
-- Everything derived from a match result, refreshed for a competition.
create or replace function private.competition_refresh(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  perform private.recompute_standings(p_competition_id);
  for t in select k.id from public.knockout_ties k join public.matches m on m.id = k.match_id
    where k.competition_id = p_competition_id and m.status = 'FT' order by k.created_at, k.position loop
    perform private.settle_tie(t);
  end loop;
  perform private.recompute_discipline(p_competition_id);
  perform private.resolve_bracket(p_competition_id);
end $$;

/*
 * Runs at commit after a match result changes (FT, a correction, a
 * cancellation): standings + qualification, knockout advancement, discipline
 * and bracket resolution. A failure here never blocks the match write itself;
 * it is recorded (COMPETITION_ENGINE_ERROR) and an admin can re-run it with
 * "Recompute".
 */
create or replace function private.competition_after_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.competition_refresh(new.competition_id);
  exception when others then
    raise warning 'competition engine failed for match %: %', new.id, sqlerrm;
    perform private.audit('COMPETITION_ENGINE_ERROR', 'match', new.id, new.id, null, null,
      jsonb_build_object('detail', left(sqlerrm, 300)));
  end;
  return null;
end $$;
create constraint trigger matches_competition_engine
  after update of status, home_score, away_score, home_pens, away_pens, winner_team_id on public.matches
  deferrable initially deferred for each row
  when ((old.status is distinct from new.status and (new.status in ('FT', 'CANCELLED', 'ABANDONED', 'POSTPONED') or old.status = 'FT'))
        or (new.status = 'FT' and (old.home_score, old.away_score, old.home_pens, old.away_pens, old.winner_team_id)
                                  is distinct from (new.home_score, new.away_score, new.home_pens, new.away_pens, new.winner_team_id)))
  execute function private.competition_after_match();

-- Admin corrections of a final match (events, cards, shoot-out kicks) refresh
-- everything derived from it — including card-only changes, which do not move
-- the score.
create or replace function private.after_correction(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  perform private.recompute_score(p_match_id);
  perform private.bump_seq(p_match_id);
  select * into m from public.matches where id = p_match_id;
  if m.status in ('FT', 'ABANDONED') then
    perform private.competition_refresh(m.competition_id);
  end if;
end $$;

-- Admin "Recompute": standings, advancement, discipline and bracket.
create or replace function public.admin_recompute_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('ADMIN') then
    raise exception 'Only an administrator can recompute standings' using errcode = 'EK403';
  end if;
  perform private.competition_refresh(p_competition_id);
  perform private.audit('STANDINGS_RECOMPUTED', 'competition', p_competition_id, null, null, null, null);
end $$;

create or replace function public.admin_create_stage(
  p_competition_id uuid, p_name text, p_stage_type text, p_stage_order integer, p_settings jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'A stage name is required' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.competitions where id = p_competition_id) then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  begin
    insert into public.competition_stages (competition_id, name, stage_order, stage_type, has_table, legs,
      extra_time_allowed, penalties_allowed, qualification)
    values (p_competition_id, btrim(p_name), p_stage_order, p_stage_type, p_stage_type in ('LEAGUE', 'GROUP'),
      coalesce((p_settings ->> 'legs')::smallint, 1),
      (p_settings ->> 'extra_time_allowed')::boolean, (p_settings ->> 'penalties_allowed')::boolean,
      coalesce(p_settings -> 'qualification', '{}'::jsonb))
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Another stage already has order %', p_stage_order using errcode = 'EK409';
    when check_violation then
      raise exception 'Invalid stage settings (knockout rounds have one leg)' using errcode = 'EK422';
  end;
  perform private.audit('STAGE_CREATED', 'competition_stage', v_id, null, null, null,
    (select to_jsonb(s) from public.competition_stages s where s.id = v_id));
  return v_id;
end $$;

-- Stage rules (locked once the stage started unless overridden with a reason).
create or replace function public.admin_update_stage(p_stage_id uuid, p_settings jsonb, p_override_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare st public.competition_stages; v_after public.competition_stages;
begin
  perform private.require_admin();
  select * into st from public.competition_stages where id = p_stage_id for update;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  if coalesce(btrim(p_override_reason), '') <> '' then
    perform private.begin_override(p_override_reason, 'competition_stage', st.id, 'update stage rules');
  end if;
  begin
    update public.competition_stages set
      name = coalesce(nullif(btrim(p_settings ->> 'name'), ''), name),
      stage_order = coalesce((p_settings ->> 'stage_order')::smallint, stage_order),
      stage_type = coalesce(p_settings ->> 'stage_type', stage_type),
      has_table = coalesce((p_settings ->> 'has_table')::boolean, has_table),
      legs = coalesce((p_settings ->> 'legs')::smallint, legs),
      extra_time_allowed = case when p_settings ? 'extra_time_allowed' then (p_settings ->> 'extra_time_allowed')::boolean else extra_time_allowed end,
      penalties_allowed = case when p_settings ? 'penalties_allowed' then (p_settings ->> 'penalties_allowed')::boolean else penalties_allowed end,
      qualification = coalesce(p_settings -> 'qualification', qualification)
    where id = p_stage_id returning * into v_after;
  exception
    when check_violation then
      raise exception 'Invalid stage settings (knockout rounds have one leg)' using errcode = 'EK422';
    when unique_violation then
      raise exception 'Another stage already has that order' using errcode = 'EK409';
  end;
  perform private.end_override();
  perform private.audit(case when v_after.qualification is distinct from st.qualification then 'QUALIFICATION_RULES_CHANGED' else 'STAGE_UPDATED' end,
    'competition_stage', st.id, null, null, to_jsonb(st), to_jsonb(v_after) || jsonb_build_object('detail', nullif(btrim(coalesce(p_override_reason, '')), '')));
  perform private.recompute_standings(st.competition_id);
  perform private.resolve_bracket(st.competition_id);
end $$;

-- Format / points / tie-breakers / defaults (locked once matches started
-- unless overridden with a reason).
create or replace function public.admin_update_competition_rules(p_competition_id uuid, p_settings jsonb, p_override_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.competitions; v_after public.competitions;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if coalesce(btrim(p_override_reason), '') <> '' then
    perform private.begin_override(p_override_reason, 'competition', c.id, 'update competition rules');
  end if;
  begin
    update public.competitions set
      format = coalesce((p_settings ->> 'format')::public.competition_format, format),
      kind = coalesce(p_settings ->> 'kind', kind),
      points_win = coalesce((p_settings ->> 'points_win')::smallint, points_win),
      points_draw = coalesce((p_settings ->> 'points_draw')::smallint, points_draw),
      points_loss = coalesce((p_settings ->> 'points_loss')::smallint, points_loss),
      tiebreakers = case when jsonb_typeof(p_settings -> 'tiebreakers') = 'array' then array(select jsonb_array_elements_text(p_settings -> 'tiebreakers')) else tiebreakers end,
      extra_time_enabled = coalesce((p_settings ->> 'extra_time_enabled')::boolean, extra_time_enabled),
      penalties_enabled = coalesce((p_settings ->> 'penalties_enabled')::boolean, penalties_enabled)
    where id = p_competition_id returning * into v_after;
  exception when check_violation or invalid_text_representation then
    raise exception 'Invalid competition settings' using errcode = 'EK422';
  end;
  perform private.end_override();
  perform private.audit('COMPETITION_RULES_CHANGED', 'competition', c.id, null, null,
    jsonb_build_object('format', c.format, 'kind', c.kind, 'points', array[c.points_win, c.points_draw, c.points_loss], 'tiebreakers', c.tiebreakers),
    jsonb_build_object('format', v_after.format, 'kind', v_after.kind, 'points', array[v_after.points_win, v_after.points_draw, v_after.points_loss],
      'tiebreakers', v_after.tiebreakers, 'detail', nullif(btrim(coalesce(p_override_reason, '')), '')));
  perform private.recompute_standings(c.id);
end $$;

create or replace function public.admin_create_groups(p_stage_id uuid, p_names text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare st public.competition_stages; v_name text; v_id uuid; v_n int := 0;
begin
  perform private.require_admin();
  select * into st from public.competition_stages where id = p_stage_id;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  if st.stage_type <> 'GROUP' then
    raise exception 'Groups belong to a group stage' using errcode = 'EK422';
  end if;
  foreach v_name in array coalesce(p_names, '{}') loop
    continue when coalesce(btrim(v_name), '') = '';
    begin
      insert into public.competition_groups (stage_id, name) values (p_stage_id, btrim(v_name)) returning id into v_id;
    exception when unique_violation then
      raise exception 'There is already a "%"', btrim(v_name) using errcode = 'EK409';
    end;
    perform private.audit('GROUP_CREATED', 'competition_group', v_id, null, null, null, jsonb_build_object('stage_id', p_stage_id, 'name', btrim(v_name)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Draw / move a team into a group (or out: p_group_id NULL).
create or replace function public.admin_assign_team_group(
  p_competition_id uuid, p_team_id uuid, p_group_id uuid, p_override_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare e public.competition_entries; v_stage uuid;
begin
  perform private.require_admin();
  select * into e from public.competition_entries where competition_id = p_competition_id and team_id = p_team_id for update;
  if not found then
    raise exception 'The team is not entered in this competition' using errcode = 'EK404';
  end if;
  if p_group_id is not null then
    select g.stage_id into v_stage from public.competition_groups g join public.competition_stages s on s.id = g.stage_id
    where g.id = p_group_id and s.competition_id = p_competition_id;
    if v_stage is null then
      raise exception 'That group does not belong to this competition' using errcode = 'EK422';
    end if;
  end if;
  if e.group_id is not distinct from p_group_id then
    return;
  end if;
  if coalesce(btrim(p_override_reason), '') <> '' then
    perform private.begin_override(p_override_reason, 'competition_entry', e.id, 'move team between groups');
  end if;
  update public.competition_entries set group_id = p_group_id, stage_id = coalesce(v_stage, stage_id) where id = e.id;
  perform private.end_override();
  perform private.audit('TEAM_ASSIGNED_TO_GROUP', 'competition_entry', e.id, null, null,
    jsonb_build_object('team_id', p_team_id, 'group_id', e.group_id),
    jsonb_build_object('team_id', p_team_id, 'group_id', p_group_id, 'detail', nullif(btrim(coalesce(p_override_reason, '')), '')));
  perform private.recompute_standings(p_competition_id);
end $$;

create or replace function public.admin_set_qualification_decision(p_stage_id uuid, p_team_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare st public.competition_stages;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required (e.g. drawing of lots, play-off result)' using errcode = 'EK422';
  end if;
  select * into st from public.competition_stages where id = p_stage_id;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  if p_decision is not null and p_decision not in ('QUALIFIED', 'ELIMINATED') then
    raise exception 'Decision must be QUALIFIED or ELIMINATED' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.standings where stage_id = p_stage_id and team_id = p_team_id) then
    raise exception 'The team is not in this stage''s table' using errcode = 'EK422';
  end if;
  update public.stage_qualification_decisions set revoked_at = now(), revoked_by = auth.uid()
  where stage_id = p_stage_id and team_id = p_team_id and revoked_at is null;
  if p_decision is not null then
    insert into public.stage_qualification_decisions (stage_id, team_id, decision, reason, decided_by)
    values (p_stage_id, p_team_id, p_decision, btrim(p_reason), auth.uid());
  end if;
  perform private.audit('QUALIFICATION_DECIDED', 'competition_stage', p_stage_id, null, null, null,
    jsonb_build_object('team_id', p_team_id, 'decision', p_decision, 'detail', btrim(p_reason)));
  perform private.recompute_standings(st.competition_id);
  perform private.resolve_bracket(st.competition_id);
end $$;

create or replace function public.admin_complete_stage(p_stage_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare st public.competition_stages; v_open int;
begin
  perform private.require_admin();
  select * into st from public.competition_stages where id = p_stage_id for update;
  if not found then
    raise exception 'Stage not found' using errcode = 'EK404';
  end if;
  if st.status = 'COMPLETED' then
    return;
  end if;
  select count(*) into v_open from public.matches where stage_id = p_stage_id and status not in ('FT', 'CANCELLED');
  if v_open > 0 then
    raise exception '% match(es) of this stage are not finished (or cancelled) yet', v_open using errcode = 'EK409';
  end if;
  if private.stage_is_knockout(st.stage_type) and exists (
    select 1 from public.knockout_ties where stage_id = p_stage_id and (winner_team_id is null or needs_reconciliation)) then
    raise exception 'Every tie of this round must be decided (and reconciled) first' using errcode = 'EK409';
  end if;
  if not private.stage_is_knockout(st.stage_type) and exists (
    select 1 from public.standings where stage_id = p_stage_id and qualification = 'PENDING') then
    raise exception 'Qualification still has pending places; record a decision for teams that are level' using errcode = 'EK409';
  end if;
  perform set_config('eksu.engine', 'on', true);
  update public.competition_stages set status = 'COMPLETED', completed_at = now(), locked_at = coalesce(locked_at, now()) where id = p_stage_id;
  perform set_config('eksu.engine', '', true);
  perform private.audit('STAGE_COMPLETED', 'competition_stage', p_stage_id, null, null, null, jsonb_build_object('stage', st.name));
end $$;

/*
 * Completion: every fixture resolved and — where the format has one — the
 * winner known from results. Honours are derived (final / third-place ties,
 * or the final table), never typed.
 */
create or replace function public.admin_complete_competition(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.competitions; v_open int; f public.knockout_ties; tp public.knockout_ties;
  v_champ uuid; v_runner uuid; v_third uuid; st public.competition_stages; v_groups int;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if c.status = 'COMPLETED' then
    raise exception 'The competition is already completed' using errcode = 'EK409';
  end if;
  perform private.competition_refresh(p_competition_id);
  select count(*) into v_open from public.matches
  where competition_id = p_competition_id and (status in ('SCHEDULED', 'POSTPONED') or status = any (private.in_progress_statuses()));
  if v_open > 0 then
    raise exception '% fixture(s) are still to be played or resolved (play, cancel or decide them first)', v_open using errcode = 'EK409';
  end if;
  if exists (select 1 from public.knockout_ties where competition_id = p_competition_id and (winner_team_id is null or needs_reconciliation)) then
    raise exception 'Every knockout tie must be decided and reconciled first' using errcode = 'EK409';
  end if;

  select t.* into f from public.knockout_ties t join public.competition_stages s on s.id = t.stage_id
  where t.competition_id = p_competition_id and s.stage_type = 'FINAL' limit 1;
  if f.id is not null then
    v_champ := f.winner_team_id; v_runner := f.loser_team_id;
    select t.* into tp from public.knockout_ties t join public.competition_stages s on s.id = t.stage_id
    where t.competition_id = p_competition_id and s.stage_type = 'THIRD_PLACE' limit 1;
    v_third := tp.winner_team_id;
  else
    select * into st from public.competition_stages where competition_id = p_competition_id and has_table
      and stage_type in ('LEAGUE', 'GROUP') order by stage_order desc limit 1;
    select count(*) into v_groups from public.competition_groups where stage_id = st.id;
    if st.id is not null and v_groups <= 1 then
      if exists (select 1 from public.standings where stage_id = st.id and rank = 1 and tied) then
        raise exception 'Teams are level at the top after every tie-breaker; record the play-off / decision first' using errcode = 'EK409';
      end if;
      select team_id into v_champ from public.standings where stage_id = st.id and rank = 1 and not tied;
      select team_id into v_runner from public.standings where stage_id = st.id and rank = 2 and not tied;
      select team_id into v_third from public.standings where stage_id = st.id and rank = 3 and not tied;
    end if;
  end if;
  if c.format in ('LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT') and v_champ is null then
    raise exception 'The champion is not determined by the results yet' using errcode = 'EK409';
  end if;

  perform set_config('eksu.engine', 'on', true);
  update public.competition_stages set status = 'COMPLETED', completed_at = coalesce(completed_at, now()), locked_at = coalesce(locked_at, now())
  where competition_id = p_competition_id;
  update public.competitions set status = 'COMPLETED', completed_at = now(), completed_by = auth.uid(),
    champion_team_id = v_champ, runner_up_team_id = v_runner, third_place_team_id = v_third
  where id = p_competition_id;
  perform set_config('eksu.engine', '', true);
  perform private.audit('COMPETITION_COMPLETED', 'competition', p_competition_id, null, null, null,
    jsonb_build_object('champion', v_champ, 'runner_up', v_runner, 'third_place', v_third));
  return jsonb_build_object('champion_team_id', v_champ, 'runner_up_team_id', v_runner, 'third_place_team_id', v_third);
end $$;

create or replace function public.admin_reopen_competition(p_competition_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.competitions;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if c.status <> 'COMPLETED' then
    raise exception 'Only a completed competition can be reopened' using errcode = 'EK409';
  end if;
  perform private.begin_override(p_reason, 'competition', c.id, 'reopen completed competition');
  perform set_config('eksu.engine', 'on', true);
  update public.competitions set status = 'ACTIVE', completed_at = null, completed_by = null,
    champion_team_id = null, runner_up_team_id = null, third_place_team_id = null where id = c.id;
  perform set_config('eksu.engine', '', true);
  perform private.end_override();
  perform private.audit('COMPETITION_REOPENED', 'competition', c.id, null, null,
    jsonb_build_object('champion', c.champion_team_id), jsonb_build_object('detail', btrim(p_reason)));
end $$;

-- ── 12. Read models ────────────────────────────────────────────────────────
create or replace function private.table_rows_json(p_stage_id uuid, p_group_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'team_id', s.team_id, 'rank', s.rank, 'played', s.played, 'wins', s.wins, 'draws', s.draws, 'losses', s.losses,
    'goals_for', s.goals_for, 'goals_against', s.goals_against, 'goal_difference', s.goal_difference,
    'points', s.points, 'fair_play_points', s.fair_play_points, 'qualification', s.qualification, 'tied', s.tied
  ) order by s.rank, t.name), '[]'::jsonb)
  from public.standings s join public.teams t on t.id = s.team_id
  where s.stage_id = p_stage_id and s.group_id is not distinct from p_group_id;
$$;

create or replace function private.tie_json(t public.knockout_ties)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'code', t.code, 'position', t.position, 'stage_id', t.stage_id,
    'home_label', t.home_label, 'away_label', t.away_label,
    'home_team_id', t.home_team_id, 'away_team_id', t.away_team_id,
    'match_id', t.match_id, 'scheduled_at', coalesce(m.scheduled_at, t.scheduled_at), 'venue_id', coalesce(m.venue_id, t.venue_id),
    'winner_team_id', t.winner_team_id, 'loser_team_id', t.loser_team_id, 'decided_by', t.decided_by,
    'needs_reconciliation', t.needs_reconciliation,
    'status', m.status, 'home_score', m.home_score, 'away_score', m.away_score,
    'home_score_90', m.home_score_90, 'away_score_90', m.away_score_90,
    'home_pens', m.home_pens, 'away_pens', m.away_pens,
    'home_source', jsonb_build_object('type', t.home_source_type, 'tie_id', t.home_source_tie_id),
    'away_source', jsonb_build_object('type', t.away_source_type, 'tie_id', t.away_source_tie_id),
    'winner_to', (select jsonb_build_object('tie_id', d.id, 'code', d.code, 'side', case when d.home_source_tie_id = t.id then 'HOME' else 'AWAY' end)
      from public.knockout_ties d where (d.home_source_tie_id = t.id and d.home_source_type = 'WINNER')
        or (d.away_source_tie_id = t.id and d.away_source_type = 'WINNER') limit 1),
    'loser_to', (select jsonb_build_object('tie_id', d.id, 'code', d.code, 'side', case when d.home_source_tie_id = t.id then 'HOME' else 'AWAY' end)
      from public.knockout_ties d where (d.home_source_tie_id = t.id and d.home_source_type = 'LOSER')
        or (d.away_source_tie_id = t.id and d.away_source_type = 'LOSER') limit 1)
  )
  from (select 1) one left join public.matches m on m.id = t.match_id;
$$;

create or replace function private.stages_json(p_competition_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'stage_type', s.stage_type, 'order', s.stage_order, 'has_table', s.has_table,
    'is_knockout', private.stage_is_knockout(s.stage_type), 'status', s.status, 'legs', s.legs,
    'locked', s.locked_at is not null, 'qualification', s.qualification,
    'extra_time', coalesce(s.extra_time_allowed, c.extra_time_enabled), 'penalties', coalesce(s.penalties_allowed, c.penalties_enabled),
    'groups', case when s.has_table and s.stage_type in ('LEAGUE', 'GROUP') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name,
        'complete', private.group_complete(s.id, g.id), 'rows', private.table_rows_json(s.id, g.id)) order by g.name nulls first), '[]'::jsonb)
      from (select gr.id, gr.name from public.competition_groups gr where gr.stage_id = s.id
            union all select null::uuid, null::text
            where not exists (select 1 from public.competition_groups gr2 where gr2.stage_id = s.id)) g) end,
    'ties', case when private.stage_is_knockout(s.stage_type) then (
      select coalesce(jsonb_agg(private.tie_json(t) order by t.position), '[]'::jsonb)
      from public.knockout_ties t where t.stage_id = s.id) end
  ) order by s.stage_order), '[]'::jsonb)
  from public.competition_stages s join public.competitions c on c.id = s.competition_id
  where s.competition_id = p_competition_id;
$$;

-- Appearances: started (confirmed line-up) or came on, in a match that began.
create or replace function private.player_appearances(p_competition_id uuid, p_player uuid, p_team uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct m.id)::int
  from public.matches m
  where m.competition_id = p_competition_id and private.match_has_begun(m.status) and m.status <> 'ABANDONED'
    and (exists (select 1 from public.match_lineups l join public.lineup_players lp on lp.lineup_id = l.id
                 where l.match_id = m.id and l.team_id = p_team and l.status = 'CONFIRMED' and lp.player_id = p_player and lp.role = 'STARTER')
      or exists (select 1 from public.match_events e where e.match_id = m.id and e.team_id = p_team and e.type = 'SUBSTITUTION'
                 and e.related_player_id = p_player and e.voided_at is null));
$$;

/*
 * Competition statistics, derived from non-voided events of official
 * (non-demo) matches of this competition only. Own goals never count for the
 * scorer; shoot-out kicks are not events; assists are not recorded, so they
 * are not reported.
 */
create or replace function private.scorers_json(p_competition_id uuid, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by (x ->> 'goals')::int desc, (x ->> 'appearances')::int, x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', e.player_id, 'team_id', e.team_id,
      'name', coalesce(p.display_name, 'No. ' || private.active_squad_shirt(e.player_id, e.team_id, c.season_id)),
      'shirt_number', private.active_squad_shirt(e.player_id, e.team_id, c.season_id),
      'goals', count(*), 'penalties', count(*) filter (where e.type = 'PENALTY_GOAL'),
      'appearances', private.player_appearances(p_competition_id, e.player_id, e.team_id)
    ) x
    from public.match_events e
    join public.matches m on m.id = e.match_id
    join public.competitions c on c.id = m.competition_id
    left join public.players p on p.id = e.player_id
    where m.competition_id = p_competition_id and not m.is_demo and private.match_has_begun(m.status)
      and e.voided_at is null and e.player_id is not null and e.type in ('GOAL', 'PENALTY_GOAL')
    group by e.player_id, e.team_id, p.display_name, c.season_id
    order by count(*) desc
    limit p_limit
  ) q;
$$;

create or replace function private.discipline_json(p_competition_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(x order by (x ->> 'reds')::int desc, (x ->> 'yellows')::int desc, x ->> 'name')
      from (
        select jsonb_build_object(
          'player_id', e.player_id, 'team_id', e.team_id,
          'name', coalesce(p.display_name, 'No. ' || private.active_squad_shirt(e.player_id, e.team_id, c.season_id)),
          'shirt_number', private.active_squad_shirt(e.player_id, e.team_id, c.season_id),
          'yellows', count(*) filter (where e.type = 'YELLOW_CARD'),
          'second_yellows', count(*) filter (where e.type = 'SECOND_YELLOW'),
          'reds', count(*) filter (where e.type = 'RED_CARD')
        ) x
        from public.match_events e
        join public.matches m on m.id = e.match_id
        join public.competitions c on c.id = m.competition_id
        left join public.players p on p.id = e.player_id
        where m.competition_id = p_competition_id and not m.is_demo and private.match_has_begun(m.status)
          and e.voided_at is null and e.player_id is not null and e.type in ('YELLOW_CARD', 'SECOND_YELLOW', 'RED_CARD')
        group by e.player_id, e.team_id, p.display_name, c.season_id
      ) q), '[]'::jsonb),
    'suspensions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'player_id', s.player_id, 'team_id', s.team_id,
        'name', coalesce(p.display_name, 'No. ' || private.active_squad_shirt(s.player_id, s.team_id, c.season_id)),
        'reason', s.reason, 'matches_total', s.matches_total, 'matches_served', s.matches_served, 'status', s.status,
        'source_match_id', s.source_match_id, 'created_at', s.created_at
      ) order by s.status, s.created_at desc)
      from public.player_suspensions s join public.competitions c on c.id = s.competition_id
      left join public.players p on p.id = s.player_id
      where s.competition_id = p_competition_id and s.status <> 'CANCELLED'), '[]'::jsonb),
    'rules', (select jsonb_build_object('enabled', r.enabled, 'red_card_matches', r.red_card_matches,
      'second_yellow_matches', r.second_yellow_matches, 'yellow_threshold', r.yellow_threshold,
      'yellow_suspension_matches', r.yellow_suspension_matches)
      from public.competition_discipline_rules r where r.competition_id = p_competition_id)
  );
$$;

-- Clean sheets only where the goalkeeper is reliably known: the starting GK
-- of a confirmed line-up who stayed on for the whole FT match.
create or replace function private.clean_sheets_json(p_competition_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by (x ->> 'clean_sheets')::int desc, x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object('player_id', lp.player_id, 'team_id', l.team_id,
      'name', coalesce(p.display_name, 'No. ' || lp.shirt_number), 'shirt_number', lp.shirt_number,
      'clean_sheets', count(*)) x
    from public.matches m
    join public.match_lineups l on l.match_id = m.id and l.status = 'CONFIRMED'
    join public.lineup_players lp on lp.lineup_id = l.id and lp.role = 'STARTER' and lp.is_goalkeeper
    join public.players p on p.id = lp.player_id
    where m.competition_id = p_competition_id and not m.is_demo and m.status = 'FT'
      and (case when l.team_id = m.home_team_id then m.away_score else m.home_score end) = 0
      and not exists (select 1 from public.match_events e where e.match_id = m.id and e.voided_at is null
        and ((e.type = 'SUBSTITUTION' and e.player_id = lp.player_id) or (e.type in ('RED_CARD', 'SECOND_YELLOW') and e.player_id = lp.player_id)))
    group by lp.player_id, l.team_id, p.display_name, lp.shirt_number
  ) q;
$$;

create or replace function private.competition_payload(p_competition_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'competition', jsonb_build_object(
      'id', c.id, 'name', c.name, 'short_name', c.short_name, 'format', c.format, 'status', c.status, 'kind', c.kind,
      'season', (select name from public.seasons where id = c.season_id),
      'champion_team_id', c.champion_team_id, 'runner_up_team_id', c.runner_up_team_id,
      'third_place_team_id', c.third_place_team_id, 'completed_at', c.completed_at,
      'points', jsonb_build_array(c.points_win, c.points_draw, c.points_loss), 'tiebreakers', to_jsonb(c.tiebreakers),
      'extra_time_enabled', c.extra_time_enabled, 'penalties_enabled', c.penalties_enabled),
    'stages', private.stages_json(c.id),
    'scorers', private.scorers_json(c.id, 50),
    'clean_sheets', private.clean_sheets_json(c.id),
    'discipline', private.discipline_json(c.id),
    'summary', (select jsonb_build_object(
      'teams', (select count(*) from public.competition_entries where competition_id = c.id),
      'matches_total', count(*) filter (where m.status <> 'CANCELLED'),
      'matches_played', count(*) filter (where m.status = 'FT'),
      'live', count(*) filter (where m.status = any (private.in_progress_statuses())),
      'goals', coalesce(sum(m.home_score + m.away_score) filter (where private.match_has_begun(m.status)), 0))
      from public.matches m where m.competition_id = c.id and not m.is_demo)
  )
  from public.competitions c where c.id = p_competition_id;
$$;

-- Public competition page (published competitions only).
create or replace function public.public_competition(p_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.competitions where id = p_competition_id and status <> 'DRAFT') then
    return null;
  end if;
  return private.competition_payload(p_competition_id);
end $$;

-- Admin control centre: the public payload plus operational state.
create or replace function public.admin_competition_overview(p_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.competitions; r public.competition_discipline_rules;
begin
  perform private.require_admin();
  select * into c from public.competitions where id = p_competition_id;
  if not found then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  select * into r from public.competition_discipline_rules where competition_id = c.id;
  return private.competition_payload(c.id) || jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('team_id', e.team_id, 'name', t.name, 'short_name', t.short_name,
        'code', t.code, 'group_id', e.group_id, 'stage_id', e.stage_id, 'seed', e.seed) order by t.name)
      from public.competition_entries e join public.teams t on t.id = e.team_id where e.competition_id = c.id), '[]'::jsonb),
    'stage_ops', coalesce((select jsonb_agg(jsonb_build_object(
        'stage_id', s.id,
        'locked', private.stage_is_locked(s.id),
        'matches', (select jsonb_build_object('total', count(*), 'finished', count(*) filter (where m.status = 'FT'),
            'scheduled', count(*) filter (where m.status = 'SCHEDULED'), 'postponed', count(*) filter (where m.status = 'POSTPONED'),
            'live', count(*) filter (where m.status = any (private.in_progress_statuses())),
            'cancelled', count(*) filter (where m.status = 'CANCELLED'), 'abandoned', count(*) filter (where m.status = 'ABANDONED'))
          from public.matches m where m.stage_id = s.id),
        'generation', (select jsonb_build_object('id', g.id, 'kind', g.kind, 'created_at', g.created_at, 'match_count', g.match_count, 'config', g.config)
          from public.fixture_generations g where g.stage_id = s.id and g.cleared_at is null order by g.created_at desc limit 1),
        'pending_qualification', (select count(*) from public.standings x where x.stage_id = s.id and x.qualification = 'PENDING'),
        'decisions', coalesce((select jsonb_agg(jsonb_build_object('team_id', d.team_id, 'decision', d.decision, 'reason', d.reason))
          from public.stage_qualification_decisions d where d.stage_id = s.id and d.revoked_at is null), '[]'::jsonb),
        'ties_to_decide', (select count(*) from public.knockout_ties t left join public.matches m on m.id = t.match_id
          where t.stage_id = s.id and t.winner_team_id is null and t.home_team_id is not null and t.away_team_id is not null
            and m.status in ('FT', 'CANCELLED', 'ABANDONED')),
        'ties_to_reconcile', (select count(*) from public.knockout_ties t where t.stage_id = s.id and t.needs_reconciliation),
        'ties_unscheduled', (select count(*) from public.knockout_ties t where t.stage_id = s.id and t.match_id is null and t.scheduled_at is null)
      ) order by s.stage_order) from public.competition_stages s where s.competition_id = c.id), '[]'::jsonb),
    'next_fixtures', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'scheduled_at', m.scheduled_at, 'status', m.status,
        'home_team_id', m.home_team_id, 'away_team_id', m.away_team_id, 'round_label', m.round_label, 'matchday', m.matchday,
        'venue_id', m.venue_id, 'stage_id', m.stage_id, 'group_id', m.group_id) order by m.scheduled_at)
      from (select * from public.matches where competition_id = c.id and status in ('SCHEDULED', 'POSTPONED')
            order by scheduled_at limit 8) m), '[]'::jsonb),
    'fixtures', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'scheduled_at', m.scheduled_at,
        'original_scheduled_at', m.original_scheduled_at, 'status', m.status, 'home_team_id', m.home_team_id,
        'away_team_id', m.away_team_id, 'round_label', m.round_label, 'matchday', m.matchday, 'venue_id', m.venue_id,
        'stage_id', m.stage_id, 'group_id', m.group_id, 'home_score', m.home_score, 'away_score', m.away_score,
        'home_pens', m.home_pens, 'away_pens', m.away_pens, 'tie_id', m.tie_id,
        'reschedules', (select count(*) from public.fixture_schedule_history h where h.match_id = m.id and h.action = 'RESCHEDULED'))
        order by m.matchday nulls last, m.scheduled_at)
      from public.matches m where m.competition_id = c.id), '[]'::jsonb),
    'discipline_alerts', coalesce((
      select jsonb_agg(a) from (
        select jsonb_build_object('kind', 'SUSPENDED', 'player_id', s.player_id, 'team_id', s.team_id,
          'name', coalesce(p.display_name, 'Player'), 'detail', s.reason, 'remaining', s.matches_total - s.matches_served) a
        from public.player_suspensions s left join public.players p on p.id = s.player_id
        where s.competition_id = c.id and s.status = 'ACTIVE'
        union all
        select jsonb_build_object('kind', 'ONE_YELLOW_AWAY', 'player_id', y.player_id, 'team_id', y.team_id,
          'name', coalesce(p.display_name, 'Player'), 'detail', y.n || ' yellow card(s)', 'remaining', null)
        from (
          select e.player_id, e.team_id, count(*) n from public.match_events e join public.matches m on m.id = e.match_id
          where m.competition_id = c.id and m.status in ('FT', 'ABANDONED') and not m.is_demo and e.voided_at is null
            and e.player_id is not null and e.type = 'YELLOW_CARD'
          group by e.player_id, e.team_id
        ) y left join public.players p on p.id = y.player_id
        where r.enabled and r.yellow_threshold is not null and y.n % r.yellow_threshold = r.yellow_threshold - 1
      ) q), '[]'::jsonb),
    'screening', coalesce((select jsonb_object_agg(st, n) from (
        select ps.status::text st, count(*) n from public.player_screenings ps
        where ps.season_id = c.season_id and ps.team_id in (select team_id from public.competition_entries where competition_id = c.id)
        group by ps.status) x), '{}'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at, 'entity_type', a.entity_type,
        'detail', a.after_state -> 'detail') order by a.created_at desc)
      from (select * from public.audit_log a
            where a.action in ('COMPETITION_FORMAT_CHANGED', 'COMPETITION_RULES_CHANGED', 'GROUP_CREATED', 'TEAM_ASSIGNED_TO_GROUP',
              'FIXTURES_GENERATED', 'FIXTURES_CLEARED', 'FIXTURE_RESCHEDULED', 'STAGE_LOCKED', 'STAGE_COMPLETED', 'KNOCKOUT_GENERATED',
              'TEAM_ADVANCED', 'KNOCKOUT_RECONCILIATION_REQUIRED', 'KNOCKOUT_RECONCILED', 'DISCIPLINARY_RULE_CHANGED',
              'PLAYER_SUSPENDED', 'SUSPENSION_SERVED', 'SUSPENSION_CANCELLED', 'COMPETITION_COMPLETED', 'COMPETITION_REOPENED',
              'QUALIFICATION_DECIDED', 'LOCK_OVERRIDE', 'COMPETITION_ENGINE_ERROR')
              and (a.entity_id = c.id
                or a.entity_id in (select id from public.competition_stages where competition_id = c.id)
                or a.entity_id in (select id from public.knockout_ties where competition_id = c.id)
                or a.entity_id in (select id from public.player_suspensions where competition_id = c.id)
                or a.entity_id in (select g.id from public.competition_groups g join public.competition_stages s on s.id = g.stage_id where s.competition_id = c.id)
                or a.entity_id in (select id from public.competition_entries where competition_id = c.id)
                or a.match_id in (select id from public.matches where competition_id = c.id))
            order by a.created_at desc limit 15) a), '[]'::jsonb),
    'discipline_rules', case when r.competition_id is null then null else to_jsonb(r) end,
    'lock_state', jsonb_build_object('begun', exists (select 1 from public.matches m where m.competition_id = c.id and private.match_has_begun(m.status)))
  );
end $$;

-- Fixture schedule history for one match (admin).
create or replace function public.admin_fixture_history(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('action', h.action, 'at', h.changed_at,
      'from_scheduled_at', h.from_scheduled_at, 'to_scheduled_at', h.to_scheduled_at,
      'from_venue_id', h.from_venue_id, 'to_venue_id', h.to_venue_id, 'from_matchday', h.from_matchday,
      'to_matchday', h.to_matchday, 'from_status', h.from_status, 'to_status', h.to_status, 'reason', h.reason,
      'by', (select display_name from public.profiles where id = h.changed_by)) order by h.changed_at)
    from public.fixture_schedule_history h where h.match_id = p_match_id), '[]'::jsonb);
end $$;

-- ── 13. RLS + privileges ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['fixture_generations', 'fixture_schedule_history', 'knockout_ties', 'stage_qualification_decisions',
    'competition_discipline_rules', 'player_suspensions', 'match_shootout_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Public: the bracket and the discipline rules of published competitions.
grant select on public.knockout_ties, public.competition_discipline_rules to anon, authenticated;
create policy "ties of published competitions are public" on public.knockout_ties
  for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = knockout_ties.competition_id));
create policy "discipline rules of published competitions are public" on public.competition_discipline_rules
  for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_discipline_rules.competition_id));

-- Staff read; every write goes through the RPCs above.
grant select on public.fixture_generations, public.fixture_schedule_history, public.stage_qualification_decisions,
  public.player_suspensions, public.match_shootout_attempts to authenticated;
create policy "staff read fixture generations" on public.fixture_generations for select to authenticated using (private.is_staff());
create policy "staff read schedule history" on public.fixture_schedule_history for select to authenticated using (private.is_staff());
create policy "staff read qualification decisions" on public.stage_qualification_decisions for select to authenticated using (private.is_staff());
create policy "staff read suspensions" on public.player_suspensions for select to authenticated using (private.is_staff());
create policy "staff read shootout kicks" on public.match_shootout_attempts for select to authenticated using (private.is_staff());

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on function
  public.admin_preview_fixtures(uuid, jsonb), public.admin_confirm_fixtures(uuid, jsonb, text),
  public.admin_clear_generated_fixtures(uuid, text), public.admin_schedule_fixture(uuid, timestamptz, uuid, integer, text),
  public.admin_preview_knockout(uuid, jsonb), public.admin_confirm_knockout(uuid, jsonb, text),
  public.admin_schedule_tie(uuid, timestamptz, uuid, text), public.admin_reconcile_tie(uuid, text),
  public.admin_decide_tie(uuid, uuid, text), public.admin_resolve_tie_side(uuid, text, uuid, text),
  public.record_shootout_attempt(uuid, uuid, uuid, uuid, text), public.void_shootout_attempt(uuid, uuid, uuid, text),
  public.admin_correct_shootout(uuid, text, uuid, uuid, text, text),
  public.admin_set_discipline_rules(uuid, boolean, integer, integer, integer, integer),
  public.admin_add_suspension(uuid, uuid, uuid, integer, text), public.admin_cancel_suspension(uuid, text),
  public.admin_create_stage(uuid, text, text, integer, jsonb), public.admin_update_stage(uuid, jsonb, text),
  public.admin_update_competition_rules(uuid, jsonb, text), public.admin_create_groups(uuid, text[]),
  public.admin_assign_team_group(uuid, uuid, uuid, text), public.admin_set_qualification_decision(uuid, uuid, text, text),
  public.admin_complete_stage(uuid), public.admin_complete_competition(uuid), public.admin_reopen_competition(uuid, text),
  public.admin_competition_overview(uuid), public.admin_fixture_history(uuid), public.public_competition(uuid)
from public, anon;

grant execute on function
  public.admin_preview_fixtures(uuid, jsonb), public.admin_confirm_fixtures(uuid, jsonb, text),
  public.admin_clear_generated_fixtures(uuid, text), public.admin_schedule_fixture(uuid, timestamptz, uuid, integer, text),
  public.admin_preview_knockout(uuid, jsonb), public.admin_confirm_knockout(uuid, jsonb, text),
  public.admin_schedule_tie(uuid, timestamptz, uuid, text), public.admin_reconcile_tie(uuid, text),
  public.admin_decide_tie(uuid, uuid, text), public.admin_resolve_tie_side(uuid, text, uuid, text),
  public.record_shootout_attempt(uuid, uuid, uuid, uuid, text), public.void_shootout_attempt(uuid, uuid, uuid, text),
  public.admin_correct_shootout(uuid, text, uuid, uuid, text, text),
  public.admin_set_discipline_rules(uuid, boolean, integer, integer, integer, integer),
  public.admin_add_suspension(uuid, uuid, uuid, integer, text), public.admin_cancel_suspension(uuid, text),
  public.admin_create_stage(uuid, text, text, integer, jsonb), public.admin_update_stage(uuid, jsonb, text),
  public.admin_update_competition_rules(uuid, jsonb, text), public.admin_create_groups(uuid, text[]),
  public.admin_assign_team_group(uuid, uuid, uuid, text), public.admin_set_qualification_decision(uuid, uuid, text, text),
  public.admin_complete_stage(uuid), public.admin_complete_competition(uuid), public.admin_reopen_competition(uuid, text),
  public.admin_competition_overview(uuid), public.admin_fixture_history(uuid)
to authenticated;
grant execute on function public.public_competition(uuid) to anon, authenticated;
