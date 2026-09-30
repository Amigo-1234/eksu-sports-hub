begin;
\ir helpers.inc
select plan(38);

create temp table u as select
  tests.make_user('admin7@test.local', array['ADMIN']) as admin,
  tests.make_user('op7@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['comp', 'stage', 'test', 'start', 'g1', 'yc', 'rc', 'sub', 'ht', '2h', 'stop', 'pause', 'resume', 'g2', 'ft']);
grant select, update on ids to anon, authenticated;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.t(n int) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
/* 11 starters (4-4-2 shape, No. 1 in goal, No. 10 captain) + 3 substitutes, synthetic names. */
create or replace function tests.test_lineup(p_prefix text) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object(
    'name', p_prefix || ' Test ' || n, 'shirt_number', n, 'role', case when n <= 11 then 'STARTER' else 'SUBSTITUTE' end,
    'position', case when n = 1 then 'GK' when n <= 5 then 'DF' when n <= 9 then 'MF' else 'FW' end,
    'x', case when n <= 11 then 5 + n * 8 end, 'y', case when n = 1 then 92 when n <= 11 then 20 + n * 5 end,
    'goalkeeper', n = 1, 'captain', n = 10) order by n)
  from generate_series(1, 14) n $$;
/* Demo participant id served to /op for a shirt (same lookup the console does). */
create or replace function tests.pid(p_team_side text, p_shirt int) returns uuid language sql stable as $$
  select (x ->> 'player_id')::uuid
  from jsonb_array_elements(public.operator_match_state(tests.id('test')) -> 'squads' -> p_team_side) x
  where (x ->> 'shirt_number')::int = p_shirt $$;
create or replace function tests.snap(p uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.match_snapshot(p) $$;
create or replace function tests.pts(p_comp uuid, p_team uuid) returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select points from public.standings where competition_id = p_comp and team_id = p_team), 0) $$;
create or replace function tests.counts() returns text language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.players) || '/' || (select count(*) from public.player_identities) || '/'
    || (select count(*) from public.player_screenings) || '/' || (select count(*) from public.squad_players) $$;
grant execute on all functions in schema tests to anon, authenticated;

create temp table before as select tests.counts() as c, tests.pts('60000000-0000-4000-8000-000000000001', tests.t(1)) as dev_pts;
grant select on before to anon, authenticated;

-- ── Fixture: a TEST competition + match, assigned to the operator ──────────
select tests.login((select admin from u));
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values (tests.id('comp'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CUP SYSTEMS TEST — not official', 'SYSTEMS TEST', 'ACTIVE');
insert into public.competition_stages (id, competition_id, name, stage_order) values (tests.id('stage'), tests.id('comp'), 'Test', 1);
insert into public.competition_entries (competition_id, stage_id, team_id) values
  (tests.id('comp'), tests.id('stage'), tests.t(1)), (tests.id('comp'), tests.id('stage'), tests.t(2));
update ids set id = public.admin_create_match(tests.id('comp'), tests.id('stage'), null, 'CUP SYSTEMS TEST — not an official result',
  tests.t(1), tests.t(2), null, now()) where k = 'test';
select lives_ok($$ select public.admin_mark_demo_match(tests.id('test'), 'Live systems test') $$, 'a TEST-labelled match can be marked demo/test');
select lives_ok($$ select public.admin_assign_operators(tests.id('test'), (select op from u)) $$, 'operator assigned as primary');

-- ── Synthetic participants exist only in the demo layer ────────────────────
select throws_ok($$ select public.admin_demo_set_lineup(tests.id('test'), tests.t(1), '4-4-2',
  jsonb_set(tests.test_lineup('Eng'), '{0,name}', '"John Adebayo"')) $$, 'EK422', null,
  'a synthetic participant needs an obviously synthetic (TEST/DEMO) name');
select tests.login((select op from u));
select throws_ok($$ select public.start_match(tests.id('test'), tests.id('start')) $$, 'EK409', null,
  'kick-off is refused until both test line-ups are prepared');
select tests.login((select admin from u));
select lives_ok($$ select public.admin_demo_set_lineup(tests.id('test'), tests.t(1), '4-4-2', tests.test_lineup('Eng')) $$, 'Engineering test line-up (11 + 3)');
select lives_ok($$ select public.admin_demo_set_lineup(tests.id('test'), tests.t(2), '4-4-2', tests.test_lineup('Sci')) $$, 'Science test line-up (11 + 3)');
select is(tests.counts(), (select c from before), 'no player, identity, screening or squad row was created');
reset role;
select is((select count(*) from public.demo_lineup_players where match_id = tests.id('test') and player_id is null)::int, 28,
  'all 28 test participants are synthetic (no player record)');
select throws_ok($$ insert into public.match_lineups (match_id, team_id, status) values (tests.id('test'), tests.t(1), 'DRAFT') $$,
  'EK422', null, 'an official line-up can never be created for a test match');

-- ── /op sees the test line-ups ─────────────────────────────────────────────
select tests.login((select op from u));
select is(public.operator_match_state(tests.id('test')) -> 'lineups' -> 'home' ->> 'status', 'CONFIRMED', 'console sees a ready home test line-up');
select ok((public.operator_match_state(tests.id('test')) -> 'lineups' -> 'away' ->> 'demo')::boolean, 'console knows the line-up is a demo/test line-up');
select is(jsonb_array_length(public.operator_match_state(tests.id('test')) -> 'squads' -> 'home'), 14, 'console offers all 14 home test players');
select is((select x ->> 'name' from jsonb_array_elements(public.operator_match_state(tests.id('test')) -> 'squads' -> 'home') x
  where x ->> 'shirt_number' = '9'), 'Eng Test 9', 'console shows synthetic names');

-- ── Live flow driven from /op ──────────────────────────────────────────────
select lives_ok($$ select public.start_match(tests.id('test'), tests.id('start')) $$, 'operator kicks off the test match');
select lives_ok($$ select public.record_event(tests.id('test'), tests.id('g1'), 'GOAL', tests.t(1), 12, 0, tests.pid('home', 9)) $$,
  'goal by a test player');
select is(tests.snap(tests.id('test')) ->> 'home_score', '1', 'score derived from the goal');
select throws_ok($$ select public.record_event(tests.id('test'), gen_random_uuid(), 'GOAL', tests.t(1), 13, 0, tests.pid('home', 13)) $$,
  'EK422', null, 'a substitute on the bench cannot score');
select throws_ok($$ select public.record_event(tests.id('test'), gen_random_uuid(), 'GOAL', tests.t(1), 13, 0, tests.pid('away', 9)) $$,
  'EK422', null, 'a player of the other team is refused');
select throws_ok($$ select public.record_event(tests.id('test'), gen_random_uuid(), 'GOAL', tests.t(1), 13, 0,
  (select player_id from public.squad_players limit 1)) $$, 'EK422', null, 'an official squad player cannot appear in a test match');
select lives_ok($$ select public.record_event(tests.id('test'), tests.id('yc'), 'YELLOW_CARD', tests.t(2), 20, 0, tests.pid('away', 4)) $$, 'yellow card');
select throws_ok($$ select public.record_event(tests.id('test'), gen_random_uuid(), 'YELLOW_CARD', tests.t(2), 21, 0, tests.pid('away', 4)) $$,
  'EK422', null, 'a second plain yellow is refused');
select lives_ok($$ select public.record_event(tests.id('test'), tests.id('rc'), 'RED_CARD', tests.t(2), 30, 0, tests.pid('away', 6)) $$, 'red card');
select throws_ok($$ select public.record_event(tests.id('test'), gen_random_uuid(), 'SUBSTITUTION', tests.t(2), 31, 0, tests.pid('away', 6), tests.pid('away', 12)) $$,
  'EK422', null, 'a dismissed player cannot be substituted');
select lives_ok($$ select public.record_event(tests.id('test'), tests.id('sub'), 'SUBSTITUTION', tests.t(1), 40, 0, tests.pid('home', 7), tests.pid('home', 13)) $$,
  'substitution');
select ok((select count(*) from jsonb_array_elements(public.operator_match_state(tests.id('test')) -> 'events') e where e ->> 'shirt_number' is null) = 0
  and exists (select 1 from jsonb_array_elements(public.operator_match_state(tests.id('test')) -> 'events') e
    where e ->> 'type' = 'SUBSTITUTION' and e ->> 'shirt_number' = '7' and e ->> 'related_shirt_number' = '13'),
  'console timeline resolves every test shirt');
select lives_ok($$ select public.end_period(tests.id('test'), tests.id('ht')) $$, 'half-time');
select lives_ok($$ select public.start_period(tests.id('test'), tests.id('2h')) $$, 'second half');
select lives_ok($$ select public.set_stoppage(tests.id('test'), tests.id('stop'), 3) $$, 'stoppage');
select lives_ok($$ select public.pause_match(tests.id('test'), tests.id('pause'), 'INJURY') $$, 'pause');
select lives_ok($$ select public.resume_match(tests.id('test'), tests.id('resume')) $$, 'resume');
select lives_ok($$ select public.record_event(tests.id('test'), tests.id('g2'), 'GOAL', tests.t(1), 70, 0, tests.pid('home', 13)) $$,
  'the substitute who came on scores');
select lives_ok($$ select public.finalise_match(tests.id('test'), tests.id('ft'), 2, 0) $$, 'full time');

-- ── Public view and isolation ──────────────────────────────────────────────
select tests.login_anon();
select is((select string_agg(e ->> 'player_name', ',' order by (e ->> 'seq')::int) from jsonb_array_elements(public.public_match_feed(tests.id('test')) -> 'events') e
  where e ->> 'type' = 'GOAL'), 'Eng Test 9,Eng Test 13', 'public feed names the test scorers');
select ok((select bool_and((p ->> 'sent_off')::boolean) from jsonb_array_elements(public.public_match_feed(tests.id('test')) -> 'lineups' -> 1 -> 'players') p
  where p ->> 'shirt_number' = '6'), 'public line-up shows the dismissal');
select ok(public.public_match_feed(tests.id('test'))::text !~* '(student|screening|pending|player_id)', 'public feed exposes no identities or ids');
reset role;
select is(tests.pts(tests.id('comp'), tests.t(1)), 3, 'the test result counts only in its own TEST competition');
select is(tests.pts('60000000-0000-4000-8000-000000000001', tests.t(1)), (select dev_pts from before),
  'official competition standings are untouched');
select is(tests.counts(), (select c from before), 'after a full live test, still no official player data');

select * from finish();
rollback;
