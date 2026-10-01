begin;
\ir helpers.inc
select plan(91);

create temp table u as select
  tests.make_user('admin8@test.local', array['ADMIN']) as admin,
  tests.make_user('op8@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated, service_role;
grant usage on schema tests to service_role;

-- Synthetic test data only: TEST names, TST matric numbers, 0800000000x phones.
create temp table ids (k text primary key, id uuid not null default gen_random_uuid());
insert into ids (k) select unnest(array['win', 'dep_a', 'dep_b', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8',
  'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
grant select, update on ids to anon, authenticated, service_role;
create or replace function tests.id(k text) returns uuid language sql stable as $$ select id from ids where ids.k = id.k $$;
create or replace function tests.t(n int) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-00000000000' || n)::uuid $$;
create or replace function tests.fac(n int) returns uuid language sql immutable as $$
  select ('40000000-0000-4000-8000-00000000000' || n)::uuid $$;
create or replace function tests.comp() returns uuid language sql immutable as $$ select '60000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function tests.season() returns uuid language sql immutable as $$ select '30000000-0000-4000-8000-000000000001'::uuid $$;

/* Store the two documents the server would have uploaded for a person. */
create or replace function tests.docs(p_reg uuid, p_pid uuid, p_id_ext text default 'pdf') returns void
language sql security definer set search_path = '' as $$
  insert into storage.objects (bucket_id, name) values
    ('registration-documents', p_reg || '/' || p_pid || '/photo.jpg'),
    ('registration-documents', p_reg || '/' || p_pid || '/id.' || p_id_ext);
$$;
create or replace function tests.person(p_reg uuid, p_pid uuid, p_name text, p_matric text, p_team uuid,
  p_fac uuid default '40000000-0000-4000-8000-000000000001', p_dep uuid default null, p_phone text default null)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p_pid, 'full_name', p_name, 'matric_number', p_matric, 'faculty_id', p_fac,
    'department_id', p_dep, 'level', '100', 'phone', p_phone, 'position', 'CM', 'team_id', p_team,
    'photo_path', p_reg || '/' || p_pid || '/photo.jpg', 'id_path', p_reg || '/' || p_pid || '/id.pdf') $$;
create or replace function tests.reg(p_reg uuid, p_type text, p_team uuid, p_players jsonb, p_phone text default '08000000001')
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p_reg, 'window_id', tests.id('win'), 'type', p_type, 'team_id', p_team,
    'submitter', jsonb_build_object('name', 'Test Submitter', 'phone', p_phone, 'email', null), 'players', p_players) $$;
create or replace function tests.submit(p jsonb) returns jsonb language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  return public.service_submit_registration(p, null);
end $$;
create or replace function tests.counts() returns text language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.players) || '/' || (select count(*) from public.player_identities) || '/'
    || (select count(*) from public.player_screenings) || '/' || (select count(*) from public.squad_players) $$;
create or replace function tests.audits(p_action text) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.audit_log where action = p_action $$;
create or replace function tests.rp(p uuid) returns public.registration_players language sql stable security definer set search_path = '' as $$
  select * from public.registration_players where id = p $$;
create or replace function tests.screening_status(p_screening uuid) returns text language sql stable security definer set search_path = '' as $$
  select status::text from public.player_screenings where id = p_screening $$;
create or replace function tests.ref(p_reg uuid) returns text language sql stable security definer set search_path = '' as $$
  select reference from public.registrations where id = p_reg $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into public.departments (id, faculty_id, name, code) values
  (tests.id('dep_a'), tests.fac(2), 'TEST Mechanical', 'TST-MEC'),
  (tests.id('dep_b'), tests.fac(3), 'TEST History', 'TST-HIS');
create temp table before as select tests.counts() as c;
grant select on before to anon, authenticated, service_role;

-- ── Windows ────────────────────────────────────────────────────────────────
select tests.login((select op from u));
select throws_ok($$ select public.admin_create_registration_window(tests.comp(), 'TEST window', 'test-window', 'TW26',
  now() - interval '1 day', null, true, true, '') $$, 'EK403', null, 'only an admin creates registration windows');
select tests.login((select admin from u));
select throws_ok($$ select public.admin_create_registration_window(tests.comp(), 'TEST window', 'Bad Slug!', 'TW26',
  now() - interval '1 day', null, true, true, '') $$, 'EK422', null, 'window link names are validated');
update ids set id = public.admin_create_registration_window(tests.comp(), 'TEST window', 'test-window', 'tw26',
  now() - interval '1 day', now() + interval '30 days', true, true, 'Bring your ID card.') where k = 'win';
select is((select count(*)::int from jsonb_array_elements(public.admin_list_registration_windows()) w where w ->> 'status' = 'DRAFT'
  and w ->> 'reference_code' = 'TW26'), 1, 'window starts as DRAFT, reference code upper-cased');
select is(tests.audits('REGISTRATION_WINDOW_CREATED'), 1, 'window creation audited');

select tests.login_anon();
select is(jsonb_array_length(public.public_registration_windows()), 0, 'a draft window is not public');
select ok(public.public_registration_window('test-window') is null, 'a draft window cannot be opened by link');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r1'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r1'), tests.id('p1'), 'Test Player One', 'TST/26/0001', tests.t(1))))) $$,
  'EK409', null, 'a DRAFT (not open) window refuses submissions');

select tests.login((select admin from u));
select lives_ok($$ select public.admin_set_registration_window_status(tests.id('win'), 'OPEN') $$, 'admin opens the window');
select is(tests.audits('REGISTRATION_WINDOW_OPENED'), 1, 'opening audited');
select tests.login_anon();
select is(public.public_registration_windows() -> 0 ->> 'slug', 'test-window', 'the open window is listed publicly');
select is(jsonb_array_length(public.public_registration_window('test-window') -> 'teams'), 4, 'form gets the entered teams');
select ok(public.public_registration_window('test-window')::text !~* '(matric|student_id|phone|created_by)',
  'window details expose no personal data');

-- ── Public cannot touch the raw tables or server-only functions ───────────
select throws_ok($$ select count(*) from public.registrations $$, '42501', null, 'anon cannot list registrations');
select throws_ok($$ select count(*) from public.registration_players $$, '42501', null, 'anon cannot read registration players');
select throws_ok($$ select count(*) from public.registration_windows $$, '42501', null, 'anon cannot read windows directly');
select throws_ok($$ select public.service_submit_registration('{}'::jsonb, null) $$, '42501', null,
  'anon cannot call the server-only submit function');
select throws_ok($$ select public.service_registration_status('X', '0800', null) $$, '42501', null,
  'anon cannot call the server-only status function');
select throws_ok($$ select public.admin_list_registrations() $$, '42501', null, 'anon cannot call the admin inbox');
select tests.login((select op from u));
select throws_ok($$ select count(*) from public.registrations $$, '42501', null, 'staff cannot read registrations directly');
select throws_ok($$ select public.admin_list_registrations() $$, 'EK403', null, 'an operator cannot open the inbox');
select throws_ok($$ select public.service_submit_registration('{}'::jsonb, null) $$, '42501', null,
  'signed-in users cannot call the server-only submit function');
reset role;

-- ── Submitting (as the Next.js server) ─────────────────────────────────────
select tests.docs(tests.id('r1'), tests.id('p1'));
select ok((tests.submit(tests.reg(tests.id('r1'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r1'), tests.id('p1'), 'Test Player One', 'TST/26/0001', tests.t(1)))))) ->> 'reference'
  ~ '^EKSU-TW26-[2-9A-HJ-NP-Z]{6}$', 'an open window accepts a player registration with an EKSU-TW26-XXXXXX reference');
reset role;
select is(tests.counts(), (select c from before), 'submitting creates no official player, identity, screening or squad row');
select is((tests.rp(tests.id('p1'))).status::text, 'SUBMITTED', 'the person is SUBMITTED (not eligible)');
select is(tests.audits('REGISTRATION_SUBMITTED'), 1, 'submission audited');
select throws_ok($$ select tests.submit(tests.reg(tests.id('r1'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r1'), tests.id('p1'), 'Test Player One', 'TST/26/0001', tests.t(1))))) $$,
  'EK409', null, 'the same registration cannot be submitted twice');
reset role;

select tests.docs(tests.id('r2'), tests.id('p2'));
select throws_ok($$ select tests.submit(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'tst / 26 / 0001', tests.t(1))))) $$,
  'EK409', 'Player 1: This student number may already have a registration. Please contact the Sports Directorate.',
  'a normalised duplicate matric number ("tst / 26 / 0001") is caught with the public message');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(9),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(9))))) $$,
  'EK422', null, 'a team that is not entered in the competition is refused');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(2),
    tests.fac(2), tests.id('dep_b'))))) $$,
  'EK422', 'Player 1: the department does not belong to that faculty', 'faculty → department is validated');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(2), tests.fac(2))))) $$,
  'EK422', 'Player 1: choose the department', 'a faculty with departments requires one');
reset role;
select throws_ok($$ select tests.submit(jsonb_set(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(1)))),
  '{players,0,photo_path}', to_jsonb(tests.id('r1') || '/' || tests.id('p1') || '/photo.jpg'))) $$,
  'EK422', 'Player 1: upload a passport photograph', 'documents must be this registration''s own private objects');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r3'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r3'), tests.id('p3'), 'Test Player Three', 'TST/26/0003', tests.t(1))))) $$,
  'EK422', 'Player 1: upload a passport photograph', 'a missing upload is refused');
reset role;
select throws_ok($$ select tests.submit(jsonb_set(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(1)))),
  '{players,0,position}', '"STRIKER"')) $$, 'EK422', 'Player 1: choose a preferred position', 'positions are validated');
reset role;
-- A valid one for later (Engineering, with department, own phone).
select lives_ok($$ select tests.submit(tests.reg(tests.id('r2'), 'PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person(tests.id('r2'), tests.id('p2'), 'Test Player Two', 'TST/26/0002', tests.t(2),
    tests.fac(2), tests.id('dep_a'), '+2348000000002')), '08000000009')) $$, 'a second valid registration');
reset role;

-- Team roster: one reference, several people, duplicate inside the roster refused.
select tests.docs(tests.id('r4'), tests.id('p4')); select tests.docs(tests.id('r4'), tests.id('p5'));
select tests.docs(tests.id('r4'), tests.id('p6'));
select throws_ok($$ select tests.submit(tests.reg(tests.id('r4'), 'TEAM_ROSTER', tests.t(3), jsonb_build_array(
  tests.person(tests.id('r4'), tests.id('p4'), 'Test Roster A', 'TST/26/0100', tests.t(3)),
  tests.person(tests.id('r4'), tests.id('p5'), 'Test Roster B', 'tst/26/0100', tests.t(3))))) $$,
  'EK409', 'Player 2: this matric number appears twice in the roster', 'a duplicate inside the roster is refused');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r4'), 'TEAM_ROSTER', tests.t(3), jsonb_build_array(
  tests.person(tests.id('r4'), tests.id('p4'), 'Test Roster A', 'TST/26/0100', tests.t(3)),
  tests.person(tests.id('r4'), tests.id('p5'), 'Test Roster B', 'TST/26/0101', tests.t(4))))) $$,
  'EK422', null, 'every roster player belongs to the roster''s team');
reset role;
select is((tests.submit(tests.reg(tests.id('r4'), 'TEAM_ROSTER', tests.t(3), jsonb_build_array(
  tests.person(tests.id('r4'), tests.id('p4'), 'Test Roster A', 'TST/26/0100', tests.t(3)),
  tests.person(tests.id('r4'), tests.id('p5'), 'Test Roster B', 'TST/26/0101', tests.t(3)),
  tests.person(tests.id('r4'), tests.id('p6'), 'Test Roster C', 'TST/26/0102', tests.t(3)))))) ->> 'players', '3',
  'a team roster with three players under one reference');
reset role;

-- ── Safe status lookup ─────────────────────────────────────────────────────
set local role service_role;
select is(public.service_registration_status(tests.ref(tests.id('r1')), '0800 000 0001', null) ->> 'status', 'SUBMITTED',
  'status lookup with reference + submitter phone');
select is((select array_agg(k order by k) from jsonb_object_keys(public.service_registration_status(lower(tests.ref(tests.id('r1'))), '+2348000000001', null)) k),
  array['competition', 'name', 'players', 'reference', 'season', 'status', 'submitted_at', 'team', 'type'],
  'status lookup returns only the safe fields');
select ok(public.service_registration_status(tests.ref(tests.id('r1')), '08000000001', null)::text !~* '(TST/26|\.pdf|\.jpg|notes|reason)',
  'no matric number, document, note or reason in the status answer');
select ok(public.service_registration_status(tests.ref(tests.id('r1')), '08000000002', null) is null, 'a wrong phone gets nothing');
select ok(public.service_registration_status('EKSU-TW26-AAAAAA', '08000000001', null) is null, 'an unknown reference gets nothing');
select is(public.service_registration_status(tests.ref(tests.id('r2')), '08000000002', null) ->> 'name', 'Test Player Two',
  'a player can look up with their own phone and sees their own name');
select is(public.service_rate_hit('test-bucket', 'k1', 2, 60)::text || public.service_rate_hit('test-bucket', 'k1', 2, 60)::text
  || public.service_rate_hit('test-bucket', 'k1', 2, 60)::text, 'truetruefalse', 'rate limiting refuses after the limit');
reset role;

-- ── Private documents ──────────────────────────────────────────────────────
select ok(not (select public from storage.buckets where id = 'registration-documents'), 'the document bucket is private');
select tests.login_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'registration-documents'), 0, 'anon cannot see any document');
select tests.login((select op from u));
select is((select count(*)::int from storage.objects where bucket_id = 'registration-documents'), 0, 'staff (non-admin) cannot see documents');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('registration-documents', 'x/y/photo.jpg') $$,
  '42501', null, 'signed-in users cannot upload into the bucket');
select tests.login((select admin from u));
select ok((select count(*) from storage.objects where bucket_id = 'registration-documents') >= 10, 'an admin can read documents (signed URLs)');
select ok((select bool_and(name !~* 'TST') from storage.objects where bucket_id = 'registration-documents'),
  'document paths never contain matric numbers');

-- ── Admin review ───────────────────────────────────────────────────────────
select is(public.admin_list_registrations() -> 'counts' ->> 'SUBMITTED', '3', 'inbox counters');
select is(jsonb_array_length(public.admin_list_registrations(p_search => 'tst / 26 / 0100') -> 'rows'), 1, 'admin can search by matric number');
select is(public.admin_registration_detail(tests.id('r1')) -> 'players' -> 0 ->> 'matric_number', 'TST/26/0001', 'admin detail shows the matric number');
select lives_ok($$ select public.admin_review_registration(tests.id('r1'), 'UNDER_REVIEW') $$, 'mark under review');
select throws_ok($$ select public.admin_review_registration(tests.id('r1'), 'NEEDS_CORRECTION', '  ') $$, 'EK422', null,
  'requesting a correction needs a reason');
select lives_ok($$ select public.admin_review_registration(tests.id('r1'), 'NEEDS_CORRECTION', 'Photo is blurred') $$, 'request correction');
select is(jsonb_array_length(public.admin_registration_detail(tests.id('r1')) -> 'history'), 3, 'history keeps every step');
select is(tests.audits('REGISTRATION_UNDER_REVIEW') + tests.audits('REGISTRATION_CORRECTION_REQUESTED'), 2, 'review steps audited');
select throws_ok($$ select public.admin_review_registration(tests.id('r1'), 'ACCEPTED_FOR_SCREENING') $$, 'EK422', null,
  'acceptance only through the dedicated accept function');

-- Accept a brand-new student: player + identity + PENDING screening, never CLEARED.
select is(public.admin_accept_registration(tests.id('r1')) ->> 'created', '1', 'accept for screening creates the official player');
select is(public.admin_registration_detail(tests.id('r1')) ->> 'status', 'ACCEPTED_FOR_SCREENING', 'registration accepted for screening');
select is(tests.screening_status((tests.rp(tests.id('p1'))).screening_id), 'PENDING', 'their screening is PENDING (registration and screening statuses are separate)');
select is((select student_id from public.player_identities where player_id = (tests.rp(tests.id('p1'))).official_player_id), 'TST/26/0001',
  'the private identity carries the matric number');
select is(tests.audits('PLAYER_CREATED_FROM_REGISTRATION') + tests.audits('REGISTRATION_ACCEPTED_FOR_SCREENING') + tests.audits('SCREENING_OPENED'), 3,
  'acceptance, player creation and screening opening audited');
select throws_ok($$ select public.admin_add_squad_player((select id from public.squads where team_id = tests.t(1) and season_id = tests.season()),
  (tests.rp(tests.id('p1'))).official_player_id, 77) $$, 'EK422', null, 'an accepted (PENDING) player cannot join a squad');
select throws_ok($$ select public.admin_accept_registration(tests.id('r1')) $$, 'EK409', null, 'acceptance happens once');
select throws_ok($$ select public.admin_review_registration(tests.id('r1'), 'REJECTED', 'late') $$, 'EK409', null,
  'an accepted registration cannot be rejected afterwards');
-- Only the screening decision clears; then the squad accepts them.
select lives_ok($$ select public.admin_decide_screening((tests.rp(tests.id('p1'))).screening_id, 'CLEARED') $$, 'directorate clears after screening');
select lives_ok($$ select public.admin_add_squad_player((select id from public.squads where team_id = tests.t(1) and season_id = tests.season()),
  (tests.rp(tests.id('p1'))).official_player_id, 77) $$, 'once CLEARED, the player can join the squad');

-- Existing official player (seeded DEV-ENG-001 identity, typed differently) registers for another team: linked, not duplicated.
reset role;
select tests.docs(tests.id('r5'), tests.id('p7'));
select lives_ok($$ select tests.submit(tests.reg(tests.id('r5'), 'PLAYER_SELF', tests.t(3),
  jsonb_build_array(tests.person(tests.id('r5'), tests.id('p7'), 'Test Existing', 'dev-eng-001', tests.t(3))))) $$,
  'an existing official student can register (flagged, not refused)');
reset role;
create temp table b2 as select (select count(*) from public.players) as players, (select count(*) from public.player_identities) as ids;
grant select on b2 to authenticated;
select tests.login((select admin from u));
select is(public.admin_registration_detail(tests.id('r5')) -> 'players' -> 0 -> 'duplicates' -> 0 ->> 'kind', 'OFFICIAL_PLAYER',
  'admin sees why: matches an official player');
select is(public.admin_accept_registration(tests.id('r5')) ->> 'linked', '1', 'accept links the existing player');
reset role;
select is((select count(*) from public.players), (select players from b2), 'no duplicate player was created');
select is((tests.rp(tests.id('p7'))).official_player_id,
  (select player_id from public.player_identities where student_id = 'DEV-ENG-001'), 'linked to the existing official record');
select is(tests.screening_status((tests.rp(tests.id('p7'))).screening_id), 'PENDING', 'a new PENDING screening for the new team');
select is(tests.audits('PLAYER_LINKED_FROM_REGISTRATION'), 1, 'linking audited');

-- Team roster: one person rejected individually, the rest accepted.
select tests.login((select admin from u));
select throws_ok($$ select public.admin_reject_registration_player(tests.id('p6'), '') $$, 'EK422', null, 'leaving someone out needs a reason');
select lives_ok($$ select public.admin_reject_registration_player(tests.id('p6'), 'Not a registered student') $$, 'leave one roster player out');
select is(public.admin_accept_registration(tests.id('r4')) ->> 'created', '2', 'the other two roster players are accepted');
select ok((tests.rp(tests.id('p6'))).official_player_id is null and (tests.rp(tests.id('p6'))).status = 'REJECTED',
  'the rejected roster player stays out of the official records');

-- Rejecting a whole registration; the student may apply again afterwards.
select throws_ok($$ select public.admin_review_registration(tests.id('r2'), 'REJECTED') $$, 'EK422', null, 'rejection needs a reason');
select lives_ok($$ select public.admin_review_registration(tests.id('r2'), 'REJECTED', 'Not eligible this season') $$, 'reject a registration');
select ok((tests.rp(tests.id('p2'))).status = 'REJECTED' and (tests.rp(tests.id('p2'))).official_player_id is null,
  'a rejected registration creates no player');
select is(tests.audits('REGISTRATION_REJECTED'), 1, 'rejection audited');
reset role;
select tests.docs(tests.id('r6'), tests.id('p8'));
select lives_ok($$ select tests.submit(tests.reg(tests.id('r6'), 'PLAYER_SELF', tests.t(2),
  jsonb_build_array(tests.person(tests.id('r6'), tests.id('p8'), 'Test Player Two', 'TST/26/0002', tests.t(2),
    tests.fac(2), tests.id('dep_a'))))) $$, 'after a rejection the student can apply again');
reset role;

-- ── Window rules ───────────────────────────────────────────────────────────
select tests.login((select admin from u));
select lives_ok($$ select public.admin_update_registration_window(tests.id('win'), 'TEST window', 'test-window', 'TW26',
  now() - interval '1 day', now() + interval '30 days', false, true, '') $$, 'admin disables individual registration');
reset role;
select tests.docs(tests.id('r7'), tests.id('p9'));
select throws_ok($$ select tests.submit(tests.reg(tests.id('r7'), 'PLAYER_SELF', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r7'), tests.id('p9'), 'Test Player Nine', 'TST/26/0009', tests.t(1))))) $$,
  'EK409', null, 'individual registration refused when disabled');
reset role;
select tests.login((select admin from u));
select lives_ok($$ select public.admin_set_registration_window_status(tests.id('win'), 'CLOSED') $$, 'admin closes the window');
select is(tests.audits('REGISTRATION_WINDOW_CLOSED'), 1, 'closing audited');
reset role;
select throws_ok($$ select tests.submit(tests.reg(tests.id('r7'), 'TEAM_ROSTER', tests.t(1),
  jsonb_build_array(tests.person(tests.id('r7'), tests.id('p9'), 'Test Player Nine', 'TST/26/0009', tests.t(1))))) $$,
  'EK409', null, 'a CLOSED window refuses submissions');
reset role;
select tests.login_anon();
select is(jsonb_array_length(public.public_registration_windows()), 0, 'a closed window is no longer listed');

select * from finish();
rollback;
