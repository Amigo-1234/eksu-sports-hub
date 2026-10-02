-- Competition Engine V2: fixtures, groups, standings, qualification, knockout
-- bracket, extra time + penalties, discipline, statistics, lifecycle, security.
-- Everything runs on synthetic competitions inside a rolled-back transaction.
begin;
\ir helpers.inc
select no_plan();

-- Derived work (standings, advancement, discipline) runs in a deferred
-- trigger at commit; tests never commit, so run it after each statement.
set constraints all immediate;

-- ── Setup ──────────────────────────────────────────────────────────────────
create table tests.ctx (k text primary key, id uuid not null);
insert into tests.ctx values
  ('admin', tests.make_user('ce-admin@test.local', array['ADMIN'])),
  ('op', tests.make_user('ce-op@test.local', array['OPERATOR']));
create or replace function tests.c(p text) returns uuid language sql stable as $$ select id from tests.ctx where k = p $$;
grant select on tests.ctx to anon, authenticated;
grant execute on function tests.c(text) to anon, authenticated;

-- Twelve synthetic teams (no squads needed for structure tests).
with t as (
  insert into public.teams (sport_id, name, short_name, code, slug)
  select '20000000-0000-4000-8000-000000000001', 'CE Team ' || lpad(n::text, 2, '0'), 'CE' || n, 'C' || lpad(n::text, 2, '0'), 'ce-team-' || n
  from generate_series(1, 12) n
  returning id, slug
)
insert into tests.ctx select 't' || replace(slug, 'ce-team-', ''), id from t;

create or replace function tests.new_comp(p_key text, p_name text, p_format public.competition_format, p_status text default 'ACTIVE')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  insert into public.competitions (sport_id, season_id, name, short_name, format, status)
  values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', p_name, left(p_name, 30), p_format, p_status)
  returning id into v;
  insert into tests.ctx values (p_key, v);
  return v;
end $$;
create or replace function tests.enter(p_comp uuid, p_teams text[]) returns void language sql security definer set search_path = '' as $$
  insert into public.competition_entries (competition_id, team_id)
  select p_comp, (select id from tests.ctx where k = t) from unnest(p_teams) t;
$$;
create or replace function tests.stage(p_comp uuid, p_type text, p_order int, p_settings jsonb default '{}') returns uuid
language sql security definer set search_path = '' as $$
  insert into public.competition_stages (competition_id, name, stage_order, stage_type, has_table, qualification,
    extra_time_allowed, penalties_allowed)
  values (p_comp, p_type || ' ' || p_order, p_order, p_type, p_type in ('LEAGUE', 'GROUP'),
    coalesce(p_settings -> 'qualification', '{}'::jsonb), (p_settings ->> 'et')::boolean, (p_settings ->> 'pens')::boolean)
  returning id;
$$;

-- Finish a match the quick way (as the system): goals for each side, FT.
create sequence tests.clock;
create or replace function tests.finish(p_match uuid, p_home int, p_away int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; i int;
begin
  select * into m from public.matches where id = p_match;
  for i in 1 .. p_home loop
    insert into public.match_events (id, match_id, seq, type, period, minute, team_id, recorded_by)
    values (gen_random_uuid(), p_match, private.bump_seq(p_match), 'GOAL', 1, 10 + i, m.home_team_id, (select id from tests.ctx where k = 'admin'));
  end loop;
  for i in 1 .. p_away loop
    insert into public.match_events (id, match_id, seq, type, period, minute, team_id, recorded_by)
    values (gen_random_uuid(), p_match, private.bump_seq(p_match), 'GOAL', 2, 50 + i, m.away_team_id, (select id from tests.ctx where k = 'admin'));
  end loop;
  update public.matches set status = 'FT', current_period = 2, started_at = coalesce(started_at, now()),
    finished_at = now() + make_interval(mins => nextval('tests.clock')::int)
  where id = p_match;
  perform private.recompute_score(p_match);
end $$;
create or replace function tests.event(p_match uuid, p_team uuid, p_type text, p_player uuid, p_minute int default 30) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.match_events (id, match_id, seq, type, period, minute, team_id, player_id, recorded_by)
  values (v, p_match, private.bump_seq(p_match), p_type, case when p_minute <= 45 then 1 else 2 end, p_minute, p_team, p_player,
    (select id from tests.ctx where k = 'admin'));
  perform private.recompute_score(p_match);
  return v;
end $$;
create or replace function tests.match_of(p_comp uuid, p_home text, p_away text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.matches where competition_id = p_comp
    and home_team_id = (select id from tests.ctx where k = p_home) and away_team_id = (select id from tests.ctx where k = p_away);
$$;
create or replace function tests.pair(p_comp uuid, p_a text, p_b text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.matches where competition_id = p_comp
    and ((home_team_id = (select id from tests.ctx where k = p_a) and away_team_id = (select id from tests.ctx where k = p_b))
      or (home_team_id = (select id from tests.ctx where k = p_b) and away_team_id = (select id from tests.ctx where k = p_a)));
$$;
create or replace function tests.row(p_comp uuid, p_team text) returns public.standings language sql stable security definer set search_path = '' as $$
  select * from public.standings where competition_id = p_comp and team_id = (select id from tests.ctx where k = p_team);
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- ═══ A. FIXTURE GENERATION ═════════════════════════════════════════════════
select tests.new_comp('L', 'CE League', 'LEAGUE');
select tests.enter(tests.c('L'), array['t1', 't2', 't3', 't4', 't5', 't6']);
insert into tests.ctx select 'L.s', tests.stage(tests.c('L'), 'LEAGUE', 1);

create temp table pv (k text primary key, v jsonb);
grant all on pv to authenticated;
select tests.login(tests.c('admin'));
insert into pv select 'L', public.admin_preview_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00", "days_between": 7, "spacing_minutes": 120}');
reset role;

select is((select (v ->> 'match_count')::int from pv where k = 'L'), 15, '6-team single round robin = 15 matches');
select is((select (v ->> 'matchdays')::int from pv where k = 'L'), 5, '6-team round robin = 5 matchdays');
select is((select count(distinct least(f ->> 'home_team_id', f ->> 'away_team_id') || greatest(f ->> 'home_team_id', f ->> 'away_team_id'))::int
           from pv, jsonb_array_elements(v -> 'fixtures') f where k = 'L'), 15, 'no duplicate pairing');
select is((select array_agg(distinct n) from (
  select count(*) n from pv, jsonb_array_elements(v -> 'fixtures') f, lateral (values (f ->> 'home_team_id'), (f ->> 'away_team_id')) t(team)
  where k = 'L' group by team) x), array[5::bigint], 'every team plays 5 matches');
select ok((select max(n) - min(n) <= 1 from (
  select count(*) n from pv, jsonb_array_elements(v -> 'fixtures') f where k = 'L' group by f ->> 'home_team_id'
  union all select 0 where false) x), 'home matches are balanced (differ by at most one)');
select is((select count(distinct f ->> 'matchday') from pv, jsonb_array_elements(v -> 'fixtures') f where k = 'L'
           group by f ->> 'matchday' having count(*) <> 3 limit 1), null, 'three matches on every matchday');
select is((select f ->> 'scheduled_at' from pv, jsonb_array_elements(v -> 'fixtures') f where k = 'L' and f ->> 'matchday' = '1' order by f ->> 'scheduled_at' limit 1),
  '2026-11-02T14:00:00+00:00', 'kick-off is set in campus time (15:00 WAT)');
select is((select count(*)::int from public.matches where stage_id = tests.c('L.s')), 0, 'preview does not persist anything');

select tests.login(tests.c('admin'));
select is(public.admin_preview_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00", "days_between": 7, "spacing_minutes": 120}') ->> 'hash',
  (select v ->> 'hash' from pv where k = 'L'), 'preview is deterministic');
select throws_ok($$ select public.admin_confirm_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00"}', 'not-the-hash') $$,
  'EK409', null, 'confirm refuses a stale/foreign preview');
select is((public.admin_confirm_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00", "days_between": 7, "spacing_minutes": 120}',
  (select v ->> 'hash' from pv where k = 'L')) ->> 'created')::int, 15, 'confirm creates the 15 fixtures');
select is((public.admin_confirm_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00", "days_between": 7, "spacing_minutes": 120}',
  (select v ->> 'hash' from pv where k = 'L')) ->> 'idempotent')::boolean, true, 'a second confirm is idempotent');
select throws_ok($$ select public.admin_confirm_fixtures(tests.c('L.s'), '{"start_date": "2026-12-01"}',
  public.admin_preview_fixtures(tests.c('L.s'), '{"start_date": "2026-12-01"}') ->> 'hash') $$, 'EK409', null, 'a different generation is refused while fixtures exist');
reset role;
select is((select count(*)::int from public.matches where stage_id = tests.c('L.s')), 15, 'still exactly 15 fixtures');
select is((select count(*)::int from public.matches where stage_id = tests.c('L.s') and matchday between 1 and 5 and generation_id is not null), 15,
  'fixtures carry their matchday and generation');
select ok(exists (select 1 from public.audit_log where action = 'FIXTURES_GENERATED' and entity_id = tests.c('L.s')), 'FIXTURES_GENERATED audited');
select ok((select bool_and(original_scheduled_at = scheduled_at) from public.matches where stage_id = tests.c('L.s')), 'original kick-off recorded');

-- Regenerate while untouched: clear → regenerate.
select tests.login(tests.c('admin'));
select throws_ok($$ select public.admin_clear_generated_fixtures(tests.c('L.s'), '') $$, 'EK422', null, 'clearing needs a reason');
select is((public.admin_clear_generated_fixtures(tests.c('L.s'), 'Wrong start date') ->> 'cleared')::int, 15, 'untouched fixtures can be cleared');
select is((public.admin_confirm_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02", "kickoff_time": "15:00", "days_between": 7, "spacing_minutes": 120}',
  (select v ->> 'hash' from pv where k = 'L')) ->> 'created')::int, 15, 'and regenerated');
reset role;

-- Operators and the public cannot generate.
select tests.login(tests.c('op'));
select throws_ok($$ select public.admin_preview_fixtures(tests.c('L.s'), '{"start_date": "2026-11-02"}') $$, 'EK403', null, 'operator cannot preview fixtures');
select throws_ok($$ select public.admin_confirm_fixtures(tests.c('L.s'), '{}', 'x') $$, 'EK403', null, 'operator cannot generate fixtures');
select tests.login_anon();
select throws_ok($$ select public.admin_preview_fixtures(tests.c('L.s'), '{}') $$, '42501', null, 'the public cannot call the generator');
reset role;

-- Double round robin + odd field.
select tests.new_comp('D2', 'CE Double', 'LEAGUE');
select tests.enter(tests.c('D2'), array['t7', 't8', 't9', 't10']);
insert into tests.ctx select 'D2.s', tests.stage(tests.c('D2'), 'LEAGUE', 1, '{}');
select tests.login(tests.c('admin'));
insert into pv select 'D2', public.admin_preview_fixtures(tests.c('D2.s'), '{"start_date": "2026-11-02", "legs": 2}');
reset role;
select is((select (v ->> 'match_count')::int from pv where k = 'D2'), 12, 'double round robin of 4 = 12 matches');
select is((select count(*)::int from (select f ->> 'home_team_id' h, f ->> 'away_team_id' a from pv, jsonb_array_elements(v -> 'fixtures') f where k = 'D2'
  group by 1, 2 having count(*) > 1) x), 0, 'every ordered pairing once (home and away swap in the second half)');
select tests.new_comp('O5', 'CE Odd', 'LEAGUE');
select tests.enter(tests.c('O5'), array['t1', 't2', 't3', 't4', 't5']);
insert into tests.ctx select 'O5.s', tests.stage(tests.c('O5'), 'LEAGUE', 1);
select tests.login(tests.c('admin'));
insert into pv select 'O5', public.admin_preview_fixtures(tests.c('O5.s'), '{"start_date": "2026-11-02"}');
reset role;
select is((select (v ->> 'match_count')::int from pv where k = 'O5'), 10, '5 teams = 10 matches (one rests each matchday)');
select is((select (v ->> 'matchdays')::int from pv where k = 'O5'), 5, '5 teams = 5 matchdays');

-- Hand-made fixture lists are never replaced (e.g. an existing cup).
select tests.new_comp('M', 'CE Manual', 'LEAGUE');
select tests.enter(tests.c('M'), array['t1', 't2', 't3']);
insert into tests.ctx select 'M.s', tests.stage(tests.c('M'), 'LEAGUE', 1);
insert into public.matches (competition_id, stage_id, home_team_id, away_team_id, scheduled_at)
values (tests.c('M'), tests.c('M.s'), tests.c('t1'), tests.c('t2'), now() + interval '3 days');
select tests.login(tests.c('admin'));
insert into pv select 'M', public.admin_preview_fixtures(tests.c('M.s'), '{"start_date": "2026-11-02"}');
select throws_ok($$ select public.admin_confirm_fixtures(tests.c('M.s'), '{"start_date": "2026-11-02"}', (select v ->> 'hash' from pv where k = 'M')) $$,
  'EK409', null, 'a stage with existing fixtures is never regenerated');
reset role;

-- ═══ B. SCHEDULING HISTORY ════════════════════════════════════════════════
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_schedule_fixture(tests.pair(tests.c('L'), 't1', 't2'), '2026-11-03 16:00+01', null, 1, 'Pitch clash') $$, 'fixture rescheduled with a reason');
reset role;
select is((select reason from public.fixture_schedule_history where match_id = tests.pair(tests.c('L'), 't1', 't2') order by changed_at desc limit 1),
  'Pitch clash', 'reschedule recorded in history with its reason');
select ok((select original_scheduled_at <> scheduled_at from public.matches where id = tests.pair(tests.c('L'), 't1', 't2')),
  'the original kick-off is kept');
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_set_match_outcome(tests.pair(tests.c('L'), 't3', 't4'), 'POSTPONED', 'Waterlogged pitch') $$, 'fixture postponed');
select throws_ok($$ select public.admin_schedule_fixture(tests.pair(tests.c('L'), 't3', 't4'), now() + interval '9 days', null, 1, null) $$,
  'EK422', null, 'rescheduling a postponed fixture needs a reason');
select lives_ok($$ select public.admin_schedule_fixture(tests.pair(tests.c('L'), 't3', 't4'), now() + interval '9 days', null, 1, 'New date agreed') $$,
  'postponed fixture rescheduled');
reset role;
select is((select array_agg(action order by changed_at) from public.fixture_schedule_history where match_id = tests.pair(tests.c('L'), 't3', 't4')),
  array['POSTPONED', 'RESCHEDULED'], 'postponement and new date are both in the history');
select is((select status::text from public.matches where id = tests.pair(tests.c('L'), 't3', 't4')), 'SCHEDULED', 'rescheduled fixture is scheduled again');

-- ═══ C. STANDINGS ═════════════════════════════════════════════════════════
select tests.finish(tests.pair(tests.c('L'), 't1', 't2'), 0, 0);
select tests.finish(tests.pair(tests.c('L'), 't1', 't3'), 0, 0);
select is((tests.row(tests.c('L'), 't1')).played, 2::smallint, 'played counts FT matches');
select is((tests.row(tests.c('L'), 't1')).draws, 2::smallint, 'draws counted');
select is((tests.row(tests.c('L'), 't1')).points, 2::smallint, 'two draws = 2 points (3/1/0)');

create temp table lg as select tests.pair(tests.c('L'), 't4', 't5') as m45, tests.pair(tests.c('L'), 't5', 't6') as m56;
grant select on lg to authenticated;
select tests.finish((select m45 from lg), 0, 0);
-- t4 v t5: give t4 three goals, t5 one (by side).
select tests.event((select m45 from lg), tests.c('t4'), 'GOAL', null, 10);
select tests.event((select m45 from lg), tests.c('t4'), 'GOAL', null, 20);
select tests.event((select m45 from lg), tests.c('t4'), 'GOAL', null, 30);
select tests.event((select m45 from lg), tests.c('t5'), 'GOAL', null, 40);
select private.after_correction((select m45 from lg));
select is((tests.row(tests.c('L'), 't4')).points, 3::smallint, 'a win is 3 points');
select is((tests.row(tests.c('L'), 't4')).goal_difference, 2::smallint, 'goal difference = goals for − against');
select is((tests.row(tests.c('L'), 't4')).goals_for, 3::smallint, 'goals scored');
select is((tests.row(tests.c('L'), 't5')).losses, 1::smallint, 'loss counted');

-- Voided goals disappear from the table.
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_void_event((select m45 from lg),
  (select id from public.match_events where match_id = (select m45 from lg) and team_id = tests.c('t4') and voided_at is null order by seq limit 1), 'Offside') $$,
  'admin voids a goal');
reset role;
select is((tests.row(tests.c('L'), 't4')).goals_for, 2::smallint, 'voided goal removed from goals scored');
select is((tests.row(tests.c('L'), 't4')).goal_difference, 1::smallint, 'voided goal removed from goal difference');

-- Tie-breaker order: points, then head-to-head, then goal difference.
select tests.new_comp('TB', 'CE Tiebreak', 'LEAGUE');
select tests.enter(tests.c('TB'), array['t1', 't2', 't3']);
insert into tests.ctx select 'TB.s', tests.stage(tests.c('TB'), 'LEAGUE', 1);
insert into public.matches (competition_id, stage_id, home_team_id, away_team_id, scheduled_at) values
  (tests.c('TB'), tests.c('TB.s'), tests.c('t1'), tests.c('t2'), now()),
  (tests.c('TB'), tests.c('TB.s'), tests.c('t2'), tests.c('t3'), now()),
  (tests.c('TB'), tests.c('TB.s'), tests.c('t3'), tests.c('t1'), now());
-- t1 beats t2 1–0; t2 beats t3 5–0; t3 beats t1 1–0 → all on 3 points;
-- GD: t2 +4, t3 −4, t1 0.
select tests.finish(tests.match_of(tests.c('TB'), 't1', 't2'), 1, 0);
select tests.finish(tests.match_of(tests.c('TB'), 't2', 't3'), 5, 0);
select tests.finish(tests.match_of(tests.c('TB'), 't3', 't1'), 1, 0);
select is((tests.row(tests.c('TB'), 't2')).rank, 1::smallint, 'default tie-breakers: goal difference puts t2 first');
select is((tests.row(tests.c('TB'), 't3')).rank, 3::smallint, 'and t3 last');
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_update_competition_rules(tests.c('TB'), '{"tiebreakers": ["points", "h2h_points", "goal_difference"]}', 'Test tie-breakers') $$,
  'tie-breakers changed (override: matches were played)');
reset role;
select is((tests.row(tests.c('TB'), 't2')).rank, 1::smallint, 'h2h among all three is level (3 pts each), GD decides: t2 first');
select is((tests.row(tests.c('TB'), 't1')).rank, 2::smallint, 't1 second on goal difference');
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_update_competition_rules(tests.c('TB'), '{"tiebreakers": ["points", "h2h_points"]}', 'Only h2h') $$, 'only points + h2h');
reset role;
select ok((tests.row(tests.c('TB'), 't1')).tied and (tests.row(tests.c('TB'), 't2')).tied, 'still level after every tie-breaker: flagged as tied');
select is((select count(distinct rank)::int from public.standings where competition_id = tests.c('TB')), 1, 'no random order: they share the position');
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_update_competition_rules(tests.c('TB'), '{"tiebreakers": ["points", "alphabetical"]}', 'Explicit alphabetical fallback') $$,
  'alphabetical fallback only when configured');
reset role;
select is((tests.row(tests.c('TB'), 't1')).rank, 1::smallint, 'alphabetical fallback orders by name');
select throws_ok($$ update public.competitions set tiebreakers = array['points', 'goal_difference', 'goals_for'] where id = tests.c('TB') $$, 'EK409', null,
  'tie-breakers locked once matches started (without an override)');
select throws_ok($$ update public.competitions set tiebreakers = array['coin_toss'] where id = tests.c('O5') $$, '23514', null, 'unknown tie-breakers are rejected');

-- ═══ D. GROUPS + QUALIFICATION ════════════════════════════════════════════
select tests.new_comp('G', 'CE Cup', 'GROUPS_KNOCKOUT');
select tests.enter(tests.c('G'), array['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
insert into tests.ctx select 'G.grp', tests.stage(tests.c('G'), 'GROUP', 1, '{"qualification": {"per_group": 2}}');
insert into tests.ctx select 'G.sf', tests.stage(tests.c('G'), 'SEMI_FINAL', 2, '{"et": true, "pens": true}');
insert into tests.ctx select 'G.3p', tests.stage(tests.c('G'), 'THIRD_PLACE', 3, '{"et": false, "pens": true}');
insert into tests.ctx select 'G.f', tests.stage(tests.c('G'), 'FINAL', 4, '{"et": true, "pens": true}');
select tests.login(tests.c('admin'));
select is(public.admin_create_groups(tests.c('G.grp'), array['Group A', 'Group B']), 2, 'groups created');
reset role;
insert into tests.ctx select 'G.A', id from public.competition_groups where stage_id = tests.c('G.grp') and name = 'Group A';
insert into tests.ctx select 'G.B', id from public.competition_groups where stage_id = tests.c('G.grp') and name = 'Group B';
select ok(exists (select 1 from public.audit_log where action = 'GROUP_CREATED'), 'GROUP_CREATED audited');
select tests.login(tests.c('admin'));
select public.admin_assign_team_group(tests.c('G'), tests.c(t), tests.c('G.A')) from unnest(array['t1', 't2', 't3', 't4']) t;
select public.admin_assign_team_group(tests.c('G'), tests.c(t), tests.c('G.B')) from unnest(array['t5', 't6', 't7', 't8']) t;
reset role;
select is((select count(*)::int from public.competition_entries where competition_id = tests.c('G') and group_id = tests.c('G.A')), 4, 'four teams drawn into Group A');
select ok(exists (select 1 from public.audit_log where action = 'TEAM_ASSIGNED_TO_GROUP'), 'TEAM_ASSIGNED_TO_GROUP audited');
select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_assign_team_group(tests.c('G'), tests.c('t4'), tests.c('G.B')) $$, 'teams can be moved before the stage starts');
select lives_ok($$ select public.admin_assign_team_group(tests.c('G'), tests.c('t4'), tests.c('G.A')) $$, 'and moved back');
insert into pv select 'G', public.admin_preview_fixtures(tests.c('G.grp'), '{"start_date": "2026-11-02"}');
select is((public.admin_confirm_fixtures(tests.c('G.grp'), '{"start_date": "2026-11-02"}', (select v ->> 'hash' from pv where k = 'G')) ->> 'created')::int, 12,
  'two groups of four = 12 group matches');
reset role;
select is((select count(*)::int from public.matches where stage_id = tests.c('G.grp') and group_id = tests.c('G.A')), 6, 'six matches in Group A');
select is((select count(*)::int from public.standings where stage_id = tests.c('G.grp') and group_id = tests.c('G.A')), 4, 'Group A table has its four teams');
select is((select count(*)::int from public.standings where stage_id = tests.c('G.grp') and group_id = tests.c('G.B')), 4, 'Group B table is separate');
select is((select array_agg(distinct qualification) from public.standings where stage_id = tests.c('G.grp')), array['PENDING'], 'everything pending before play');

-- Bracket with placeholders (cross-group pairing) before the groups finish.
select tests.login(tests.c('admin'));
insert into pv select 'K', public.admin_preview_knockout(tests.c('G.sf'), '{"pairing": "CROSS_GROUPS", "third_place": true}');
reset role;
select is((select jsonb_path_query_array(v, '$.stages[*].ties[*].code') from pv where k = 'K'), '["SF1", "SF2", "3P", "F"]'::jsonb,
  'bracket preview: SF1, SF2, third place, final');
select is((select v #>> '{stages,0,ties,0,home,label}' || ' v ' || (v #>> '{stages,0,ties,0,away,label}') from pv where k = 'K'),
  'Winner Group A v Runner-up Group B', 'A1 v B2');
select is((select v #>> '{stages,0,ties,1,home,label}' || ' v ' || (v #>> '{stages,0,ties,1,away,label}') from pv where k = 'K'),
  'Winner Group B v Runner-up Group A', 'B1 v A2');
select is((select count(*)::int from public.knockout_ties where competition_id = tests.c('G')), 0, 'knockout preview stores nothing');
select tests.login(tests.c('admin'));
select is((public.admin_confirm_knockout(tests.c('G.sf'), '{"pairing": "CROSS_GROUPS", "third_place": true}', (select v ->> 'hash' from pv where k = 'K')) ->> 'created')::int, 4,
  'bracket confirmed: four ties');
select is((public.admin_confirm_knockout(tests.c('G.sf'), '{"pairing": "CROSS_GROUPS", "third_place": true}', (select v ->> 'hash' from pv where k = 'K')) ->> 'idempotent')::boolean, true,
  'second confirm is idempotent');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'KNOCKOUT_GENERATED'), 'KNOCKOUT_GENERATED audited');
select is((select home_label || ' / ' || away_label from public.knockout_ties where stage_id = tests.c('G.f')), 'Winner SF1 / Winner SF2', 'final placeholders');
select is((select home_label || ' / ' || away_label from public.knockout_ties where stage_id = tests.c('G.3p')), 'Loser SF1 / Loser SF2', 'third-place placeholders');
select ok((select bool_and(home_team_id is null and away_team_id is null) from public.knockout_ties where competition_id = tests.c('G')),
  'no team advances while the groups are unfinished');

-- Group A: t1 wins all, t2 second, t3 third, t4 last.
select tests.finish(tests.pair(tests.c('G'), 't1', 't2'), 0, 0);
select tests.finish(m, case when home_team_id = tests.c('t1') then 2 else 0 end, case when away_team_id = tests.c('t1') then 2 else 0 end)
from (select id m, home_team_id, away_team_id from public.matches where group_id = tests.c('G.A') and status = 'SCHEDULED'
      and tests.c('t1') in (home_team_id, away_team_id)) x;
select tests.finish(m, case when home_team_id = tests.c('t2') then 1 else 0 end, case when away_team_id = tests.c('t2') then 1 else 0 end)
from (select id m, home_team_id, away_team_id from public.matches where group_id = tests.c('G.A') and status = 'SCHEDULED'
      and tests.c('t2') in (home_team_id, away_team_id)) x;
select tests.finish(tests.pair(tests.c('G'), 't3', 't4'), 0, 0);
-- give t3 the win over t4
select tests.event(tests.pair(tests.c('G'), 't3', 't4'), tests.c('t3'), 'GOAL', null, 70);
select private.after_correction(tests.pair(tests.c('G'), 't3', 't4'));
select is((tests.row(tests.c('G'), 't1')).qualification, 'QUALIFIED', 'group winner qualified once the group is complete');
select is((tests.row(tests.c('G'), 't2')).qualification, 'QUALIFIED', 'runner-up qualified');
select is((tests.row(tests.c('G'), 't4')).qualification, 'ELIMINATED', 'last place eliminated');
select is((tests.row(tests.c('G'), 't5')).qualification, 'PENDING', 'unfinished Group B stays pending');
select is((select home_team_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1), tests.c('t1'), 'A1 resolved into SF1');
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2), tests.c('t2'), 'A2 resolved into SF2');
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1), null, 'B2 not resolved yet');

-- Stage locking.
select ok((select locked_at is not null from public.competition_stages where id = tests.c('G.grp')), 'group stage locked after kick-off');
select ok(exists (select 1 from public.audit_log where action = 'STAGE_LOCKED' and entity_id = tests.c('G.grp')), 'STAGE_LOCKED audited');
select tests.login(tests.c('admin'));
select throws_ok($$ select public.admin_assign_team_group(tests.c('G'), tests.c('t8'), tests.c('G.A')) $$, 'EK409', null, 'group assignments locked after matches start');
select throws_ok($$ update public.competition_entries set group_id = tests.c('G.A') where competition_id = tests.c('G') and team_id = tests.c('t8') $$,
  'EK409', null, 'direct edits are locked too');
select throws_ok($$ select public.admin_update_stage(tests.c('G.grp'), '{"qualification": {"per_group": 1}}') $$, 'EK409', null,
  'qualification rules locked once the stage started');
select throws_ok($$ select public.admin_update_stage(tests.c('G.grp'), '{"qualification": {"per_group": 1}}', 'Testing override') $$, 'EK409', null,
  'and frozen (even with an override) once a bracket uses them');
select throws_ok($$ update public.competitions set format = 'LEAGUE' where id = tests.c('G') $$, 'EK409', null, 'format locked once matches started');
select throws_ok($$ update public.competition_stages set status = 'COMPLETED' where id = tests.c('G.grp') $$, 'EK403', null, 'stage progress is engine-managed');
select throws_ok($$ update public.competitions set champion_team_id = tests.c('t1') where id = tests.c('G') $$, 'EK403', null, 'a champion cannot be typed');
reset role;

-- Group B: t5, t6 qualify.
select tests.finish(m, case when home_team_id in (tests.c('t5')) then 3 when home_team_id = tests.c('t6') and away_team_id <> tests.c('t5') then 1 else 0 end,
                       case when away_team_id in (tests.c('t5')) then 3 when away_team_id = tests.c('t6') and home_team_id <> tests.c('t5') then 1 else 0 end)
from (select id m, home_team_id, away_team_id from public.matches where group_id = tests.c('G.B') and status = 'SCHEDULED') x;
select is((select array_agg(t.short_name order by t.short_name) from public.standings s join public.teams t on t.id = s.team_id
  where s.stage_id = tests.c('G.grp') and s.qualification = 'QUALIFIED'), array['CE1', 'CE2', 'CE5', 'CE6'], 'four qualified teams');
select is((select home_team_id::text || away_team_id::text from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1),
  tests.c('t1')::text || tests.c('t6')::text, 'SF1 = A1 v B2');
select is((select home_team_id::text || away_team_id::text from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2),
  tests.c('t5')::text || tests.c('t2')::text, 'SF2 = B1 v A2');
select is((select match_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1), null, 'no match until a kick-off is set');
select tests.login(tests.c('admin'));
select public.admin_schedule_tie(id, now() + interval '1 day' + position * interval '3 hours', null, null)
from public.knockout_ties where competition_id = tests.c('G') order by position;
reset role;
select ok((select bool_and(match_id is not null) from public.knockout_ties where stage_id = tests.c('G.sf')), 'semi-final matches created once scheduled');
select is((select count(*)::int from public.knockout_ties where stage_id in (tests.c('G.f'), tests.c('G.3p')) and match_id is not null), 0,
  'final / third place wait for their teams');

-- ═══ E. EXTRA TIME + PENALTIES (operator RPCs) ════════════════════════════
create temp table sf as select (select match_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1) sf1,
  (select match_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2) sf2;
grant select on sf to authenticated;
insert into public.operator_assignments (match_id, user_id, role) select sf1, tests.c('op'), 'PRIMARY' from sf;
insert into public.operator_assignments (match_id, user_id, role) select tests.pair(tests.c('G'), 't1', 't3'), tests.c('op'), 'PRIMARY';
select tests.login(tests.c('admin'));
select public.admin_set_lineup_override((select sf1 from sf), 'Synthetic test teams have no squads');
reset role;

select tests.login(tests.c('op'));
select lives_ok($$ select public.start_match((select sf1 from sf), gen_random_uuid()) $$, 'semi-final kicks off');
select lives_ok($$ select public.record_event((select sf1 from sf), gen_random_uuid(), 'GOAL', tests.c('t1'), 20) $$, 'home goal');
select lives_ok($$ select public.end_period((select sf1 from sf), gen_random_uuid()) $$, 'half-time');
select lives_ok($$ select public.start_period((select sf1 from sf), gen_random_uuid()) $$, 'second half');
select lives_ok($$ select public.record_event((select sf1 from sf), gen_random_uuid(), 'GOAL', tests.c('t6'), 80) $$, 'equaliser');
select throws_ok($$ select public.finalise_match((select sf1 from sf), gen_random_uuid(), 1, 1) $$, 'EK409', null,
  'a level knockout match cannot end after 90 minutes when extra time is configured');
select lives_ok($$ select public.end_period((select sf1 from sf), gen_random_uuid()) $$, 'end of normal time');
select is((select status::text from public.matches where id = (select sf1 from sf)), 'ET_BREAK', 'tied regulation enters the extra-time break');
select lives_ok($$ select public.start_period((select sf1 from sf), gen_random_uuid()) $$, 'extra time first half');
select is((select status::text || current_period || '/' || period_offset_seconds from public.matches where id = (select sf1 from sf)), 'ET13/5400', 'ET1 is period 3 from 90:00');
select throws_ok($$ select public.record_event((select sf1 from sf), gen_random_uuid(), 'GOAL', tests.c('t1'), 60) $$, 'EK422', null, 'ET1 rejects regulation minutes');
select lives_ok($$ select public.pause_match((select sf1 from sf), gen_random_uuid(), 'INJURY') $$, 'pause in extra time');
select lives_ok($$ select public.resume_match((select sf1 from sf), gen_random_uuid()) $$, 'resume in extra time');
select lives_ok($$ select public.end_period((select sf1 from sf), gen_random_uuid()) $$, 'end of ET1');
select lives_ok($$ select public.start_period((select sf1 from sf), gen_random_uuid()) $$, 'ET2');
select is((select status::text || current_period from public.matches where id = (select sf1 from sf)), 'ET24', 'ET2 is period 4');
select throws_ok($$ select public.finalise_match((select sf1 from sf), gen_random_uuid(), 1, 1) $$, 'EK409', null,
  'still level after extra time: penalties first');
select lives_ok($$ select public.end_period((select sf1 from sf), gen_random_uuid()) $$, 'to penalties');
select is((select status::text || current_period from public.matches where id = (select sf1 from sf)), 'PENS5', 'tied ET enters penalties');
select throws_ok($$ select public.record_event((select sf1 from sf), gen_random_uuid(), 'GOAL', tests.c('t1'), 120) $$, 'EK409', null,
  'no match events during the shoot-out');

create temp table events_before as select count(*) n from public.match_events where match_id = (select sf1 from sf);
grant select on events_before to authenticated;
select lives_ok($$ select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), tests.c('t1'), null, 'SCORED') $$, 'kick 1 (home) scored');
select throws_ok($$ select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), tests.c('t1'), null, 'SCORED') $$, 'EK409', null,
  'teams alternate: home cannot kick twice in a row');
select lives_ok($$ select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), tests.c('t6'), null, 'SCORED') $$, 'kick 1 (away) scored');
-- Idempotent kick.
create temp table kick as select gen_random_uuid() id;
grant select on kick to authenticated;
select lives_ok($$ select public.record_shootout_attempt((select sf1 from sf), (select id from kick), tests.c('t1'), null, 'SAVED') $$, 'kick 2 (home) saved');
select lives_ok($$ select public.record_shootout_attempt((select sf1 from sf), (select id from kick), tests.c('t1'), null, 'SAVED') $$, 'retrying the same kick is safe');
select throws_ok($$ select public.finalise_match((select sf1 from sf), gen_random_uuid(), 1, 1) $$, 'EK409', null, 'the shoot-out is not decided yet');
select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), team, null, outcome)
from (values (2, tests.c('t6'), 'SCORED'), (3, tests.c('t1'), 'SCORED'), (3, tests.c('t6'), 'SCORED'),
             (4, tests.c('t1'), 'SCORED'), (4, tests.c('t6'), 'SCORED'), (5, tests.c('t1'), 'SCORED')) k(n, team, outcome) order by n, team <> tests.c('t1');
select is((select home_pens || '-' || away_pens from public.matches where id = (select sf1 from sf)), '4-4', 'shoot-out score 4–4 after nine kicks');
select lives_ok($$ select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), tests.c('t6'), null, 'SCORED') $$, 'away scores its fifth');
select is((public.operator_match_state((select sf1 from sf)) #>> '{shootout,decided}')::boolean, true, 'away wins 5–4: decided (operator state)');
select throws_ok($$ select public.record_shootout_attempt((select sf1 from sf), gen_random_uuid(), tests.c('t1'), null, 'SCORED') $$, 'EK409', null,
  'no kicks after the shoot-out is decided');
select is((select count(*) from public.match_events where match_id = (select sf1 from sf)), (select n from events_before),
  'shoot-out kicks are not match events');
select is((select home_score || '-' || away_score from public.matches where id = (select sf1 from sf)), '1-1', 'shoot-out never changes the match score');
select lives_ok($$ select public.finalise_match((select sf1 from sf), gen_random_uuid(), 1, 1) $$, 'semi-final finalised after penalties');
reset role;
select is((select winner_team_id from public.matches where id = (select sf1 from sf)), tests.c('t6'), 'shoot-out winner is the match winner');
select is((select decided_by from public.matches where id = (select sf1 from sf)), 'PENALTIES', 'decided on penalties');
select is((select home_score_90 || '-' || away_score_90 from public.matches where id = (select sf1 from sf)), '1-1', 'score after 90 minutes stored');

-- Advancement.
select is((select winner_team_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1), tests.c('t6'), 'winner advanced from SF1');
select is((select home_team_id from public.knockout_ties where stage_id = tests.c('G.f')), tests.c('t6'), 'SF1 winner is home in the final');
select is((select home_team_id from public.knockout_ties where stage_id = tests.c('G.3p')), tests.c('t1'), 'SF1 loser goes to the third-place match');
select is((select count(*)::int from public.audit_log where action = 'TEAM_ADVANCED' and entity_id = (select id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1)),
  1, 'TEAM_ADVANCED audited once');
select private.settle_tie((select id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1));
select private.competition_refresh(tests.c('G'));
select is((select count(*)::int from public.audit_log where action = 'TEAM_ADVANCED' and entity_id = (select id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 1)),
  1, 'repeated settlement never advances twice');

-- A level group match is simply a draw (no extra time).
select tests.login(tests.c('op'));
select throws_ok($$ select public.end_period(tests.pair(tests.c('G'), 't1', 't3'), gen_random_uuid()) $$, 'EK409', null,
  'group matches have no extra time (match not in play here)');
reset role;

-- SF2 in normal time; the final gets both teams.
select tests.finish((select sf2 from sf), 2, 1);
select is((select winner_team_id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2), tests.c('t5'), 'SF2 decided in regulation');
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.f')), tests.c('t5'), 'SF2 winner is away in the final');
select ok((select match_id is not null from public.knockout_ties where stage_id = tests.c('G.f')), 'final fixture created (already scheduled)');

-- Correction of a decided tie requires reconciliation (never silent).
select tests.login(tests.c('admin'));
select public.admin_add_event((select sf2 from sf), gen_random_uuid(), 'GOAL', tests.c('t2'), 2, 85, 0, null, null, 'Missed goal');
select public.admin_add_event((select sf2 from sf), gen_random_uuid(), 'GOAL', tests.c('t2'), 2, 88, 0, null, null, 'Missed goal');
reset role;
select is((select winner_team_id from public.matches where id = (select sf2 from sf)), tests.c('t2'), 'corrected result has a new winner');
select ok((select needs_reconciliation from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2), 'tie flagged for reconciliation');
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.f')), tests.c('t5'), 'the final is not changed silently');
select ok(exists (select 1 from public.audit_log where action = 'KNOCKOUT_RECONCILIATION_REQUIRED'), 'reconciliation requirement audited');
select tests.login(tests.c('admin'));
select throws_ok($$ select public.admin_reconcile_tie((select id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2), '') $$,
  'EK422', null, 'reconciliation needs a reason');
select lives_ok($$ select public.admin_reconcile_tie((select id from public.knockout_ties where stage_id = tests.c('G.sf') and position = 2), 'Goal-line evidence') $$,
  'admin reconciles');
reset role;
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.f')), tests.c('t2'), 'final updated to the corrected winner');
select is((select away_team_id from public.matches where id = (select match_id from public.knockout_ties where stage_id = tests.c('G.f'))), tests.c('t2'),
  'unstarted final match updated too');
select is((select away_team_id from public.knockout_ties where stage_id = tests.c('G.3p')), tests.c('t5'), 'and the new loser plays for third place');

-- Third place: no extra time configured → straight to penalties.
select tests.login(tests.c('admin'));
select throws_ok($$ select public.admin_complete_competition(tests.c('G')) $$, 'EK409', null, 'cannot complete with matches unplayed');
reset role;
select tests.finish((select match_id from public.knockout_ties where stage_id = tests.c('G.3p')), 2, 0);
select tests.finish((select match_id from public.knockout_ties where stage_id = tests.c('G.f')), 1, 0);
select is((select winner_team_id from public.knockout_ties where stage_id = tests.c('G.f')), tests.c('t6'), 'final decided');
select tests.login(tests.c('admin'));
select is((public.admin_complete_competition(tests.c('G')) ->> 'champion_team_id')::uuid, tests.c('t6'), 'final produces the champion');
reset role;
select is((select runner_up_team_id from public.competitions where id = tests.c('G')), tests.c('t2'), 'runner-up from the final');
select is((select third_place_team_id from public.competitions where id = tests.c('G')), tests.c('t1'), 'third place from the third-place match');
select is((select status from public.competitions where id = tests.c('G')), 'COMPLETED', 'competition completed');
select ok(exists (select 1 from public.audit_log where action = 'COMPETITION_COMPLETED' and entity_id = tests.c('G')), 'COMPETITION_COMPLETED audited');

-- Penalties without extra time (stage setting).
select tests.new_comp('P', 'CE Pens', 'KNOCKOUT');
select tests.enter(tests.c('P'), array['t9', 't10']);
insert into tests.ctx select 'P.f', tests.stage(tests.c('P'), 'FINAL', 1, '{"et": false, "pens": true}');
select tests.login(tests.c('admin'));
insert into pv select 'P', public.admin_preview_knockout(tests.c('P.f'), '{}');
select public.admin_confirm_knockout(tests.c('P.f'), '{}', (select v ->> 'hash' from pv where k = 'P'));
select public.admin_schedule_tie((select id from public.knockout_ties where stage_id = tests.c('P.f')), now() + interval '2 days', null, null);
select public.admin_set_lineup_override((select match_id from public.knockout_ties where stage_id = tests.c('P.f')), 'Synthetic');
reset role;
insert into public.operator_assignments (match_id, user_id, role) select match_id, tests.c('op'), 'PRIMARY' from public.knockout_ties where stage_id = tests.c('P.f');
create temp table pf as select match_id m from public.knockout_ties where stage_id = tests.c('P.f');
grant select on pf to authenticated;
select tests.login(tests.c('op'));
select public.start_match((select m from pf), gen_random_uuid());
select public.end_period((select m from pf), gen_random_uuid());
select public.start_period((select m from pf), gen_random_uuid());
select lives_ok($$ select public.end_period((select m from pf), gen_random_uuid()) $$, 'level after 90 with no extra time');
select is((select status::text from public.matches where id = (select m from pf)), 'PENS', 'goes straight to penalties');
reset role;

-- ═══ F. DISCIPLINE + ELIGIBILITY (seeded squads) ══════════════════════════
select tests.new_comp('DS', 'CE Discipline', 'LEAGUE');
insert into public.competition_entries (competition_id, team_id) values
  (tests.c('DS'), tests.home()), (tests.c('DS'), tests.away()), (tests.c('DS'), '70000000-0000-4000-8000-000000000003');
insert into tests.ctx select 'DS.s', tests.stage(tests.c('DS'), 'LEAGUE', 1);
insert into public.matches (competition_id, stage_id, home_team_id, away_team_id, scheduled_at, round_label) values
  (tests.c('DS'), tests.c('DS.s'), tests.home(), tests.away(), now() + interval '1 day', 'D1'),
  (tests.c('DS'), tests.c('DS.s'), tests.home(), '70000000-0000-4000-8000-000000000003', now() + interval '2 days', 'D2'),
  (tests.c('DS'), tests.c('DS.s'), '70000000-0000-4000-8000-000000000003', tests.home(), now() + interval '3 days', 'D3'),
  (tests.c('DS'), tests.c('DS.s'), tests.away(), tests.home(), now() + interval '4 days', 'D4');
create or replace function tests.d(p text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.matches where competition_id = (select id from tests.ctx where k = 'DS') and round_label = p $$;
grant execute on function tests.d(text) to authenticated;

-- Rules off (default): cards create no suspensions.
select tests.event(tests.d('D1'), tests.home(), 'RED_CARD', tests.player(tests.home(), 5), 20);
select tests.event(tests.d('D1'), tests.home(), 'YELLOW_CARD', tests.player(tests.home(), 6), 25);
select tests.event(tests.d('D1'), tests.home(), 'YELLOW_CARD', tests.player(tests.home(), 7), 30);
select tests.event(tests.d('D1'), tests.home(), 'SECOND_YELLOW', tests.player(tests.home(), 7), 60);
select tests.event(tests.d('D1'), tests.home(), 'GOAL', tests.player(tests.home(), 9), 10);
select tests.event(tests.d('D1'), tests.home(), 'GOAL', tests.player(tests.home(), 9), 15);
select tests.event(tests.d('D1'), tests.home(), 'OWN_GOAL', tests.player(tests.home(), 9), 70);
select tests.finish(tests.d('D1'), 0, 0);
select is((select count(*)::int from public.player_suspensions where competition_id = tests.c('DS')), 0, 'no automatic suspensions while discipline is off');

select tests.login(tests.c('admin'));
select lives_ok($$ select public.admin_set_discipline_rules(tests.c('DS'), true, 1, 1, 2, 1) $$, 'discipline enabled: red 1, second yellow 1, every 2 yellows → 1');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'DISCIPLINARY_RULE_CHANGED' and entity_id = tests.c('DS')), 'DISCIPLINARY_RULE_CHANGED audited');
select is((select reason || ':' || status from public.player_suspensions where player_id = tests.player(tests.home(), 5) and competition_id = tests.c('DS')),
  'RED_CARD:ACTIVE', 'straight red → suspension');
select is((select reason || ':' || status from public.player_suspensions where player_id = tests.player(tests.home(), 7) and competition_id = tests.c('DS')),
  'SECOND_YELLOW:ACTIVE', 'second-yellow red → suspension');
select is((select count(*)::int from public.player_suspensions where player_id = tests.player(tests.home(), 6) and competition_id = tests.c('DS')), 0,
  'one yellow is not a suspension yet');
select ok(exists (select 1 from public.audit_log where action = 'PLAYER_SUSPENDED'), 'PLAYER_SUSPENDED audited');
select is(private.match_eligibility(tests.d('D2'), tests.home(), tests.player(tests.home(), 5)), 'SUSPENDED', 'suspended player unavailable for the next match');
select is(private.match_eligibility(tests.d('D2'), tests.home(), tests.player(tests.home(), 8)), 'CLEARED', 'team-mates unaffected');
select ok((select active from public.squad_players sp join public.squads s on s.id = sp.squad_id
  where s.team_id = tests.home() and sp.player_id = tests.player(tests.home(), 5)), 'the suspended player stays in the squad');
-- A line-up containing the suspended player cannot be confirmed.
insert into public.match_lineups (match_id, team_id, status, formation_code) values (tests.d('D2'), tests.home(), 'DRAFT', '4-4-2');
insert into public.lineup_players (lineup_id, player_id, shirt_number, role, sort_order)
select l.id, tests.player(tests.home(), 5), 5, 'STARTER', 1 from public.match_lineups l where l.match_id = tests.d('D2') and l.team_id = tests.home();
select ok(exists (select 1 from unnest(private.lineup_problems((select id from public.match_lineups where match_id = tests.d('D2') and team_id = tests.home()), 'draft')) p
  where p like '%not eligible (suspended)%'), 'line-up shows the suspension reason and blocks confirmation');

-- Cancelled fixture does not serve it; the next played one does.
select tests.login(tests.c('admin'));
select public.admin_set_match_outcome(tests.d('D2'), 'CANCELLED', 'Opponent withdrew');
reset role;
select is((select status from public.player_suspensions where player_id = tests.player(tests.home(), 5) and competition_id = tests.c('DS')), 'ACTIVE',
  'a cancelled fixture does not serve a suspension');
select tests.event(tests.d('D3'), tests.home(), 'YELLOW_CARD', tests.player(tests.home(), 6), 30);
select tests.finish(tests.d('D3'), 0, 1);
select is((select status || ':' || matches_served from public.player_suspensions where player_id = tests.player(tests.home(), 5) and competition_id = tests.c('DS')),
  'SERVED:1', 'served after the next completed fixture');
select ok(exists (select 1 from public.audit_log where action = 'SUSPENSION_SERVED'), 'SUSPENSION_SERVED audited');
select is(private.match_eligibility(tests.d('D4'), tests.home(), tests.player(tests.home(), 5)), 'CLEARED', 'available again afterwards');
select is((select reason || ':' || status from public.player_suspensions where player_id = tests.player(tests.home(), 6) and competition_id = tests.c('DS')),
  'YELLOW_ACCUMULATION:ACTIVE', 'two yellows across matches → suspension');
select is((select count(*)::int from public.player_suspensions where player_id = tests.player(tests.home(), 7) and reason = 'YELLOW_ACCUMULATION'), 0,
  'yellows that led to a second-yellow red do not also accumulate');

-- Voiding the card cancels the suspension (history kept).
select tests.login(tests.c('admin'));
select public.admin_void_event(tests.d('D1'), (select id from public.match_events where match_id = tests.d('D1') and type = 'SECOND_YELLOW'), 'Mistaken identity');
reset role;
select is((select status from public.player_suspensions where player_id = tests.player(tests.home(), 7) and competition_id = tests.c('DS')), 'CANCELLED',
  'voided card → suspension cancelled (row kept)');
select ok(exists (select 1 from public.audit_log where action = 'SUSPENSION_CANCELLED'), 'SUSPENSION_CANCELLED audited');
-- Manual suspension and its sanctioned cancellation.
select tests.login(tests.c('admin'));
create temp table ms as select public.admin_add_suspension(tests.c('DS'), tests.player(tests.away(), 4), tests.away(), 2, 'Misconduct after the match') id;
select is((select status || ':' || matches_total from public.player_suspensions where id = (select id from ms)), 'ACTIVE:2', 'manual suspension');
select lives_ok($$ select public.admin_cancel_suspension((select id from ms), 'Appeal upheld') $$, 'manual suspension cancelled with a reason');
select throws_ok($$ delete from public.player_suspensions $$, '42501', null, 'suspension history cannot be deleted');
reset role;

-- ═══ G. PLAYER STATS ══════════════════════════════════════════════════════
select tests.login(tests.c('admin'));
select public.admin_void_event(tests.d('D1'), (select id from public.match_events where match_id = tests.d('D1') and type = 'GOAL'
  and player_id = tests.player(tests.home(), 9) order by seq desc limit 1), 'Goal disallowed');
reset role;
select tests.event(tests.d('D3'), tests.home(), 'PENALTY_GOAL', tests.player(tests.home(), 9), 80);
select tests.login_anon();
select is((select (x ->> 'goals')::int from jsonb_array_elements(public.public_competition(tests.c('DS')) -> 'scorers') x
  where (x ->> 'player_id')::uuid = tests.player(tests.home(), 9)), 2, 'goals derived from events: own goal and voided goal excluded');
select is((select (x ->> 'penalties')::int from jsonb_array_elements(public.public_competition(tests.c('DS')) -> 'scorers') x
  where (x ->> 'player_id')::uuid = tests.player(tests.home(), 9)), 1, 'penalty goals counted (and flagged)');
select is((select count(*)::int from jsonb_array_elements(public.public_competition(tests.c('G')) -> 'scorers') x), 0,
  'shoot-out kicks never appear as goals');
select ok((select (x ->> 'reds')::int = 1 from jsonb_array_elements(public.public_competition(tests.c('DS')) #> '{discipline,players}') x
  where (x ->> 'player_id')::uuid = tests.player(tests.home(), 5)), 'discipline table counts the red card');
select is((select count(*)::int from jsonb_array_elements(public.public_competition(tests.c('L')) -> 'scorers')), 0, 'stats are scoped to their competition');
reset role;

-- ═══ H. LEAGUE COMPLETION + PUBLIC READ MODEL ═════════════════════════════
select tests.new_comp('S', 'CE Small', 'LEAGUE');
select tests.enter(tests.c('S'), array['t10', 't11', 't12']);
insert into tests.ctx select 'S.s', tests.stage(tests.c('S'), 'LEAGUE', 1);
insert into public.matches (competition_id, stage_id, home_team_id, away_team_id, scheduled_at) values
  (tests.c('S'), tests.c('S.s'), tests.c('t10'), tests.c('t11'), now()),
  (tests.c('S'), tests.c('S.s'), tests.c('t11'), tests.c('t12'), now()),
  (tests.c('S'), tests.c('S.s'), tests.c('t12'), tests.c('t10'), now());
select tests.finish(tests.match_of(tests.c('S'), 't10', 't11'), 2, 0);
select tests.login(tests.c('admin'));
select throws_ok($$ select public.admin_complete_competition(tests.c('S')) $$, 'EK409', null, 'unfinished league cannot be completed');
reset role;
select tests.finish(tests.match_of(tests.c('S'), 't11', 't12'), 1, 0);
select tests.finish(tests.match_of(tests.c('S'), 't12', 't10'), 0, 3);
select tests.login(tests.c('admin'));
select is((public.admin_complete_competition(tests.c('S')) ->> 'champion_team_id')::uuid, tests.c('t10'), 'league champion = top of the final table');
reset role;
select tests.login_anon();
select is(public.public_competition(tests.c('S')) #>> '{competition,champion_team_id}', tests.c('t10')::text, 'public page shows the champion');
select is(jsonb_array_length(public.public_competition(tests.c('G')) #> '{stages}'), 4, 'public payload lists every stage');
select ok((public.public_competition(tests.c('G')) #> '{stages,1,ties,0,winner_to}') is not null, 'ties know where the winner goes');
select is((select count(*)::int from public.knockout_ties where competition_id = tests.c('G')), 4, 'the public can read the bracket');
select throws_ok($$ select count(*) from public.player_suspensions $$, '42501', null, 'the public cannot read suspensions directly');
select throws_ok($$ insert into public.knockout_ties (competition_id, stage_id, code, position, home_source_type, home_label, away_source_type, away_label)
  values (tests.c('G'), tests.c('G.f'), 'X', 9, 'TEAM', 'x', 'TEAM', 'y') $$, '42501', null, 'the public cannot write the bracket');
select throws_ok($$ select public.admin_complete_competition(tests.c('S')) $$, '42501', null, 'the public cannot complete competitions');
reset role;
update public.competitions set status = 'DRAFT' where id = tests.c('O5');
select tests.login_anon();
select is(public.public_competition(tests.c('O5')), null, 'draft competitions are not public');
reset role;
select tests.login(tests.c('op'));
select throws_ok($$ select public.admin_complete_competition(tests.c('S')) $$, 'EK403', null, 'operators cannot complete competitions');
select throws_ok($$ select public.admin_competition_overview(tests.c('S')) $$, 'EK403', null, 'operators cannot open the control centre');
reset role;
select tests.login(tests.c('admin'));
select ok(public.admin_competition_overview(tests.c('G')) ? 'stage_ops', 'admin control centre payload');
reset role;

select * from finish();
rollback;
