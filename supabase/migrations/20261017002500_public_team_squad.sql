-- Public squad list for a team's profile page.
--
-- Squads stay staff-only at table level; this read-only function exposes just
-- what a team sheet already shows publicly: display name, shirt number,
-- position and captaincy. Only players who are
--   * active members of the team's squad for the current season, and
--   * CLEARED in screening for that team and season
-- are listed. No player ids, student/matric numbers, screening details,
-- faculty/department or registration data are returned.

create or replace function public.public_team_squad(p_team_id uuid)
returns table (player_name text, shirt_number integer, player_position text, is_captain boolean)
language sql stable security definer set search_path = '' as $$
  select p.display_name, sp.shirt_number::integer, sp.position, sp.is_captain
  from public.teams t
  join public.squads s on s.team_id = t.id
  join public.seasons se on se.id = s.season_id and se.is_current and se.archived_at is null
  join public.squad_players sp on sp.squad_id = s.id and sp.active
  join public.players p on p.id = sp.player_id
  where t.id = p_team_id
    and t.active
    and exists (
      select 1 from public.player_screenings ps
      where ps.player_id = sp.player_id and ps.team_id = t.id and ps.season_id = s.season_id and ps.status = 'CLEARED')
  order by case sp.position when 'GK' then 1 when 'DF' then 2 when 'MF' then 3 when 'FW' then 4 else 5 end,
    sp.shirt_number, p.display_name;
$$;

revoke execute on function public.public_team_squad(uuid) from public;
grant execute on function public.public_team_squad(uuid) to anon, authenticated;
