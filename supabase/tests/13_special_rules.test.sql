-- Special competition rules (isolated per competition): six-a-side line-ups,
-- rolling substitutions with re-entry, 60-second temporary red cards on the
-- active-play clock, operator-approved returns, audited permanent exclusion,
-- no added time, kick-off snapshot (history kept) — and normal football untouched.
begin;
\ir helpers.inc
select no_plan();
set constraints all immediate;

create temp table u as select
  tests.make_user('admin15@test.local', array['ADMIN']) as admin,
  tests.make_user('op15@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;

-- A six-a-side novelty competition and one fixture (MZ); the seeded competition stays normal.
insert into public.competitions (id, sport_id, season_id, name, short_name, format, status, tiebreakers)
values ('15000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'Novelty six-a-side', 'Novelty', 'LEAGUE', 'ACTIVE', array['points', 'goal_difference', 'goals_for']);
insert into public.competition_entries (competition_id, team_id)
values ('15000000-0000-4000-8000-000000000001', tests.home()), ('15000000-0000-4000-8000-000000000001', tests.away());
insert into public.matches (id, competition_id, round_label, home_team_id, away_team_id, scheduled_at)
values ('15000000-0000-4000-8000-0000000000aa', '15000000-0000-4000-8000-000000000001', 'Matchday 1', tests.home(), tests.away(), now());
insert into public.operator_assignments (match_id, user_id, role)
select m, op, 'PRIMARY'::public.assignment_role from u, (values ('15000000-0000-4000-8000-0000000000aa'::uuid), (tests.m2())) v(m);

create or replace function tests.mz() returns uuid language sql immutable as $$ select '15000000-0000-4000-8000-0000000000aa'::uuid $$;
create or replace function tests.mzc() returns uuid language sql immutable as $$ select '15000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function tests.as_op(p_sql text) returns text language plpgsql as $$
begin
  perform tests.login((select op from u));
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ': ' || sqlerrm;
end $$;
create or replace function tests.as_admin(p_sql text) returns text language plpgsql as $$
begin
  perform tests.login((select admin from u));
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ': ' || sqlerrm;
end $$;
-- Time passes: every timestamp of the match moves back (now() is fixed in a transaction).
create or replace function tests.advance(p_match uuid, p_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
declare d interval := make_interval(secs => p_seconds);
begin
  update public.matches set period_started_at = period_started_at - d, period_ended_at = period_ended_at - d,
    paused_at = paused_at - d, started_at = started_at - d where id = p_match;
  update public.match_periods set started_at = started_at - d, ended_at = ended_at - d where match_id = p_match;
end $$;
create or replace function tests.ev(p_match uuid, p_type text, p_team uuid, p_minute int, p_player int, p_related int default null,
  p_extra int default 0, p_payload jsonb default '{}') returns text language plpgsql as $$
begin
  return tests.as_op(format('select public.record_event(%L, gen_random_uuid(), %L, %L, %s, %s, %L, %L, null, false, %L)',
    p_match, p_type, p_team, p_minute, p_extra, tests.player(p_team, p_player),
    case when p_related is null then null else tests.player(p_team, p_related) end, p_payload));
end $$;
create or replace function tests.st(p_match uuid, p_team uuid, p_shirt int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) from private.lineup_player_states((select id from public.match_lineups where match_id = p_match and team_id = p_team)) s
  where s.shirt_number = p_shirt $$;
create or replace function tests.on_pitch(p_match uuid, p_team uuid) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from private.lineup_player_states((select id from public.match_lineups where match_id = p_match and team_id = p_team)) s
  where s.on_field $$;
create or replace function tests.six(p_team uuid, p_starters int[], p_subs int[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.o), '[]'::jsonb) from (
    select s.o, jsonb_build_object('player_id', tests.player(p_team, s.shirt), 'role', 'STARTER', 'slot', s.o - 1, 'captain', s.o = 2) as j
    from unnest(p_starters) with ordinality s(shirt, o)
    union all
    select 100 + b.o, jsonb_build_object('player_id', tests.player(p_team, b.shirt), 'role', 'SUBSTITUTE')
    from unnest(p_subs) with ordinality b(shirt, o)) x $$;
create or replace function tests.rules(p_match uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.match_rules(p_match) $$;
create or replace function tests.lrules(p_match uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select private.lineup_rules_for_match(p_match) $$;
grant execute on all functions in schema tests to anon, authenticated;

create temp table preset as select '{
  "starters": 6, "no_added_time": true, "halftime_seconds": 60, "rolling_subs": true,
  "red_card_suspension_seconds": 60, "offside": false,
  "title": "Official rules", "regulations": [{"title": "Match duration", "body": "Two 8-minute halves."}]}'::jsonb as j;
grant select on preset to anon, authenticated;

-- ── Configuration: admin only, validated, audited ───────────────────────────
select is((select count(*)::int from public.competitions where special_rules is not null), 0, 'no competition has special rules by default');
select ialike(tests.as_op($$ select public.admin_set_special_rules(tests.mzc(), (select j from preset)) $$), 'EK403%', 'an operator cannot set special rules');
select ialike(tests.as_admin($$ select public.admin_set_special_rules(tests.mzc(), '{"starters": 6, "golden_goal": true}') $$), 'EK422%unknown%golden_goal%', 'unknown rules are refused');
select ialike(tests.as_admin($$ select public.admin_set_special_rules(tests.mzc(), '{"starters": 3}') $$), 'EK422%starters%', 'starters must be 4–11');
select ialike(tests.as_admin($$ select public.admin_set_special_rules(tests.mzc(), '{"red_card_suspension_seconds": 5}') $$), 'EK422%', 'suspension must be at least 10 s');
select is(tests.as_admin($$ select public.admin_set_special_rules(tests.mzc(), (select j from preset)) $$), 'ok', 'admin applies the six-a-side rules');
select is(tests.as_admin($$ select public.admin_set_match_duration(tests.mzc(), 480, 900) $$), 'ok', 'admin sets 2 × 8:00');
select ok(exists (select 1 from public.audit_log where action = 'SPECIAL_RULES_CHANGED' and entity_id = tests.mzc()
  and before_state -> 'special_rules' = 'null'::jsonb and (after_state -> 'special_rules' ->> 'starters')::int = 6), 'the change is audited');
select is((select count(*)::int from public.competitions where special_rules is not null), 1, 'only this competition has special rules');

-- Effective rules: the competition's (without its public text) before kick-off; normal elsewhere.
select is(tests.rules(tests.mz()) -> 'regulations', null, 'match rules carry no public text');
select is((tests.rules(tests.mz()) ->> 'red_card_suspension_seconds')::int, 60, 'fixture follows its competition before kick-off');
select is(tests.rules(tests.m2()), '{}'::jsonb, 'a normal match has no special rules');
select is(array[(tests.lrules(tests.mz()) ->> 'min_starters')::int, (tests.lrules(tests.mz()) ->> 'max_starters')::int], array[6, 6], 'exactly six starters');
select is(array[(tests.lrules(tests.m2()) ->> 'min_starters')::int, (tests.lrules(tests.m2()) ->> 'max_starters')::int], array[7, 11], 'normal line-up rules unchanged');

-- ── Six-a-side line-ups ─────────────────────────────────────────────────────
select tests.login((select op from u));
select is((select array_agg(f ->> 'code' order by f ->> 'code') from jsonb_array_elements(public.lineup_editor_state(tests.mz(), tests.home()) -> 'formations') f),
  array['1-2-2', '2-1-2', '2-2-1', '3-1-1'], 'six-a-side fixtures offer six-player formations only');
select is((select count(*)::int from jsonb_array_elements(public.lineup_editor_state(tests.m2(), tests.home()) -> 'formations') f
  where jsonb_array_length(f -> 'slots') <> 11), 0, 'normal fixtures offer eleven-player formations only');
reset role;
select ialike(tests.as_op($$ select public.save_lineup(tests.mz(), tests.home(), '4-4-2', tests.six(tests.home(), array[1,2,3,4,5,6], array[7])) $$),
  'EK422%4-4-2 is for 11 players%', 'an eleven-a-side formation is refused');
select ialike(tests.as_op($$ select public.save_lineup(tests.mz(), tests.home(), null, (select jsonb_agg(e - 'slot') from jsonb_array_elements(tests.six(tests.home(), array[1,2,3,4,5,6,7], array[]::int[])) e)) $$),
  'EK422%at most 6%', 'seven starters are refused');
select is(tests.as_op($$ select public.save_lineup(tests.mz(), tests.home(), '2-2-1', tests.six(tests.home(), array[1,2,3,4,5,6], array[7,8,9,10])) $$), 'ok', 'home six saved (2-2-1)');
select is(tests.as_op($$ select public.save_lineup(tests.mz(), tests.away(), '2-1-2', tests.six(tests.away(), array[1,2,3,4,5,6], array[7,8,9])) $$), 'ok', 'away six saved (2-1-2)');
select is(tests.as_op($$ select public.confirm_lineup(tests.mz(), tests.home()) $$), 'ok', 'home six confirmed');
select is(tests.as_op($$ select public.confirm_lineup(tests.mz(), tests.away()) $$), 'ok', 'away six confirmed');
select is((select count(*)::int from public.lineup_players lp join public.match_lineups l on l.id = lp.lineup_id
  where l.match_id = tests.mz() and l.team_id = tests.home() and lp.role = 'STARTER' and lp.is_goalkeeper), 1, 'one starting goalkeeper');
select is(tests.on_pitch(tests.mz(), tests.home()), 6, 'six on the pitch at kick-off');

-- ── Kick-off snapshots the rules ────────────────────────────────────────────
select is(tests.as_op($$ select public.start_match(tests.mz(), gen_random_uuid()) $$), 'ok', 'kick-off');
select is((select (special_rules ->> 'starters')::int from public.matches where id = tests.mz()), 6, 'rules snapshotted onto the match at kick-off');
select is((select special_rules ? 'regulations' from public.matches where id = tests.mz()), false, 'the snapshot holds behaviour, not the public text');
select is((private.match_snapshot(tests.mz()) -> 'special_rules' ->> 'no_added_time')::boolean, true, 'operator state carries the rules');
select is((private.public_match_row((select m from public.matches m where id = tests.mz())) -> 'special_rules' ->> 'halftime_seconds')::int, 60, 'public state carries the rules');
select is(private.public_match_row((select m from public.matches m where id = tests.m2())) -> 'special_rules', 'null'::jsonb, 'normal match: no rules in public state');
select throws_ok($$ update public.matches set special_rules = '{}' where id = tests.mz() $$, 'EK409', null, 'the rules a match is played under cannot be rewritten');

-- ── No added time ───────────────────────────────────────────────────────────
select ialike(tests.as_op($$ select public.set_stoppage(tests.mz(), gen_random_uuid(), 2) $$), 'EK422%no added time%', 'stoppage time cannot be announced');
select ialike(tests.ev(tests.mz(), 'GOAL', tests.home(), 8, 5, null, 1), 'EK422%no added time%', 'an 8+1'' event is refused');
select is(tests.ev(tests.mz(), 'GOAL', tests.home(), 3, 5), 'ok', 'a goal at 3''');

-- ── Rolling substitutions and re-entry ──────────────────────────────────────
select tests.advance(tests.mz(), 120);
select is(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 3, 2, 7), 'ok', 'No. 2 off, No. 7 on');
select is(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 4, 7, 2), 'ok', 'No. 7 off, No. 2 back on (re-entry)');
select is(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 4, 3, 7), 'ok', 'No. 3 off, No. 7 on again');
select is(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 5, 7, 3), 'ok', 'No. 7 off, No. 3 back on');
select is(array[(tests.st(tests.mz(), tests.home(), 2) ->> 'on_field')::boolean, (tests.st(tests.mz(), tests.home(), 7) ->> 'on_field')::boolean],
  array[true, false], 'positions follow the latest substitution');
select is(array[(tests.st(tests.mz(), tests.home(), 7) ->> 'entries')::int, (tests.st(tests.mz(), tests.home(), 7) ->> 'exits')::int], array[2, 2],
  'No. 7 came on twice and went off twice');
select is(array[(tests.st(tests.mz(), tests.home(), 2) ->> 'entries')::int, (tests.st(tests.mz(), tests.home(), 2) ->> 'exits')::int], array[1, 1],
  'No. 2 (a starter) went off once and came back once');
select is((tests.st(tests.mz(), tests.home(), 2) ->> 'subbed_off')::boolean, false, 'a returned player is not shown as substituted off');
select is((tests.st(tests.mz(), tests.home(), 7) ->> 'subbed_on')::boolean, true, 'No. 7 has played (came on)');
select is(tests.on_pitch(tests.mz(), tests.home()), 6, 'still six on the pitch');
select ialike(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 5, 4, 2), 'EK422%already on the pitch%', 'cannot bring on a player who is on the pitch');
select ialike(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 5, 8, 9), 'EK422%not on the pitch%', 'the player going off must be on the pitch');
select is(tests.ev(tests.mz(), 'GOAL', tests.home(), 5, 2), 'ok', 'a re-entered player can score');
select ialike(tests.ev(tests.mz(), 'GOAL', tests.home(), 5, 7), 'EK422%not on the pitch%', 'a player on the bench cannot score');

-- ── Temporary red card: 60 s of active play, operator-approved return ───────
select is(tests.ev(tests.mz(), 'RED_CARD', tests.home(), 6, 4), 'ok', 'red card to No. 4 (at 2:00 of play)');
select is(array[(tests.st(tests.mz(), tests.home(), 4) ->> 'suspended')::boolean, (tests.st(tests.mz(), tests.home(), 4) ->> 'on_field')::boolean,
                (tests.st(tests.mz(), tests.home(), 4) ->> 'sent_off')::boolean], array[true, false, false],
  'suspended: off the pitch, but not permanently sent off');
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 60, '60 s to serve');
select is(tests.on_pitch(tests.mz(), tests.home()), 5, 'the team plays a player short');
select ialike(tests.ev(tests.mz(), 'SUBSTITUTION', tests.home(), 6, 4, 8), 'EK422%serving a suspension and cannot be replaced%', 'a suspended player cannot be replaced');
select ialike(tests.ev(tests.mz(), 'GOAL', tests.home(), 6, 4), 'EK422%serving a suspension%', 'a suspended player cannot score');
select ialike(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.home(), 6, 4), 'EK422%still has 60 s%', 'no return before the time is served');
select tests.advance(tests.mz(), 30);
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 30, '30 s of play later: 30 s left');
-- Pauses do not count.
select is(tests.as_op($$ select public.pause_match(tests.mz(), gen_random_uuid(), 'INJURY') $$), 'ok', 'play paused');
select tests.advance(tests.mz(), 90);
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 30, 'a 90 s stoppage does not count');
select is(tests.as_op($$ select public.resume_match(tests.mz(), gen_random_uuid()) $$), 'ok', 'play resumed');
select tests.advance(tests.mz(), 10);
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 20, '40 s served, 20 s left');
-- Half-time does not count; the remaining 20 s carry into the second half.
select is(tests.as_op($$ select public.end_period(tests.mz(), gen_random_uuid()) $$), 'ok', 'half-time (operator confirms)');
select tests.advance(tests.mz(), 60);
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 20, 'the one-minute break does not count');
select ialike(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.home(), 8, 4), 'EK409%', 'no return during half-time');
select is(tests.as_op($$ select public.start_period(tests.mz(), gen_random_uuid()) $$), 'ok', 'second half starts');
select is((private.match_snapshot(tests.mz()) ->> 'period_offset_seconds')::int, 480, 'second half starts at 8:00');
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 20, 'still 20 s at the restart');
select tests.advance(tests.mz(), 19);
select ialike(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.home(), 9, 4), 'EK422%still has 1 s%', 'one second short');
select tests.advance(tests.mz(), 1);
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'suspension_remaining')::int, 0, 'served');
select is((tests.st(tests.mz(), tests.home(), 4) ->> 'on_field')::boolean, false, 'no automatic return');
select is(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.home(), 9, 4), 'ok', 'operator approves the return');
select is(array[(tests.st(tests.mz(), tests.home(), 4) ->> 'on_field')::boolean, (tests.st(tests.mz(), tests.home(), 4) ->> 'suspended')::boolean],
  array[true, false], 'No. 4 is back on the pitch');
select is(tests.on_pitch(tests.mz(), tests.home()), 6, 'six again');

-- Second yellow: a red-card incident with the same 60 s suspension.
select is(tests.ev(tests.mz(), 'YELLOW_CARD', tests.away(), 9, 3), 'ok', 'away No. 3 booked');
select ialike(tests.ev(tests.mz(), 'YELLOW_CARD', tests.away(), 9, 3), 'EK422%already booked%', 'a booked player gets a second yellow, not another yellow');
select is(tests.ev(tests.mz(), 'SECOND_YELLOW', tests.away(), 10, 3), 'ok', 'second yellow = red-card incident');
select is(array[(tests.st(tests.mz(), tests.away(), 3) ->> 'yellow_cards')::int, (tests.st(tests.mz(), tests.away(), 3) ->> 'red_cards')::int,
                (tests.st(tests.mz(), tests.away(), 3) ->> 'suspension_remaining')::int], array[1, 1, 60],
  'both card records kept; 60 s suspension');
select is((select count(*)::int from public.match_events where match_id = tests.mz() and team_id = tests.away()
  and player_id = tests.player(tests.away(), 3) and type in ('YELLOW_CARD', 'SECOND_YELLOW') and voided_at is null), 2, 'yellow and second yellow both recorded');
select tests.advance(tests.mz(), 60);
select is(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.away(), 11, 3), 'ok', 'away No. 3 returns after 60 s');
-- A repeat incident: another 60 s.
select is(tests.ev(tests.mz(), 'SECOND_YELLOW', tests.away(), 11, 3), 'ok', 'another caution: a second 60 s suspension');
select is(array[(tests.st(tests.mz(), tests.away(), 3) ->> 'red_cards')::int, (tests.st(tests.mz(), tests.away(), 3) ->> 'suspension_remaining')::int],
  array[2, 60], 'second suspension counted from the new incident');

-- ── Permanent exclusion: explicit, with a reason, audited ───────────────────
select ialike(tests.ev(tests.mz(), 'EXCLUSION', tests.away(), 11, 3), 'EK422%needs a reason%', 'exclusion needs a reason');
select is(tests.ev(tests.mz(), 'EXCLUSION', tests.away(), 11, 3, null, 0, '{"reason": "Repeated abusive language"}'), 'ok', 'referee excludes No. 3');
select is(array[(tests.st(tests.mz(), tests.away(), 3) ->> 'excluded')::boolean, (tests.st(tests.mz(), tests.away(), 3) ->> 'sent_off')::boolean,
                (tests.st(tests.mz(), tests.away(), 3) ->> 'suspended')::boolean], array[true, true, false], 'excluded for the rest of the match');
select ok(exists (select 1 from public.audit_log where action = 'PLAYER_EXCLUDED' and match_id = tests.mz()
  and after_state ->> 'reason' = 'Repeated abusive language'), 'exclusion audited with its reason');
select ialike(tests.ev(tests.mz(), 'SUSPENSION_RETURN', tests.away(), 12, 3), 'EK422%excluded%', 'an excluded player cannot return');
select ialike(tests.ev(tests.mz(), 'SUBSTITUTION', tests.away(), 12, 4, 3), 'EK422%excluded%', 'an excluded player cannot come on');
select is(tests.on_pitch(tests.mz(), tests.away()), 5, 'away continue with five');

-- ── Notifications ───────────────────────────────────────────────────────────
select is((select count(*)::int from public.notification_outbox where match_id = tests.mz() and notification_type = 'RED_CARD'), 4,
  'red cards, second yellows and the exclusion alert; returns and substitutions do not');
select ialike((select private.notification_content(tests.mz(), 'RED_CARD', e.id, 't') ->> 'body' from public.match_events e
  where e.match_id = tests.mz() and e.type = 'RED_CARD'), '%60-second suspension%', 'red-card alert says 60-second suspension');
select is((select private.notification_content(tests.mz(), 'RED_CARD', e.id, 't') ->> 'title' from public.match_events e
  where e.match_id = tests.mz() and e.type = 'EXCLUSION'), 'SENT OFF 🟥', 'exclusion alert');

-- ── Public read model ───────────────────────────────────────────────────────
select is((select (p ->> 'entries')::int from jsonb_array_elements(private.public_lineups(tests.mz())) t, jsonb_array_elements(t -> 'players') p
  where (t ->> 'team_id')::uuid = tests.home() and (p ->> 'shirt_number')::int = 7), 2, 'public line-ups show repeated entries');
select is((select (p ->> 'excluded')::boolean from jsonb_array_elements(private.public_lineups(tests.mz())) t, jsonb_array_elements(t -> 'players') p
  where (t ->> 'team_id')::uuid = tests.away() and (p ->> 'shirt_number')::int = 3), true, 'public line-ups show the exclusion');

-- ── Full time: standings 3/1/0; history survives disabling the rules ───────
select tests.advance(tests.mz(), 480);
select is(tests.as_op(format('select public.finalise_match(tests.mz(), gen_random_uuid(), %s, %s)',
  (select home_score from public.matches where id = tests.mz()), (select away_score from public.matches where id = tests.mz()))), 'ok', 'full time at 16:00');
select is((select points::int from public.standings where competition_id = tests.mzc() and team_id = tests.home()), 3, 'win = 3 points');
select is(tests.as_admin($$ select public.admin_set_special_rules(tests.mzc(), null) $$), 'ok', 'special rules switched off for the competition');
select is((tests.rules(tests.mz()) ->> 'red_card_suspension_seconds')::int, 60, 'the played match keeps its rules');
select is(array[(tests.st(tests.mz(), tests.home(), 4) ->> 'red_cards')::int, (tests.st(tests.mz(), tests.home(), 4) ->> 'sent_off')::boolean::int],
  array[1, 0], 'its history still reads as a temporary suspension');

-- ── Normal football is unchanged ────────────────────────────────────────────
-- (helpers.inc already confirmed normal 4-4-2 line-ups for m2)
select is(tests.as_op($$ select public.start_match(tests.m2(), gen_random_uuid()) $$), 'ok', 'normal match kicks off');
select is((select special_rules from public.matches where id = tests.m2()), null, 'no rules snapshot for a normal match');
select ialike(tests.ev(tests.m2(), 'SUSPENSION_RETURN', tests.home(), 5, 4), 'EK422%not used in this competition%', 'returns do not exist in normal football');
select ialike(tests.ev(tests.m2(), 'EXCLUSION', tests.home(), 5, 4, null, 0, '{"reason": "x x x"}'), 'EK422%not used in this competition%', 'nor does exclusion');
select is(tests.ev(tests.m2(), 'SUBSTITUTION', tests.home(), 10, 2, 12), 'ok', 'normal substitution');
select ialike(tests.ev(tests.m2(), 'SUBSTITUTION', tests.home(), 11, 12, 2), 'EK422%', 'no re-entry in normal football');
select is(tests.ev(tests.m2(), 'RED_CARD', tests.home(), 12, 4), 'ok', 'normal red card');
select is(array[(tests.st(tests.m2(), tests.home(), 4) ->> 'sent_off')::boolean, (tests.st(tests.m2(), tests.home(), 4) ->> 'suspended')::boolean],
  array[true, false], 'a normal red card is a permanent dismissal');
select ialike(tests.ev(tests.m2(), 'GOAL', tests.home(), 12, 4), 'EK422%', 'a dismissed player cannot score');
select is(tests.as_op($$ select public.set_stoppage(tests.m2(), gen_random_uuid(), 3) $$), 'ok', 'stoppage time still works in normal football');
select is(tests.ev(tests.m2(), 'GOAL', tests.home(), 45, 5, null, 2), 'ok', 'and 45+2'' events');
select ialike((select private.notification_content(tests.m2(), 'RED_CARD', e.id, 't') ->> 'body' from public.match_events e
  where e.match_id = tests.m2() and e.type = 'RED_CARD'), '%sent off%', 'normal red-card alert unchanged');

-- ── Security ────────────────────────────────────────────────────────────────
select tests.login_anon();
select throws_ok($$ select public.admin_set_special_rules(tests.mzc(), null) $$, '42501', null, 'anon cannot change special rules');
select throws_ok($$ select private.match_rules(tests.mz()) $$, '42501', null, 'private helpers are not callable');
reset role;

select * from finish();
rollback;
