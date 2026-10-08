-- Competition top scorers: goals + penalties by named players in live and
-- finished matches; own goals, voided, unnamed and demo goals excluded; ties share a rank.
begin;
\ir helpers.inc
select no_plan();
set constraints all immediate;

create temp table u as select tests.make_user('op16@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;
insert into public.operator_assignments (match_id, user_id, role)
select m, op, 'PRIMARY'::public.assignment_role from u, (values (tests.m1()), (tests.m2())) v(m);
create or replace function tests.op(p_sql text) returns void language plpgsql as $$
begin perform tests.login((select op from u)); execute p_sql; reset role; end $$;
create or replace function tests.goal(p_match uuid, p_type text, p_team uuid, p_minute int, p_shirt int) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  perform tests.op(format('select public.record_event(%L, %L, %L, %L, %s, 0, %L)', p_match, v, p_type, p_team, p_minute,
    case when p_shirt is null then null else tests.player(p_team, p_shirt) end));
  return v;
end $$;
create or replace function tests.comp() returns uuid language sql stable security definer set search_path = '' as $$
  select competition_id from public.matches where id = (select id from tests.fixture where key = 'm1') $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.login_anon();
select is((select count(*)::int from public.public_top_scorers(tests.comp())), 0, 'no goals: empty leaderboard (anon can call it)');
reset role;

select tests.op($$ select public.start_match(tests.m1(), gen_random_uuid()) $$);
select tests.goal(tests.m1(), 'GOAL', tests.home(), 5, 9);
select tests.goal(tests.m1(), 'PENALTY_GOAL', tests.home(), 20, 9);
select tests.goal(tests.m1(), 'GOAL', tests.away(), 25, 10);
select tests.goal(tests.m1(), 'OWN_GOAL', tests.away(), 30, 4);
select tests.goal(tests.m1(), 'GOAL', tests.away(), 35, null);
create temp table voided as select tests.goal(tests.m1(), 'GOAL', tests.away(), 40, 11) as id;
select tests.op(format('select public.void_event(%L, gen_random_uuid(), %L, %L)', tests.m1(), (select id from voided), 'Wrong player'));

select tests.login_anon();
select results_eq($$ select rank, team_id, goals from public.public_top_scorers(tests.comp()) $$,
  $$ values (1, tests.home(), 2), (2, tests.away(), 1) $$, 'live match counts goals + penalties; own, unnamed and voided goals excluded');
reset role;

-- A second (finished) match: a tie at the top shares rank 1.
select tests.op($$ select public.start_match(tests.m2(), gen_random_uuid()) $$);
select tests.goal(tests.m2(), 'GOAL', tests.away(), 10, 10);
select tests.op($$ select public.end_period(tests.m2(), gen_random_uuid()) $$);
select tests.op($$ select public.start_period(tests.m2(), gen_random_uuid()) $$);
select tests.op(format('select public.finalise_match(%L, gen_random_uuid(), %s, %s)', tests.m2(),
  (select home_score from public.matches where id = tests.m2()), (select away_score from public.matches where id = tests.m2())));
select tests.login_anon();
select results_eq($$ select rank, goals from public.public_top_scorers(tests.comp()) $$,
  $$ values (1, 2), (1, 2) $$, 'live + finished matches counted once; equal goals share rank 1');
select is((select count(*)::int from public.public_top_scorers(tests.comp())), 2, 'one row per player');
reset role;
select is(pg_get_function_result('public.public_top_scorers(uuid)'::regprocedure),
  'TABLE(rank integer, player_name text, team_id uuid, team_name text, team_short_name text, goals integer)', 'exposes only name, team and goals');
select is((select count(*)::int from public.public_top_scorers('00000000-0000-4000-8000-000000000000')), 0, 'unknown competition: empty');

select * from finish();
rollback;
