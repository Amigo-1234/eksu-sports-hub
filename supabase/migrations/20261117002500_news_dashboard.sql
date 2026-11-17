-- Dashboard-published Sports News: the same category and report/opinion
-- labels as the stories published in code (src/lib/news/stories.ts), so both
-- kinds sit in one feed. `pinned` marks the featured story. Table is new and
-- empty when this runs; additive only.
alter table public.news_posts
  add column category text not null default 'UPDATE'
    check (category in ('MATCH_REPORT', 'PLAYER_SPOTLIGHT', 'TEAM_UPDATE', 'COMPETITION', 'INTERVIEW', 'UPDATE')),
  add column kind text not null default 'report' check (kind in ('report', 'opinion'));

comment on column public.news_posts.pinned is 'Featured story (leads the Sports News section).';
