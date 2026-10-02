begin;
\ir helpers.inc
select plan(77);

create temp table u as select
  tests.make_user('primary@test.local', array['OPERATOR']) as primary_op,
  tests.make_user('backup@test.local', array['OPERATOR']) as backup_op,
  tests.make_user('admin@test.local', array['ADMIN']) as admin;
grant select on u to authenticated;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), primary_op, 'PRIMARY'::public.assignment_role from u union all
select tests.m1(), backup_op, 'BACKUP' from u union all
select tests.m2(), primary_op, 'PRIMARY' from u;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['start','goal','og','pmiss','pen','yc','yc2','sy','sub','void','stop','pause','resume','ht','2h','goal2h','ft','takeover','late']);
grant select on ids to authenticated;

-- Helpers evaluated as the logged-in user.
create or replace function tests.state() returns jsonb language sql stable security definer set search_path = '' as $$
  select private.match_snapshot(tests.m1()) $$;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
grant execute on function tests.state(), tests.id(text) to authenticated;

select tests.login((select primary_op from u));

-- ── Illegal transitions before kick-off ────────────────────────────────────
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 1) $$, 'EK409', null, 'cannot record before kick-off');
select throws_ok($$ select public.end_period(tests.m1(), gen_random_uuid()) $$, 'EK409', null, 'cannot end a period before kick-off');
select throws_ok($$ select public.start_period(tests.m1(), gen_random_uuid()) $$, 'EK409', null, 'cannot start 2H before kick-off');

-- ── Start ──────────────────────────────────────────────────────────────────
select lives_ok($$ select public.start_match(tests.m1(), tests.id('start')) $$, 'assigned primary can start match');
select is(tests.state() ->> 'status', '1H', 'status is 1H');
select is((tests.state() ->> 'period_offset_seconds')::int, 0, '1H offset is 0');
select ok((tests.state() ->> 'clock_running')::boolean, 'clock running');
select is(tests.state() ->> 'active_operator_id', (select primary_op::text from u), 'starter is in control');
select lives_ok($$ select public.start_match(tests.m1(), tests.id('start')) $$, 'retrying start with same intent is safe');
select is((select count(*) from public.match_periods where match_id = tests.m1())::int, 1, 'retry did not create a second period');
select throws_ok($$ select public.start_match(tests.m1(), gen_random_uuid()) $$, 'EK409', null, 'starting again (new intent) is illegal');
select throws_ok($$ select public.end_period(tests.m1(), tests.id('start')) $$, 'EK422', null, 'reusing an intent id for another command is rejected');

-- ── Goals and scoring ──────────────────────────────────────────────────────
select lives_ok($$ select public.record_event(tests.m1(), tests.id('goal'), 'GOAL', tests.home(), 10, 0, tests.player(tests.home(), 9)) $$, 'home goal recorded');
select is((tests.state() ->> 'home_score')::int, 1, 'goal increments home score');
select is((tests.state() ->> 'away_score')::int, 0, 'away score unchanged');

-- Idempotency: the same event id sent 1, 2 and 10 times → one event, one goal.
select public.record_event(tests.m1(), tests.id('goal'), 'GOAL', tests.home(), 10, 0, tests.player(tests.home(), 9));
select is((select count(*) from public.match_events where id = tests.id('goal'))::int, 1, 'duplicate event id (x2) stored once');
select public.record_event(tests.m1(), tests.id('goal'), 'GOAL', tests.home(), 10, 0, tests.player(tests.home(), 9)) from generate_series(1, 8);
select is((select count(*) from public.match_events where match_id = tests.m1())::int, 1, 'duplicate event id (x10) stored once');
select is((tests.state() ->> 'home_score')::int, 1, 'duplicates did not change the score');
select ok((public.record_event(tests.m1(), tests.id('goal'), 'GOAL', tests.home(), 10) ->> 'replayed')::boolean, 'retry is reported as replayed');
select throws_ok($$ select public.record_event(tests.m2(), tests.id('goal'), 'GOAL', tests.home(), 10) $$, 'EK422', null, 'event id reused on another match is rejected');

-- Own goal by an AWAY player counts for HOME.
select lives_ok($$ select public.record_event(tests.m1(), tests.id('og'), 'OWN_GOAL', tests.away(), 20, 0, tests.player(tests.away(), 3)) $$, 'own goal recorded');
select is((tests.state() ->> 'home_score')::int, 2, 'own goal by away player credits home');
select is((tests.state() ->> 'away_score')::int, 0, 'own goal does not credit the player''s team');

select lives_ok($$ select public.record_event(tests.m1(), tests.id('pmiss'), 'PENALTY_MISS', tests.away(), 22, 0, tests.player(tests.away(), 10)) $$, 'penalty miss recorded');
select is((tests.state() ->> 'away_score')::int, 0, 'penalty miss does not change the score');
select lives_ok($$ select public.record_event(tests.m1(), tests.id('pen'), 'PENALTY_GOAL', tests.away(), 25, 0, tests.player(tests.away(), 10)) $$, 'penalty goal recorded');
select is((tests.state() ->> 'away_score')::int, 1, 'penalty goal increments away');

-- ── Validation ─────────────────────────────────────────────────────────────
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', '70000000-0000-4000-8000-000000000003', 26) $$, 'EK422', null, 'team not in match rejected');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 26, 0, tests.player(tests.away(), 9)) $$, 'EK422', null, 'player from the other squad rejected');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 60) $$, 'EK422', null, '1H minute 60 rejected');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.home(), 26) $$, 'EK422', null, 'card without a player rejected');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'NOT_A_TYPE', tests.home(), 26) $$, 'EK422', null, 'unknown event type rejected');

-- Second yellow rules.
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'SECOND_YELLOW', tests.home(), 27, 0, tests.player(tests.home(), 4)) $$, 'EK422', null, 'second yellow without a first rejected');
select lives_ok($$ select public.record_event(tests.m1(), tests.id('yc'), 'YELLOW_CARD', tests.home(), 28, 0, tests.player(tests.home(), 4)) $$, 'yellow recorded');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.home(), 29, 0, tests.player(tests.home(), 4)) $$, 'EK422', null, 'second plain yellow rejected');
select lives_ok($$ select public.record_event(tests.m1(), tests.id('sy'), 'SECOND_YELLOW', tests.home(), 30, 0, tests.player(tests.home(), 4)) $$, 'second yellow recorded');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 31, 0, tests.player(tests.home(), 4)) $$, 'EK422', null, 'sent-off player cannot score');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'SUBSTITUTION', tests.home(), 31, 0, tests.player(tests.home(), 4), tests.player(tests.home(), 15)) $$, 'EK422', null, 'sent-off player cannot be substituted');

-- Substitution rules.
select lives_ok($$ select public.record_event(tests.m1(), tests.id('sub'), 'SUBSTITUTION', tests.home(), 32, 0, tests.player(tests.home(), 7), tests.player(tests.home(), 14)) $$, 'substitution recorded');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'SUBSTITUTION', tests.home(), 33, 0, tests.player(tests.home(), 8), tests.player(tests.home(), 7)) $$, 'EK422', null, 'subbed-off player cannot return');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'SUBSTITUTION', tests.home(), 33, 0, tests.player(tests.home(), 8), tests.player(tests.home(), 14)) $$, 'EK422', null, 'player already on cannot come on again');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'SUBSTITUTION', tests.home(), 33, 0, tests.player(tests.home(), 8), tests.player(tests.home(), 8)) $$, 'EK422', null, 'same player on and off rejected');

-- ── Void recomputes score ──────────────────────────────────────────────────
select lives_ok($$ select public.void_event(tests.m1(), tests.id('void'), tests.id('pen'), 'Recorded in error') $$, 'goal voided');
select is((tests.state() ->> 'away_score')::int, 0, 'voiding the penalty goal recomputes away score');
select is((select count(*) from public.match_events where match_id = tests.m1())::int, 7, 'voided event is kept, not deleted');
select lives_ok($$ select public.void_event(tests.m1(), tests.id('void'), tests.id('pen'), 'Recorded in error') $$, 'void retry with same intent is safe');
select throws_ok($$ select public.void_event(tests.m1(), gen_random_uuid(), tests.id('pen'), 'again') $$, 'EK409', null, 'already-voided event cannot be voided again');

-- ── Sequences strictly increase ────────────────────────────────────────────
select is((select count(distinct seq) = count(*) from public.match_events where match_id = tests.m1()), true, 'event seqs are unique');

-- ── Stoppage / pause / resume ──────────────────────────────────────────────
select lives_ok($$ select public.set_stoppage(tests.m1(), tests.id('stop'), 3) $$, 'stoppage set');
select is((tests.state() ->> 'stoppage_seconds')::int, 180, 'stoppage stored in seconds');
select is((tests.state() ->> 'period_started_at')::timestamptz, (select started_at from public.match_periods where match_id = tests.m1() and period = 1), 'stoppage does not touch the clock start');
select lives_ok($$ select public.pause_match(tests.m1(), tests.id('pause'), 'INJURY') $$, 'paused');
select ok(tests.state() ->> 'paused_at' is not null, 'paused_at set');
select throws_ok($$ select public.pause_match(tests.m1(), gen_random_uuid(), 'INJURY') $$, 'EK409', null, 'cannot pause twice');
reset role;
update public.matches set paused_at = now() - interval '2 minutes' where id = tests.m1(); -- simulate elapsed pause
select tests.login((select primary_op from u));
select lives_ok($$ select public.resume_match(tests.m1(), tests.id('resume')) $$, 'resumed');
select is((tests.state() ->> 'accumulated_pause_seconds')::numeric, 120.000, 'pause time accumulated exactly');
select ok(tests.state() ->> 'paused_at' is null and (tests.state() ->> 'clock_running')::boolean, 'clock running again, not paused');

-- ── Half-time ──────────────────────────────────────────────────────────────
select lives_ok($$ select public.end_period(tests.m1(), tests.id('ht')) $$, 'first half ended');
select ok(tests.state() ->> 'status' = 'HT' and not (tests.state() ->> 'clock_running')::boolean and tests.state() ->> 'period_ended_at' is not null, 'HT freezes the clock');
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 45) $$, 'EK409', null, 'events rejected during HT');
select throws_ok($$ select public.finalise_match(tests.m1(), gen_random_uuid(), 2, 0) $$, 'EK409', null, 'cannot finish from HT');

-- ── Backup takeover ────────────────────────────────────────────────────────
reset role;
select tests.login((select backup_op from u));
select throws_ok($$ select public.start_period(tests.m1(), gen_random_uuid()) $$, 'EK403', null, 'backup cannot act while primary is in control');
select lives_ok($$ select public.take_over_match(tests.m1(), tests.id('takeover')) $$, 'backup takes over');
select lives_ok($$ select public.start_period(tests.m1(), tests.id('2h')) $$, 'backup starts second half');
select is((tests.state() ->> 'period_offset_seconds')::int, 2700, 'second half uses 45-minute offset');
select is((tests.state() ->> 'accumulated_pause_seconds')::numeric, 0::numeric, 'second half resets pause accumulator');
reset role;
select tests.login((select primary_op from u));
select throws_ok($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 50) $$, 'EK403', null, 'previous operator loses control after takeover');
reset role;

-- ── Second half goal + full-time ───────────────────────────────────────────
select tests.login((select backup_op from u));
select lives_ok($$ select public.record_event(tests.m1(), tests.id('goal2h'), 'GOAL', tests.away(), 67, 0, tests.player(tests.away(), 9)) $$, '2H goal');
select throws_ok($$ select public.finalise_match(tests.m1(), gen_random_uuid(), 2, 0) $$, 'EK409', null, 'finalise with a stale score is rejected');
select lives_ok($$ select public.finalise_match(tests.m1(), tests.id('ft'), 2, 1) $$, 'match finalised with confirmed score');
select is(tests.state() ->> 'status', 'FT', 'status FT');
select throws_ok($$ select public.record_event(tests.m1(), tests.id('late'), 'GOAL', tests.home(), 90) $$, 'EK409', null, 'events rejected after FT');
select throws_ok($$ select public.void_event(tests.m1(), gen_random_uuid(), tests.id('goal'), 'x') $$, 'EK409', null, 'voids rejected after FT');
reset role;

-- ── Audit + standings ──────────────────────────────────────────────────────
select is(
  (select array_agg(distinct action order by action) from public.audit_log where match_id = tests.m1()),
  array['EVENT_RECORDED','EVENT_VOIDED','MATCH_FINALISED','MATCH_STARTED','OPERATOR_TAKEOVER','PAUSED','PERIOD_ENDED','PERIOD_STARTED','RESUMED','STOPPAGE_SET'],
  'every kind of write was audited');
select ok((select bool_and(actor_id is not null and before_state is not null or action = 'EVENT_RECORDED')
           from public.audit_log where match_id = tests.m1()), 'audit rows carry actor and before-state');
select results_eq(
  $$ select played::int, wins::int, draws::int, losses::int, goals_for::int, goals_against::int, points::int, rank::int
     from public.standings where team_id = tests.home() and competition_id = (select competition_id from public.matches where id = tests.m1()) $$,
  $$ values (1, 1, 0, 0, 2, 1, 3, 1) $$,
  'standings recomputed at FT using competition points (home)');
select results_eq(
  $$ select played::int, losses::int, points::int, goal_difference::int from public.standings where team_id = tests.away() and competition_id = (select competition_id from public.matches where id = tests.m1()) $$,
  $$ values (1, 1, 0, -1) $$,
  'standings recomputed at FT (away)');

select * from finish();
rollback;
