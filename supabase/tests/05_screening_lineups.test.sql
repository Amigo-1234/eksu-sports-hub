begin;
\ir helpers.inc
select plan(163);

create temp table u as select
  tests.make_user('admin5@test.local', array['ADMIN']) as admin,
  tests.make_user('op5@test.local', array['OPERATOR']) as op,
  tests.make_user('op5b@test.local', array['OPERATOR']) as op_other,
  tests.make_user('mgr5@test.local', array['MANAGER']) as mgr,
  tests.make_user('op5c@test.local', array['OPERATOR']) as op_backup,
  tests.make_user('fan5@test.local') as nobody;
grant select on u to anon, authenticated;

create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['p1', 'p2', 'p3', 'season2', 'm', 'm2', 'start', 'start2', 'sub', 'g14', 'red5', 'red16', 'mech', 'civil', 'cupA', 'p4', 'p5', 'mA', 'mB']);
grant select, update on ids to anon, authenticated;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.t(n int) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
-- Current screening of a player for a team (season-level).
create or replace function tests.scr(p_player uuid, p_team uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.player_screenings where player_id = p_player and team_id = p_team and competition_id is null
  order by created_at desc limit 1 $$;
create or replace function tests.scr_status(p_player uuid, p_team uuid) returns text language sql stable security definer set search_path = '' as $$
  select status::text from public.player_screenings where id = tests.scr(p_player, p_team) $$;
create or replace function tests.squad(p_team uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.squads where team_id = p_team and season_id = '30000000-0000-4000-8000-000000000001' $$;
create or replace function tests.lineup_status(p_match uuid, p_team uuid) returns text language sql stable security definer set search_path = '' as $$
  select status::text from public.match_lineups where match_id = p_match and team_id = p_team $$;
create or replace function tests.on_field(p_match uuid, p_team uuid, p_shirt int) returns boolean language sql stable security definer set search_path = '' as $$
  select s.on_field from private.lineup_player_states(
    (select id from public.match_lineups where match_id = p_match and team_id = p_team)) s where s.shirt_number = p_shirt $$;
create or replace function tests.audits(p_action text, p_match uuid default null) returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.audit_log where action = p_action and (p_match is null or match_id = p_match) $$;
/*
 * Line-up payload from squad shirt numbers: starters fill 4-4-2 slots in the
 * order given (the first is the goalkeeper slot), then substitutes.
 */
create or replace function tests.lineup(p_team uuid, p_starters int[], p_subs int[], p_captain int default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.o), '[]'::jsonb) from (
    select s.o, jsonb_build_object('player_id', tests.player(p_team, s.shirt), 'role', 'STARTER', 'slot', s.o - 1,
      'captain', s.shirt = p_captain) as j
    from unnest(p_starters) with ordinality s(shirt, o)
    union all
    select 100 + b.o, jsonb_build_object('player_id', tests.player(p_team, b.shirt), 'role', 'SUBSTITUTE', 'captain', b.shirt = p_captain)
    from unnest(p_subs) with ordinality b(shirt, o)
  ) x $$;
create or replace function tests.lineup_role(p_match uuid, p_team uuid, p_shirt int) returns text
  language sql stable security definer set search_path = '' as $$
  select lp.role::text from public.lineup_players lp join public.match_lineups l on l.id = lp.lineup_id
  where l.match_id = p_match and l.team_id = p_team and lp.shirt_number = p_shirt $$;
create or replace function tests.hints(p_topic text) returns bigint language sql security definer set search_path = '' as $$
  select count(*) from realtime.messages where topic = p_topic $$;
create or replace function tests.elig(p_match uuid, p_team uuid, p_player uuid) returns text
  language sql stable security definer set search_path = '' as $$ select private.match_eligibility(p_match, p_team, p_player) $$;
create or replace function tests.snap_status(p uuid) returns text language sql stable security definer set search_path = '' as $$
  select status::text from public.matches where id = p $$;
create or replace function tests.snap_active(p uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select active_operator_id from public.matches where id = p $$;
create or replace function tests.status_of(p_player uuid, p_team uuid, p_season uuid, p_comp uuid default null) returns text
  language sql stable security definer set search_path = '' as $$ select private.screening_status(p_player, p_team, p_season, p_comp) $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ═════ Registration and private identity ════════════════════════════════════
select tests.login((select admin from u));
update ids set id = (public.admin_register_player('Ada Test', 'EKSU/2020/001', null, null, tests.t(1),
  '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid where k = 'p1';
select is(tests.scr_status(tests.id('p1'), tests.t(1)), 'PENDING', 'registered player starts PENDING');
select throws_ok($$ select public.admin_register_player('Ada Copy', ' eksu/2020/001 ', null, null, tests.t(1), '30000000-0000-4000-8000-000000000001') $$,
  'EK409', 'A player with this student number is already registered', 'same student number (any case/spacing) cannot register twice');
select throws_ok($$ select public.admin_register_player('No Number', '  ', null, null, tests.t(1), '30000000-0000-4000-8000-000000000001') $$,
  'EK422', null, 'student number is required');
select ok((select after_state ->> 'student_id' from public.audit_log where action = 'PLAYER_REGISTERED' and entity_id = tests.id('p1'))
  not like '%2020%', 'audit keeps only a masked student number');
update ids set id = (public.admin_register_player('Bola Test', 'EKSU/2020/002', null, null, tests.t(1),
  '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid where k = 'p2';
update ids set id = (public.admin_register_player('Chidi Test', 'EKSU/2020/003', null, null, tests.t(1),
  '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid where k = 'p3';

select tests.login((select op from u));
select throws_ok($$ select public.admin_register_player('X', 'EKSU/X/1', null, null, tests.t(1), '30000000-0000-4000-8000-000000000001') $$,
  'EK403', null, 'operator cannot register players');
select is((select count(*) from public.player_identities)::int, 0, 'operator cannot read student numbers');
select is((select count(*) from public.player_screenings)::int, 0, 'operator cannot read screenings');
select is((select count(*) from public.player_screening_decisions)::int, 0, 'operator cannot read screening history');
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'CLEARED') $$,
  'EK403', null, 'operator cannot clear players');
select throws_ok($$ select public.admin_list_screenings() $$, 'EK403', null, 'operator cannot list the screening queue');
select throws_ok($$ select public.admin_player_detail(tests.id('p1')) $$, 'EK403', null, 'operator cannot open player detail');
select ok((select display_name from public.players where id = tests.id('p1')) = 'Ada Test', 'operator may still read player names');

select tests.login((select mgr from u));
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'CLEARED') $$,
  'EK403', null, 'manager cannot decide screenings (no scoped manager model yet)');
select is((select count(*) from public.player_identities)::int, 0, 'manager cannot read student numbers');

select tests.login_anon();
select throws_ok($$ select student_id from public.player_identities $$, '42501', null, 'anon cannot read student numbers');
select throws_ok($$ select status from public.player_screenings $$, '42501', null, 'anon cannot read screenings');
select throws_ok($$ select * from public.player_screening_decisions $$, '42501', null, 'anon cannot read screening history');
select throws_ok($$ select * from public.players $$, '42501', null, 'anon cannot read the player register');

-- ═════ Screening decisions ══════════════════════════════════════════════════
select tests.login((select admin from u));
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p1'), 30) $$,
  'EK422', null, 'PENDING player cannot join a squad');
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'REJECTED') $$,
  'EK422', null, 'REJECT requires a reason');
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'SUSPENDED', '   ') $$,
  'EK422', null, 'SUSPEND requires a reason');
select lives_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'REJECTED', 'Not a registered student') $$,
  'admin rejects with a reason');
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p1'), 30) $$,
  'EK422', null, 'REJECTED player cannot join a squad');
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'REJECTED', 'again') $$,
  'EK409', null, 'the same decision twice is refused');
select lives_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'PENDING', 'Documents resubmitted') $$,
  'admin returns a player to pending');
select lives_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(1)), 'CLEARED', null, 'Matric card seen', current_date) $$,
  'admin clears a player');
select is((select count(*) from public.player_screening_decisions where screening_id = tests.scr(tests.id('p1'), tests.t(1)))::int, 4,
  'every decision is kept in history (opened, rejected, pending, cleared)');
select is((select array_agg(to_status::text order by decided_at, to_status) from public.player_screening_decisions
  where screening_id = tests.scr(tests.id('p1'), tests.t(1)) and from_status is not null),
  array['REJECTED', 'PENDING', 'CLEARED'], 'history records each transition');
select ok(tests.audits('SCREENING_REJECTED') = 1 and tests.audits('SCREENING_RETURNED_TO_PENDING') = 1 and tests.audits('SCREENING_CLEARED') >= 1,
  'screening decisions are audited');
select is((select screened_by from public.player_screenings where id = tests.scr(tests.id('p1'), tests.t(1))), (select admin from u),
  'current decision records who screened');
select throws_ok($$ select public.admin_decide_screening(tests.scr(tests.id('p3'), tests.t(1)), 'CLEARED', null, null, current_date + 3) $$,
  'EK422', null, 'a screening date in the future is refused');
reset role;
select throws_ok($$ update public.player_screening_decisions set to_status = 'CLEARED' where true $$, '42501', null,
  'screening history is append-only, even for the owner');
select throws_ok($$ delete from public.player_screening_decisions where true $$, '42501', null, 'screening history cannot be deleted');
select tests.login((select admin from u));

select is(public.admin_player_detail(tests.id('p1')) -> 'player' ->> 'student_id', 'EKSU/2020/001', 'admin sees the student number on player detail');
select is(jsonb_array_length(public.admin_player_detail(tests.id('p1')) -> 'screenings' -> 0 -> 'history'), 4, 'player detail includes full decision history');
select is(jsonb_array_length(public.admin_list_screenings(p_student_id => '2020/00 2') -> 'rows'), 1, 'screening queue filters by student number');
select is(jsonb_array_length(public.admin_list_screenings(p_status => 'PENDING', p_name => 'chidi') -> 'rows'), 1, 'screening queue filters by status and name');

-- ═════ Squads ═══════════════════════════════════════════════════════════════
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p1'), 30, 'MF') $$, 'CLEARED player joins the squad');
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p1'), 31) $$,
  'EK409', 'That player is already in this squad', 'duplicate player in a squad refused');
select public.admin_decide_screening(tests.scr(tests.id('p2'), tests.t(1)), 'CLEARED');
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p2'), 30) $$,
  'EK409', 'Shirt 30 is already taken in this squad', 'duplicate shirt number in a squad refused');
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(1)), tests.id('p2'), 31, 'DF', true) $$, 'second player joins as captain');
select is((select count(*) from public.squad_players where squad_id = tests.squad(tests.t(1)) and is_captain and active)::int, 1, 'one captain per squad');
select ok(tests.audits('SQUAD_PLAYER_ADDED') >= 2, 'squad additions are audited');

-- Player changes team within the season.
select public.admin_open_screening(tests.id('p1'), tests.t(2), '30000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.admin_open_screening(tests.id('p1'), tests.t(2), '30000000-0000-4000-8000-000000000001') $$,
  'EK409', null, 'a screening scope cannot be opened twice');
select public.admin_decide_screening(tests.scr(tests.id('p1'), tests.t(2)), 'CLEARED');
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(2)), tests.id('p1'), 30) $$,
  'EK409', null, 'a player cannot be in two squads whose teams meet in the same competition');
select throws_ok($$ select public.admin_set_squad_player_active((select id from public.squad_players where player_id = tests.id('p1') and squad_id = tests.squad(tests.t(1))), false) $$,
  'EK422', null, 'removing a player from a squad needs a reason');
select lives_ok($$ select public.admin_set_squad_player_active((select id from public.squad_players where player_id = tests.id('p1') and squad_id = tests.squad(tests.t(1))), false, 'Transferred to Engineering') $$,
  'membership deactivated with a reason');
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(2)), tests.id('p1'), 30) $$, 'player joins the new team''s squad');
select is((select count(*) from public.squad_players where player_id = tests.id('p1'))::int, 2, 'old squad membership kept as history');
select ok((select left_at is not null and left_reason = 'Transferred to Engineering' from public.squad_players
  where player_id = tests.id('p1') and squad_id = tests.squad(tests.t(1))), 'history records when and why the player left');

-- Another season: screening is per season.
insert into public.seasons (id, name, starts_on, ends_on) values (tests.id('season2'), 'TEST 2027/28', '2027-08-01', '2028-07-31');
select public.admin_open_screening(tests.id('p1'), tests.t(2), tests.id('season2'));
select is((select tests.status_of(tests.id('p1'), tests.t(2), tests.id('season2'))), 'PENDING', 'new season needs a new screening');
select is((select tests.status_of(tests.id('p1'), tests.t(2), '30000000-0000-4000-8000-000000000001')), 'CLEARED', 'earlier season stays cleared');
-- A competition-scoped screening can only restrict.
select public.admin_open_screening(tests.id('p1'), tests.t(2), '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001');
select is((select tests.status_of(tests.id('p1'), tests.t(2), '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')),
  'PENDING', 'a pending competition screening blocks that competition');
select public.admin_decide_screening(s.id, 'CLEARED') from public.player_screenings s
  where s.player_id = tests.id('p1') and s.competition_id = '60000000-0000-4000-8000-000000000001';

-- ═════ Competition-aware squads ═════════════════════════════════════════════
-- Department team in an inter-departmental cup + faculty team (DEV Engineering)
-- in the inter-faculty league, same season.
insert into public.teams (id, sport_id, name, short_name, code, slug, kind, faculty_id) values
  (tests.id('mech'), '20000000-0000-4000-8000-000000000001', 'TEST Mechanical Engineering', 'Mech Eng', 'MEE', 'test-mech', 'DEPARTMENT', '40000000-0000-4000-8000-000000000002'),
  (tests.id('civil'), '20000000-0000-4000-8000-000000000001', 'TEST Civil Engineering', 'Civil Eng', 'CVE', 'test-civil', 'DEPARTMENT', '40000000-0000-4000-8000-000000000002');
insert into public.competitions (id, sport_id, season_id, name, short_name)
values (tests.id('cupA'), '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'TEST Inter-Departmental Cup', 'Dept Cup');
insert into public.competition_entries (competition_id, team_id) values (tests.id('cupA'), tests.id('mech')), (tests.id('cupA'), tests.id('civil'));
insert into public.squads (team_id, season_id) values
  (tests.id('mech'), '30000000-0000-4000-8000-000000000001'), (tests.id('civil'), '30000000-0000-4000-8000-000000000001');
update ids set id = (public.admin_register_player('Dayo Dual', 'EKSU/2021/044', null, null, tests.id('mech'),
  '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid where k = 'p4';
select public.admin_decide_screening(tests.scr(tests.id('p4'), tests.id('mech')), 'CLEARED');
select public.admin_open_screening(tests.id('p4'), tests.t(2), '30000000-0000-4000-8000-000000000001');
select public.admin_decide_screening(tests.scr(tests.id('p4'), tests.t(2)), 'CLEARED');
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.id('mech')), tests.id('p4'), 7) $$,
  'player joins Department A (Competition A)');
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.t(2)), tests.id('p4'), 40) $$,
  'same season, the same player also joins Faculty A (Competition B)');
select is((select count(*) from public.squad_players where player_id = tests.id('p4') and active)::int, 2, 'two active memberships in one season');
update ids set id = public.admin_create_match(tests.id('cupA'), null, null, 'Cup R1', tests.id('mech'), tests.id('civil'), null, now() + interval '2 days') where k = 'mA';
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, 'League', tests.t(2), tests.t(3), null, now() + interval '3 days') where k = 'mB';
select is(tests.elig(tests.id('mA'), tests.id('mech'), tests.id('p4')) || '/' || tests.elig(tests.id('mB'), tests.t(2), tests.id('p4')), 'CLEARED/CLEARED',
  'eligible for Department A in Competition A and for Faculty A in Competition B');
select lives_ok($$ select public.save_lineup(tests.id('mA'), tests.id('mech'), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.id('p4'), 'role', 'STARTER', 'slot', 5))) $$, 'selected for the department in the cup');
select lives_ok($$ select public.save_lineup(tests.id('mB'), tests.t(2), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.id('p4'), 'role', 'STARTER', 'slot', 5))) $$, 'and for the faculty in the league');
-- Opposing teams inside one competition.
update ids set id = (public.admin_register_player('Opeyemi Opposed', 'EKSU/2021/045', null, null, tests.id('civil'),
  '30000000-0000-4000-8000-000000000001') ->> 'player_id')::uuid where k = 'p5';
select public.admin_decide_screening(tests.scr(tests.id('p5'), tests.id('civil')), 'CLEARED');
select public.admin_open_screening(tests.id('p5'), tests.id('mech'), '30000000-0000-4000-8000-000000000001');
select public.admin_decide_screening(tests.scr(tests.id('p5'), tests.id('mech')), 'CLEARED');
select public.admin_add_squad_player(tests.squad(tests.id('civil')), tests.id('p5'), 9);
select throws_ok($$ select public.admin_add_squad_player(tests.squad(tests.id('mech')), tests.id('p5'), 9) $$,
  'EK409', null, 'a player cannot represent two opposing teams in the same competition');
select throws_ok($$ insert into public.competition_entries (competition_id, team_id) values ('60000000-0000-4000-8000-000000000001', tests.id('mech')) $$,
  'EK409', null, 'entering a team that shares an active player with an entered team is refused');
update public.competitions set allow_multi_team_players = true where id = tests.id('cupA');
select lives_ok($$ select public.admin_add_squad_player(tests.squad(tests.id('mech')), tests.id('p5'), 9) $$,
  'allowed when the competition''s rules explicitly permit it');
select throws_ok($$ update public.competitions set allow_multi_team_players = false where id = tests.id('cupA') $$,
  'EK409', null, 'the rule cannot be switched off while players represent two of its teams');

-- ═════ Line-ups ═════════════════════════════════════════════════════════════
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', null, 'Lineups',
  tests.t(1), tests.t(2), '50000000-0000-4000-8000-000000000001', now() + interval '1 hour') where k = 'm';
update ids set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', null, 'Override',
  tests.t(3), tests.t(4), '50000000-0000-4000-8000-000000000002', now() + interval '1 hour') where k = 'm2';
select public.admin_assign_operators(tests.id('m'), (select op from u), (select op_backup from u));
select public.admin_assign_operators(tests.id('m2'), (select op from u));
-- Suspend home No. 5 before anyone builds a line-up.
select public.admin_decide_screening(tests.scr(tests.player(tests.t(1), 5), tests.t(1)), 'SUSPENDED', 'Two-match ban');

select tests.login((select op_other from u));
select throws_ok($$ select public.lineup_editor_state(tests.id('m'), tests.t(1)) $$, 'EK403', null, 'unassigned operator cannot see the line-up editor');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', '[]') $$, 'EK403', null, 'unassigned operator cannot save a line-up');
select tests.login((select mgr from u));
select throws_ok($$ select public.lineup_editor_state(tests.id('m'), tests.t(1)) $$, 'EK403', null, 'unassigned manager cannot edit line-ups');
select tests.login_anon();
select throws_ok($$ select public.lineup_editor_state(tests.id('m'), tests.t(1)) $$, '42501', null, 'anon cannot use the line-up editor');
select throws_ok($$ select * from public.match_lineups $$, '42501', null, 'anon cannot read line-up tables');
select throws_ok($$ select * from public.lineup_players $$, '42501', null, 'anon cannot read line-up players');

select tests.login((select op from u));
select ok(not exists (select 1 from jsonb_array_elements(public.lineup_editor_state(tests.id('m'), tests.t(1)) -> 'squad') x
  where x ->> 'eligibility' <> 'CLEARED'), 'operator sees only eligible squad players');
select ok(public.lineup_editor_state(tests.id('m'), tests.t(1))::text not like '%student%', 'editor state carries no student numbers');
select is(jsonb_array_length(public.lineup_editor_state(tests.id('m'), tests.t(1)) -> 'formations'), 6, 'formations come from data');
select lives_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,3,4,6], array[12])) $$,
  'incomplete draft can be saved');
select is(tests.lineup_status(tests.id('m'), tests.t(1)), 'DRAFT', 'draft stays draft');
select throws_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(1)) $$, 'EK422', null, 'incomplete line-up cannot be confirmed');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,3,4,6,7,8,9,10,11,12,13], '{}')) $$,
  'EK422', null, 'more than 11 starters refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,3], array[3])) $$,
  'EK422', null, 'the same player as starter and substitute refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.player(tests.t(1), 2), 'role', 'STARTER', 'slot', 1),
                    jsonb_build_object('player_id', tests.player(tests.t(1), 2), 'role', 'STARTER', 'slot', 2))) $$,
  'EK422', null, 'the same player twice refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.player(tests.t(1), 2), 'role', 'STARTER', 'slot', 1, 'shirt_number', 9),
                    jsonb_build_object('player_id', tests.player(tests.t(1), 9), 'role', 'STARTER', 'slot', 2))) $$,
  'EK422', 'Shirt 9 is used by more than one player in this line-up', 'duplicate shirt numbers in a line-up refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,3], array[12], 12)) $$,
  'EK422', 'The captain must be in the starting XI', 'captain on the bench refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,5], '{}')) $$,
  'EK422', null, 'SUSPENDED player cannot be selected');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.player(tests.t(1), 1), 'role', 'STARTER', 'slot', 0),
                    jsonb_build_object('player_id', tests.player(tests.t(1), 13), 'role', 'STARTER', 'slot', 1, 'goalkeeper', true))) $$,
  'EK422', 'Only one starting goalkeeper is allowed', 'two starting goalkeepers refused');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2',
  jsonb_build_array(jsonb_build_object('player_id', tests.id('p3'), 'role', 'STARTER', 'slot', 1))) $$,
  'EK422', null, 'registered but unscreened player (not in squad) cannot be selected');
select is(jsonb_array_length(public.public_match_feed(tests.id('m')) -> 'lineups'), 0, 'draft line-up is not public');

-- Valid line-ups; home No. 10 captain.
select lives_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1,2,3,4,6,7,8,9,10,11,31], array[12,13,14,15,16], 10)) $$,
  'full home line-up saved');
select lives_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(1)) $$, 'operator confirms the home line-up');
select is(tests.lineup_status(tests.id('m'), tests.t(1)), 'CONFIRMED', 'home line-up confirmed');
select ok(tests.audits('LINEUP_CONFIRMED', tests.id('m')) = 1, 'confirmation audited');
select ok(tests.hints('match:' || tests.id('m')) >= 1, 'confirming a line-up sends a realtime hint to the match channel');
select is(tests.audits('LINEUP_SAVED', tests.id('m')), 0::bigint, 'draft saves do not spam the audit log');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-3-3', tests.lineup(tests.t(1), array[1,2,3], '{}')) $$,
  'EK409', null, 'confirmed line-up cannot be casually rewritten');
select throws_ok($$ select public.start_match(tests.id('m'), tests.id('start')) $$, 'EK409', null, 'kick-off blocked while a line-up is missing');

select tests.login_anon();
select is(jsonb_array_length(public.public_match_feed(tests.id('m')) -> 'lineups'), 1, 'confirmed line-up is public');
select ok(not exists (select 1 from jsonb_array_elements(public.public_match_feed(tests.id('m')) -> 'lineups' -> 0 -> 'players') p
  where p ?| array['player_id', 'student_id', 'eligibility', 'screening']), 'public line-up exposes no ids, identities or screening data');
select is((select count(*) from jsonb_array_elements(public.public_match_feed(tests.id('m')) -> 'lineups' -> 0 -> 'players') p
  where (p ->> 'captain')::boolean and p ->> 'shirt_number' = '10')::int, 1, 'public line-up shows the captain');

-- Away draft includes No. 6; then No. 6 is suspended after the draft.
select tests.login((select op from u));
select public.save_lineup(tests.id('m'), tests.t(2), '4-3-3', tests.lineup(tests.t(2), array[1,2,3,4,5,6,7,8,9,10,11], array[12,13,14,15,16,17], 9));
select tests.login((select admin from u));
select public.admin_decide_screening(tests.scr(tests.player(tests.t(2), 6), tests.t(2)), 'SUSPENDED', 'Misconduct');
select tests.login((select op from u));
select ok(jsonb_array_length(public.lineup_editor_state(tests.id('m'), tests.t(2)) -> 'lineup' -> 'problems') > 0,
  'draft flags a player suspended after the draft');
select throws_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(2)) $$, 'EK422', null, 'draft with a suspended player cannot be confirmed');
select lives_ok($$ select public.save_lineup(tests.id('m'), tests.t(2), '4-3-3', tests.lineup(tests.t(2), array[1,2,3,4,5,17,7,8,9,10,11], array[12,13,14,15,16,18], 9)) $$,
  'operator replaces the suspended player');
select lives_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(2)) $$, 'away line-up confirmed');

-- Status change after confirmation: home No. 3 suspended → line-up reopened automatically.
select tests.login((select admin from u));
select is((public.admin_decide_screening(tests.scr(tests.player(tests.t(1), 3), tests.t(1)), 'SUSPENDED', 'Late registration issue') ->> 'reopened_lineups')::int,
  1, 'suspending a confirmed player reopens that line-up');
select is(tests.lineup_status(tests.id('m'), tests.t(1)), 'DRAFT', 'home line-up is a draft again (unpublished)');
select ok(tests.audits('LINEUP_AUTO_REOPENED', tests.id('m')) = 1, 'automatic reopen is audited');
select public.admin_decide_screening(tests.scr(tests.player(tests.t(1), 3), tests.t(1)), 'CLEARED');
select tests.login((select op from u));
select public.confirm_lineup(tests.id('m'), tests.t(1));
select throws_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), '') $$, 'EK422', null, 'reopening needs a reason');
select lives_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), 'Captain change') $$, 'operator reopens before kick-off');
select ok(tests.audits('LINEUP_REOPENED', tests.id('m')) = 1, 'reopen audited');
select public.confirm_lineup(tests.id('m'), tests.t(1));

-- Pre-kick-off control: PRIMARY manages, BACKUP views until an audited take-over, ADMIN always may.
select tests.login((select op_backup from u));
select is(public.lineup_editor_state(tests.id('m'), tests.t(1)) ->> 'viewer_role', 'VIEWER', 'backup sees line-ups read-only');
select ok(not (public.lineup_editor_state(tests.id('m'), tests.t(1)) ->> 'editable')::boolean, 'backup editor is not editable');
select throws_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), 'Backup change') $$, 'EK403', null, 'backup cannot reopen before taking over');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(2), '4-3-3', '[]') $$, 'EK403', null, 'backup cannot edit before taking over');
select lives_ok($$ select public.take_over_match(tests.id('m'), gen_random_uuid()) $$, 'backup takes over before kick-off');
select ok(tests.audits('OPERATOR_TAKEOVER', tests.id('m')) = 1, 'take-over audited');
select lives_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), 'Late change by backup') $$, 'backup in control reopens');
select tests.login((select op from u));
select throws_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(1)) $$, 'EK403', null, 'primary is read-only while the backup is in control');
select is(public.lineup_editor_state(tests.id('m'), tests.t(1)) ->> 'viewer_role', 'VIEWER', 'primary now views read-only');
select tests.login((select op_backup from u));
select lives_ok($$ select public.confirm_lineup(tests.id('m'), tests.t(1)) $$, 'backup in control confirms');
select tests.login((select admin from u));
select lives_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), 'Admin check'); select public.confirm_lineup(tests.id('m'), tests.t(1)) $$,
  'admin may always intervene');
select tests.login((select op from u));

-- Kick-off override (match 2 has no line-ups).
select throws_ok($$ select public.start_match(tests.id('m2'), tests.id('start2')) $$, 'EK409', null, 'match start without confirmed line-ups is blocked');
select throws_ok($$ select public.admin_set_lineup_override(tests.id('m2'), 'Team sheets lost') $$, 'EK403', null, 'operator cannot override');
select tests.login((select admin from u));
select lives_ok($$ select public.admin_set_lineup_override(tests.id('m2'), 'Team sheets lost; referee approved') $$, 'admin emergency override');
select ok(tests.audits('LINEUP_REQUIREMENT_OVERRIDDEN', tests.id('m2')) = 1, 'override audited');
select tests.login((select op from u));
select lives_ok($$ select public.start_match(tests.id('m2'), tests.id('start2')) $$, 'overridden match can start');

-- ═════ Kick-off control ═════════════════════════════════════════════════════
-- The backup took control of match m above: the primary must take it back.
select throws_ok($$ select public.start_match(tests.id('m'), tests.id('start')) $$, 'EK403', null,
  'primary cannot start while the backup is in control');
select tests.login((select op_backup from u));
select throws_ok($$ select public.start_match(tests.id('mB'), gen_random_uuid()) $$, 'EK403', null, 'unassigned operator cannot start');
select tests.login((select op from u));
select lives_ok($$ select public.take_over_match(tests.id('m'), gen_random_uuid()) $$, 'primary takes control back (audited)');
select ok(tests.audits('OPERATOR_TAKEOVER', tests.id('m')) = 2, 'both take-overs audited');

-- ═════ Kick-off, lock, substitutions, discipline ════════════════════════════
select lives_ok($$ select public.start_match(tests.id('m'), tests.id('start')) $$, 'kick-off with both line-ups confirmed');
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', tests.lineup(tests.t(1), array[1], '{}')) $$,
  'EK409', null, 'line-up locked after kick-off');
select throws_ok($$ select public.reopen_lineup(tests.id('m'), tests.t(1), 'x') $$, 'EK409', null, 'cannot reopen after kick-off');
select throws_ok($$ select public.admin_correct_lineup(tests.id('m'), tests.t(1), '4-4-2', '[]', 'x') $$, 'EK403', null, 'operator cannot correct after kick-off');
select tests.login((select op_backup from u));
select throws_ok($$ select public.save_lineup(tests.id('m'), tests.t(1), '4-4-2', '[]') $$, 'EK403', null, 'backup stays locked out after kick-off');
select tests.login((select op from u));
reset role;
select throws_ok($$ update public.lineup_players set is_captain = false where lineup_id = (select id from public.match_lineups where match_id = tests.id('m') limit 1) $$,
  'EK409', null, 'even a direct write cannot rewrite a started match''s line-up');
select tests.login((select op from u));

select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'SUBSTITUTION', tests.t(1), 20, 0, tests.player(tests.t(1), 12), tests.player(tests.t(1), 14)) $$,
  'EK422', null, 'player OFF must be on the pitch');
select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'SUBSTITUTION', tests.t(1), 20, 0, tests.player(tests.t(1), 7), tests.player(tests.t(1), 2)) $$,
  'EK422', null, 'player ON must be on the bench (not already on the field)');
select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'SUBSTITUTION', tests.t(1), 20, 0, tests.player(tests.t(1), 7), tests.player(tests.t(1), 17)) $$,
  'EK422', null, 'player ON must be in the line-up');
select lives_ok($$ select public.record_event(tests.id('m'), tests.id('sub'), 'SUBSTITUTION', tests.t(1), 20, 0, tests.player(tests.t(1), 7), tests.player(tests.t(1), 14)) $$,
  'valid substitution recorded');
select ok(not tests.on_field(tests.id('m'), tests.t(1), 7) and tests.on_field(tests.id('m'), tests.t(1), 14), 'OFF leaves, ON enters the field');
select is(tests.lineup_role(tests.id('m'), tests.t(1), 7), 'STARTER', 'confirmed starting XI is not rewritten');
select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'GOAL', tests.t(1), 22, 0, tests.player(tests.t(1), 12)) $$,
  'EK422', null, 'a bench player cannot score');
select lives_ok($$ select public.record_event(tests.id('m'), tests.id('g14'), 'GOAL', tests.t(1), 23, 0, tests.player(tests.t(1), 14)) $$,
  'the substitute who came on can score');
select lives_ok($$ select public.record_event(tests.id('m'), tests.id('red5'), 'RED_CARD', tests.t(2), 25, 0, tests.player(tests.t(2), 5)) $$,
  'red card recorded');
select ok(not tests.on_field(tests.id('m'), tests.t(2), 5), 'red card removes the player from the field');
select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'SUBSTITUTION', tests.t(2), 26, 0, tests.player(tests.t(2), 5), tests.player(tests.t(2), 12)) $$,
  'EK422', null, 'a dismissed player cannot be substituted');
select lives_ok($$ select public.record_event(tests.id('m'), tests.id('red16'), 'RED_CARD', tests.t(2), 27, 0, tests.player(tests.t(2), 16)) $$,
  'bench player can be sent off');
select throws_ok($$ select public.record_event(tests.id('m'), gen_random_uuid(), 'SUBSTITUTION', tests.t(2), 28, 0, tests.player(tests.t(2), 7), tests.player(tests.t(2), 16)) $$,
  'EK422', null, 'a dismissed substitute cannot come on');

-- Voiding the substitution restores the on-field state (14 must not have scored though: void the goal first).
select public.void_event(tests.id('m'), gen_random_uuid(), tests.id('g14'), 'Offside');
select public.void_event(tests.id('m'), gen_random_uuid(), tests.id('sub'), 'Wrong players');
select ok(tests.on_field(tests.id('m'), tests.t(1), 7) and not tests.on_field(tests.id('m'), tests.t(1), 14), 'voided substitution restores the on-field state');

-- A fresh read (page refresh) reconstructs everything from line-up + events.
select tests.login_anon();
select is((select count(*) from jsonb_array_elements(public.public_match_feed(tests.id('m')) -> 'lineups') l,
  jsonb_array_elements(l -> 'players') p where (p ->> 'on_field')::boolean)::int, 21, 'public feed: 11 + 10 players on the field');
select ok((select bool_and((p ->> 'sent_off')::boolean) from jsonb_array_elements(public.public_match_feed(tests.id('m')) -> 'lineups' -> 1 -> 'players') p
  where p ->> 'shirt_number' in ('5', '16')), 'public feed shows dismissals');
select ok(public.public_match_feed(tests.id('m'))::text not like '%EKSU/2020%' and public.public_match_feed(tests.id('m'))::text not like '%Two-match ban%',
  'public feed carries no student numbers or screening reasons');

-- ═════ Admin correction after kick-off ══════════════════════════════════════
select tests.login((select admin from u));
select throws_ok($$ select public.admin_correct_lineup(tests.id('m'), tests.t(1), '4-4-2',
  tests.lineup(tests.t(1), array[1,2,3,4,6,7,8,9,10,11,31], array[12,13,14,15,16], 10), '  ') $$, 'EK422', null, 'correction needs a reason');
select throws_ok($$ select public.admin_correct_lineup(tests.id('m'), tests.t(2), '4-3-3',
  tests.lineup(tests.t(2), array[1,2,3,4,17,7,8,9,10,11,18], array[12,13,14,15], 9), 'Wrong sheet') $$,
  'EK422', null, 'correction must still include players with recorded events');
select lives_ok($$ select public.admin_correct_lineup(tests.id('m'), tests.t(1), '4-3-3',
  tests.lineup(tests.t(1), array[1,2,3,4,6,7,8,9,10,11,31], array[12,13,14,15,16], 9), 'Captain was No. 9 per referee report') $$,
  'admin corrects formation and captain after kick-off');
select ok(tests.audits('LINEUP_CORRECTED', tests.id('m')) = 1, 'correction audited');
select is((select before_state ->> 'formation' from public.audit_log where action = 'LINEUP_CORRECTED' and match_id = tests.id('m')), '4-4-2',
  'correction audit keeps the previous line-up');

-- ═════ Kick-off follows operator control ════════════════════════════════════
reset role;
create temp table ko (k text primary key, id uuid not null default gen_random_uuid());
insert into ko (k) select unnest(array['a', 'b', 'c']);
grant select, update on ko to authenticated;
create or replace function tests.ko(k text) returns uuid language sql stable as $$ select id from ko where ko.k = $1 $$;
grant execute on function tests.ko(text) to authenticated;
select tests.login((select admin from u));
update ko set id = public.admin_create_match('60000000-0000-4000-8000-000000000001', null, null, 'KO ' || k, tests.t(3), tests.t(4), null, now()) where true;
select public.admin_assign_operators(tests.ko(k), (select op from u), (select op_backup from u)) from ko;
select tests.confirm_lineups(tests.ko(k)) from ko;

select tests.login((select op_backup from u));
select throws_ok($$ select public.start_match(tests.ko('a'), gen_random_uuid()) $$, 'EK403',
  'Take control to start this match: another operator is in control, or you are the backup (take over first; it is audited).',
  'backup cannot start without taking over (clear permission error)');
select is(tests.snap_status(tests.ko('a')), 'SCHEDULED', 'match not started by the refused backup');
select tests.login((select op from u));
select lives_ok($$ select public.start_match(tests.ko('a'), gen_random_uuid()) $$, 'primary starts normally when nobody has taken control');
select is(tests.snap_active(tests.ko('a')), (select op from u), 'the starter is in control');

select tests.login((select op_backup from u));
select lives_ok($$ select public.take_over_match(tests.ko('b'), gen_random_uuid()) $$, 'backup takes over before kick-off');
select tests.login((select op from u));
select throws_ok($$ select public.start_match(tests.ko('b'), gen_random_uuid()) $$, 'EK403', null,
  'primary cannot start after the backup has taken control');
select tests.login((select op_backup from u));
select lives_ok($$ select public.start_match(tests.ko('b'), gen_random_uuid()) $$, 'backup starts after taking over');
select is(tests.snap_active(tests.ko('b')), (select op_backup from u), 'the backup is in control');

-- ADMIN intervention: reassigning operators hands control back to the (new) primary;
-- an ADMIN assigned to the match may start it directly.
select tests.login((select op_backup from u));
select public.take_over_match(tests.ko('c'), gen_random_uuid());
select tests.login((select admin from u));
select public.admin_assign_operators(tests.ko('c'), (select op from u), (select admin from u));
select tests.login((select op from u));
select ok(public.operator_match_state(tests.ko('c')) -> 'lineup_control' = 'true'::jsonb,
  'after the admin removes the controlling backup, the primary regains control');
select tests.login((select admin from u));
select lives_ok($$ select public.start_match(tests.ko('c'), gen_random_uuid()) $$, 'an ADMIN assigned to the match may always start it');

select * from finish();
rollback;
