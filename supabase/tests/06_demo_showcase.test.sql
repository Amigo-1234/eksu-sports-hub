begin;
\ir helpers.inc
select plan(56);

create temp table u as select
  tests.make_user('admin6@test.local', array['ADMIN']) as admin,
  tests.make_user('op6@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['comp', 'stage', 'demo', 'official', 'g1', 'g2', 'yc', 'sub', 'g3', 'x']);
grant select, update on ids to anon, authenticated;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.t(n int) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
-- Registered (PENDING) demo players: 'h1'..'h8' for team 1, 'a1'..'a8' for team 2.
create temp table dp (k text primary key, id uuid);
grant select, insert, update on dp to anon, authenticated;
create or replace function tests.dp(k text) returns uuid language sql stable as $$ select id from dp where dp.k = $1 $$;
create or replace function tests.audits(p_action text) returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.audit_log where action = p_action $$;
create or replace function tests.flag(p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select is_demo from public.matches where id = p $$;
create or replace function tests.score(p uuid) returns text language sql stable security definer set search_path = '' as $$
  select home_score || '-' || away_score from public.matches where id = p $$;
create or replace function tests.elig(p_match uuid, p_team uuid, p_player uuid) returns text
  language sql stable security definer set search_path = '' as $$ select private.match_eligibility(p_match, p_team, p_player) $$;
/* Demo line-up payload: first key is the goalkeeper; the last player is on the bench. */
create or replace function tests.demo_lineup(p_prefix text) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object(
    'player_id', tests.dp(p_prefix || n), 'shirt_number', n, 'role', case when n < 8 then 'STARTER' else 'SUBSTITUTE' end,
    'position', case when n = 1 then 'GK' else 'MF' end, 'x', case when n < 8 then 10 + n * 10 end,
    'y', case when n = 1 then 92 when n < 8 then 50 end, 'goalkeeper', n = 1, 'captain', n = 2) order by n)
  from generate_series(1, 8) n $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ── Fixture: a DEMO competition + match, PENDING registered players ────────
select tests.login((select admin from u));
insert into public.competitions (id, sport_id, season_id, name, short_name, status)
values (tests.id('comp'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'TEST DEMO SHOWCASE', 'DEMO', 'ACTIVE');
insert into public.competition_stages (id, competition_id, name, stage_order) values (tests.id('stage'), tests.id('comp'), 'Demo', 1);
insert into public.competition_entries (competition_id, stage_id, team_id) values
  (tests.id('comp'), tests.id('stage'), tests.t(1)), (tests.id('comp'), tests.id('stage'), tests.t(2));
insert into dp (k, id)
select pre || n, (public.admin_register_player(pre || ' Demo ' || n, 'TST-DEMO-' || pre || n, null, null,
  case pre when 'h' then tests.t(1) else tests.t(2) end, '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid
from unnest(array['h', 'a']) pre, generate_series(1, 8) n;
update ids set id = public.admin_create_match(tests.id('comp'), tests.id('stage'), null, 'DEMO SHOWCASE — not official',
  tests.t(1), tests.t(2), null, now() - interval '2 hours') where k = 'demo';
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, 'Official',
  tests.t(1), tests.t(2), null, now() + interval '1 day') where k = 'official';
reset role;
update public.matches set status = 'FT', home_score = 0, away_score = 0 where id = tests.id('demo'); -- played (no events)

-- ── Marking a match as DEMO ────────────────────────────────────────────────
select tests.login((select op from u));
select throws_ok($$ select public.admin_mark_demo_match(tests.id('demo'), 'x') $$, 'EK403', null, 'operator cannot mark a demo match');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_mark_demo_match(tests.id('official'), 'showcase') $$, 'EK422', null,
  'an official (unlabelled) match cannot become a demo match');
select throws_ok($$ select public.admin_mark_demo_match(tests.id('demo'), '  ') $$, 'EK422', null, 'marking needs a reason');
select lives_ok($$ select public.admin_mark_demo_match(tests.id('demo'), 'Directorate showcase') $$, 'admin marks the DEMO match');
select ok(tests.flag(tests.id('demo')) and tests.audits('DEMO_MATCH_MARKED') = 1, 'demo flag set and audited');
reset role;
select throws_ok($$ update public.matches set is_demo = false where id = tests.id('demo') $$, 'EK409', null,
  'the demo flag can never be cleared, even by the owner');
select throws_ok($$ update public.matches set round_label = 'Final' where id = tests.id('demo') $$, 'EK422', null,
  'a demo match must keep its visible DEMO label');
select throws_ok($$ update public.competitions set name = 'Official Cup' where id = tests.id('comp') $$, 'EK422', null,
  'a competition with demo matches must keep DEMO in its name');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_create_match(tests.id('comp'), null, null, 'Round 2', tests.t(1), tests.t(2), null, now()) $$,
  'EK422', null, 'a demo competition cannot hold official matches');

-- ── Access control ─────────────────────────────────────────────────────────
select throws_ok($$ select public.admin_demo_set_lineup(tests.id('official'), tests.t(1), '3-3-1', tests.demo_lineup('h')) $$,
  'EK422', null, 'demo line-ups are refused on an official match');
select throws_ok($$ select public.admin_demo_set_stats(tests.id('official'), tests.t(1), 50, 1, 1, 1, 1) $$,
  'EK422', null, 'demo stats are refused on an official match');
select tests.login((select op from u));
select throws_ok($$ select public.admin_demo_set_lineup(tests.id('demo'), tests.t(1), '3-3-1', tests.demo_lineup('h')) $$,
  'EK403', null, 'operator cannot write demo line-ups');
select throws_ok($$ select * from public.demo_lineup_players $$, '42501', null, 'signed-in users cannot read demo participants directly');
select tests.login_anon();
select throws_ok($$ select * from public.demo_lineup_players $$, '42501', null, 'anon cannot read demo participants');
select throws_ok($$ select * from public.demo_match_stats $$, '42501', null, 'anon cannot read demo stats tables');
select throws_ok($$ select demo_player_id from public.match_events $$, '42501', null, 'anon cannot read demo participant links');
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'GOAL', tests.t(1), 1, 5, 0, null, null, 'x') $$,
  '42501', null, 'anon cannot execute demo RPCs');

-- ── Demo line-ups with PENDING players ─────────────────────────────────────
select tests.login((select admin from u));
select throws_ok($$ select public.admin_demo_set_lineup(tests.id('demo'), tests.t(1), '3-3-1', tests.demo_lineup('a')) $$,
  'EK422', null, 'demo participants must be registered for that team');
select lives_ok($$ select public.admin_demo_set_lineup(tests.id('demo'), tests.t(1), '3-3-1', tests.demo_lineup('h')) $$,
  'home demo line-up saved with PENDING players');
select lives_ok($$ select public.admin_demo_set_lineup(tests.id('demo'), tests.t(2), '3-2-2', tests.demo_lineup('a')) $$,
  'away demo line-up saved');
select ok(tests.audits('DEMO_LINEUP_SET') = 2, 'demo line-ups are audited as DEMO');

-- Nothing official changed.
reset role;
select is((select count(*) from public.player_screenings where player_id in (select id from dp) and status <> 'PENDING')::int, 0,
  'every demo participant is still PENDING');
select is((select count(*) from public.squad_players where player_id in (select id from dp))::int, 0,
  'no demo participant became a squad member');
select is((select count(*) from public.lineup_players where player_id in (select id from dp))::int, 0,
  'no demo participant appears in an official line-up');
select is(tests.elig(tests.id('official'), tests.t(1), tests.dp('h2')), 'NOT_IN_SQUAD', 'demo participation gives no official eligibility');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_add_squad_player((select id from public.squads where team_id = tests.t(1)
  and season_id = '30000000-0000-4000-8000-000000000001'), tests.dp('h2'), 77) $$, 'EK422', null,
  'a demo participant still cannot join an official squad');
select throws_ok($$ select public.save_lineup(tests.id('official'), tests.t(1), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.dp('h2'), 'role', 'STARTER', 'slot', 1))) $$, 'EK422', null,
  'a demo participant still cannot be picked for an official line-up');
select is(jsonb_array_length(public.admin_player_detail(tests.dp('h2')) -> 'lineups'), 0, 'player detail shows no official appearances');

-- ── Demo events ────────────────────────────────────────────────────────────
select lives_ok($$ select public.admin_demo_add_event(tests.id('demo'), tests.id('g1'), 'GOAL', tests.t(1), 1, 12, 0, tests.dp('h7'), null, 'Showcase') $$,
  'named demo goal recorded');
select is(tests.score(tests.id('demo')), '1-0', 'score is derived from the demo goal');
reset role;
select ok((select player_id is null and demo_player_id is not null from public.match_events where id = tests.id('g1')),
  'demo event stores no official player reference');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'GOAL', tests.t(1), 1, 20, 0, tests.dp('h8'), null, 'x') $$,
  'EK422', null, 'a substitute who has not come on cannot score');
select lives_ok($$ select public.admin_demo_add_event(tests.id('demo'), tests.id('yc'), 'YELLOW_CARD', tests.t(2), 1, 41, 0, tests.dp('a3'), null, 'Showcase') $$,
  'demo yellow card');
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'YELLOW_CARD', tests.t(2), 2, 50, 0, tests.dp('a3'), null, 'x') $$,
  'EK422', null, 'a second plain yellow is refused');
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'SUBSTITUTION', tests.t(1), 2, 60, 0, tests.dp('h6'), tests.dp('h5'), 'x') $$,
  'EK422', null, 'the player coming on must be on the bench');
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'GOAL', tests.t(1), 1, 60, 0, tests.dp('h7'), null, 'x') $$,
  'EK422', null, 'minute outside the period is refused');
select lives_ok($$ select public.admin_demo_add_event(tests.id('demo'), tests.id('sub'), 'SUBSTITUTION', tests.t(1), 2, 61, 0, tests.dp('h6'), tests.dp('h8'), 'Showcase') $$,
  'demo substitution');
select lives_ok($$ select public.admin_demo_add_event(tests.id('demo'), tests.id('g2'), 'GOAL', tests.t(1), 2, 70, 0, tests.dp('h8'), null, 'Showcase') $$,
  'the substitute can score after coming on');
select throws_ok($$ select public.admin_demo_add_event(tests.id('demo'), gen_random_uuid(), 'GOAL', tests.t(1), 2, 75, 0, tests.dp('h6'), null, 'x') $$,
  'EK422', null, 'a substituted player cannot score afterwards');
select throws_ok($$ select public.admin_demo_set_lineup(tests.id('demo'), tests.t(1), '3-3-1', tests.demo_lineup('h')) $$,
  'EK409', null, 'a demo line-up with recorded events cannot be silently replaced');
select ok(tests.audits('DEMO_EVENT_ADDED') = 4, 'demo events are audited as DEMO');

-- Trigger-level isolation (even for the owner).
reset role;
select throws_ok($$ insert into public.match_events (id, match_id, seq, type, period, minute, team_id, demo_player_id, recorded_by)
  values (gen_random_uuid(), tests.id('official'), 999, 'GOAL', 1, 5, tests.t(1),
    (select id from public.demo_lineup_players where player_id = tests.dp('h7')), (select admin from u)) $$,
  'EK422', null, 'a demo participant can never appear in an official match');
select throws_ok($$ insert into public.match_events (id, match_id, seq, type, period, minute, team_id, demo_player_id, recorded_by)
  values (gen_random_uuid(), tests.id('demo'), 999, 'GOAL', 1, 5, tests.t(2),
    (select id from public.demo_lineup_players where player_id = tests.dp('h7')), (select admin from u)) $$,
  'EK422', null, 'a demo participant cannot play for the other team');
select throws_ok($$ insert into public.demo_match_stats (match_id, team_id, possession, shots, shots_on_target, corners, fouls)
  values (tests.id('official'), tests.t(1), 50, 1, 1, 1, 1) $$, 'EK422', null, 'demo stats can never attach to an official match');

-- ── Stats ──────────────────────────────────────────────────────────────────
select tests.login((select admin from u));
select lives_ok($$ select public.admin_demo_set_stats(tests.id('demo'), tests.t(1), 54, 12, 7, 5, 10) $$, 'home demo stats');
select throws_ok($$ select public.admin_demo_set_stats(tests.id('demo'), tests.t(2), 50, 10, 5, 4, 12) $$, 'EK422', null,
  'possession must add up to 100%');
select lives_ok($$ select public.admin_demo_set_stats(tests.id('demo'), tests.t(2), 46, 10, 5, 4, 12) $$, 'away demo stats');

-- ── Public feed ────────────────────────────────────────────────────────────
select tests.login_anon();
select ok((select bool_and(e ? 'player_name' and e ->> 'player_name' is not null)
  from jsonb_array_elements(public.public_match_feed(tests.id('demo')) -> 'events') e), 'public events carry demo names');
select is((select count(*) from jsonb_array_elements(public.public_match_feed(tests.id('demo')) -> 'lineups') l
  where (l ->> 'demo')::boolean)::int, 2, 'public feed shows both demo line-ups, flagged demo');
select ok((select (p ->> 'subbed_on')::boolean from jsonb_array_elements(public.public_match_feed(tests.id('demo')) -> 'lineups' -> 0 -> 'players') p
  where p ->> 'shirt_number' = '8'), 'line-up state reflects the demo substitution');
select ok(public.public_match_feed(tests.id('demo')) -> 'stats' ->> 'demo' = 'true'
  and public.public_match_feed(tests.id('demo')) -> 'stats' -> 'cards' -> 'away' ->> 'yellow' = '1'
  and (public.public_match_feed(tests.id('demo')) -> 'match' ->> 'is_demo')::boolean, 'demo stats are labelled demo, cards derived from events');
select ok(public.public_match_feed(tests.id('demo'))::text !~* '(TST-DEMO|student|screening|pending|player_id)',
  'demo feed exposes no identities, screening or ids');
select ok(public.public_match_feed(tests.id('official')) -> 'stats' = 'null'::jsonb
  and not (public.public_match_feed(tests.id('official')) -> 'match' ->> 'is_demo')::boolean, 'official matches carry no demo stats');

-- ── Admin UI writes (signed-in ADMIN, RLS path) still work with the guards ──
select tests.login((select admin from u));
select lives_ok($$ update public.competitions set name = 'DEV Inter-Faculty League (renamed)', points_win = 3
  where id = '60000000-0000-4000-8000-000000000001' $$, 'a signed-in admin can still save an official competition');
select throws_ok($$ update public.competitions set name = 'Official Cup' where id = tests.id('comp') $$, 'EK422', null,
  'a signed-in admin still cannot drop DEMO from a demo competition');
select lives_ok($$ update public.competitions set name = 'TEST DEMO SHOWCASE (renamed)' where id = tests.id('comp') $$,
  'a demo competition can be renamed while it keeps DEMO');

select * from finish();
rollback;
