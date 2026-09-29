-- PRODUCTION REFERENCE DATA — safe for hosted projects (unlike seed.sql).
-- Roles, the football sport and the event types the match engine needs.
-- Idempotent: keyed on each table's unique `code`, so re-running it never
-- duplicates rows. No fixtures, teams, players, competitions or users.
-- Applied to the hosted eksu-sports-hub project on 2026-09-29.

insert into public.roles (code, description) values
  ('ADMIN', 'Full administrative access'),
  ('MANAGER', 'Manages competitions and assignments'),
  ('OPERATOR', 'Operates assigned matches')
on conflict (code) do nothing;

insert into public.sports (code, name) values ('football', 'Football')
on conflict (code) do nothing;

insert into public.event_types (code, sport_id, name, scores_for, requires_player, requires_related_player)
select v.code, s.id, v.name, v.scores_for, v.requires_player, v.requires_related_player
from (values
  ('GOAL',          'Goal',           'SELF',     false, false),
  ('PENALTY_GOAL',  'Penalty goal',   'SELF',     false, false),
  ('OWN_GOAL',      'Own goal',       'OPPONENT', false, false),
  ('PENALTY_MISS',  'Penalty missed', null,       false, false),
  ('YELLOW_CARD',   'Yellow card',    null,       true,  false),
  ('SECOND_YELLOW', 'Second yellow',  null,       true,  false),
  ('RED_CARD',      'Red card',       null,       true,  false),
  ('SUBSTITUTION',  'Substitution',   null,       true,  true)
) v(code, name, scores_for, requires_player, requires_related_player)
cross join public.sports s where s.code = 'football'
on conflict (code) do nothing;
