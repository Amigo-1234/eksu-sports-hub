begin;
\ir helpers.inc
select plan(30);

-- Fixtures: an operator assigned to m1, an operator with no assignment,
-- a signed-in user with no role, and an admin.
create temp table u as select
  tests.make_user('op1@test.local', array['OPERATOR']) as op,
  tests.make_user('stranger-op@test.local', array['OPERATOR']) as stranger,
  tests.make_user('plain@test.local') as plain,
  tests.make_user('admin@test.local', array['ADMIN']) as admin;
grant select on u to anon, authenticated;
insert into public.operator_assignments (match_id, user_id, role) select tests.m1(), op, 'PRIMARY' from u;

-- RLS is enabled (and forced) on every public table.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity))::int,
  0, 'RLS enabled and forced on every public table');

-- Private helpers are not executable by client roles (except RLS helpers).
select is(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  'has_role,is_staff', 'anon can execute only the RLS helpers in private');
select is(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')),
  'has_role,is_staff', 'authenticated can execute only the RLS helpers in private');

-- ── anon ──────────────────────────────────────────────────────────────────
select tests.login_anon();
select ok((select count(*) from public.matches) >= 3, 'anon can read public matches');
select ok((select count(*) from public.teams) >= 4, 'anon can read teams');
select throws_ok($$ select active_operator_id from public.matches $$, '42501', null, 'anon cannot read operational match columns');
select throws_ok($$ select recorded_by from public.match_events $$, '42501', null, 'anon cannot read who recorded events');
select throws_ok($$ select * from public.operator_assignments $$, '42501', null, 'anon cannot read assignments');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.user_roles $$, '42501', null, 'anon cannot read user roles');
select throws_ok($$ select * from public.players $$, '42501', null, 'anon cannot read players');
select throws_ok($$ update public.matches set status = 'FT' $$, '42501', null, 'anon cannot update matches');
select throws_ok($$ select public.start_match(tests.m1(), gen_random_uuid()) $$, '42501', null, 'anon cannot execute match RPCs');
reset role;

-- ── plain signed-in user (no role) ────────────────────────────────────────
select tests.login((select plain from u));
select throws_ok($$ update public.matches set status = '1H' where id = tests.m1() $$, '42501', null, 'authenticated cannot update matches.status');
select throws_ok($$ update public.matches set home_score = 3 where id = tests.m1() $$, '42501', null, 'authenticated cannot set scores');
select throws_ok($$ insert into public.match_events (id, match_id, seq, type, period, minute, team_id, recorded_by)
  values (gen_random_uuid(), tests.m1(), 1, 'GOAL', 1, 1, tests.home(), auth.uid()) $$, '42501', null, 'authenticated cannot insert events');
select throws_ok($$ insert into public.standings (competition_id, team_id, rank) values ('60000000-0000-4000-8000-000000000001', tests.home(), 1) $$,
  '42501', null, 'authenticated cannot write standings');
select throws_ok($$ insert into public.audit_log (action, entity_type, entity_id) values ('X', 'match', tests.m1()) $$,
  '42501', null, 'authenticated cannot write audit log');
select throws_ok($$ delete from public.match_events $$, '42501', null, 'authenticated cannot delete events');
select throws_ok($$ select public.start_match(tests.m1(), gen_random_uuid()) $$, 'EK403', null, 'user without a role cannot start a match');
select is((select count(*) from public.players)::int, 0, 'user without a staff role sees no players');
reset role;

-- ── operators ─────────────────────────────────────────────────────────────
select tests.login((select op from u));
select is((select count(*) from public.operator_assignments)::int, 1, 'operator sees only own assignment');
select is((select count(*) from public.audit_log)::int, 0, 'operator cannot read audit log');
select throws_ok($$ insert into public.operator_assignments (match_id, user_id, role) values (tests.m2(), auth.uid(), 'PRIMARY') $$,
  '42501', null, 'operator cannot self-assign');
select ok((select count(*) from public.players) > 0, 'operator can read squads');
reset role;

select tests.login((select stranger from u));
select is((select count(*) from public.operator_assignments)::int, 0, 'unassigned operator sees no assignments');
select throws_ok($$ select public.start_match(tests.m1(), gen_random_uuid()) $$, 'EK403', null, 'unassigned operator cannot start a match by knowing its id');
select throws_ok($$ select public.operator_match_state(tests.m1()) $$, 'EK403', null, 'unassigned operator cannot read operator state');
reset role;

-- ── audit log is append-only for everyone, including the owner ────────────
insert into public.audit_log (action, entity_type, entity_id) values ('TEST', 'match', tests.m1());
select throws_ok($$ update public.audit_log set action = 'TAMPERED' $$, '42501', 'audit_log is append-only', 'owner cannot update audit rows');
select throws_ok($$ delete from public.audit_log $$, '42501', 'audit_log is append-only', 'owner cannot delete audit rows');

select * from finish();
rollback;
