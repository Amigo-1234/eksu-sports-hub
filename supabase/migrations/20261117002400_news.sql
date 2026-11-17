-- News: short articles published by administrators (announcements, previews,
-- match reports). Additive only — no existing table changes.
--
-- Public (anon) sees PUBLISHED posts whose publish time has passed; drafts and
-- scheduled posts are visible to admins only. Writes are ADMIN-only (RLS) and
-- every change lands in the audit log via the shared admin audit trigger.

create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  summary text not null default '' check (char_length(summary) <= 300),
  body text not null default '' check (char_length(body) <= 20000),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  published_at timestamptz,
  -- Optional link to a fixture the story is about (cleared if the match is removed).
  match_id uuid references public.matches(id) on delete set null,
  pinned boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_published_has_time check (status <> 'PUBLISHED' or published_at is not null)
);

create index news_posts_feed_idx on public.news_posts (pinned desc, published_at desc) where status = 'PUBLISHED';

create trigger news_posts_touch before update on public.news_posts
  for each row execute function private.touch_updated_at();
create trigger audit_admin_change after insert or update or delete on public.news_posts
  for each row execute function private.audit_admin_change();

alter table public.news_posts enable row level security;
alter table public.news_posts force row level security;
revoke all on public.news_posts from anon, authenticated;
grant select on public.news_posts to anon, authenticated;
grant insert, update, delete on public.news_posts to authenticated;

create policy "published news is public" on public.news_posts for select to anon, authenticated
  using ((status = 'PUBLISHED' and published_at <= now()) or private.has_role('ADMIN'));
create policy "admins insert news" on public.news_posts for insert to authenticated
  with check (private.has_role('ADMIN'));
create policy "admins update news" on public.news_posts for update to authenticated
  using (private.has_role('ADMIN')) with check (private.has_role('ADMIN'));
create policy "admins delete news" on public.news_posts for delete to authenticated
  using (private.has_role('ADMIN'));
