-- Matches, authoritative clock state, events, assignments, standings, audit.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  stage_id uuid references public.competition_stages (id) on delete set null,
  group_id uuid references public.competition_groups (id) on delete set null,
  round_label text not null default '',
  home_team_id uuid not null references public.teams (id) on delete restrict,
  away_team_id uuid not null references public.teams (id) on delete restrict,
  venue_id uuid references public.venues (id) on delete set null,
  scheduled_at timestamptz not null,

  -- State (changed only by the RPC layer).
  status public.match_status not null default 'SCHEDULED',
  status_note text,
  -- Derived from non-voided scoring events; never accepted from clients.
  home_score smallint not null default 0 check (home_score >= 0),
  away_score smallint not null default 0 check (away_score >= 0),
  -- Monotonic per-match sequence: bumped on every change; events take it.
  seq bigint not null default 0,

  -- Authoritative clock STATE (the displayed minute is derived by clients).
  current_period smallint check (current_period between 1 and 5),
  period_started_at timestamptz,
  period_ended_at timestamptz,
  period_offset_seconds integer not null default 0,
  clock_running boolean not null default false,
  paused_at timestamptz,
  accumulated_pause_seconds numeric(10, 3) not null default 0,
  stoppage_seconds integer not null default 0 check (stoppage_seconds between 0 and 1800),

  started_at timestamptz,
  finished_at timestamptz,
  -- Operator currently allowed to make live changes.
  active_operator_id uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (paused_at is null or clock_running)
);
create index matches_scheduled_at_idx on public.matches (scheduled_at);
create index matches_competition_idx on public.matches (competition_id, scheduled_at);
create index matches_status_idx on public.matches (status);
create index matches_home_idx on public.matches (home_team_id);
create index matches_away_idx on public.matches (away_team_id);
create trigger matches_touch before update on public.matches
  for each row execute function private.touch_updated_at();

create table public.match_periods (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  period smallint not null check (period between 1 and 5),
  offset_seconds integer not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  accumulated_pause_seconds numeric(10, 3) not null default 0,
  stoppage_seconds integer not null default 0,
  unique (match_id, period)
);

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z_]+$'),
  sport_id uuid not null references public.sports (id) on delete restrict,
  name text not null,
  -- Scoring: 'SELF' credits the event team, 'OPPONENT' credits the other team.
  scores_for text check (scores_for in ('SELF', 'OPPONENT')),
  requires_player boolean not null default false,
  requires_related_player boolean not null default false
);

create table public.match_events (
  -- Client-generated: the idempotency key for record_event.
  id uuid primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  seq bigint not null,
  type text not null references public.event_types (code) on update cascade,
  period smallint not null,
  minute smallint not null check (minute between 0 and 200),
  minute_extra smallint not null default 0 check (minute_extra between 0 and 60),
  -- Team of the player involved (own goal: the player's own team).
  team_id uuid not null references public.teams (id) on delete restrict,
  player_id uuid references public.players (id) on delete restrict,
  related_player_id uuid references public.players (id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  client_ts timestamptz,
  client_queued boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  unique (match_id, seq),
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or coalesce(void_reason, '') <> '')
);
create index match_events_match_seq_idx on public.match_events (match_id, seq);

create table public.operator_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.assignment_role not null,
  active boolean not null default true,
  prep_checks jsonb not null default '{}'::jsonb,
  prep_completed_at timestamptz,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (match_id, user_id),
  check (active or revoked_at is not null)
);
create index operator_assignments_user_idx on public.operator_assignments (user_id) where active;
create index operator_assignments_match_idx on public.operator_assignments (match_id);
create unique index operator_assignments_one_primary
  on public.operator_assignments (match_id) where active and role = 'PRIMARY';

-- Idempotency ledger for every match command. A retried intent returns the
-- current canonical state instead of applying twice.
create table public.match_intents (
  id uuid primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  command text not null,
  actor_id uuid not null references public.profiles (id),
  match_seq bigint not null,
  created_at timestamptz not null default now()
);
create index match_intents_match_idx on public.match_intents (match_id);

create table public.standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  group_id uuid references public.competition_groups (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  played smallint not null default 0,
  wins smallint not null default 0,
  draws smallint not null default 0,
  losses smallint not null default 0,
  goals_for smallint not null default 0,
  goals_against smallint not null default 0,
  goal_difference smallint not null default 0,
  points smallint not null default 0,
  rank smallint not null,
  updated_at timestamptz not null default now()
);
create unique index standings_unique on public.standings (competition_id, group_id, team_id) nulls not distinct;
create index standings_rank_idx on public.standings (competition_id, group_id, rank);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  -- No cascade: an audited match cannot be deleted (audit rows are immutable).
  match_id uuid references public.matches (id),
  intent_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_match_idx on public.audit_log (match_id, created_at);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- Append-only: rejects UPDATE/DELETE/TRUNCATE for every role, including the
-- table owner and service_role.
create or replace function private.audit_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();
