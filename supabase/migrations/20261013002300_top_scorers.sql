-- ════════════════════════════════════════════════════════════════════════════
-- Competition top scorers (read-only, public). Additive: one function, no
-- table or data changes. Independent of Competition Engine V2.
-- ════════════════════════════════════════════════════════════════════════════
-- Counts GOAL and PENALTY_GOAL events by a named player in the competition's
-- live and finished public matches (1H / HT / 2H / FT). Excluded: own goals,
-- voided (cancelled/undone) events, goals without a recorded scorer, demo
-- matches, and anything outside periods 1–4 (no shoot-out attempts count).
-- Each event is counted once (grouped by player and team).
-- Ties share a rank (standard competition ranking: 1, 1, 3 …).
-- Exposes only the display name, team and goal count — no ids, student
-- numbers or other private player data.
create or replace function public.public_top_scorers(p_competition_id uuid)
returns table (rank integer, player_name text, team_id uuid, team_name text, team_short_name text, goals integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select e.player_id, e.team_id, count(*)::int as goals
    from public.match_events e
    join public.matches m on m.id = e.match_id
    join public.competitions c on c.id = m.competition_id
    where m.competition_id = p_competition_id
      and c.status <> 'DRAFT'
      and not m.is_demo
      and m.status in ('1H', 'HT', '2H', 'FT')
      and e.type in ('GOAL', 'PENALTY_GOAL')
      and e.voided_at is null
      and e.player_id is not null
      and e.period between 1 and 4
    group by e.player_id, e.team_id
  )
  select (rank() over (order by g.goals desc))::int, p.display_name, t.id, t.name, t.short_name, g.goals
  from g
  join public.players p on p.id = g.player_id
  join public.teams t on t.id = g.team_id
  order by g.goals desc, p.display_name, t.short_name;
$$;
revoke execute on function public.public_top_scorers(uuid) from public;
grant execute on function public.public_top_scorers(uuid) to anon, authenticated;
