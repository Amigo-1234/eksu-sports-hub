-- Fan Zone: likes, comments, replies, comment likes, reports and the pre-match vote.
begin;
\ir helpers.inc
select no_plan();

-- Devices, as the server holds them (cookie tokens). A and B have names; C does not.
create temp table dev (k text primary key, token text);
insert into dev (k, token) select k, public.service_audience_register(null) ->> 'token' from unnest(array['A', 'B', 'C', 'D', 'E']) k;
create or replace function tests.tok(p text) returns text language sql stable as $$ select token from dev where k = p $$;
select public.service_visitor_join(tests.tok('A'), 'Ada', null, 'qa');
select public.service_visitor_join(tests.tok('B'), 'Bayo', null, 'qa');
select public.service_visitor_join(tests.tok('D'), 'Dami', null, 'qa');
select public.service_visitor_join(tests.tok('E'), 'Emeka', null, 'qa');
create or replace function tests.m() returns text language sql stable as $$ select tests.m1()::text $$;
create or replace function tests.act(p_dev text, p_action text, p jsonb default '{}') returns jsonb language sql as $$
  select public.service_fan_act(tests.tok(p_dev), 'match', tests.m(), p_action, p) $$;
create or replace function tests.first_comment() returns uuid language sql stable as $$
  select id from public.fan_comments where target_id = tests.m() and parent_id is null order by created_at limit 1 $$;

-- Public / signed-in roles cannot touch the tables or functions.
select tests.login_anon();
select throws_ok($$ select count(*) from public.fan_comments $$, '42501', null, 'anon cannot read comments directly');
select throws_ok($$ select public.service_fan_feed('match', tests.m(), null, 50) $$, '42501', null, 'anon cannot call the feed function');
reset role;

-- Reading works without a device; unknown targets are refused.
select is((public.service_fan_feed('match', tests.m(), null, 50) ->> 'likes')::int, 0, 'feed readable without a device');
select throws_ok($$ select public.service_fan_feed('match', gen_random_uuid()::text, null, 50) $$, 'EK404', null, 'unknown match refused');
select throws_ok($$ select public.service_fan_feed('news', 'Bad Slug!', null, 50) $$, 'EK404', null, 'bad news id refused');
select throws_ok($$ select public.service_fan_act('not-a-real-token-but-long-enough-to-match-xxxxx', 'match', tests.m(), 'like') $$, 'EK401', null, 'forged device refused');

-- Likes: one per device, toggleable.
select is((tests.act('A', 'like') ->> 'likes')::int, 1, 'A likes the match');
select is((tests.act('A', 'like') ->> 'likes')::int, 1, 'liking twice still counts once');
select is((tests.act('B', 'like') ->> 'liked')::boolean, true, 'B sees their like');
select is((tests.act('A', 'unlike') ->> 'likes')::int, 1, 'A unlikes');
select is((tests.act('C', 'like') ->> 'likes')::int, 2, 'a device without a name can still like');

-- Comments need a name; links refused; length enforced.
select throws_ok($$ select tests.act('C', 'comment', '{"body":"no name"}') $$, 'EK401', null, 'commenting needs a name');
select throws_ok($$ select tests.act('A', 'comment', '{"body":"visit https://spam.example"}') $$, 'EK422', null, 'links refused');
select throws_ok($$ select tests.act('A', 'comment', '{"body":"buy now at cheap.ng today"}') $$, 'EK422', null, 'bare domains refused');
select throws_ok($$ select tests.act('A', 'comment', jsonb_build_object('body', repeat('a', 501))) $$, 'EK422', null, 'over 500 characters refused');
select is(jsonb_array_length(tests.act('A', 'comment', '{"body":"  Darul   Saadah  all the way! "}') -> 'comments'), 1, 'A comments');
select is((select body from public.fan_comments where id = tests.first_comment()), 'Darul Saadah all the way!', 'whitespace normalised');
select is((select author_name from public.fan_comments where id = tests.first_comment()), 'Ada', 'author name comes from the light sign-in');

-- Replies (one level), comment likes, own-comment flags.
select lives_ok(format($$ select tests.act('B', 'comment', jsonb_build_object('body', 'Never! Hudah take it', 'parent_id', %L)) $$, tests.first_comment()), 'B replies');
select throws_ok(format($$ select tests.act('A', 'comment', jsonb_build_object('body', 'reply to reply', 'parent_id', %L)) $$,
  (select id from public.fan_comments where parent_id is not null limit 1)), 'EK404', null, 'no replies to replies');
select is((tests.act('B', 'like_comment', jsonb_build_object('comment_id', tests.first_comment())) -> 'comments' -> 0 ->> 'likes')::int, 1, 'B likes A''s comment');
select is((tests.act('A', 'like') -> 'comments' -> 0 ->> 'mine')::boolean, true, 'A sees the comment as theirs');
select is(jsonb_array_length(public.service_fan_feed('match', tests.m(), tests.tok('C'), 50) -> 'comments' -> 0 -> 'replies'), 1, 'reply nested under its comment');
select is((public.service_fan_feed('match', tests.m(), null, 50) ->> 'comment_count')::int, 2, 'comment count includes replies');

-- Only the author can delete.
select throws_ok(format($$ select tests.act('B', 'delete', jsonb_build_object('comment_id', %L)) $$, tests.first_comment()), 'EK403', null, 'cannot delete someone else''s comment');

-- Reports: 3 distinct devices hide a comment.
select lives_ok(format($$ select tests.act('B', 'report', jsonb_build_object('comment_id', %L)) $$, tests.first_comment()), 'report 1');
select lives_ok(format($$ select tests.act('B', 'report', jsonb_build_object('comment_id', %L)) $$, tests.first_comment()), 'same device reporting again counts once');
select lives_ok(format($$ select tests.act('D', 'report', jsonb_build_object('comment_id', %L)) $$, tests.first_comment()), 'report 2');
select is((select hidden_at is null from public.fan_comments where id = tests.first_comment()), true, 'still visible after 2 reports');
select lives_ok(format($$ select tests.act('E', 'report', jsonb_build_object('comment_id', %L)) $$, tests.first_comment()), 'report 3');
select is((select hidden_at is not null from public.fan_comments where id = tests.first_comment()), true, 'hidden after 3 reports');
select is((public.service_fan_feed('match', tests.m(), null, 50) ->> 'comment_count')::int, 0, 'hidden comment (and its replies) leave the public feed');

-- Rate limit: 5 comments a minute per device.
select lives_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'one')) $$, 'rate 1');
select lives_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'two')) $$, 'rate 2');
select lives_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'three')) $$, 'rate 3');
select lives_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'four')) $$, 'rate 4');
select lives_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'five')) $$, 'rate 5');
select throws_ok($$ select tests.act('D', 'comment', jsonb_build_object('body', 'six')) $$, 'EK429', null, '6th comment in a minute refused');
select lives_ok(format($$ select tests.act('D', 'delete', jsonb_build_object('comment_id', %L)) $$,
  (select id from public.fan_comments where body = 'five')), 'author deletes own comment');

-- Who will win? one vote per device, changeable, closes at kick-off.
select is((tests.act('A', 'vote', '{"pick":"HOME"}') -> 'vote' ->> 'home')::int, 1, 'A votes home');
select is((tests.act('A', 'vote', '{"pick":"away"}') -> 'vote' ->> 'mine'), 'AWAY', 'A changes to away');
select is((tests.act('B', 'vote', '{"pick":"DRAW"}') -> 'vote' ->> 'away')::int, 1, 'votes counted per pick');
select throws_ok($$ select tests.act('B', 'vote', '{"pick":"MAYBE"}') $$, 'EK422', null, 'invalid pick refused');
update public.matches set status = 'FT' where id = tests.m1();
select throws_ok($$ select tests.act('C', 'vote', '{"pick":"HOME"}') $$, 'EK409', null, 'voting closed after kick-off');
select throws_ok($$ select public.service_fan_act(tests.tok('A'), 'news', 'some-story', 'vote', '{"pick":"HOME"}') $$, 'EK422', null, 'no votes on news');

-- News targets work too.
select is((public.service_fan_act(tests.tok('A'), 'news', 'darul-saadah-win', 'like') ->> 'likes')::int, 1, 'news stories can be liked');

-- Admin moderation under RLS.
create temp table u as select tests.make_user('fan-admin@test.local', array['ADMIN']) as admin, tests.make_user('fan-op@test.local', array['OPERATOR']) as op;
grant select on u to authenticated;
select tests.login((select op from u));
select is((select count(*)::int from public.fan_comments), 0, 'operators cannot read comments');
reset role;
select tests.login((select admin from u));
select ok((select count(*) from public.fan_comments) >= 6, 'admin reads all comments, hidden included');
select lives_ok(format($$ update public.fan_comments set hidden_at = null, hidden_reason = null where id = %L $$, tests.first_comment()), 'admin restores a reported comment');
reset role;
select is((public.service_fan_feed('match', tests.m(), null, 50) -> 'comments' -> -1 ->> 'name'), 'Ada', 'restored comment is public again');

select * from finish();
rollback;
