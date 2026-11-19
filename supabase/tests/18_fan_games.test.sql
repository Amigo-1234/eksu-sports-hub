-- Fan games: score predictions, points, leaderboards and Player of the Match.
begin;
\ir helpers.inc
select no_plan();

create temp table dev (k text primary key, token text);
insert into dev (k, token) select k, public.service_audience_register(null) ->> 'token' from unnest(array['A', 'B', 'C', 'N']) k;
create or replace function tests.tok(p text) returns text language sql stable as $$ select token from dev where k = p $$;
select public.service_visitor_join(tests.tok('A'), 'Ada', null, 'qa');
select public.service_visitor_join(tests.tok('B'), 'Bayo', null, 'qa');
select public.service_visitor_join(tests.tok('C'), 'Chidi', null, 'qa');
create or replace function tests.g(p_dev text, p_action text, p jsonb default '{}', p_match uuid default null) returns jsonb language sql as $$
  select public.service_fan_games_act(tests.tok(p_dev), coalesce(p_match, tests.m1()), p_action, p) $$;

-- Kick-off tomorrow for m1 and m2.
update public.matches set scheduled_at = now() + interval '1 day' where id in (tests.m1(), tests.m2());

-- Locked down.
select tests.login_anon();
select throws_ok($$ select count(*) from public.fan_predictions $$, '42501', null, 'anon cannot read predictions');
select throws_ok($$ select public.service_fan_leaderboard('all', null, null, 10) $$, '42501', null, 'anon cannot call leaderboard');
reset role;

-- Predictions.
select is((public.service_fan_games(tests.m1(), null) -> 'prediction' ->> 'open')::boolean, true, 'predictions open before kick-off');
select throws_ok($$ select tests.g('N', 'predict', '{"home":1,"away":0}') $$, 'EK401', null, 'a name is needed to predict');
select throws_ok($$ select tests.g('A', 'predict', '{"home":1}') $$, 'EK422', null, 'both scores needed');
select throws_ok($$ select tests.g('A', 'predict', '{"home":31,"away":0}') $$, 'EK422', null, 'silly scores refused');
select throws_ok($$ select tests.g('A', 'predict', '{"home":"x","away":0}') $$, 'EK422', null, 'non-numbers refused');
select is(tests.g('A', 'predict', '{"home":2,"away":1}') -> 'prediction' -> 'mine', '{"home":2,"away":1,"points":null}'::jsonb, 'A predicts 2-1');
select is(tests.g('A', 'predict', '{"home":3,"away":1}') -> 'prediction' -> 'mine' ->> 'home', '3', 'A changes to 3-1');
select is((tests.g('B', 'predict', '{"home":1,"away":0}') -> 'prediction' ->> 'count')::int, 2, 'two predictions');
select lives_ok($$ select tests.g('C', 'predict', '{"home":0,"away":2}') $$, 'C predicts an away win');
select is(public.service_fan_games(tests.m1(), null) -> 'prediction' -> 'popular' -> 0 ->> 'n', '1', 'popular scorelines listed');
select is(tests.g('C', 'unpredict') -> 'prediction' -> 'mine', 'null'::jsonb, 'C withdraws');
select lives_ok($$ select tests.g('C', 'predict', '{"home":0,"away":2}') $$, 'C predicts again');
select lives_ok($$ select tests.g('A', 'predict', '{"home":0,"away":0}', tests.m2()) $$, 'A predicts m2');

-- Kick-off closes predictions.
update public.matches set scheduled_at = now() - interval '1 minute' where id = tests.m1();
select throws_ok($$ select tests.g('B', 'predict', '{"home":5,"away":5}') $$, 'EK409', null, 'closed once kick-off time passes');
update public.matches set status = '1H' where id = tests.m1();
select is((public.service_fan_games(tests.m1(), null) -> 'prediction' ->> 'open')::boolean, false, 'closed while live');
select is(public.service_fan_games(tests.m1(), null) -> 'potm', 'null'::jsonb, 'no Player of the Match before full-time');

-- Full-time 3-1: A exact (3), B right result (1), C wrong (0).
update public.matches set status = 'FT', home_score = 3, away_score = 1, finished_at = now() where id = tests.m1();
select is((public.service_fan_games(tests.m1(), tests.tok('A')) -> 'prediction' -> 'mine' ->> 'points')::int, 3, 'exact score: 3 points');
select is((public.service_fan_games(tests.m1(), tests.tok('B')) -> 'prediction' -> 'mine' ->> 'points')::int, 1, 'right result: 1 point');
select is((public.service_fan_games(tests.m1(), tests.tok('C')) -> 'prediction' -> 'mine' ->> 'points')::int, 0, 'wrong: 0');
select is((public.service_fan_games(tests.m1(), null) -> 'prediction' ->> 'exact')::int, 1, 'one exact score');

-- Leaderboard.
select is(public.service_fan_leaderboard('all', null, tests.tok('B'), 10) -> 'rows' -> 0 ->> 'name', 'Ada', 'Ada top');
select is((public.service_fan_leaderboard('all', null, tests.tok('B'), 10) -> 'me' ->> 'rank')::int, 2, 'Bayo sees own rank');
select is((public.service_fan_leaderboard('all', null, null, 10) ->> 'players')::int, 3, 'unfinished m2 not counted, 3 players');
select is((public.service_fan_leaderboard('week', null, null, 10) -> 'rows' -> 0 ->> 'points')::int, 3, 'weekly board');
select is(jsonb_array_length(public.service_fan_leaderboard('all', gen_random_uuid(), null, 10) -> 'rows'), 0, 'competition filter');
select throws_ok($$ select public.service_fan_leaderboard('year', null, null, 10) $$, 'EK422', null, 'bad period refused');

-- Player of the Match.
select ok(jsonb_array_length(public.service_fan_games(tests.m1(), null) -> 'potm' -> 'candidates') >= 22, 'starters are candidates');
select ok(not exists (select 1 from jsonb_array_elements(public.service_fan_games(tests.m1(), null) -> 'potm' -> 'candidates') c
  where (c ->> 'id')::uuid = tests.player(tests.home(), 15)), 'unused substitutes are not candidates');
select is((tests.g('N', 'potm', jsonb_build_object('player_id', tests.player(tests.home(), 9))) -> 'potm' ->> 'total')::int, 1, 'no name needed to vote');
select is(tests.g('A', 'potm', jsonb_build_object('player_id', tests.player(tests.home(), 9))) -> 'potm' -> 'candidates' -> 0 ->> 'votes', '2', 'votes counted, leader first');
select is(tests.g('A', 'potm', jsonb_build_object('player_id', tests.player(tests.away(), 7))) -> 'potm' ->> 'mine', tests.player(tests.away(), 7)::text, 'vote changeable');
select throws_ok(format($$ select tests.g('B', 'potm', jsonb_build_object('player_id', %L)) $$, tests.player(tests.home(), 15)), 'EK422', null, 'unused sub refused');
select throws_ok($$ select tests.g('B', 'potm', jsonb_build_object('player_id', gen_random_uuid())) $$, 'EK422', null, 'random player refused');
update public.matches set finished_at = now() - interval '49 hours' where id = tests.m1();
select throws_ok(format($$ select tests.g('B', 'potm', jsonb_build_object('player_id', %L)) $$, tests.player(tests.home(), 9)), 'EK409', null, 'closed after 48 hours');
select is((public.service_fan_games(tests.m1(), null) -> 'potm' ->> 'open')::boolean, false, 'results stay visible after closing');
select throws_ok($$ select tests.g('B', 'potm', '{}', tests.m2()) $$, 'EK409', null, 'no vote before full-time');

-- Unknown match / forged device.
select throws_ok($$ select public.service_fan_games(gen_random_uuid(), null) $$, 'EK404', null, 'unknown match');
select throws_ok($$ select public.service_fan_games_act('forged-token-forged-token-forged-token-xx', tests.m2(), 'predict', '{"home":1,"away":1}') $$, 'EK401', null, 'forged device');

select * from finish();
rollback;
