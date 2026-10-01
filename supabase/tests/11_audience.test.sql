begin;
\ir helpers.inc
select plan(50);

create temp table u as select
  tests.make_user('admin11@test.local', array['ADMIN']) as admin,
  tests.make_user('op11@test.local', array['OPERATOR']) as op,
  tests.make_user('backup11@test.local', array['OPERATOR']) as backup,
  tests.make_user('other11@test.local', array['OPERATOR']) as other;
grant select on u to anon, authenticated, service_role;
grant usage on schema tests to service_role;
grant select on tests.fixture to service_role;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), op, 'PRIMARY'::public.assignment_role from u union all
select tests.m1(), backup, 'BACKUP' from u union all
select tests.m2(), other, 'PRIMARY' from u;

-- Devices (as the Next.js server holds them: the cookie token).
create temp table dev (k text primary key, token text);
create temp table ses (k text primary key, id uuid);
grant select, insert, update on dev, ses to service_role;
set local role service_role;
insert into dev (k, token) select k, public.service_audience_register(null) ->> 'token' from unnest(array['A', 'B', 'C', 'D']) k;
reset role;
create or replace function tests.tok(p text) returns text language sql stable as $$ select token from dev where k = p $$;
create or replace function tests.start(p_dev text, p_match uuid, p_key text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('role', 'service_role', true);
  v := (public.service_audience_start(tests.tok(p_dev), p_match) ->> 'session_id')::uuid;
  perform set_config('role', 'postgres', true);
  insert into ses values (p_key, v) on conflict (k) do update set id = excluded.id;
  return v;
end $$;
create or replace function tests.sid(p text) returns uuid language sql stable as $$ select id from ses where k = p $$;
create or replace function tests.aud(p_match uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.audience_summary(p_match) $$;
create or replace function tests.age(p_key text, p_seconds int) returns void language sql security definer set search_path = '' as $$
  update public.match_view_sessions set last_seen_at = now() - make_interval(secs => p_seconds) where id = tests.sid(p_key) $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

select ok((select bool_and(token ~ '^[A-Za-z0-9_-]{43}$') from dev), 'devices get opaque server-issued tokens');

-- 1. first visitor
select tests.start('A', tests.m1(), 'A1');
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 1, '1. first visitor → watching now 1');
select is((tests.aud(tests.m1()) ->> 'unique_viewers')::int, 1, 'first visitor → 1 unique viewer');
select is((tests.aud(tests.m1()) ->> 'total_visits')::int, 1, 'first visitor → 1 visit');
-- 2. second device
select tests.start('B', tests.m1(), 'B1');
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 2, '2. second distinct device → watching now 2');
-- 3/19. second tab on the same device
select tests.start('A', tests.m1(), 'A2');
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 2, '19. a second tab on device A does not inflate watching now');
select is((tests.aud(tests.m1()) ->> 'unique_viewers')::int, 2, '3. a second tab does not inflate unique viewers');
select is((tests.aud(tests.m1()) ->> 'total_visits')::int, 3, 'each tab is a visit');
-- 7. peak rises
select is((tests.aud(tests.m1()) ->> 'peak_viewers')::int, 2, '7. peak follows the simultaneous high (2)');
select tests.start('C', tests.m1(), 'C1');
select is((tests.aud(tests.m1()) ->> 'peak_viewers')::int, 3, 'peak rises to 3');

-- 5. stale heartbeats stop counting
select tests.age('C1', 120);
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 2, '5. a heartbeat older than 50 s stops counting as watching now');
-- 8. peak never decreases
select is((tests.aud(tests.m1()) ->> 'peak_viewers')::int, 3, '8. peak does not decrease when viewers leave');
-- 6. reconnect (resume within 10 min)
set local role service_role;
select is(public.service_audience_beat(tests.tok('C'), tests.sid('C1')), '{"ok": true}'::jsonb, '6. a returning viewer resumes the same session');
reset role;
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 3, 'and counts as watching again');
select is((tests.aud(tests.m1()) ->> 'total_visits')::int, 4, 'resuming is not a new visit');
-- beyond the resume window → new visit required
select tests.age('C1', 900);
set local role service_role;
select is(public.service_audience_beat(tests.tok('C'), tests.sid('C1')) ->> 'restart', 'true', 'after 10 minutes away the client must start a new visit');
reset role;
-- 4. repeat visit
select tests.start('C', tests.m1(), 'C2');
select is((tests.aud(tests.m1()) ->> 'total_visits')::int, 5, '4. a repeat visit increments total visits');
select is((tests.aud(tests.m1()) ->> 'unique_viewers')::int, 3, 'but not unique viewers');

-- explicit end
set local role service_role;
select public.service_audience_end(tests.tok('B'), tests.sid('B1'));
reset role;
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 2, 'a closed page stops counting immediately');
-- the throttle: a beat right after the last one writes nothing
create temp table before_beat as select last_seen_at from public.match_view_sessions where id = tests.sid('A1');
set local role service_role;
select public.service_audience_beat(tests.tok('A'), tests.sid('A1'));
reset role;
select is((select last_seen_at from public.match_view_sessions where id = tests.sid('A1')), (select last_seen_at from before_beat),
  'beats closer than 10 s apart are accepted without a write');

-- Another device cannot touch someone else's session.
set local role service_role;
select is(public.service_audience_beat(tests.tok('D'), tests.sid('A1')) ->> 'restart', 'true', 'a session cannot be kept alive by another device');
select public.service_audience_end(tests.tok('D'), tests.sid('A1'));
reset role;
select ok((select ended_at is null from public.match_view_sessions where id = tests.sid('A1')), 'or ended by another device');

-- Bad input
set local role service_role;
select throws_ok($$ select public.service_audience_start('not-a-real-token-but-long-enough-to-match-xxxxx', tests.m1()) $$, 'EK401', null,
  'tokens not issued by the app are refused');
select throws_ok($$ select public.service_audience_start(tests.tok('A'), gen_random_uuid()) $$, 'EK404', null, 'unknown matches are refused');
reset role;

-- 9. finished match keeps its numbers
select tests.login((select op from u));
select public.start_match(tests.m1(), gen_random_uuid());
select public.end_period(tests.m1(), gen_random_uuid());
select public.start_period(tests.m1(), gen_random_uuid());
select public.finalise_match(tests.m1(), gen_random_uuid(), 0, 0);
reset role;
update public.match_view_sessions set last_seen_at = now() - interval '5 minutes' where match_id = tests.m1();
select is((tests.aud(tests.m1()) ->> 'watching_now')::int, 0, 'after FT watching now drains to 0');
select is(jsonb_build_array((tests.aud(tests.m1()) ->> 'peak_viewers')::int, (tests.aud(tests.m1()) ->> 'unique_viewers')::int,
  (tests.aud(tests.m1()) ->> 'total_visits')::int), '[3, 3, 5]'::jsonb, '9. finished match preserves peak / unique / visits');

-- 16. TEST matches are separate
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values ('11111111-1111-4111-8111-111111111111', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'AUDIENCE SYSTEMS TEST', 'TEST', 'ACTIVE');
insert into public.competition_stages (id, competition_id, name, stage_order) values ('11111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', 'Test', 1);
insert into public.competition_entries (competition_id, stage_id, team_id)
select '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111112', t from unnest(array[tests.home(), tests.away()]) t;
select tests.login((select admin from u));
create temp table demo as select public.admin_create_match('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111112', null,
  'SYSTEMS TEST', tests.home(), tests.away(), null, now() + interval '1 day') as id;
select public.admin_mark_demo_match((select id from demo), 'TEST: audience');
reset role;
grant select on demo to service_role;
select tests.start('D', (select id from demo), 'D1');
select is((tests.aud((select id from demo)) ->> 'unique_viewers')::int, 1, '16. TEST match audience is tracked on its own');
select is((tests.aud(tests.m1()) ->> 'unique_viewers')::int, 3, 'and does not touch the official match');
select tests.start('D', tests.m2(), 'D2');
select is((tests.aud(tests.m2()) ->> 'watching_now')::int, 1, 'another match counts separately');

-- 10/11. nothing public
select tests.login_anon();
select throws_ok($$ select count(*) from public.match_view_sessions $$, '42501', null, '11. anon cannot read viewing sessions');
select throws_ok($$ select count(*) from public.match_audience_viewers $$, '42501', null, 'anon cannot enumerate viewer devices');
select throws_ok($$ select * from public.match_audience $$, '42501', null, '10. anon cannot read audience aggregates');
select throws_ok($$ select public.op_match_audience(tests.m1()) $$, '42501', null, 'anon cannot call the operator reader');
select throws_ok($$ select public.admin_match_audience(tests.m1()) $$, '42501', null, 'anon cannot call the admin reader');
select throws_ok($$ select public.service_audience_start('x', tests.m1()) $$, '42501', null, 'anon cannot report views directly (server only)');
select throws_ok($$ select count(*) from public.notification_devices $$, '42501', null, 'anon cannot read device tokens');
-- 15. the public feed carries no audience numbers
select ok(public.public_match_feed(tests.m1())::text !~* '(watching|viewer|visit|audience|peak)', '15. public match feed contains no audience data');
reset role;

-- 12/13/14. who can read
select tests.login((select op from u));
select is((public.op_match_audience(tests.m1()) ->> 'peak_viewers')::int, 3, '12. the assigned operator reads their match audience');
select ok(not (public.op_match_audience(tests.m1()) ? 'last_view_at'), 'operators get the glanceable numbers only');
select tests.login((select backup from u));
select lives_ok($$ select public.op_match_audience(tests.m1()) $$, 'the active backup follows the existing rule (can read)');
select tests.login((select other from u));
select throws_ok($$ select public.op_match_audience(tests.m1()) $$, 'EK403', null, '13. an unassigned operator cannot read it');
select throws_ok($$ select public.admin_match_audience(tests.m1()) $$, 'EK403', null, 'and is not an admin');
select tests.login((select admin from u));
select is((public.admin_match_audience(tests.m1()) ->> 'total_visits')::int, 5, '14. admin reads the full summary');
select throws_ok($$ select count(*) from public.match_view_sessions $$, '42501', null, 'even admins never see raw sessions');
reset role;

-- 17. rate limits
set local role service_role;
create temp table rl as select public.service_audience_register(null) ->> 'token' as t;
reset role;
grant select on rl to service_role;
set local role service_role;
select throws_ok($$ select public.service_audience_start((select t from rl), tests.m2()) from generate_series(1, 11) $$, 'EK429', null,
  '17. more than 10 open tabs on one match from one device are refused');
select throws_ok($$ select public.service_audience_register('same-network') from generate_series(1, 2001) $$, 'EK429', null,
  'device creation is rate limited per network');
reset role;

-- 20. clean-up keeps the aggregates
update public.match_view_sessions set last_seen_at = now() - interval '3 days' where match_id = tests.m1();
update public.match_audience_viewers set last_seen_at = now() - interval '200 days' where match_id = tests.m1();
select ok((private.audience_housekeeping() ->> 'sessions')::int >= 3, 'stale raw sessions are purged');
select is((select count(*)::int from public.match_view_sessions where match_id = tests.m1()), 0, 'no raw sessions left for the old match');
select is((select count(*)::int from public.match_audience_viewers where match_id = tests.m1()), 0, 'old per-device rows are purged');
select is(jsonb_build_array((tests.aud(tests.m1()) ->> 'peak_viewers')::int, (tests.aud(tests.m1()) ->> 'unique_viewers')::int,
  (tests.aud(tests.m1()) ->> 'total_visits')::int), '[3, 3, 5]'::jsonb, '20. clean-up does not destroy preserved aggregates');

select * from finish();
rollback;
