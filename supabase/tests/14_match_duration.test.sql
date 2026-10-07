-- Configurable match duration: a short format (2 × 7:30) next to the normal
-- 45:00 clock. Offsets, accepted minute labels, kick-off snapshot, exact
-- clock seconds on events, admin RPC, locking and read models.
begin;
\ir helpers.inc
select no_plan();
set constraints all immediate;

create temp table u as select
  tests.make_user('admin14@test.local', array['ADMIN']) as admin,
  tests.make_user('op14@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;
insert into public.operator_assignments (match_id, user_id, role)
select tests.m1(), op, 'PRIMARY'::public.assignment_role from u;
create or replace function tests.op(p_sql text) returns void language plpgsql as $$
begin
  perform tests.login((select op from u));
  execute p_sql;
  reset role;
end $$;
create or replace function tests.err(p_sql text) returns text language plpgsql as $$
begin
  perform tests.login((select op from u));
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- A separate, untouched normal competition for comparison.
insert into public.competitions (id, sport_id, season_id, name, short_name, format, status)
values ('14000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'Normal clock league', 'Normal', 'LEAGUE', 'ACTIVE');
insert into public.competition_entries (competition_id, team_id)
values ('14000000-0000-4000-8000-000000000001', tests.home()), ('14000000-0000-4000-8000-000000000001', tests.away());
insert into public.matches (id, competition_id, round_label, home_team_id, away_team_id, scheduled_at)
values ('14000000-0000-4000-8000-0000000000aa', '14000000-0000-4000-8000-000000000001', 'Std', tests.home(), tests.away(), now());

-- ── Defaults: every existing competition keeps the football clock ────────────
select is((select count(*)::int from public.competitions where half_seconds <> 2700 or et_half_seconds <> 900), 0, 'existing competitions default to 45:00 halves and 15:00 extra time');
select is(array[private.period_minute_lo('14000000-0000-4000-8000-0000000000aa', 1), private.period_minute_hi('14000000-0000-4000-8000-0000000000aa', 1),
                private.period_minute_lo('14000000-0000-4000-8000-0000000000aa', 2), private.period_minute_hi('14000000-0000-4000-8000-0000000000aa', 2),
                private.period_minute_lo('14000000-0000-4000-8000-0000000000aa', 3), private.period_minute_hi('14000000-0000-4000-8000-0000000000aa', 3),
                private.period_minute_lo('14000000-0000-4000-8000-0000000000aa', 4), private.period_minute_hi('14000000-0000-4000-8000-0000000000aa', 4)],
  array[0, 45, 45, 90, 90, 105, 105, 120], 'normal clock minute ranges are unchanged');
select is(array[private.period_offset_seconds(2700, 900, 1), private.period_offset_seconds(2700, 900, 2), private.period_offset_seconds(2700, 900, 3),
                private.period_offset_seconds(2700, 900, 4), private.period_offset_seconds(2700, 900, 5)],
  array[0, 2700, 5400, 6300, 7200], 'normal clock offsets are unchanged');

-- ── Admin sets the short format ──────────────────────────────────────────────
create or replace function tests.m1_competition() returns uuid language sql stable security definer set search_path = '' as $$
  select competition_id from public.matches where id = (select id from tests.fixture where key = 'm1') $$;
grant execute on function tests.m1_competition() to anon, authenticated;
select tests.login_anon();
select throws_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 450, 900) $$, '42501', null, 'anon cannot change match length');
reset role;
select is(tests.err($$ select public.admin_set_match_duration(tests.m1_competition(), 450, 900) $$), 'EK403', 'an operator cannot change match length');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 445, 900) $$, 'EK422', null, 'half length must be a multiple of 30 seconds');
select throws_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 30, 900) $$, 'EK422', null, 'half length of at least 1:00');
select throws_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 3630, 900) $$, 'EK422', null, 'half length of at most 60:00');
select lives_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 450, 900) $$, 'admin sets 2 × 7:30');
reset role;
select is((select half_seconds from public.competitions where id = tests.m1_competition()), 450, 'competition stores 450 s halves');
select ok(exists (select 1 from public.audit_log where action = 'MATCH_DURATION_CHANGED' and entity_id = tests.m1_competition()
  and (after_state ->> 'half_seconds')::int = 450 and (before_state ->> 'half_seconds')::int = 2700), 'the change is audited with before and after');
select is((select half_seconds from public.competitions where id = '14000000-0000-4000-8000-000000000001'), 2700, 'other competitions are not affected');

-- Before kick-off the match follows its competition; nothing is snapshotted yet.
select is((select half_seconds from public.matches where id = tests.m1()), null::int, 'no snapshot before kick-off');
select is((private.match_snapshot(tests.m1()) ->> 'half_seconds')::int, 450, 'operator state shows the competition length before kick-off');
select is(array[private.period_minute_lo(tests.m1(), 1), private.period_minute_hi(tests.m1(), 1),
                private.period_minute_lo(tests.m1(), 2), private.period_minute_hi(tests.m1(), 2)],
  array[0, 8, 7, 15], 'short format accepts 0–8 in the first half and 7–15 in the second');

-- ── Kick-off snapshots the length; the competition setting then locks ───────
select tests.op($$ select public.start_match(tests.m1(), gen_random_uuid()) $$);
select is((select half_seconds || '/' || et_half_seconds from public.matches where id = tests.m1()), '450/900', 'kick-off copies the length onto the match');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 600, 900) $$, 'EK409', null, 'match length locks after a kick-off');
select lives_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 600, 900, 'Organisers changed the format') $$, 'an override with a reason is allowed');
select lives_ok($$ select public.admin_set_match_duration(tests.m1_competition(), 450, 900, 'Back to 7:30 halves') $$, 'and can be reverted');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'LOCK_OVERRIDE' and entity_id = tests.m1_competition()), 'the override is audited');
select is((private.match_snapshot(tests.m1()) ->> 'half_seconds')::int, 450, 'a started match keeps its own snapshot');

-- ── First half (7:30) ────────────────────────────────────────────────────────
-- Simulate 3:20 of play.
update public.matches set period_started_at = now() - interval '200 seconds' where id = tests.m1();
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 4, 0, tests.player(tests.home(), 9)) $$), 'ok', 'goal at 4'' accepted');
select ok((select clock_seconds between 199 and 202 from public.match_events where match_id = tests.m1() and minute = 4), 'event stores the exact clock second (≈200 s)');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.away(), 8, 0, tests.player(tests.away(), 5)) $$), 'ok', '8'' (last minute of a 7:30 half) accepted');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.away(), 8, 1, tests.player(tests.away(), 6)) $$), 'ok', 'added time 8+1'' accepted');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.away(), 9, 0, tests.player(tests.away(), 7)) $$), 'EK422', '9'' rejected in a 7:30 first half');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.away(), 7, 1, tests.player(tests.away(), 7)) $$), 'EK422', 'added time only on the last minute (7+1'' rejected)');
select tests.op($$ select public.end_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text from public.matches where id = tests.m1()), 'HT', 'half-time');

-- ── Second half starts from 7:30 ─────────────────────────────────────────────
select tests.op($$ select public.start_period(tests.m1(), gen_random_uuid()) $$);
select is((select status::text || ' ' || current_period || ' ' || period_offset_seconds from public.matches where id = tests.m1()), '2H 2 450', 'second half starts from 7:30 (450 s)');
select is((select offset_seconds from public.match_periods where match_id = tests.m1() and period = 2), 450, 'period history records the 450 s offset');
update public.matches set period_started_at = now() - interval '300 seconds' where id = tests.m1();
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.away(), 13, 0, tests.player(tests.away(), 9)) $$), 'ok', 'goal at 13'' accepted');
select ok((select clock_seconds between 749 and 752 from public.match_events where match_id = tests.m1() and minute = 13), 'second-half clock second continues from 450 (≈750 s)');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 15, 2, tests.player(tests.home(), 10)) $$), 'ok', 'added time 15+2'' accepted');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 16, 0, tests.player(tests.home(), 11)) $$), 'EK422', '16'' rejected (full time at 15:00)');
select is(tests.err($$ select public.record_event(tests.m1(), gen_random_uuid(), 'GOAL', tests.home(), 6, 0, tests.player(tests.home(), 11)) $$), 'EK422', 'first-half minutes rejected in the second half');

-- Read models carry the length for the clocks.
select is((private.canonical_state(tests.m1()) -> 'match' ->> 'half_seconds')::int, 450, 'operator state exposes half_seconds');
select is((private.public_match_row((select m from public.matches m where m.id = tests.m1())) ->> 'half_seconds')::int, 450, 'public row exposes half_seconds');
select is((select (x ->> 'half_seconds')::int from jsonb_array_elements(public.public_live_scores() -> 'matches') x where (x ->> 'id')::uuid = tests.m1()), 450, 'live scores expose half_seconds');

-- Admin corrections follow the same ranges.
select tests.op($$ select public.finalise_match(tests.m1(), gen_random_uuid(), 2, 1) $$);
select is((select status::text || ' ' || home_score || '-' || away_score from public.matches where id = tests.m1()), 'FT 2-1', 'short match finalised');
select tests.login((select admin from u));
select lives_ok($$ select public.admin_add_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.home(), 2, 12, 0, tests.player(tests.home(), 4), null, 'Missed booking') $$,
  'admin correction at 12'' in the second half');
select throws_ok($$ select public.admin_add_event(tests.m1(), gen_random_uuid(), 'YELLOW_CARD', tests.home(), 1, 20, 0, tests.player(tests.home(), 3), null, 'x') $$,
  'EK422', null, 'admin correction outside the short first half is rejected');
reset role;
select is((select clock_seconds from public.match_events where match_id = tests.m1() and minute = 12), null::int, 'retro admin events have no exact clock second');

-- The normal competition still behaves like football.
select is((private.match_snapshot('14000000-0000-4000-8000-0000000000aa') ->> 'half_seconds')::int, 2700, 'normal match still 45:00 halves');

select * from finish();
rollback;
