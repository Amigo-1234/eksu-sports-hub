-- Sports structure: sports, seasons, institutions, venues, competitions,
-- teams, players and squads.

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null,
  active boolean not null default true
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. "2026/27"
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);
create unique index seasons_single_current on public.seasons (is_current) where is_current;

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculties (id) on delete restrict,
  name text not null,
  code text not null unique,
  unique (faculty_id, name)
);
create index departments_faculty_idx on public.departments (faculty_id);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  name text not null,
  short_name text not null,
  format public.competition_format not null default 'LEAGUE',
  category public.competition_category not null default 'MEN',
  description text not null default '',
  -- Points configuration (never hard-coded in standings logic).
  points_win smallint not null default 3,
  points_draw smallint not null default 1,
  points_loss smallint not null default 0,
  -- Ordered tie-breakers understood by private.recompute_standings().
  tiebreakers text[] not null default array['points', 'goal_difference', 'goals_for'],
  created_at timestamptz not null default now(),
  unique (season_id, name)
);
create index competitions_sport_season_idx on public.competitions (sport_id, season_id);

create table public.competition_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,                -- "League phase", "Semi-final"
  stage_order smallint not null,
  has_table boolean not null default true,
  unique (competition_id, stage_order)
);

create table public.competition_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.competition_stages (id) on delete cascade,
  name text not null,
  unique (stage_id, name)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete restrict,
  name text not null,
  short_name text not null,
  code text not null check (char_length(code) between 2 and 4),
  kind public.team_kind not null default 'FACULTY',
  category public.competition_category not null default 'MEN',
  faculty_id uuid references public.faculties (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  color_primary text not null default '#761530' check (color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  color_secondary text not null default '#FFFFFF' check (color_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  unique (sport_id, name)
);

create table public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  stage_id uuid references public.competition_stages (id) on delete cascade,
  group_id uuid references public.competition_groups (id) on delete set null,
  team_id uuid not null references public.teams (id) on delete restrict,
  unique (competition_id, team_id)
);
create index competition_entries_team_idx on public.competition_entries (team_id);

-- Players carry no personal data beyond an optional display name. Development
-- seeds leave it null (shirt numbers only).
create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now()
);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete restrict,
  unique (team_id, season_id)
);

create table public.squad_players (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  shirt_number smallint not null check (shirt_number between 1 and 99),
  unique (squad_id, player_id),
  unique (squad_id, shirt_number)
);
create index squad_players_player_idx on public.squad_players (player_id);
