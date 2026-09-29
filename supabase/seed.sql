-- DEVELOPMENT SEED — not for production.
-- Reference data + one development competition. No real people: players have
-- no names (shirt numbers only). Auth users, roles and operator assignments
-- are created by `npm run dev:users` (scripts/dev-users.mjs) through the
-- Supabase Auth admin API, never by inserting into auth.users here.

insert into public.roles (id, code, description) values
  ('10000000-0000-4000-8000-000000000001', 'ADMIN', 'Full administrative access'),
  ('10000000-0000-4000-8000-000000000002', 'MANAGER', 'Manages competitions and assignments'),
  ('10000000-0000-4000-8000-000000000003', 'OPERATOR', 'Operates assigned matches');

insert into public.sports (id, code, name) values
  ('20000000-0000-4000-8000-000000000001', 'football', 'Football');

insert into public.event_types (code, sport_id, name, scores_for, requires_player, requires_related_player) values
  ('GOAL',          '20000000-0000-4000-8000-000000000001', 'Goal',           'SELF',     false, false),
  ('PENALTY_GOAL',  '20000000-0000-4000-8000-000000000001', 'Penalty goal',   'SELF',     false, false),
  ('OWN_GOAL',      '20000000-0000-4000-8000-000000000001', 'Own goal',       'OPPONENT', false, false),
  ('PENALTY_MISS',  '20000000-0000-4000-8000-000000000001', 'Penalty missed', null,       false, false),
  ('YELLOW_CARD',   '20000000-0000-4000-8000-000000000001', 'Yellow card',    null,       true,  false),
  ('SECOND_YELLOW', '20000000-0000-4000-8000-000000000001', 'Second yellow',  null,       true,  false),
  ('RED_CARD',      '20000000-0000-4000-8000-000000000001', 'Red card',       null,       true,  false),
  ('SUBSTITUTION',  '20000000-0000-4000-8000-000000000001', 'Substitution',   null,       true,  true);

insert into public.seasons (id, name, starts_on, ends_on, is_current) values
  ('30000000-0000-4000-8000-000000000001', 'DEV 2026/27', '2026-08-01', '2027-07-31', true);

insert into public.faculties (id, name, code) values
  ('40000000-0000-4000-8000-000000000001', 'Faculty of Science', 'SCI'),
  ('40000000-0000-4000-8000-000000000002', 'Faculty of Engineering', 'ENG'),
  ('40000000-0000-4000-8000-000000000003', 'Faculty of Arts', 'ART'),
  ('40000000-0000-4000-8000-000000000004', 'Faculty of Education', 'EDU');

insert into public.venues (id, name, short_name) values
  ('50000000-0000-4000-8000-000000000001', 'DEV Sports Complex — Main Pitch', 'Main Pitch'),
  ('50000000-0000-4000-8000-000000000002', 'DEV Sports Complex — Pitch 2', 'Pitch 2');

insert into public.competitions (id, sport_id, season_id, name, short_name, format, category, description) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   'DEV Inter-Faculty League', 'DEV League', 'LEAGUE', 'MEN', 'Development competition for backend testing.');

insert into public.competition_stages (id, competition_id, name, stage_order) values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'League phase', 1);

insert into public.teams (id, sport_id, name, short_name, code, slug, kind, faculty_id, color_primary) values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'DEV Science', 'Science', 'SCI', 'dev-science', 'FACULTY', '40000000-0000-4000-8000-000000000001', '#1D4ED8'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'DEV Engineering', 'Engineering', 'ENG', 'dev-engineering', 'FACULTY', '40000000-0000-4000-8000-000000000002', '#9A3412'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'DEV Arts', 'Arts', 'ART', 'dev-arts', 'FACULTY', '40000000-0000-4000-8000-000000000003', '#6D28D9'),
  ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'DEV Education', 'Education', 'EDU', 'dev-education', 'FACULTY', '40000000-0000-4000-8000-000000000004', '#047857');

insert into public.competition_entries (competition_id, stage_id, team_id)
select '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', t.id
from public.teams t where t.id::text like '70000000-%';

-- Squads: 18 anonymous players per team, shirts 1–18.
with sq as (
  insert into public.squads (team_id, season_id)
  select t.id, '30000000-0000-4000-8000-000000000001' from public.teams t where t.id::text like '70000000-%'
  returning id
), slots as (
  select sq.id as squad_id, n as shirt, gen_random_uuid() as player_id
  from sq cross join generate_series(1, 18) n
), players as (
  insert into public.players (id) select player_id from slots returning id
)
insert into public.squad_players (squad_id, player_id, shirt_number)
select squad_id, player_id, shirt from slots;

-- Matches. The first is the one assigned to the development operators.
insert into public.matches (id, competition_id, stage_id, round_label, home_team_id, away_team_id, venue_id, scheduled_at) values
  ('80000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Matchday 1',
   '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', now() + interval '20 minutes'),
  ('80000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Matchday 1',
   '70000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002', now() + interval '20 minutes'),
  ('80000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Matchday 2',
   '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', now() + interval '3 days');

select private.recompute_standings('60000000-0000-4000-8000-000000000001');
