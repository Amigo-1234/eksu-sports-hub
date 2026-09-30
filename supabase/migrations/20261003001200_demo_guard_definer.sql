-- Fix: the DEMO SHOWCASE guard triggers (20261002001100) ran with the caller's
-- privileges. An ADMIN saving a competition through the admin UI (a direct,
-- RLS-checked table update) hit "permission denied for table matches" because
-- clients have no grant on matches.is_demo. Guards must see the whole row set
-- whatever the caller may read, like the other guard triggers: run them as
-- their owner. Bodies are unchanged.

create or replace function private.guard_demo_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_demo and not new.is_demo then
    raise exception 'A demo match stays a demo match' using errcode = 'EK409';
  end if;
  if new.is_demo and coalesce(new.round_label, '') !~* 'demo' then
    raise exception 'A demo match must keep a visible DEMO label in its round' using errcode = 'EK422';
  end if;
  -- Demo competitions hold only demo matches (official standings stay clean).
  if not new.is_demo and exists (
    select 1 from public.matches x where x.competition_id = new.competition_id and x.is_demo and x.id <> new.id
  ) then
    raise exception 'This competition is a demo competition: it can only hold demo matches' using errcode = 'EK422';
  end if;
  return new;
end $$;

create or replace function private.guard_demo_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.name !~* 'demo' and exists (select 1 from public.matches m where m.competition_id = new.id and m.is_demo) then
    raise exception 'A competition with demo matches must keep DEMO in its name' using errcode = 'EK422';
  end if;
  return new;
end $$;

create or replace function private.guard_demo_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.matches m
    where m.id = new.match_id and m.is_demo and new.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'Demo data can only be attached to a team of a DEMO SHOWCASE match' using errcode = 'EK422';
  end if;
  return new;
end $$;

create or replace function private.guard_demo_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.demo_player_id is null and new.demo_related_player_id is null then
    return new;
  end if;
  if not exists (select 1 from public.matches m where m.id = new.match_id and m.is_demo) then
    raise exception 'Demo participants can only appear in a DEMO SHOWCASE match' using errcode = 'EK422';
  end if;
  if exists (
    select 1 from public.demo_lineup_players d
    where d.id in (new.demo_player_id, new.demo_related_player_id)
      and (d.match_id <> new.match_id or d.team_id <> new.team_id)
  ) then
    raise exception 'That demo participant belongs to another match or team' using errcode = 'EK422';
  end if;
  return new;
end $$;

-- Functions: nothing is executable unless granted (triggers do not need EXECUTE).
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
