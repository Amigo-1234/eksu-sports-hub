-- Search, registered teams, live Fan Zone hints and emoji bursts.
begin;
\ir helpers.inc
select no_plan();

-- Give two seeded players names (the dev seed leaves them blank).
update public.players set display_name = 'Tunde Bakare' where id = tests.player(tests.home(), 9);
update public.players set display_name = 'Bisi_Ade 100%' where id = tests.player(tests.away(), 7);

-- Registered teams / player search are public, read-only.
select tests.login_anon();
select ok(tests.home() in (select public.public_registered_teams()), 'a team with a current squad is registered');
select is((select count(*)::int from public.public_search_players('tunde', 20)), 1, 'anon finds a player by name');
select is((select team_id from public.public_search_players('Bakare', 20)), tests.home(), 'result carries the team');
select is((select shirt_number from public.public_search_players('bakare', 20)), 9, 'and the shirt number');
select is((select count(*)::int from public.public_search_players('t', 20)), 0, 'one letter is too short');
select is((select count(*)::int from public.public_search_players('%x%', 20)), 0, 'wildcards are literal');
select is((select count(*)::int from public.public_search_players('_Ade 100%', 20)), 1, 'literal % and _ still match');
select throws_ok($$ select count(*) from public.fan_bursts $$, '42501', null, 'anon cannot read bursts table');
select throws_ok($$ select public.service_fan_burst('x', 'match', tests.m1()::text, 'fire') $$, '42501', null, 'anon cannot burst directly');
reset role;

-- Not cleared in screening → not searchable.
update public.player_screenings set status = 'PENDING' where player_id = tests.player(tests.home(), 9);
select is((select count(*)::int from public.public_search_players('tunde', 20)), 0, 'uncleared players are hidden');

-- Live hints.
create temp table dev (k text primary key, token text);
insert into dev values ('A', public.service_audience_register(null) ->> 'token');
select public.service_visitor_join((select token from dev), 'Ada', null, 'qa');
delete from realtime.messages;
select public.service_fan_act((select token from dev), 'match', tests.m1()::text, 'like');
select is((select topic from realtime.messages where event = 'fan_changed' order by id desc limit 1), 'fan:match:' || tests.m1(), 'a like sends a hint on the match channel');
select public.service_fan_act((select token from dev), 'news', 'some-story', 'comment', '{"body":"hello"}');
select is((select payload ->> 'what' from realtime.messages where topic = 'fan:news:some-story' order by id desc limit 1), 'feed', 'a comment sends a feed hint');
select public.service_fan_act((select token from dev), 'match', tests.m1()::text, 'vote', '{"pick":"HOME"}');
select is((select payload ->> 'what' from realtime.messages where topic = 'fan:match:' || tests.m1() order by id desc limit 1), 'games', 'a vote sends a games hint');

-- Bursts.
select is(public.service_fan_burst((select token from dev), 'match', tests.m1()::text, 'fire') ->> 'fire', '1', 'burst counted');
select is(public.service_fan_burst((select token from dev), 'match', tests.m1()::text, 'fire') ->> 'fire', '2', 'and again');
select is((select count(*)::int from realtime.messages where event = 'fan_burst'), 2, 'each burst is broadcast');
select is(public.service_fan_bursts('match', tests.m1()::text) ->> 'fire', '2', 'counts readable');
select throws_ok($$ select public.service_fan_burst((select token from dev), 'match', tests.m1()::text, 'poop') $$, 'EK422', null, 'unknown emoji refused');
select throws_ok($$ select public.service_fan_bursts('match', gen_random_uuid()::text) $$, 'EK404', null, 'unknown match refused');
select throws_ok($$ do $b$ begin for i in 1..40 loop perform public.service_fan_burst((select token from dev), 'match', tests.m1()::text, 'clap'); end loop; end $b$ $$,
  'EK429', null, 'bursts are rate-limited');

-- Listen-only policy exists for fan topics.
select ok(exists (select 1 from pg_policy where polname = 'public fan channels are listen-only'), 'fan channel policy');

select * from finish();
rollback;
