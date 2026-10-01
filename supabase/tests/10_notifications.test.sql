begin;
\ir helpers.inc
select plan(86);

-- Deferred (at-commit) outbox triggers fire per statement inside this rolled-back test.
set constraints all immediate;

create temp table u as select
  tests.make_user('admin10@test.local', array['ADMIN']) as admin,
  tests.make_user('op10@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated, service_role;
grant usage on schema tests to service_role;
grant select on tests.fixture to service_role;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), op, 'PRIMARY'::public.assignment_role from u union all
select tests.m2(), op, 'PRIMARY' from u;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['start', 'g1', 'yc', 'sub', 'rc', 'ht', '2h', 'g2', 'ft', 'start2', 'demo', 'draftc', 'draftm', 'privc']);
grant select, update on ids to anon, authenticated, service_role;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;

-- Anonymous devices (tokens as the Next.js server would hold them in httpOnly cookies).
create temp table dev (k text primary key, token text);
grant select, insert, update on dev to anon, authenticated, service_role;
create or replace function tests.tok(p text) returns text language sql stable as $$ select token from dev where k = p $$;
create or replace function tests.dev_id(p text) returns uuid language sql stable security definer set search_path = '' as $$
  select d.id from public.notification_devices d, dev where dev.k = p and d.token_hash = encode(extensions.digest(dev.token, 'sha256'), 'hex') $$;
create or replace function tests.sub(p text) returns void language sql as $$
  select public.service_notify_set_subscription(tests.tok(p), 'https://push.example.test/send/' || p || '-' || md5(p),
    rpad('B' || md5(p), 87, 'x'), rpad('a' || left(md5(p), 21), 22, 'y'), 'android', false, null) $$;
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
-- Who received a notification of this type for this match (device labels, sorted).
create or replace function tests.got(p_type text, p_match uuid default null) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(dev.k, ',' order by dev.k), '')
  from public.notification_deliveries d join public.notification_outbox o on o.id = d.outbox_id
  join public.notification_devices nd on nd.id = d.device_id
  join dev on nd.token_hash = encode(extensions.digest(dev.token, 'sha256'), 'hex')
  where o.notification_type = p_type and o.match_id = coalesce(p_match, tests.m1()) and d.status = 'SENT' $$;
create or replace function tests.outbox(p_type text, p_match uuid default null) returns public.notification_outbox language sql stable security definer set search_path = '' as $$
  select * from public.notification_outbox where notification_type = p_type and match_id = coalesce(p_match, tests.m1()) order by created_at desc limit 1 $$;
create or replace function tests.n_outbox(p_type text, p_match uuid default null) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_outbox where notification_type = p_type and match_id = coalesce(p_match, tests.m1()) $$;
create or replace function tests.n_deliveries() returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_deliveries $$;
create or replace function tests.state() returns jsonb language sql stable security definer set search_path = '' as $$
  select private.match_snapshot(tests.m1()) $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ── Anonymous device registration ──────────────────────────────────────────
set local role service_role;
insert into dev (k, token) select k, public.service_notify_register('android', false, null) ->> 'token'
from unnest(array['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']) k;
reset role;
select ok((select bool_and(token ~ '^[A-Za-z0-9_-]{43}$') from dev), 'devices get an opaque 256-bit server-generated token');
select is((select count(*)::int from public.notification_devices nd join dev on nd.token_hash = encode(extensions.digest(dev.token, 'sha256'), 'hex')), 8,
  'only the token hash is stored');
select is((select count(*)::int from public.notification_devices nd join dev on nd.token_hash = dev.token), 0, 'the raw token is never stored');
set local role service_role;
select throws_ok($$ select public.service_notify_state('not-a-real-token-but-long-enough-to-match-xxxxx') $$, 'EK401', null, 'an unknown token is refused');
select throws_ok($$ select public.service_notify_state(null) $$, 'EK401', null, 'a missing token is refused');
reset role;

-- ── Nothing is publicly readable or callable ───────────────────────────────
select tests.login_anon();
select throws_ok($$ select count(*) from public.notification_devices $$, '42501', null, 'anon cannot enumerate devices');
select throws_ok($$ select endpoint, p256dh, auth from public.push_subscriptions $$, '42501', null, 'anon cannot read push endpoints or keys');
select throws_ok($$ select count(*) from public.match_notification_preferences $$, '42501', null, 'anon cannot read match follows');
select throws_ok($$ select count(*) from public.team_notification_preferences $$, '42501', null, 'anon cannot read team follows');
select throws_ok($$ select count(*) from public.notification_outbox $$, '42501', null, 'anon cannot read the outbox');
select throws_ok($$ select public.service_notify_register('ios', false, null) $$, '42501', null, 'anon cannot register directly (server only)');
select throws_ok($$ select public.service_notification_claim(10) $$, '42501', null, 'anon cannot claim deliveries');
select throws_ok($$ insert into public.notification_outbox (event_key, match_id, notification_type, payload)
  values ('x', tests.m1(), 'GOAL', '{"title":"FAKE"}') $$, '42501', null, 'anon cannot write notification content');
select tests.login((select admin from u));
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'even admins cannot read push subscriptions directly');
select throws_ok($$ select public.service_notify_state(tests.tok('d1')) $$, '42501', null, 'signed-in users cannot call device functions directly');
reset role;

-- ── Follows and preferences ────────────────────────────────────────────────
set local role service_role;
select tests.sub(k) from unnest(array['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd8']) k;   -- d7 never enables push
-- d1: follows the match (recommended defaults)
select public.service_notify_set_match(tests.tok('d1'), tests.m1(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'HALF_TIME', 'FULL_TIME', 'STATUS'], null);
-- d2: follows the home team (team defaults)
select public.service_notify_set_team(tests.tok('d2'), tests.home(), true, array['REMINDER', 'KICKOFF', 'GOAL', 'RED_CARD', 'FULL_TIME', 'STATUS'], null);
-- d3: follows the home team AND the match (match adds yellows + 2nd half)
select public.service_notify_set_team(tests.tok('d3'), tests.home(), true, array['GOAL'], null);
select public.service_notify_set_match(tests.tok('d3'), tests.m1(), true, array['KICKOFF', 'GOAL', 'YELLOW_CARD', 'RED_CARD', 'HALF_TIME', 'SECOND_HALF', 'FULL_TIME'], null);
-- d4: follows BOTH teams
select public.service_notify_set_team(tests.tok('d4'), tests.home(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'FULL_TIME'], null);
select public.service_notify_set_team(tests.tok('d4'), tests.away(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'FULL_TIME'], null);
-- d5: follows an unrelated team
select public.service_notify_set_team(tests.tok('d5'), '70000000-0000-4000-8000-000000000003', true, array['KICKOFF', 'GOAL', 'FULL_TIME'], null);
-- d6: follows the home team but MUTES this match
select public.service_notify_set_team(tests.tok('d6'), tests.home(), true, array['KICKOFF', 'GOAL', 'FULL_TIME'], null);
select public.service_notify_set_match(tests.tok('d6'), tests.m1(), false, array['GOAL'], null);
-- d7: follows the match but has no push subscription
select public.service_notify_set_match(tests.tok('d7'), tests.m1(), true, array['GOAL'], null);
-- d8: follows the match, later disables everything
select public.service_notify_set_match(tests.tok('d8'), tests.m1(), true, array['KICKOFF', 'GOAL', 'FULL_TIME'], null);

select throws_ok($$ select public.service_notify_set_match(tests.tok('d1'), tests.m1(), true, array['GOAL', 'SUBSTITUTION'], null) $$,
  'EK422', null, 'unknown event types are refused');
select throws_ok($$ select public.service_notify_set_match(tests.tok('d1'), gen_random_uuid(), true, array['GOAL'], null) $$,
  'EK404', null, 'a match that does not exist is refused');
select throws_ok($$ select public.service_notify_set_team(tests.tok('d1'), gen_random_uuid(), true, array['GOAL'], null) $$,
  'EK404', null, 'a team that does not exist is refused');
select is(jsonb_array_length(public.service_notify_state(tests.tok('d3')) -> 'matches'), 1, 'match follow persists');
select is(public.service_notify_state(tests.tok('d3')) -> 'teams' -> 0 ->> 'team_id', tests.home()::text, 'team follow persists');
select ok((public.service_notify_state(tests.tok('d1')) ->> 'push_enabled')::boolean, 'push enabled after saving a subscription');
select ok(not (public.service_notify_state(tests.tok('d7')) ->> 'push_enabled')::boolean, 'no subscription → push not enabled');
select is(public.service_notify_state(tests.tok('d5')) -> 'matches', '[]'::jsonb, 'one device never sees another device''s follows');
-- toggle + unfollow
select public.service_notify_set_team(tests.tok('d5'), tests.away(), true, array['GOAL'], null);
select public.service_notify_remove_team(tests.tok('d5'), tests.away(), null);
select is(jsonb_array_length(public.service_notify_state(tests.tok('d5')) -> 'teams'), 1, 'unfollow removes only that team');
select public.service_notify_set_match(tests.tok('d1'), tests.m1(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'HALF_TIME', 'FULL_TIME', 'STATUS', 'YELLOW_CARD'], null);
select public.service_notify_set_match(tests.tok('d1'), tests.m1(), true, array['KICKOFF', 'GOAL', 'RED_CARD', 'HALF_TIME', 'FULL_TIME', 'STATUS'], null);
select is(public.service_notify_state(tests.tok('d1')) -> 'matches' -> 0 -> 'events',
  '["FULL_TIME", "GOAL", "HALF_TIME", "KICKOFF", "RED_CARD", "STATUS"]'::jsonb, 'event toggles are saved (yellow switched on then off)');
reset role;

-- ── Live match through the real operator RPCs ──────────────────────────────
select tests.login((select op from u));
select lives_ok($$ select public.start_match(tests.m1(), tests.id('start')) $$, 'kick-off (match RPC still works with outbox triggers)');
select is(tests.n_outbox('KICKOFF'), 1, 'kick-off intent written in the same transaction');
select tests.dispatch();
select is(tests.got('KICKOFF'), 'd1,d2,d3,d4,d8', 'kick-off → match followers + team followers; muted (d6), unrelated (d5), no-subscription (d7) excluded');

select tests.login((select op from u));
select lives_ok($$ select public.record_event(tests.m1(), tests.id('g1'), 'GOAL', tests.home(), 12, 0, tests.player(tests.home(), 9)) $$, 'goal');
select tests.dispatch();
select is(tests.got('GOAL'), 'd1,d2,d3,d4,d8', 'goal → one delivery per device (d3 match+team, d4 both teams: no duplicates)');
select is((tests.outbox('GOAL')).payload ->> 'title', 'GOAL ⚽', 'goal title');
select is((tests.outbox('GOAL')).payload ->> 'body', E'DEV Science 1–0 DEV Engineering\n12''', 'score from canonical state; unknown scorer omitted gracefully');
select is((tests.outbox('GOAL')).payload ->> 'url', '/matches/' || tests.m1(), 'tapping opens the match');
select ok((tests.outbox('GOAL')).payload::text !~* '(not recorded|null|student|matric)', 'no placeholder text or private data in content');

-- Retries / replays never duplicate.
select tests.login((select op from u));
select public.record_event(tests.m1(), tests.id('g1'), 'GOAL', tests.home(), 12, 0, tests.player(tests.home(), 9));
reset role;
select is(tests.n_outbox('GOAL'), 1, 'a replayed goal command does not create a second intent');
select is(private.notification_enqueue('EVT:' || tests.id('g1'), tests.m1(), 'GOAL', tests.id('g1')), null, 'enqueueing the same event again is a no-op');
create temp table before_d as select tests.n_deliveries() as n;
select tests.dispatch(); select tests.dispatch();
select is(tests.n_deliveries(), (select n from before_d), 're-running the dispatcher creates no new deliveries');

select tests.login((select op from u));
select lives_ok($$ select public.record_event(tests.m1(), tests.id('yc'), 'YELLOW_CARD', tests.away(), 20, 0, tests.player(tests.away(), 4)) $$, 'yellow card');
select lives_ok($$ select public.record_event(tests.m1(), tests.id('sub'), 'SUBSTITUTION', tests.home(), 25, 0, tests.player(tests.home(), 7), tests.player(tests.home(), 14)) $$, 'substitution');
select tests.dispatch();
select is(tests.got('YELLOW_CARD'), 'd3', 'yellow card → only the device that enabled yellows');
select is((select count(*)::int from public.notification_outbox where source_event_id = tests.id('sub')), 0, 'substitutions never push');
select tests.login((select op from u));
select lives_ok($$ select public.record_event(tests.m1(), tests.id('rc'), 'RED_CARD', tests.away(), 30, 0, tests.player(tests.away(), 6)) $$, 'red card');
select tests.dispatch();
select is(tests.got('RED_CARD'), 'd1,d2,d3,d4', 'red card → devices with red cards on (d8 did not choose them)');
select tests.login((select op from u));
select lives_ok($$ select public.end_period(tests.m1(), tests.id('ht')) $$, 'half-time');
select tests.dispatch();
select is(tests.got('HALF_TIME'), 'd1,d3', 'half-time → only devices that chose it');
select tests.login((select op from u));
select lives_ok($$ select public.start_period(tests.m1(), tests.id('2h')) $$, 'second half');
select tests.dispatch();
select is(tests.got('SECOND_HALF'), 'd3', 'second half → only the device that chose it');

-- ── Void / correction ──────────────────────────────────────────────────────
select tests.login((select op from u));
select lives_ok($$ select public.void_event(tests.m1(), gen_random_uuid(), tests.id('g1'), 'TEST: goal disallowed') $$, 'the delivered goal is voided');
reset role;
select is((tests.outbox('SCORE_CORRECTION')).payload ->> 'body', E'DEV Science 0–0 DEV Engineering\nThe previous goal has been removed',
  'a score correction is queued with the canonical score');
select tests.dispatch();
select is(tests.got('SCORE_CORRECTION'), 'd1,d2,d3,d4,d8', 'the correction goes exactly to devices that received the goal');
select is((tests.outbox('SCORE_CORRECTION')).payload ->> 'tag', (select payload ->> 'tag' from public.notification_outbox where event_key = 'EVT:' || tests.id('g1')),
  'the correction replaces the goal notification on the device (same tag)');
select is(tests.n_outbox('GOAL'), 1, 'the voided goal is never re-sent');
-- A goal voided before anything was sent: silently dropped, no correction.
select tests.login((select op from u));
select public.record_event(tests.m1(), tests.id('g2'), 'GOAL', tests.home(), 60);
select public.void_event(tests.m1(), gen_random_uuid(), tests.id('g2'), 'TEST: recorded by mistake');
reset role;
select tests.dispatch();
select is((select status from public.notification_outbox where event_key = 'EVT:' || tests.id('g2')), 'CANCELLED', 'an unsent voided goal is cancelled');
select is(tests.n_outbox('SCORE_CORRECTION'), 1, 'and needs no correction');

-- ── Expired subscriptions and retries ──────────────────────────────────────
select tests.login((select op from u));
select lives_ok($$ select public.finalise_match(tests.m1(), tests.id('ft'), 0, 0) $$, 'full time');
reset role;
set local role service_role;
create temp table claimed as select value as d from jsonb_array_elements(public.service_notification_claim(500));
grant select on claimed to service_role;
select is((select count(*)::int from claimed), 5, 'full-time claimed for 5 devices');
select is(public.service_notification_report((select jsonb_agg(jsonb_build_object('id', d ->> 'id',
  'result', case when d ->> 'endpoint' like '%/d4-%' then 'GONE' when d ->> 'endpoint' like '%/d8-%' then 'RETRY' else 'SENT' end, 'code',
  case when d ->> 'endpoint' like '%/d4-%' then 410 when d ->> 'endpoint' like '%/d8-%' then 503 else 201 end)) from claimed)),
  '{"gone": 1, "sent": 3, "retry": 1, "failed": 0}'::jsonb, 'sent / gone / retry recorded');
reset role;
select ok((select invalidated_at is not null from public.push_subscriptions where device_id = tests.dev_id('d4') order by created_at desc limit 1),
  'a 410 Gone subscription is invalidated');
select ok(not (select push_enabled from public.notification_devices where id = tests.dev_id('d4')), 'and that device is marked push-disabled');
select is((select status from public.notification_deliveries where device_id = tests.dev_id('d8') and outbox_id = (tests.outbox('FULL_TIME')).id),
  'PENDING', 'a temporary failure is retried later');
select ok((select next_attempt_at > now() from public.notification_deliveries where device_id = tests.dev_id('d8') and outbox_id = (tests.outbox('FULL_TIME')).id),
  'with back-off');
update public.notification_deliveries set attempts = 5, status = 'SENDING', locked_until = now() + interval '1 minute'
where device_id = tests.dev_id('d8') and outbox_id = (tests.outbox('FULL_TIME')).id;
set local role service_role;
select public.service_notification_report(jsonb_build_array(jsonb_build_object('id',
  (select id from public.notification_deliveries where device_id = tests.dev_id('d8') and outbox_id = (tests.outbox('FULL_TIME')).id), 'result', 'RETRY', 'code', 503)));
reset role;
select is((select status from public.notification_deliveries where device_id = tests.dev_id('d8') and outbox_id = (tests.outbox('FULL_TIME')).id),
  'FAILED', 'retries stop after 5 attempts (the outbox never jams)');

-- Re-subscribing replaces the dead subscription.
set local role service_role;
select tests.sub('d4');
select ok((public.service_notify_state(tests.tok('d4')) ->> 'push_enabled')::boolean, 'an expired subscription can be replaced');
-- The same endpoint presented by a new install moves to that device.
select public.service_notify_set_subscription(tests.tok('d5'), 'https://push.example.test/send/d4-' || md5('d4'),
  rpad('B' || md5('d4'), 87, 'x'), rpad('a' || left(md5('d4'), 21), 22, 'y'), 'android', false, null);
select ok(not (public.service_notify_state(tests.tok('d4')) ->> 'push_enabled')::boolean, 'one endpoint belongs to one device at a time');
reset role;

-- ── Reminders ──────────────────────────────────────────────────────────────
update public.matches set scheduled_at = now() + interval '10 minutes' where id = tests.m2();
select tests.dispatch();
select is(tests.got('MATCH_REMINDER', tests.m2()), 'd2', 'starting soon → team follower with reminders on');
select ok((tests.outbox('MATCH_REMINDER', tests.m2())).payload ->> 'body' ~ '^DEV Science vs DEV Engineering starts in 10 minutes · \d\d:\d\d$', 'reminder text');
select tests.dispatch();
select is(tests.n_outbox('MATCH_REMINDER', tests.m2()), 1, 'one reminder per kick-off time');
-- Kick-off moves: the old reminder is stale; a reminder for the new time is computed again.
update public.matches set scheduled_at = now() + interval '12 minutes' where id = tests.m2();
select tests.dispatch();
select is(tests.n_outbox('MATCH_REMINDER', tests.m2()), 2, 'a changed kick-off gets its own reminder');
-- Postponed: queued reminders never go out; followers are told.
delete from public.notification_deliveries where outbox_id in (select id from public.notification_outbox where match_id = tests.m2());
delete from public.notification_outbox where match_id = tests.m2();
update public.matches set scheduled_at = now() + interval '5 minutes' where id = tests.m2();
select private.enqueue_due_reminders();
select tests.login((select admin from u));
select lives_ok($$ select public.admin_set_match_outcome(tests.m2(), 'POSTPONED', 'TEST: waterlogged pitch') $$, 'match postponed');
reset role;
select tests.dispatch();
select is(tests.got('MATCH_REMINDER', tests.m2()), '', 'a reminder queued before the postponement is never sent');
select is(tests.got('POSTPONED', tests.m2()), 'd2', 'postponement → followers with status alerts');
-- Reminder never fires after kick-off.
delete from public.notification_outbox where match_id = tests.m2();
update public.matches set status = 'SCHEDULED', scheduled_at = now() - interval '1 minute' where id = tests.m2();
select is(private.enqueue_due_reminders(), 0, 'no reminder once kick-off time has passed');
update public.matches set scheduled_at = now() + interval '5 minutes' where id = tests.m2();
select private.enqueue_due_reminders();
update public.matches set scheduled_at = now() - interval '1 minute' where id = tests.m2();
select tests.dispatch();
select is(tests.got('MATCH_REMINDER', tests.m2()), '', 'a queued reminder whose kick-off has passed is dropped');

-- ── Old intents expire instead of flooding devices later ───────────────────
insert into public.notification_outbox (event_key, match_id, notification_type, payload, created_at)
values ('TEST:old', tests.m1(), 'GOAL', '{"title":"x"}', now() - interval '2 hours');
select tests.dispatch();
select is((select status from public.notification_outbox where event_key = 'TEST:old'), 'EXPIRED', 'intents older than 30 minutes expire unsent');

-- ── TEST / DEMO matches and private competitions ───────────────────────────
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values (tests.id('draftc'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'NOTIFY SYSTEMS TEST', 'TEST', 'ACTIVE');
insert into public.competition_stages (competition_id, name, stage_order) values (tests.id('draftc'), 'Test', 1);
insert into public.competition_entries (competition_id, stage_id, team_id)
select tests.id('draftc'), (select id from public.competition_stages where competition_id = tests.id('draftc')), t from unnest(array[tests.home(), tests.away()]) t;
select tests.login((select admin from u));
update ids set id = public.admin_create_match(tests.id('draftc'), (select id from public.competition_stages where competition_id = tests.id('draftc')), null,
  'SYSTEMS TEST', tests.home(), tests.away(), null, now() + interval '2 days') where k = 'demo';
select public.admin_mark_demo_match(tests.id('demo'), 'TEST: notification check');
reset role;
set local role service_role;
select public.service_notify_set_match(tests.tok('d1'), tests.id('demo'), true, array['STATUS'], null);
reset role;
select tests.login((select admin from u));
select public.admin_set_match_outcome(tests.id('demo'), 'POSTPONED', 'TEST: rehearsal');
reset role;
select tests.dispatch();
select is(tests.got('POSTPONED', tests.id('demo')), 'd1', 'TEST match → only devices following that match (team followers are not alerted)');
select ok((tests.outbox('POSTPONED', tests.id('demo'))).payload ->> 'title' like 'TEST · %', 'TEST match notifications are labelled TEST');
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values (tests.id('privc'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'TEST private comp', 'PRIV', 'DRAFT');
insert into public.matches (id, competition_id, round_label, home_team_id, away_team_id, scheduled_at)
values (tests.id('draftm'), tests.id('privc'), 'x', tests.home(), tests.away(), now());
set local role service_role;
select throws_ok($$ select public.service_notify_set_match(tests.tok('d1'), tests.id('draftm'), true, array['GOAL'], null) $$,
  'EK404', null, 'matches of draft (private) competitions cannot be followed');
reset role;
update public.matches set status = 'CANCELLED' where id = tests.id('draftm');
select is(tests.n_outbox('CANCELLED', tests.id('draftm')), 0, 'and never produce notifications');

-- ── Disable all ────────────────────────────────────────────────────────────
set local role service_role;
select public.service_notify_disable_all(tests.tok('d8'), null);
select is(public.service_notify_state(tests.tok('d8')), '{"teams": [], "matches": [], "push_enabled": false}'::jsonb,
  'disable all: no subscription, no follows');
reset role;
select ok((select bool_and(invalidated_at is not null) from public.push_subscriptions where device_id = tests.dev_id('d8')), 'subscription invalidated server-side');
select is((select count(*)::int from public.notification_deliveries where device_id = tests.dev_id('d8') and status in ('PENDING', 'SENDING')), 0,
  'nothing pending remains for that device');

-- ── Atomicity / independence ───────────────────────────────────────────────
select is(tests.state() ->> 'status', 'FT', 'the match itself finished normally');
select is((select count(*)::int from public.match_events where match_id = tests.m1() and voided_at is null), 3, 'all non-voided events kept');
select is((select count(*)::int from public.notification_outbox where match_id = tests.m1() and notification_type in
  ('KICKOFF', 'GOAL', 'YELLOW_CARD', 'RED_CARD', 'HALF_TIME', 'SECOND_HALF', 'FULL_TIME', 'SCORE_CORRECTION') and event_key not like 'TEST:%'), 9,
  'every alertable change produced exactly one intent');
-- A broken notification path never blocks a match write.
alter table public.notification_outbox add constraint t_break check (false) not valid;
select tests.login((select op from u));
select lives_ok($$ select public.start_match(tests.m2(), tests.id('start2')) $$, 'match writes succeed even if the outbox cannot be written');
reset role;
alter table public.notification_outbox drop constraint t_break;
select is((select status::text from public.matches where id = tests.m2()), '1H', 'the match started');

select * from finish();
rollback;
