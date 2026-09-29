begin;
\ir helpers.inc
select plan(30);

create temp table u as select tests.make_user('pub-op@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), op, 'PRIMARY'::public.assignment_role from u;

-- A draft competition with one match: must be invisible to the public.
create temp table d (k text primary key, id uuid not null default gen_random_uuid());
insert into d (k) values ('comp'), ('match');
grant select on d to anon, authenticated;
create or replace function tests.d(k text) returns uuid language sql stable as $$ select id from d where d.k = d.k and d.k = $1 $$;
grant execute on function tests.d(text) to anon, authenticated;
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values (tests.d('comp'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'TEST Draft Cup', 'Draft', 'DRAFT');
insert into public.competition_entries (competition_id, team_id) values (tests.d('comp'), tests.home()), (tests.d('comp'), tests.away());
insert into public.matches (id, competition_id, home_team_id, away_team_id, scheduled_at)
values (tests.d('match'), tests.d('comp'), tests.home(), tests.away(), now());
insert into public.operator_assignments (match_id, user_id, role)
select tests.d('match'), op, 'PRIMARY'::public.assignment_role from u;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['g1', 'g2', 'yc']);
grant select on ids to anon, authenticated;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = $1 $$;
grant execute on function tests.id(text) to anon, authenticated;
create or replace function tests.hints(p_topic text) returns bigint language sql security definer set search_path = '' as $$
  select count(*) from realtime.messages where topic = p_topic $$;
grant execute on function tests.hints(text) to anon, authenticated;

-- ── Operator drives the match: every change must leave realtime hints ─────
select tests.confirm_lineups(tests.d('match'));
select tests.login((select op from u));
select public.start_match(tests.m1(), gen_random_uuid());
select public.record_event(tests.m1(), tests.id('g1'), 'GOAL', tests.home(), 5, 0, tests.player(tests.home(), 9));
select public.record_event(tests.m1(), tests.id('yc'), 'YELLOW_CARD', tests.away(), 7, 0, tests.player(tests.away(), 4));
select public.start_match(tests.d('match'), gen_random_uuid());
reset role;
select ok(tests.hints('match:' || tests.m1()) >= 3, 'match channel received a hint per change');
select ok(tests.hints('scores:live') >= 3, 'scores:live received hints');
select is(tests.hints('match:' || tests.d('match')), 0::bigint, 'draft match changes are not broadcast');
select is((select bool_and(private) from realtime.messages where topic in ('scores:live', 'match:' || tests.m1())), true, 'hints go to private channels');
select ok((select payload ? 'seq' and payload ? 'match_id' from realtime.messages where topic = 'match:' || tests.m1() order by inserted_at desc limit 1), 'hint carries match id and seq');
select ok(not exists (select 1 from realtime.messages where topic = 'match:' || tests.m1() and (payload ? 'recorded_by' or payload ? 'active_operator_id')), 'hints carry no operator identity');

-- ── Anonymous public reads ─────────────────────────────────────────────────
select tests.login_anon();
select is((select count(*) from public.competitions where id = tests.d('comp'))::int, 0, 'anon cannot see draft competition');
select is((select count(*) from public.matches where id = tests.d('match'))::int, 0, 'anon cannot see draft matches');
select is((select count(*) from public.match_events where match_id = tests.d('match'))::int, 0, 'anon cannot see draft match events');
select is((select count(*) from public.competition_entries where competition_id = tests.d('comp'))::int, 0, 'anon cannot see draft entries');
select is((select count(*) from public.matches where id = tests.m1())::int, 1, 'anon sees published matches');
select is((select home_score::int from public.matches where id = tests.m1()), 1, 'anon reads canonical score');
select throws_ok($$ select payload from public.match_events limit 1 $$, '42501', null, 'anon cannot read event payload');
select throws_ok($$ select void_reason from public.match_events limit 1 $$, '42501', null, 'anon cannot read void reasons');
select throws_ok($$ select active_operator_id from public.matches limit 1 $$, '42501', null, 'anon cannot read operator in control');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'anon cannot read audit');
select throws_ok($$ select * from public.squad_players $$, '42501', null, 'anon cannot read squads');
select throws_ok($$ update public.matches set home_score = 9 where id = tests.m1() $$, '42501', null, 'anon cannot write matches');
select throws_ok($$ insert into realtime.messages (topic, extension, payload, event, private) values ('scores:live', 'broadcast', '{}', 'match_changed', true) $$,
  '42501', null, 'anon cannot publish realtime hints');

-- Feed RPC
select is((public.public_match_feed(tests.m1()) -> 'match' ->> 'home_score')::int, 1, 'feed returns canonical score');
select is(jsonb_array_length(public.public_match_feed(tests.m1()) -> 'events'), 2, 'feed returns all events');
select is(public.public_match_feed(tests.m1()) -> 'events' -> 0 ->> 'shirt_number', '9', 'feed resolves shirt numbers');
select is(jsonb_array_length(public.public_match_feed(tests.m1(), (select seq from public.match_events where id = tests.id('g1'))) -> 'events'), 1,
  'after_seq returns only newer events');
select ok(not (public.public_match_feed(tests.m1()) -> 'events' -> 0 ?| array['void_reason', 'recorded_by', 'payload', 'player_id']), 'feed events expose no internal fields');
select is(public.public_match_feed(tests.d('match')), null, 'feed hides draft matches');
select is(jsonb_array_length(public.public_live_scores() -> 'matches'), 1, 'live board lists only published live matches');

-- Void propagates
select tests.login((select op from u));
select public.void_event(tests.m1(), gen_random_uuid(), tests.id('g1'), 'wrong team');
select tests.login_anon();
select is((public.public_match_feed(tests.m1()) -> 'match' ->> 'home_score')::int, 0, 'void re-derives public score');
select is(public.public_match_feed(tests.m1()) -> 'voided_ids' ->> 0, tests.id('g1')::text, 'feed lists voided ids for reconciliation');
select is((select last_value from (select (public.public_live_scores() -> 'matches' -> 0 -> 'last_event' ->> 'type') last_value) x), 'YELLOW_CARD',
  'live board last event skips voided events');

select * from finish();
rollback;
