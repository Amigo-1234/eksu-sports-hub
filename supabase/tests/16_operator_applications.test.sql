-- Operator applications: server-only submission (validated, rate-limited, one open
-- application per email); admins review; applicants and other staff see nothing.
begin;
\ir helpers.inc
select no_plan();

create temp table u as select
  tests.make_user('apps-admin@test.local', array['ADMIN']) as admin,
  tests.make_user('apps-op@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;

create or replace function tests.app(p_email text, p_days text[] default array['MON','WED'], p_why text default 'I love football and want to help EKSU sport.')
returns jsonb language sql immutable as $$
  select jsonb_build_object('full_name', 'Ada Applicant', 'email', p_email, 'phone', '+234 801 234 5678',
    'department', 'Civil Engineering', 'level', '300L', 'experience', 'Scored house matches',
    'available_days', to_jsonb(p_days), 'periods', jsonb_build_array('MORNING', 'EVENING'), 'can_attend', true,
    'answer_why', p_why, 'answer_wrong_goal', 'Undo it at once and re-record it for the right team.',
    'answer_offline', 'Keep recording: the console queues events and syncs when I am back online.',
    'commits_accuracy', true) $$;
grant usage on schema tests to service_role;
grant execute on function tests.app(text, text[], text) to anon, authenticated, service_role;

-- The public cannot call the submission function or touch the table.
select tests.login_anon();
select throws_ok($$ select public.service_submit_operator_application(tests.app('anon@test.local'), 'k-anon') $$, '42501', null, 'anon cannot submit directly');
select throws_ok($$ insert into public.operator_applications (reference, full_name, email, available_days, periods, can_attend, answer_why, answer_wrong_goal, answer_offline, commits_accuracy)
  values ('X', 'X Y', 'x@y.zz', array['MON','TUE'], array['MORNING'], true, repeat('a', 30), repeat('b', 20), repeat('c', 20), true) $$, '42501', null, 'anon cannot insert');
reset role;

-- Server (service role) submissions.
set local role service_role;
select matches(public.service_submit_operator_application(tests.app('Ada@Test.Local '), 'k1'), '^OPA-[0-9A-F]{6}$', 'valid application returns a reference');
select throws_ok($$ select public.service_submit_operator_application(tests.app('ada@test.local'), 'k2') $$, 'EK409', null, 'duplicate open application for the same email is refused (case-insensitive)');
select throws_ok($$ select public.service_submit_operator_application(tests.app('one@test.local', array['MON']), 'k3') $$, 'EK422', null, 'fewer than 2 days is refused');
select throws_ok($$ select public.service_submit_operator_application(tests.app('four@test.local', array['MON','TUE','WED','THU']), 'k3') $$, 'EK422', null, 'more than 3 days is refused');
select throws_ok($$ select public.service_submit_operator_application(tests.app('odd@test.local', array['MON','FUNDAY']), 'k3') $$, 'EK422', null, 'unknown day is refused');
select throws_ok($$ select public.service_submit_operator_application(tests.app('short@test.local', array['MON','TUE'], 'too short'), 'k3') $$, 'EK422', null, 'too-short answer is refused');
select lives_ok($$ select public.service_submit_operator_application(tests.app('r1@test.local'), 'rate') $$, 'rate: 1st');
select lives_ok($$ select public.service_submit_operator_application(tests.app('r2@test.local'), 'rate') $$, 'rate: 2nd');
select lives_ok($$ select public.service_submit_operator_application(tests.app('r3@test.local'), 'rate') $$, 'rate: 3rd');
select throws_ok($$ select public.service_submit_operator_application(tests.app('r4@test.local'), 'rate') $$, 'EK429', null, 'rate: 4th from the same caller within an hour is refused');
reset role;
select is((select count(*)::int from public.operator_applications), 4, 'four applications stored');
select is((select email from public.operator_applications where email_key = 'ada@test.local'), 'ada@test.local', 'email stored normalised');

-- Other staff and the public see nothing.
select tests.login((select op from u));
select is((select count(*)::int from public.operator_applications), 0, 'an operator cannot read applications');
select is_empty($$ update public.operator_applications set status = 'APPROVED' returning id $$, 'an operator cannot change applications');
reset role;
select tests.login_anon();
select throws_ok($$ select count(*) from public.operator_applications $$, '42501', null, 'anon cannot read applications');
reset role;

-- Admin review.
select tests.login((select admin from u));
select is((select count(*)::int from public.operator_applications), 4, 'admin reads applications');
select lives_ok($$ update public.operator_applications set status = 'REJECTED', review_notes = 'Not available on match days' where email_key = 'ada@test.local' $$, 'admin rejects with a note');
select throws_ok($$ update public.operator_applications set status = 'INVITED' where email_key = 'r1@test.local' $$, '23514', null, 'INVITED needs an invited account');
reset role;
select ok((select count(*) from public.audit_log where entity_type = 'operator_applications' and action = 'ADMIN_UPDATE') >= 1, 'review changes are audited');

-- After rejection the same person may apply again.
set local role service_role;
select lives_ok($$ select public.service_submit_operator_application(tests.app('ada@test.local'), 'k9') $$, 'a rejected applicant can re-apply');
reset role;

select * from finish();
rollback;
