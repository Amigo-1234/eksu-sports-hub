-- Fan Zone: likes, comments ("banter") and a pre-match "Who will win?" vote.
-- Additive only. Uses the existing light sign-in: an anonymous device cookie
-- plus a display name (site_visitors). No accounts.
--
-- Access: the public never touches these tables directly. Every read and
-- write goes through service_role functions called by the site's server
-- (/api/fan), which resolve the device from its secret token. Posting needs a
-- name (site_visitors row). Rate-limited per device; links are refused;
-- 3 reports hide a comment until an admin reviews it. Admins read and
-- moderate under RLS; moderation is audited.

-- Targets: a match (uuid text) or a news story (its slug / id).
create table public.fan_reactions (
  target_kind text not null check (target_kind in ('match', 'news')),
  target_id text not null check (target_id ~ '^[a-z0-9-]{3,100}$'),
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_kind, target_id, device_id)
);

create table public.fan_comments (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('match', 'news')),
  target_id text not null check (target_id ~ '^[a-z0-9-]{3,100}$'),
  parent_id uuid references public.fan_comments (id) on delete cascade,
  device_id uuid references public.notification_devices (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  report_count int not null default 0,
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index fan_comments_target_idx on public.fan_comments (target_kind, target_id, created_at desc);
create index fan_comments_parent_idx on public.fan_comments (parent_id) where parent_id is not null;
create index fan_comments_device_idx on public.fan_comments (device_id);
create index fan_comments_recent_idx on public.fan_comments (created_at desc);

create table public.fan_comment_likes (
  comment_id uuid not null references public.fan_comments (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, device_id)
);

create table public.fan_comment_reports (
  comment_id uuid not null references public.fan_comments (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, device_id)
);

create table public.fan_votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  pick text not null check (pick in ('HOME', 'DRAW', 'AWAY')),
  created_at timestamptz not null default now(),
  primary key (match_id, device_id)
);

create trigger audit_admin_change after update or delete on public.fan_comments
  for each row execute function private.audit_admin_change();

do $$
declare t text;
begin
  foreach t in array array['fan_reactions', 'fan_comments', 'fan_comment_likes', 'fan_comment_reports', 'fan_votes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Admins moderate comments from the dashboard.
grant select, update on public.fan_comments to authenticated;
create policy "admins read fan comments" on public.fan_comments for select to authenticated using (private.has_role('ADMIN'));
create policy "admins moderate fan comments" on public.fan_comments for update to authenticated
  using (private.has_role('ADMIN')) with check (private.has_role('ADMIN'));

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function private.fan_target_ok(p_kind text, p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'match' then p_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      and private.match_is_public(p_id::uuid)
    when 'news' then p_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(p_id) between 3 and 100
    else false end $$;

-- Device optional for reads (unknown device → nothing is "mine").
create or replace function private.fan_device_or_null(p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null then return null; end if;
  return (private.audience_device(p_token)).id;
exception when others then
  return null;
end $$;

create or replace function private.fan_feed(p_kind text, p_id text, p_device uuid, p_limit int)
returns jsonb language sql stable security definer set search_path = '' as $$
  with c as (
    select fc.*, (select count(*) from public.fan_comment_likes l where l.comment_id = fc.id) as likes,
           exists (select 1 from public.fan_comment_likes l where l.comment_id = fc.id and l.device_id = p_device) as liked
    from public.fan_comments fc
    where fc.target_kind = p_kind and fc.target_id = p_id and fc.hidden_at is null
      -- a hidden comment takes its replies with it
      and (fc.parent_id is null or exists (select 1 from public.fan_comments p where p.id = fc.parent_id and p.hidden_at is null))
  ),
  top as (select * from c where parent_id is null order by created_at desc limit greatest(1, least(p_limit, 100)))
  select jsonb_build_object(
    'likes', (select count(*) from public.fan_reactions r where r.target_kind = p_kind and r.target_id = p_id),
    'liked', exists (select 1 from public.fan_reactions r where r.target_kind = p_kind and r.target_id = p_id and r.device_id = p_device),
    'comment_count', (select count(*) from c),
    'name', (select v.display_name from public.site_visitors v where v.device_id = p_device),
    'vote', case when p_kind = 'match' then jsonb_build_object(
        'home', (select count(*) from public.fan_votes v where v.match_id = p_id::uuid and v.pick = 'HOME'),
        'draw', (select count(*) from public.fan_votes v where v.match_id = p_id::uuid and v.pick = 'DRAW'),
        'away', (select count(*) from public.fan_votes v where v.match_id = p_id::uuid and v.pick = 'AWAY'),
        'mine', (select v.pick from public.fan_votes v where v.match_id = p_id::uuid and v.device_id = p_device))
      end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.author_name, 'body', t.body, 'at', t.created_at, 'likes', t.likes, 'liked', t.liked,
        'mine', t.device_id is not distinct from p_device and p_device is not null,
        'replies', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.author_name, 'body', r.body, 'at', r.created_at, 'likes', r.likes, 'liked', r.liked,
            'mine', r.device_id is not distinct from p_device and p_device is not null) order by r.created_at)
          from c r where r.parent_id = t.id), '[]'::jsonb)) order by t.created_at desc)
      from top t), '[]'::jsonb)
  ) $$;

-- ── Service API (server-side only) ─────────────────────────────────────────
create or replace function public.service_fan_feed(p_kind text, p_id text, p_token text default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.fan_target_ok(p_kind, p_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  return private.fan_feed(p_kind, p_id, private.fan_device_or_null(p_token), p_limit);
end $$;

create or replace function public.service_fan_act(p_token text, p_kind text, p_id text, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.notification_devices;
  v_name text;
  v_body text;
  v_parent uuid;
  v_comment uuid;
  v_pick text;
  m public.matches;
begin
  d := private.audience_device(p_token);
  if not private.fan_target_ok(p_kind, p_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  if not private.rate_hit('fan-act', d.id::text, 60, 60) then
    raise exception 'Slow down a little and try again.' using errcode = 'EK429';
  end if;

  if p_action = 'like' then
    insert into public.fan_reactions (target_kind, target_id, device_id) values (p_kind, p_id, d.id) on conflict do nothing;
  elsif p_action = 'unlike' then
    delete from public.fan_reactions where target_kind = p_kind and target_id = p_id and device_id = d.id;

  elsif p_action = 'vote' then
    if p_kind <> 'match' then raise exception 'Votes are for matches' using errcode = 'EK422'; end if;
    select * into m from public.matches where id = p_id::uuid;
    if m.status <> 'SCHEDULED' then
      raise exception 'Voting closes at kick-off.' using errcode = 'EK409';
    end if;
    v_pick := upper(coalesce(p ->> 'pick', ''));
    if v_pick not in ('HOME', 'DRAW', 'AWAY') then raise exception 'Pick home, draw or away' using errcode = 'EK422'; end if;
    insert into public.fan_votes (match_id, device_id, pick) values (m.id, d.id, v_pick)
      on conflict (match_id, device_id) do update set pick = excluded.pick, created_at = now();

  elsif p_action = 'comment' then
    select display_name into v_name from public.site_visitors where device_id = d.id;
    if v_name is null then
      raise exception 'Tell us your name first.' using errcode = 'EK401';
    end if;
    if not private.rate_hit('fan-comment', d.id::text, 5, 60) or not private.rate_hit('fan-comment-hour', d.id::text, 40, 3600) then
      raise exception 'You are commenting very fast. Take a breather and try again.' using errcode = 'EK429';
    end if;
    v_body := btrim(regexp_replace(coalesce(p ->> 'body', ''), '\s+', ' ', 'g'));
    if char_length(v_body) < 1 or char_length(v_body) > 500 then
      raise exception 'Comments are 1–500 characters.' using errcode = 'EK422';
    end if;
    if v_body ~* '(https?://|www\.|\.(com|ng|net|org|xyz|io|me|ly)(/|\s|$))' then
      raise exception 'Links are not allowed in comments.' using errcode = 'EK422';
    end if;
    v_parent := nullif(p ->> 'parent_id', '')::uuid;
    if v_parent is not null and not exists (
      select 1 from public.fan_comments where id = v_parent and target_kind = p_kind and target_id = p_id
        and parent_id is null and hidden_at is null) then
      raise exception 'That comment is no longer available.' using errcode = 'EK404';
    end if;
    insert into public.fan_comments (target_kind, target_id, parent_id, device_id, author_name, body)
    values (p_kind, p_id, v_parent, d.id, v_name, v_body);

  elsif p_action in ('like_comment', 'unlike_comment', 'report', 'delete') then
    v_comment := nullif(p ->> 'comment_id', '')::uuid;
    if not exists (select 1 from public.fan_comments where id = v_comment and target_kind = p_kind and target_id = p_id and hidden_at is null) then
      raise exception 'That comment is no longer available.' using errcode = 'EK404';
    end if;
    if p_action = 'like_comment' then
      insert into public.fan_comment_likes (comment_id, device_id) values (v_comment, d.id) on conflict do nothing;
    elsif p_action = 'unlike_comment' then
      delete from public.fan_comment_likes where comment_id = v_comment and device_id = d.id;
    elsif p_action = 'report' then
      if not private.rate_hit('fan-report', d.id::text, 20, 3600) then
        raise exception 'Too many reports. Try again later.' using errcode = 'EK429';
      end if;
      insert into public.fan_comment_reports (comment_id, device_id) values (v_comment, d.id) on conflict do nothing;
      update public.fan_comments c set report_count = (select count(*) from public.fan_comment_reports r where r.comment_id = c.id),
        hidden_at = case when (select count(*) from public.fan_comment_reports r where r.comment_id = c.id) >= 3 then now() else null end,
        hidden_reason = case when (select count(*) from public.fan_comment_reports r where r.comment_id = c.id) >= 3 then 'Reported by fans' else null end
      where c.id = v_comment;
    else -- delete own comment
      delete from public.fan_comments where id = v_comment and device_id = d.id;
      if not found then raise exception 'You can only delete your own comments.' using errcode = 'EK403'; end if;
    end if;
  else
    raise exception 'Unknown action' using errcode = 'EK422';
  end if;

  return private.fan_feed(p_kind, p_id, d.id, 50);
exception
  when invalid_text_representation then
    raise exception 'Invalid request' using errcode = 'EK422';
end $$;

revoke all on function public.service_fan_feed(text, text, text, int) from public, anon, authenticated;
revoke all on function public.service_fan_act(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.service_fan_feed(text, text, text, int) to service_role;
grant execute on function public.service_fan_act(text, text, text, text, jsonb) to service_role;
revoke all on function private.fan_feed(text, text, uuid, int), private.fan_target_ok(text, text), private.fan_device_or_null(text) from public, anon, authenticated;
