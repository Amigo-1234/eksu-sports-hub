-- Operator practice links: admin-only table, open/submit via service functions.
begin;
\ir helpers.inc
select no_plan();

insert into public.operator_applications (id, reference, full_name, email, department, level, experience, available_days, periods,
  can_attend, answer_why, answer_wrong_goal, answer_offline, commits_accuracy)
select 'a0000000-0000-4000-8000-0000000000a1', 'OP-TEST1', 'Ada Practice Lovelace', 'ada-practice@test.local', 'Computer Science', '300', 'NONE',
  array['MON','TUE'], array['MORNING'], true, 'I love football and data accuracy here', 'I would undo it and record the right one', 'I would keep recording offline', true;

create temp table u as select tests.make_user('practice-admin@test.local', array['ADMIN']) as admin, tests.make_user('practice-op@test.local', array['OPERATOR']) as op;
grant select on u to authenticated;

-- Admin creates links under RLS; operators cannot.
select tests.login((select admin from u));
select lives_ok($$ insert into public.operator_practice_links (application_id, token, created_by)
  values ('a0000000-0000-4000-8000-0000000000a1', 'tok_practice_aaaaaaaaaaaaaaaaaaaa', auth.uid()) $$, 'admin creates a practice link');
select is((select count(*)::int from public.operator_practice_links), 1, 'admin reads links');
reset role;
select tests.login((select op from u));
select is((select count(*)::int from public.operator_practice_links), 0, 'operators cannot read links');
select throws_ok($$ insert into public.operator_practice_links (application_id, token) values ('a0000000-0000-4000-8000-0000000000a1', 'tok_practice_bbbbbbbbbbbbbbbbbbbb') $$,
  '42501', null, 'operators cannot create links');
reset role;
select tests.login_anon();
select throws_ok($$ select public.service_practice_open('tok_practice_aaaaaaaaaaaaaaaaaaaa') $$, '42501', null, 'anon cannot call open directly');
reset role;

-- Open / submit.
select is(public.service_practice_open('tok_practice_aaaaaaaaaaaaaaaaaaaa') ->> 'first_name', 'Ada', 'first name only');
select is(public.service_practice_open('tok_practice_aaaaaaaaaaaaaaaaaaaa') ->> 'status', 'open', 'link open');
select ok((select opened_at is not null from public.operator_practice_links), 'opened time recorded');
select throws_ok($$ select public.service_practice_open('nope') $$, 'EK404', null, 'unknown token');
select throws_ok($$ select public.service_practice_submit('tok_practice_aaaaaaaaaaaaaaaaaaaa', '  ', 80, '{}') $$, 'EK422', null, 'name required');
select throws_ok($$ select public.service_practice_submit('tok_practice_aaaaaaaaaaaaaaaaaaaa', 'Ada', 101, '{}') $$, 'EK422', null, 'score range');
select is(public.service_practice_submit('tok_practice_aaaaaaaaaaaaaaaaaaaa', ' Ada   Lovelace ', 86, '{"items":[]}') ->> 'score', '86', 'submitted');
select is((select submitted_name from public.operator_practice_links), 'Ada Lovelace', 'name normalised');
select throws_ok($$ select public.service_practice_submit('tok_practice_aaaaaaaaaaaaaaaaaaaa', 'Ada', 99, '{}') $$, 'EK409', null, 'only one submission');
select is(public.service_practice_open('tok_practice_aaaaaaaaaaaaaaaaaaaa') ->> 'status', 'submitted', 'shows submitted');

-- Expired and revoked links.
insert into public.operator_practice_links (application_id, token, expires_at) values ('a0000000-0000-4000-8000-0000000000a1', 'tok_practice_expiredxxxxxxxxxxxx', now() - interval '1 minute');
select is(public.service_practice_open('tok_practice_expiredxxxxxxxxxxxx') ->> 'status', 'expired', 'expired link');
select throws_ok($$ select public.service_practice_submit('tok_practice_expiredxxxxxxxxxxxx', 'Ada', 50, '{}') $$, 'EK409', null, 'cannot submit expired');
insert into public.operator_practice_links (application_id, token, revoked_at) values ('a0000000-0000-4000-8000-0000000000a1', 'tok_practice_revokedxxxxxxxxxxxx', now());
select is(public.service_practice_open('tok_practice_revokedxxxxxxxxxxxx') ->> 'status', 'revoked', 'revoked link');


select * from finish();
rollback;
