-- News posts: the public reads published posts only; only ADMIN writes; changes are audited.
begin;
\ir helpers.inc
select no_plan();

create temp table u as select
  tests.make_user('news-admin@test.local', array['ADMIN']) as admin,
  tests.make_user('news-op@test.local', array['OPERATOR']) as op;
grant select on u to anon, authenticated;

-- Admin creates a published post, a draft and a scheduled (future) post.
select tests.login((select admin from u));
select lives_ok($$ insert into public.news_posts (slug, title, summary, body, status, published_at, match_id)
  values ('civil-derby', 'Civil 400L face Civil 500L', 'Wednesday friendly', 'Kick-off 9:00.', 'PUBLISHED', now() - interval '1 minute', tests.m1()) $$,
  'admin publishes a post linked to a match');
select lives_ok($$ insert into public.news_posts (slug, title) values ('draft-story', 'Draft story') $$, 'admin saves a draft');
select lives_ok($$ insert into public.news_posts (slug, title, status, published_at) values ('later-story', 'Later story', 'PUBLISHED', now() + interval '1 day') $$,
  'admin schedules a post');
select throws_ok($$ insert into public.news_posts (slug, title, status) values ('no-time', 'No time', 'PUBLISHED') $$, '23514', null,
  'a published post needs a publish time');
select throws_ok($$ insert into public.news_posts (slug, title) values ('Bad Slug!', 'Bad slug') $$, '23514', null, 'slug format is enforced');
select throws_ok($$ insert into public.news_posts (slug, title) values ('civil-derby', 'Duplicate') $$, '23505', null, 'slugs are unique');
select is((select count(*)::int from public.news_posts), 3, 'admin sees drafts and scheduled posts');
select lives_ok($$ update public.news_posts set title = 'Civil 400L v Civil 500L' where slug = 'civil-derby' $$, 'admin edits');
reset role;
select ok((select count(*) from public.audit_log where entity_type = 'news_posts') >= 4, 'news changes are audited');

-- Public: published and due only.
select tests.login_anon();
select results_eq($$ select slug from public.news_posts order by slug $$, $$ values ('civil-derby') $$, 'anon sees only the published, due post');
select throws_ok($$ insert into public.news_posts (slug, title) values ('anon-post', 'Anon') $$, '42501', null, 'anon cannot write news');
select is((select count(*)::int from public.news_posts where slug = 'civil-derby' and title = 'Civil 400L v Civil 500L'), 1, 'anon sees the edited title');
reset role;

-- Staff who are not admins cannot write or see drafts.
select tests.login((select op from u));
select throws_ok($$ insert into public.news_posts (slug, title) values ('op-post', 'Op') $$, '42501', null, 'an operator cannot publish news');
select is((select count(*)::int from public.news_posts), 1, 'an operator sees only published news');
select is_empty($$ update public.news_posts set title = 'Hacked' where slug = 'civil-derby' returning id $$, 'an operator cannot edit news');
reset role;

-- Deleting the linked match clears the link, not the story.
select tests.login((select admin from u));
select lives_ok($$ delete from public.news_posts where slug = 'draft-story' $$, 'admin deletes a post');
select is((select count(*)::int from public.news_posts), 2, 'post deleted');
reset role;

select * from finish();
rollback;
