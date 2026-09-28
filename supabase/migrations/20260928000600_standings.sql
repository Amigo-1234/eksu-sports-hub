-- Football standings, rebuilt from FT matches using competition config.
-- Called when a match reaches FT; also callable by admins after corrections.

create or replace function private.recompute_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.competitions;
  v_order text := '';
  t text;
begin
  select * into c from public.competitions where id = p_competition_id;
  if not found or c.format = 'KNOCKOUT' then
    return;
  end if;

  -- Tie-breakers come from configuration, restricted to known columns.
  foreach t in array c.tiebreakers loop
    if t not in ('points', 'goal_difference', 'goals_for', 'wins') then
      raise exception 'Unsupported tie-breaker %', t using errcode = 'EK422';
    end if;
    v_order := v_order || case when v_order = '' then '' else ', ' end || format('%I desc', t);
  end loop;
  if v_order = '' then
    v_order := 'points desc';
  end if;

  delete from public.standings where competition_id = p_competition_id;

  execute format($q$
    insert into public.standings (
      competition_id, group_id, team_id, played, wins, draws, losses,
      goals_for, goals_against, goal_difference, points, rank
    )
    with entries as (
      select ce.team_id, ce.group_id from public.competition_entries ce where ce.competition_id = $1
    ),
    results as (
      select m.home_team_id as team_id, m.home_score as gf, m.away_score as ga
      from public.matches m where m.competition_id = $1 and m.status = 'FT'
      union all
      select m.away_team_id, m.away_score, m.home_score
      from public.matches m where m.competition_id = $1 and m.status = 'FT'
    ),
    agg as (
      select
        e.team_id, e.group_id,
        count(r.team_id)::smallint as played,
        count(*) filter (where r.gf > r.ga)::smallint as wins,
        count(*) filter (where r.gf = r.ga)::smallint as draws,
        count(*) filter (where r.gf < r.ga)::smallint as losses,
        coalesce(sum(r.gf), 0)::smallint as goals_for,
        coalesce(sum(r.ga), 0)::smallint as goals_against
      from entries e left join results r on r.team_id = e.team_id
      group by e.team_id, e.group_id
    ),
    scored as (
      select a.*,
        (a.goals_for - a.goals_against)::smallint as goal_difference,
        (a.wins * $2 + a.draws * $3 + a.losses * $4)::smallint as points
      from agg a
    )
    select $1, s.group_id, s.team_id, s.played, s.wins, s.draws, s.losses,
      s.goals_for, s.goals_against, s.goal_difference, s.points,
      rank() over (partition by s.group_id order by %s)::smallint
    from scored s
  $q$, v_order)
  using p_competition_id, c.points_win, c.points_draw, c.points_loss;
end $$;

-- Admin hook for future corrections to finished matches.
create or replace function public.admin_recompute_standings(p_competition_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('ADMIN') then
    raise exception 'Only an administrator can recompute standings' using errcode = 'EK403';
  end if;
  perform private.recompute_standings(p_competition_id);
  perform private.audit('STANDINGS_RECOMPUTED', 'competition', p_competition_id, null, null, null, null);
end $$;

revoke execute on function public.admin_recompute_standings(uuid) from public, anon;
grant execute on function public.admin_recompute_standings(uuid) to authenticated;
