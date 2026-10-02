-- Extra-time notifications: ET1/ET2 goals (incl. own goals) use the normal
-- GOAL pipeline with the right football minute; voiding one uses the existing
-- cancel / SCORE_CORRECTION path; shoot-out kicks never alert as goals and
-- never count as player goals; retries never duplicate an intent.
begin;
\ir helpers.inc
select no_plan();

-- Outbox triggers fire at COMMIT; inside this rolled-back test, per statement.
set constraints all immediate;

create temp table u as select tests.make_user('op13@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated, service_role;
grant usage on schema tests to service_role;
grant select on tests.fixture to service_role;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), op, 'PRIMARY'::public.assignment_role from u;

-- m1 becomes a final (knockout stage: extra time + penalties when level).
insert into public.competition_stages (competition_id, name, stage_order, stage_type, has_table, extra_time_allowed, penalties_allowed)
values ('60000000-0000-4000-8000-000000000001', 'ET test final', 99, 'FINAL', false, true, true);
update public.matches set stage_id = (select id from public.competition_stages where name = 'ET test final') where id = tests.m1();

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['et1', 'og', 'et2', 'late', 'void']);
grant select on ids to anon, authenticated, service_role;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;

create temp table dev (k text primary key, token text);
grant select, insert on dev to anon, authenticated, service_role;
create or replace function tests.tok(p text) returns text language sql stable as $$ select token from dev where k = p $$;
create or replace function tests.dispatch() returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('role', 'service_role', true);
  r := public.service_notification_claim(500);
  perform public.service_notification_report(coalesce((select jsonb_agg(jsonb_build_object('id', x ->> 'id', 'result', 'SENT', 'code', 201))
    from jsonb_array_elements(r) x), '[]'::jsonb));
  perform set_config('role', 'postgres', true);
  return r;
end $$;
create or replace function tests.n(p_type text) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_outbox where notification_type = p_type and match_id = tests.m1() $$;
create or replace function tests.goal(p_key text) returns public.notification_outbox language sql stable security definer set search_path = '' as $$
  select * from public.notification_outbox where event_key = 'EVT:' || tests.id(p_key) $$;
create or replace function tests.op(p_sql text) returns void language plpgsql as $$
begin
  perform tests.login((select op from u));
  execute p_sql;
  reset role;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- One device following the match.
set local role service_role;
insert into dev (k, token) values ('d1', public.service_notify_register('android', false, null) ->> 'token');
select public.service_notify_set_subscription(tests.tok('d1'), 'https://push.example.test/send/d1', rpad('Bd1', 87, 'x'), rpad('ad1', 22, 'y'), 'android', false, null);
select public.service_notify_set_match(tests.tok('d1'), tests.m1(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'HALF_TIME', 'FULL_TIME'], null);
reset role;

-- ── Regulation: level → extra time ─────────────────────────────────────────
select tests.op($$ select public.start_match(tests.m1(), gen_random_uuid()) $$);
select tests.op($$ select public.end_period(tests.m1(), gen_random_uuid()) $$);
select tests.op($$ select public.start_period(tests.m1(), gen_random_uuid()) $$);
select tests.op($$ select public.end_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'ET_BREAK', 'level after 90: extra-time break');
select tests.op($$ select public.start_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'ET1', 'extra time first half');
select tests.dispatch();   -- kick-off / half-time alerts out of the way

-- ── ET1 goal ───────────────────────────────────────────────────────────────
select tests.op($$ select public.record_event(tests.m1(), tests.id('et1'), 'GOAL', tests.home(), 105, 1, tests.player(tests.home(), 9)) $$);
select is(tests.n('GOAL'), 1, 'ET1 goal queues exactly one goal alert');
select is((tests.goal('et1')).payload ->> 'title', 'GOAL ⚽', 'normal GOAL title');
select ok((tests.goal('et1')).payload ->> 'body' like '%1–0%' and (tests.goal('et1')).payload ->> 'body' like '%105+1''%',
  'ET1 alert shows the score at the goal and 105+1''');
select tests.op($$ select public.record_event(tests.m1(), tests.id('et1'), 'GOAL', tests.home(), 105, 1, tests.player(tests.home(), 9)) $$);
select is(tests.n('GOAL'), 1, 'retrying the ET1 goal does not duplicate the alert');
select is((select count(*)::int from public.match_events where id = tests.id('et1')), 1, 'retry stores no second event');
select ok(jsonb_array_length(tests.dispatch()) = 1, 'the ET1 goal is delivered once');

-- ── ET2: own goal, goal, voided goals ──────────────────────────────────────
select tests.op($$ select public.end_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'ET_BREAK', 'extra-time half-time');
select tests.op($$ select public.start_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'ET2', 'extra time second half');

select tests.op($$ select public.record_event(tests.m1(), tests.id('og'), 'OWN_GOAL', tests.home(), 112, 0, tests.player(tests.home(), 4)) $$);
select is(tests.n('GOAL'), 2, 'ET own goal queues one goal alert');
select is((tests.goal('og')).payload ->> 'title', 'OWN GOAL ⚽', 'own-goal title');
select ok((tests.goal('og')).payload ->> 'body' like '%1–1%' and (tests.goal('og')).payload ->> 'body' like '%112''%',
  'own goal credited to the opponent at 112''');
select is((select home_score || '-' || away_score from public.matches where id = tests.m1()), '1-1', 'own goal scores for the away side');

select tests.op($$ select public.record_event(tests.m1(), tests.id('et2'), 'GOAL', tests.away(), 118, 0, tests.player(tests.away(), 9)) $$);
select is(tests.n('GOAL'), 3, 'ET2 goal queues exactly one goal alert');
select ok((tests.goal('et2')).payload ->> 'body' like '%1–2%' and (tests.goal('et2')).payload ->> 'body' like '%118''%', 'ET2 alert at 118''');
select tests.op($$ select public.record_event(tests.m1(), tests.id('et2'), 'GOAL', tests.away(), 118, 0, tests.player(tests.away(), 9)) $$);
select is(tests.n('GOAL'), 3, 'retrying the ET2 goal does not duplicate the alert');
select ok(jsonb_array_length(tests.dispatch()) = 2, 'own goal and ET2 goal delivered');

-- A delivered ET goal is voided: the existing SCORE_CORRECTION goes to the devices that saw it.
select tests.op($$ select public.void_event(tests.m1(), tests.id('void'), tests.id('et2'), 'Offside') $$);
select is(tests.n('SCORE_CORRECTION'), 1, 'voiding a delivered ET goal queues one score correction');
select is((select corrects_outbox_id from public.notification_outbox where event_key = 'VOID:' || tests.id('et2')), (tests.goal('et2')).id,
  'the correction targets the voided goal alert');
select ok((select payload ->> 'body' from public.notification_outbox where event_key = 'VOID:' || tests.id('et2')) like '%1–1%',
  'the correction shows the corrected score');
select tests.op($$ select public.void_event(tests.m1(), tests.id('void'), tests.id('et2'), 'Offside') $$);
select is(tests.n('SCORE_CORRECTION'), 1, 'retrying the void does not duplicate the correction');
select ok(jsonb_array_length(tests.dispatch()) = 1, 'the correction is delivered once');
select is((select d.status from public.notification_deliveries d join public.notification_outbox o on o.id = d.outbox_id
  where o.event_key = 'VOID:' || tests.id('et2')), 'SENT', 'correction sent to the device that saw the goal');

-- A not-yet-delivered ET goal is voided: the alert is simply never sent.
select tests.op($$ select public.record_event(tests.m1(), tests.id('late'), 'GOAL', tests.away(), 120, 2, tests.player(tests.away(), 9)) $$);
select ok((tests.goal('late')).payload ->> 'body' like '%120+2''%', 'stoppage time in ET2 shows 120+2''');
select tests.op($$ select public.void_event(tests.m1(), gen_random_uuid(), tests.id('late'), 'Handball') $$);
select is((tests.goal('late')).status, 'CANCELLED', 'undelivered voided ET goal is cancelled');
select is(tests.n('SCORE_CORRECTION'), 1, 'no correction for a goal nobody received');

-- ── Penalties: kicks are not goals ─────────────────────────────────────────
select tests.op($$ select public.end_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'PENS', 'level after extra time: penalties');
select tests.op(format($$ select public.record_shootout_attempt(tests.m1(), gen_random_uuid(), %L, %L, %L) $$, team, player, outcome))
from (values (1, tests.home(), tests.player(tests.home(), 7), 'SCORED'), (2, tests.away(), tests.player(tests.away(), 7), 'MISSED'),
             (3, tests.home(), tests.player(tests.home(), 8), 'SCORED'), (4, tests.away(), tests.player(tests.away(), 8), 'SAVED'),
             (5, tests.home(), tests.player(tests.home(), 11), 'SCORED'), (6, tests.away(), tests.player(tests.away(), 11), 'MISSED')) k(n, team, player, outcome)
order by n;
select is((select home_pens || '-' || away_pens from public.matches where id = tests.m1()), '3-0', 'shoot-out recorded');
select is(tests.n('GOAL'), 4, 'scored shoot-out kicks queue no GOAL notification');
select is((select count(*)::int from public.notification_outbox where match_id = tests.m1() and source_event_id is null
  and notification_type not in ('KICKOFF', 'HALF_TIME', 'SECOND_HALF')), 0, 'no other alert came from the kicks');
select is((select home_score || '-' || away_score from public.matches where id = tests.m1()), '1-1', 'kicks never change the score');
select is((select count(*)::int from jsonb_array_elements(private.scorers_json('60000000-0000-4000-8000-000000000001', 100)) x
  where (x ->> 'player_id')::uuid in (tests.player(tests.home(), 7), tests.player(tests.home(), 8), tests.player(tests.home(), 11))), 0,
  'shoot-out takers get no player goals');
select is((select (x ->> 'goals')::int from jsonb_array_elements(private.scorers_json('60000000-0000-4000-8000-000000000001', 100)) x
  where (x ->> 'player_id')::uuid = tests.player(tests.home(), 9)), 1, 'the ET1 scorer has exactly one goal');
select is((select count(*)::int from jsonb_array_elements(private.scorers_json('60000000-0000-4000-8000-000000000001', 100)) x
  where (x ->> 'player_id')::uuid = tests.player(tests.home(), 4)), 0, 'an own goal is not a player goal');

-- ── Full-time states how it was decided ────────────────────────────────────
select tests.op($$ select public.finalise_match(tests.m1(), gen_random_uuid(), 1, 1) $$);
select is((select status::text from public.matches where id = tests.m1()), 'FT', 'finalised');
select is(tests.n('FULL_TIME'), 1, 'one full-time alert');
select ok((select payload ->> 'body' from public.notification_outbox where match_id = tests.m1() and notification_type = 'FULL_TIME')
  like '%1–1%win 3–0 on penalties%', 'full-time alert: score, then the shoot-out result');
select is(tests.n('GOAL'), 4, 'no further goal alerts');

select * from finish();
rollback;
