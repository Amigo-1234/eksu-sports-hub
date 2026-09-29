begin;
\ir helpers.inc
select plan(88);

create temp table u as select
  tests.make_user('admin3@test.local', array['ADMIN']) as admin,
  tests.make_user('op3@test.local', array['OPERATOR']) as op,
  tests.make_user('op3b@test.local', array['OPERATOR']) as op2,
  tests.make_user('fan3@test.local') as nobody;
grant select on u to anon, authenticated;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array[
  'season','faculty','dept','team','player','player2','squad','fx','fx2','fx3',
  'start','g1','g2','add','end1','start2','ft','start3']);
grant select, update on ids to authenticated;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.snap(p uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.match_snapshot(p) $$;
create or replace function tests.pts(p_team uuid) returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select points from public.standings where team_id = p_team and competition_id = '60000000-0000-4000-8000-000000000001'), 0) $$;
grant execute on function tests.id(text), tests.snap(uuid), tests.pts(uuid) to anon, authenticated;

create or replace function tests.t(n int) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
grant execute on function tests.t(int) to anon, authenticated;

-- ── Access: anonymous and operators cannot administer ──────────────────────
select tests.login_anon();
select throws_ok($$ insert into public.seasons (name, starts_on, ends_on) values ('X', '2027-09-01', '2028-07-31') $$,
  '42501', null, 'anonymous cannot create a season');
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(1), tests.t(2), null, now()) $$,
  '42501', null, 'anonymous cannot execute admin RPCs');

select tests.login((select op from u));
select throws_ok($$ insert into public.seasons (name, starts_on, ends_on) values ('X', '2027-09-01', '2028-07-31') $$,
  '42501', null, 'operator cannot create a season (RLS)');
update public.teams set name = 'Hacked' where id = tests.t(1);
select is((select name from public.teams where id = tests.t(1)), 'DEV Science', 'operator update on teams affects nothing');
select throws_ok($$ select public.admin_set_current_season('30000000-0000-4000-8000-000000000001') $$,
  'EK403', null, 'operator cannot call admin_set_current_season');
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(1), tests.t(2), null, now()) $$,
  'EK403', null, 'operator cannot create fixtures');
select throws_ok($$ select public.admin_grant_role((select op from u), 'ADMIN') $$,
  'EK403', null, 'operator cannot grant themselves ADMIN');
select throws_ok($$ select * from public.admin_list_staff() $$, 'EK403', null, 'operator cannot list staff');
select throws_ok($$ update public.matches set home_score = 9 $$, '42501', null, 'score columns are never writable by clients');

select tests.login((select nobody from u));
select throws_ok($$ select public.admin_live_matches() $$, 'EK403', null, 'signed-in non-staff cannot use admin reads');

-- ── Seasons ────────────────────────────────────────────────────────────────
select tests.login((select admin from u));
select lives_ok($$ insert into public.seasons (id, name, starts_on, ends_on) values (tests.id('season'), 'TEST 2027/28', '2027-09-01', '2028-07-31') $$,
  'admin creates a season');
select is((select actor_id from public.audit_log where entity_type = 'seasons' and entity_id = tests.id('season') and action = 'ADMIN_INSERT'),
  (select admin from u), 'season creation is audited with the admin as actor');
select lives_ok($$ update public.seasons set name = 'TEST 2027-28' where id = tests.id('season') $$, 'admin edits a season');
select lives_ok($$ select public.admin_set_current_season(tests.id('season')) $$, 'admin marks season current');
select is((select count(*) from public.seasons where is_current)::int, 1, 'exactly one current season');
select ok((select is_current from public.seasons where id = tests.id('season')), 'new season is current');
select throws_ok($$ update public.seasons set archived_at = now() where id = tests.id('season') $$,
  '23514', null, 'current season cannot be archived');
select lives_ok($$ select public.admin_set_current_season('30000000-0000-4000-8000-000000000001') $$, 'switch current back');
select lives_ok($$ update public.seasons set archived_at = now() where id = tests.id('season') $$, 'non-current season can be archived');
select throws_ok($$ select public.admin_set_current_season(tests.id('season')) $$, 'EK404', null, 'archived season cannot be made current');
select throws_ok($$ delete from public.seasons where id = tests.id('season') $$,
  '42501', null, 'seasons are archived, never deleted');

-- ── Faculties, departments, teams ──────────────────────────────────────────
select lives_ok($$ insert into public.faculties (id, name, code) values (tests.id('faculty'), 'TEST Faculty of Law', 'TLAW') $$, 'admin creates faculty');
select lives_ok($$ insert into public.departments (id, faculty_id, name, code) values (tests.id('dept'), tests.id('faculty'), 'TEST Private Law', 'TPLW') $$,
  'admin creates department');
select lives_ok($$ insert into public.teams (id, sport_id, name, short_name, code, slug, kind, faculty_id)
  values (tests.id('team'), '20000000-0000-4000-8000-000000000001', 'TEST Law', 'Law', 'TLW', 'test-law', 'FACULTY', tests.id('faculty')) $$,
  'admin creates team');
select throws_ok($$ insert into public.teams (sport_id, name, short_name, code, slug, kind)
  values ('20000000-0000-4000-8000-000000000001', 'TEST Other', 'Other', 'TOT', 'test-law', 'FACULTY') $$,
  '23505', null, 'duplicate team slug rejected');
select throws_ok($$ insert into public.teams (sport_id, name, short_name, code, slug, kind)
  values ('20000000-0000-4000-8000-000000000001', 'TEST Bad', 'Bad', 'TBD', 'Bad Slug', 'FACULTY') $$,
  '23514', null, 'malformed slug rejected');
select throws_ok($$ delete from public.faculties where id = tests.id('faculty') $$, 'EK409', null, 'faculty with departments cannot be deleted');
select lives_ok($$ delete from public.departments where id = tests.id('dept') $$, 'unused department can be deleted');
select throws_ok($$ delete from public.faculties where id = tests.id('faculty') $$, 'EK409', null, 'faculty with teams cannot be deleted');
select throws_ok($$ delete from public.venues where id = '50000000-0000-4000-8000-000000000001' $$, 'EK409', null, 'venue with fixtures cannot be deleted');
select throws_ok($$ delete from public.teams where id = tests.id('team') $$, '42501', null, 'teams are deactivated, never deleted');
select lives_ok($$ update public.teams set active = false where id = tests.id('team') $$, 'admin deactivates team');

-- ── Players and squads ─────────────────────────────────────────────────────
select lives_ok($$ insert into public.players (id, display_name) values (tests.id('player'), 'Test Player A'), (tests.id('player2'), 'Test Player B') $$,
  'admin creates players');
select lives_ok($$ insert into public.squads (id, team_id, season_id) values (tests.id('squad'), tests.id('team'), '30000000-0000-4000-8000-000000000001') $$,
  'admin creates squad');
select lives_ok($$ insert into public.squad_players (squad_id, player_id, shirt_number, position, is_captain)
  values (tests.id('squad'), tests.id('player'), 1, 'GK', true) $$, 'admin adds captain goalkeeper');
select throws_ok($$ insert into public.squad_players (squad_id, player_id, shirt_number) values (tests.id('squad'), tests.id('player2'), 1) $$,
  '23505', null, 'duplicate shirt number rejected');
select throws_ok($$ insert into public.squad_players (squad_id, player_id, shirt_number, is_captain) values (tests.id('squad'), tests.id('player2'), 2, true) $$,
  '23505', null, 'second captain rejected');

-- ── Fixtures ───────────────────────────────────────────────────────────────
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(3), tests.t(3), null, now()) $$,
  'EK422', null, 'same team home and away rejected');
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(3), tests.id('team'), null, now()) $$,
  'EK422', null, 'team not entered in competition rejected');
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', gen_random_uuid(), '', tests.t(3), tests.t(4), null, now()) $$,
  'EK422', null, 'group outside the stage rejected');
select throws_ok($$ select public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(3), tests.t(4), null, null) $$,
  'EK422', null, 'missing kick-off rejected');
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', null, 'Test MD',
  tests.t(3), tests.t(4), '50000000-0000-4000-8000-000000000001', now() + interval '1 hour') where k = 'fx';
select is((select status::text from public.matches where id = tests.id('fx')), 'SCHEDULED', 'admin creates a valid fixture');
select ok(exists (select 1 from public.audit_log where action = 'FIXTURE_CREATED' and match_id = tests.id('fx')), 'fixture creation audited');
select lives_ok($$ select public.admin_update_fixture(tests.id('fx'), '61000000-0000-4000-8000-000000000001', null, 'Test MD2',
  tests.t(3), tests.t(4), '50000000-0000-4000-8000-000000000002', now() + interval '2 hours') $$, 'admin edits a scheduled fixture');

-- ── Operator assignments ───────────────────────────────────────────────────
select lives_ok($$ select public.admin_assign_operators(tests.id('fx'), (select op from u), (select op2 from u)) $$, 'assign primary + backup');
select throws_ok($$ insert into public.operator_assignments (match_id, user_id, role) values (tests.id('fx'), (select admin from u), 'PRIMARY') $$,
  '42501', null, 'no raw assignment writes from clients');
reset role;
select throws_ok($$ insert into public.operator_assignments (match_id, user_id, role) values (tests.id('fx'), (select admin from u), 'PRIMARY') $$,
  '23505', null, 'database rejects a second active primary');
select tests.login((select admin from u));
select lives_ok($$ select public.admin_assign_operators(tests.id('fx'), (select op2 from u), (select op from u)) $$, 'swap primary and backup');
select is((select count(*) from public.operator_assignments where match_id = tests.id('fx') and active and role = 'PRIMARY')::int, 1, 'still one active primary');
select is((select user_id from public.operator_assignments where match_id = tests.id('fx') and active and role = 'PRIMARY'), (select op2 from u), 'op2 is primary');
select throws_ok($$ select public.admin_assign_operators(tests.id('fx'), (select op from u), (select op from u)) $$,
  'EK422', null, 'primary and backup must differ');
select throws_ok($$ select public.admin_assign_operators(tests.id('fx'), (select nobody from u)) $$,
  'EK422', null, 'non-staff cannot be assigned');

select tests.login((select op2 from u));
select is((select role::text from public.operator_assignments where match_id = tests.id('fx') and user_id = auth.uid() and active), 'PRIMARY',
  'operator sees their assigned match');

-- ── Corrections through events ─────────────────────────────────────────────
select public.start_match(tests.id('fx'), tests.id('start'));
select public.record_event(tests.id('fx'), tests.id('g1'), 'GOAL', tests.t(3), 10, 0, tests.player(tests.t(3), 9));
select public.record_event(tests.id('fx'), tests.id('g2'), 'GOAL', tests.t(4), 20, 0, tests.player(tests.t(4), 9));
select throws_ok($$ select public.admin_void_event(tests.id('fx'), tests.id('g1'), 'x') $$, 'EK403', null, 'operator cannot use admin corrections');

select tests.login((select admin from u));
select throws_ok($$ select public.admin_void_event(tests.id('fx'), tests.id('g1'), '  ') $$, 'EK422', null, 'correction needs a reason');
select lives_ok($$ select public.admin_void_event(tests.id('fx'), tests.id('g1'), 'Goal was disallowed') $$, 'admin voids an event');
select is(tests.snap(tests.id('fx')) ->> 'home_score', '0', 'score re-derived after void');
select throws_ok($$ select public.admin_void_event(tests.id('fx'), tests.id('g1'), 'again') $$, 'EK409', null, 'cannot void twice');
select ok(exists (select 1 from public.audit_log where action = 'ADMIN_EVENT_VOIDED' and entity_id = tests.id('g1') and actor_id = (select admin from u)),
  'void is audited');
select throws_ok($$ select public.admin_add_event(tests.id('fx'), gen_random_uuid(), 'GOAL', tests.t(3), 1, 60, 0, null, null, 'late') $$,
  'EK422', null, 'minute outside the period rejected');
select lives_ok($$ select public.admin_add_event(tests.id('fx'), tests.id('add'), 'GOAL', tests.t(3), 1, 30, 0, tests.player(tests.t(3), 7), null, 'Missed by operator') $$,
  'admin adds a missing goal');
select public.admin_add_event(tests.id('fx'), tests.id('add'), 'GOAL', tests.t(3), 1, 30, 0, tests.player(tests.t(3), 7), null, 'Missed by operator');
select is((select count(*) from public.match_events where id = tests.id('add'))::int, 1, 'adding the same event twice is idempotent');
select is(tests.snap(tests.id('fx')) ->> 'home_score', '1', 'score includes the added goal');

-- Finish 1–1, then correct after full time: standings must follow.
select tests.login((select op2 from u));
select public.end_period(tests.id('fx'), tests.id('end1'));
select public.start_period(tests.id('fx'), tests.id('start2'));
select public.finalise_match(tests.id('fx'), tests.id('ft'), 1, 1);
select tests.login((select admin from u));
select is(tests.pts(tests.t(3)), 1, 'draw gives home 1 point');
select lives_ok($$ select public.admin_add_event(tests.id('fx'), gen_random_uuid(), 'GOAL', tests.t(3), 2, 80, 0, tests.player(tests.t(3), 9), null, 'Confirmed by referee report') $$,
  'admin adds a goal after full time');
select is(tests.pts(tests.t(3)), 3, 'standings recomputed: home now has 3 points');
select is(tests.pts(tests.t(4)), 0, 'standings recomputed: away now has 0 points');
select throws_ok($$ select public.admin_assign_operators(tests.id('fx'), (select op from u)) $$, 'EK409', null, 'no assignment changes after full time');

-- ── Postpone / reschedule / cancel / abandon ───────────────────────────────
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(1), tests.t(4), null, now() + interval '1 day') where k = 'fx2';
select throws_ok($$ select public.admin_set_match_outcome(tests.id('fx2'), 'POSTPONED', '') $$, 'EK422', null, 'postponing needs a reason');
select lives_ok($$ select public.admin_set_match_outcome(tests.id('fx2'), 'POSTPONED', 'Waterlogged pitch') $$, 'admin postpones');
select throws_ok($$ select public.admin_set_match_outcome(tests.id('fx2'), 'ABANDONED', 'x') $$, 'EK409', null, 'cannot abandon a match that never started');
select lives_ok($$ select public.admin_reschedule_match(tests.id('fx2'), now() + interval '8 days', 'New date agreed') $$, 'admin reschedules');
select is((select status::text from public.matches where id = tests.id('fx2')), 'SCHEDULED', 'rescheduled match is scheduled again');
select lives_ok($$ select public.admin_set_match_outcome(tests.id('fx2'), 'CANCELLED', 'Withdrawn') $$, 'admin cancels');
select throws_ok($$ select public.admin_update_fixture(tests.id('fx2'), null, null, '', tests.t(1), tests.t(4), null, now()) $$,
  'EK409', null, 'cancelled fixture cannot be edited');

update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, '', tests.t(2), tests.t(3), null, now()) where k = 'fx3';
select public.admin_assign_operators(tests.id('fx3'), (select op from u));
select tests.login((select op from u));
select public.start_match(tests.id('fx3'), tests.id('start3'));
select tests.login((select admin from u));
select is(jsonb_array_length(public.admin_live_matches()), 1, 'live monitor lists the live match');
select lives_ok($$ select public.admin_set_match_outcome(tests.id('fx3'), 'ABANDONED', 'Floodlight failure') $$, 'admin abandons a live match');
select ok(not (tests.snap(tests.id('fx3')) ->> 'clock_running')::boolean, 'abandoned match clock stopped');
select ok(public.admin_match_detail(tests.id('fx3')) ?& array['state','match','periods','assignments','audit'], 'match inspection returns full detail');

-- ── Staff roles and deactivation ───────────────────────────────────────────
select throws_ok($$ select public.admin_revoke_role(auth.uid(), 'ADMIN') $$, 'EK409', null, 'admin cannot remove own ADMIN role');
select throws_ok($$ select public.admin_set_staff_active(auth.uid(), false) $$, 'EK409', null, 'admin cannot deactivate self');
select lives_ok($$ select public.admin_grant_role((select nobody from u), 'MANAGER') $$, 'admin grants a role');
select ok(exists (select 1 from public.audit_log where action = 'ROLE_GRANTED' and entity_id = (select nobody from u)), 'role grant audited');
select lives_ok($$ select public.admin_set_staff_active((select op2 from u), false) $$, 'admin deactivates an operator');
select throws_ok($$ select public.admin_assign_operators(tests.id('fx2'), (select op2 from u)) $$, 'EK409', null, 'cancelled match cannot be reassigned');
select tests.login((select op2 from u));
select ok(not private.has_role('OPERATOR'), 'deactivated operator loses role access');

-- ── Audit log is immutable ─────────────────────────────────────────────────
select tests.login((select admin from u));
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'admin cannot delete audit entries');
reset role;
select throws_ok($$ update public.audit_log set action = 'X' $$, '42501', null, 'audit log is append-only even for the owner');

select * from finish();
rollback;
