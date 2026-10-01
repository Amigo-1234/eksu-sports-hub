begin;
\ir helpers.inc
select plan(45);

create temp table u as select
  tests.make_user('admin9@test.local', array['ADMIN']) as admin,
  tests.make_user('op9@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated, service_role;
grant usage on schema tests to service_role;

-- Synthetic test data only: TEST names, TST matric numbers, 0800000000x phones.
create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['win', 'dep', 'pub', 'pubp', 'self', 'team', 'link']);
grant select, update on ids to anon, authenticated, service_role;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.t(n int) returns uuid language sql immutable as $$ select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
create or replace function tests.fac(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-00000000000' || n)::uuid $$;
create or replace function tests.person(p_name text, p_matric text, p_team uuid, p_fac uuid default '40000000-0000-4000-8000-000000000001',
  p_dep uuid default null, p_phone text default null) returns jsonb language sql stable as $$
  select jsonb_build_object('full_name', p_name, 'matric_number', p_matric, 'faculty_id', p_fac, 'department_id', p_dep,
    'level', '200', 'phone', p_phone, 'position', 'CB', 'team_id', p_team) $$;
create or replace function tests.reg(p_type text, p_team uuid, p_players jsonb, p_name text default 'Test Official', p_phone text default '08000000901')
returns jsonb language sql stable as $$
  select jsonb_build_object('window_id', tests.id('win'), 'type', p_type, 'team_id', p_team,
    'submitter', jsonb_build_object('name', p_name, 'phone', p_phone), 'players', p_players) $$;
create or replace function tests.counts() returns text language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.players) || '/' || (select count(*) from public.player_identities) || '/'
    || (select count(*) from public.player_screenings) || '/' || (select count(*) from public.squad_players) $$;
create or replace function tests.audits(p_action text) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.audit_log where action = p_action $$;
create or replace function tests.r(p uuid) returns public.registrations language sql stable security definer set search_path = '' as $$
  select * from public.registrations where id = p $$;
create or replace function tests.rp_of(p_reg uuid, p_n int) returns public.registration_players language sql stable security definer set search_path = '' as $$
  select * from public.registration_players where registration_id = p_reg and sort_order = p_n $$;
create or replace function tests.events(p_reg uuid, p_to text) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registration_events where registration_id = p_reg and to_status = p_to $$;
create or replace function tests.cleared() returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.player_screenings where status = 'CLEARED' $$;
create or replace function tests.screening_of(p_reg uuid) returns text language sql stable security definer set search_path = '' as $$
  select s.status::text from public.player_screenings s join public.registration_players rp on rp.screening_id = s.id where rp.registration_id = p_reg limit 1 $$;
create or replace function tests.squad_count() returns int language sql stable security definer set search_path = '' as $$ select count(*)::int from public.squad_players $$;
create or replace function tests.window_status() returns text language sql stable security definer set search_path = '' as $$
  select status::text from public.registration_windows w join ids on ids.id = w.id and ids.k = 'win' $$;
create or replace function tests.edit_reason(p_reg uuid) returns text language sql stable security definer set search_path = '' as $$
  select reason from public.registration_events where registration_id = p_reg and to_status = 'EDITED' order by created_at desc limit 1 $$;
create or replace function tests.last_edit_audit() returns jsonb language sql stable security definer set search_path = '' as $$
  select after_state from public.audit_log where action = 'REGISTRATION_EDITED' order by created_at desc limit 1 $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into public.departments (id, faculty_id, name, code) values (tests.id('dep'), tests.fac(2), 'TEST Electrical', 'TST-ELE');
create temp table before as select tests.counts() as c, tests.cleared() as cleared;
grant select on before to anon, authenticated, service_role;

-- ── Window: opened, one public entry, then CLOSED (public intake switched off) ──
select tests.login((select admin from u));
update ids set id = public.admin_create_registration_window('60000000-0000-4000-8000-000000000001', 'TEST admin intake', 'test-admin-intake', 'TA26',
  now() - interval '1 day', null, true, true, '') where k = 'win';
select public.admin_set_registration_window_status(tests.id('win'), 'OPEN');
reset role;
insert into storage.objects (bucket_id, name) values
  ('registration-documents', tests.id('pub') || '/' || tests.id('pubp') || '/photo.jpg'),
  ('registration-documents', tests.id('pub') || '/' || tests.id('pubp') || '/id.pdf');
set local role service_role;
select lives_ok($$ select public.service_submit_registration(jsonb_build_object('id', tests.id('pub'), 'window_id', tests.id('win'),
  'type', 'PLAYER_SELF', 'team_id', tests.t(1), 'submitter', jsonb_build_object('name', 'Test Public', 'phone', '08000000900'),
  'players', jsonb_build_array(tests.person('Test Public', 'TST/26/5000', tests.t(1)) || jsonb_build_object('id', tests.id('pubp'),
    'photo_path', tests.id('pub') || '/' || tests.id('pubp') || '/photo.jpg', 'id_path', tests.id('pub') || '/' || tests.id('pubp') || '/id.pdf'))), null) $$,
  'a public submission while the window is open (pre-existing data)');
reset role;
select is((tests.r(tests.id('pub'))).source, 'PUBLIC', 'public submissions are marked PUBLIC');
select tests.login((select admin from u));
select lives_ok($$ select public.admin_set_registration_window_status(tests.id('win'), 'CLOSED') $$, 'admin closes public intake (window kept, audited)');
reset role;
set local role service_role;
select throws_ok($$ select public.service_submit_registration(jsonb_build_object('id', gen_random_uuid(), 'window_id', tests.id('win'),
  'type', 'PLAYER_SELF', 'team_id', tests.t(1), 'submitter', jsonb_build_object('name', 'Test Late', 'phone', '08000000999'),
  'players', jsonb_build_array(tests.person('Test Late', 'TST/26/5999', tests.t(1)))), null) $$,
  'EK409', null, 'public submission is refused once intake is closed (direct call to the submit function)');
reset role;
select tests.login_anon();
select throws_ok($$ select public.admin_create_registration('{}'::jsonb) $$, '42501', null, 'anon cannot call the admin create function');
select tests.login((select op from u));
select throws_ok($$ select public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person('Test Op', 'TST/26/5998', tests.t(1)))) ) $$, 'EK403', null, 'a non-admin cannot create registrations');
select throws_ok($$ select public.admin_registration_intake_options() $$, 'EK403', null, 'a non-admin cannot load intake options');

-- ── Admin creates a single-player registration (window closed to the public) ──
select tests.login((select admin from u));
select ok(public.admin_registration_intake_options() -> 'windows' @> jsonb_build_array(jsonb_build_object('id', tests.id('win'))),
  'closed (not archived) windows are offered to admins');
update ids set id = (public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person('Test Admin Single', 'TST/26/5001', tests.t(2), tests.fac(2), tests.id('dep'), '08000000911')),
  'Test Admin Single', '08000000911')) ->> 'id')::uuid where k = 'self';
select ok((tests.r(tests.id('self'))).reference ~ '^EKSU-TA26-[2-9A-HJ-NP-Z]{6}$', 'admin-created registration gets a reference');
select is((tests.r(tests.id('self'))).source, 'ADMIN', 'it is marked ADMIN');
select is((tests.r(tests.id('self'))).created_by, (select admin from u), 'and records which admin entered it');
select is((tests.r(tests.id('self'))).status::text, 'SUBMITTED', 'it starts SUBMITTED, like a public one');
select ok((tests.rp_of(tests.id('self'), 1)).passport_photo_path is null, 'documents are optional for admin entry');
select is(tests.counts(), (select c from before), 'creating creates no player, identity, screening or squad row');
select ok(public.admin_list_registrations() -> 'rows' @> jsonb_build_array(jsonb_build_object('id', tests.id('self'), 'source', 'ADMIN')),
  'it appears in the inbox');
select is(tests.events(tests.id('self'), 'SUBMITTED'), 1, 'history starts with the submission');
select throws_ok($$ select public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person('Test Wrong Dept', 'TST/26/5002', tests.t(2), tests.fac(2))))) $$,
  'EK422', 'Player 1: choose the department', 'faculty → department rules apply to admin entry');
select throws_ok($$ select public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(9),
  jsonb_build_array(tests.person('Test No Team', 'TST/26/5003', tests.t(9))))) $$,
  'EK422', null, 'a team that is not entered is refused');

-- Duplicate checks are the same as the public path.
select throws_ok($$ select public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person('Test Dup', 'tst / 26 / 5001', tests.t(1))))) $$,
  'EK409', 'Player 1: This student number may already have a registration. Please contact the Sports Directorate.',
  'normalised duplicate of an admin entry is refused');
select throws_ok($$ select public.admin_create_registration(tests.reg('PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person('Test Dup Public', 'tst/26/5000', tests.t(1))))) $$,
  'EK409', null, 'duplicate of a public entry is refused too');

-- ── Admin creates a team roster ─────────────────────────────────────────────
select throws_ok($$ select public.admin_create_registration(tests.reg('TEAM_ROSTER', tests.t(3), jsonb_build_array(
  tests.person('Test R1', 'TST/26/5101', tests.t(3)), tests.person('Test R2', 'tst/26/5101', tests.t(3))))) $$,
  'EK409', 'Player 2: this matric number appears twice in the roster', 'duplicate inside an admin roster is refused');
update ids set id = (public.admin_create_registration(tests.reg('TEAM_ROSTER', tests.t(3), jsonb_build_array(
  tests.person('Test Roster One', 'TST/26/5101', tests.t(3)), tests.person('Test Roster Two', 'TST/26/5102', tests.t(3)),
  tests.person('Test Roster Three', 'TST/26/5103', tests.t(3))), 'Test Team Official', '08000000920')) ->> 'id')::uuid where k = 'team';
select is(public.admin_registration_detail(tests.id('team')) ->> 'source', 'ADMIN', 'detail shows the admin source');
select is(jsonb_array_length(public.admin_registration_detail(tests.id('team')) -> 'players'), 3, 'roster of three under one reference');

-- ── Correct intake mistakes, with history ───────────────────────────────────
select lives_ok($$ select public.admin_update_registration_player((tests.rp_of(tests.id('team'), 2)).id,
  tests.person('Test Roster Two Corrected', 'TST/26/5112', tests.t(3)) || jsonb_build_object('position', 'GK')) $$, 'admin corrects a roster entry');
select is((tests.rp_of(tests.id('team'), 2)).full_name, 'Test Roster Two Corrected', 'the correction is stored');
select is(tests.edit_reason(tests.id('team')),
  'Corrected: name, matric number, position', 'history names what changed');
select ok(tests.last_edit_audit() ->> 'matric_number' !~ 'TST/26/5112' and tests.last_edit_audit() ->> 'matric_number' like '%112',
  'the audit row masks the matric number');
select throws_ok($$ select public.admin_update_registration_player((tests.rp_of(tests.id('team'), 2)).id,
  tests.person('Test Roster Two Corrected', 'tst/26/5101', tests.t(3)) || jsonb_build_object('position', 'GK')) $$,
  'EK409', null, 'an edit cannot create a duplicate');
select throws_ok($$ select public.admin_update_registration_player((tests.rp_of(tests.id('team'), 2)).id,
  tests.person('Test Roster Two Corrected', 'TST/26/5112', tests.t(3)) || jsonb_build_object('position', 'GK')) $$,
  'EK409', 'Nothing was changed', 'a no-op edit is refused (no empty history)');
select lives_ok($$ select public.admin_update_registration_contact(tests.id('self'), 'Test Admin Single', '08000000912', null) $$,
  'admin corrects the contact phone');
select is(tests.events(tests.id('self'), 'EDITED'), 1, 'contact correction recorded in history');

-- ── Attach a document the server stored ────────────────────────────────────
reset role;
insert into storage.objects (bucket_id, name) values
  ('registration-documents', tests.id('self') || '/' || (tests.rp_of(tests.id('self'), 1)).id || '/photo.jpg');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_attach_registration_document((tests.rp_of(tests.id('self'), 1)).id, 'photo',
  tests.id('team') || '/' || (tests.rp_of(tests.id('self'), 1)).id || '/photo.jpg') $$, 'EK422', null, 'documents must belong to that entry');
select lives_ok($$ select public.admin_attach_registration_document((tests.rp_of(tests.id('self'), 1)).id, 'photo',
  tests.id('self') || '/' || (tests.rp_of(tests.id('self'), 1)).id || '/photo.jpg') $$, 'admin attaches a passport photo');
select is(tests.events(tests.id('self'), 'DOCUMENT_ATTACHED'), 1, 'attachment recorded in history');

-- ── Accept for screening: PENDING only ─────────────────────────────────────
select is((public.admin_accept_registration(tests.id('self'))) ->> 'created', '1', 'admin-created registration can be accepted for screening');
select is(tests.screening_of(tests.id('self')), 'PENDING',
  'acceptance opens a PENDING screening');
select lives_ok($$ select public.admin_reject_registration_player((tests.rp_of(tests.id('team'), 3)).id, 'TEST: not eligible') $$, 'leave one roster entry out');
select is((public.admin_accept_registration(tests.id('team'))) ->> 'created', '2', 'the rest of the roster is accepted');
select is(tests.cleared(), (select cleared from before), 'nobody is CLEARED automatically');
select is(tests.squad_count(), split_part((select c from before), '/', 4)::int, 'nobody is added to a squad');
select throws_ok($$ select public.admin_update_registration_player((tests.rp_of(tests.id('self'), 1)).id,
  tests.person('Test Too Late', 'TST/26/5001', tests.t(2), tests.fac(2), tests.id('dep'))) $$, 'EK409', null, 'accepted registrations can no longer be edited');

-- ── Status lookup for an admin-created reference ───────────────────────────
reset role;
set local role service_role;
select is(public.service_registration_status((tests.r(tests.id('self'))).reference, '08000000912', null) ->> 'status', 'ACCEPTED_FOR_SCREENING',
  'the applicant can check an admin-created registration with reference + phone');
select is(public.service_registration_status((tests.r(tests.id('self'))).reference, '08000000999', null), null,
  'a phone that is not on the registration gets nothing');
reset role;

-- ── Existing data and history intact ───────────────────────────────────────
select is((tests.r(tests.id('pub'))).status::text, 'SUBMITTED', 'the earlier public registration is untouched');
select ok(tests.audits('REGISTRATION_WINDOW_CLOSED') >= 1 and tests.window_status() = 'CLOSED',
  'the window is kept (closed, audited), not deleted');

select * from finish();
rollback;
