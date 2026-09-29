-- Shared test helpers, installed inside each test transaction (rolled back).
-- Loaded by the other test files via \ir.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Create a user through auth.users (fires the profile trigger) and grant roles.
create or replace function tests.make_user(p_email text, p_roles text[] default '{}')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_user_meta_data)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '', now(), now(),
          jsonb_build_object('display_name', p_email));
  insert into public.user_roles (user_id, role_id)
  select v_id, r.id from public.roles r where r.code = any (p_roles);
  return v_id;
end $$;

-- Become a signed-in user for subsequent statements (undo with `reset role`).
create or replace function tests.login(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.login_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Test-owned matches (isolated from development assignments), created
-- inside the rolled-back transaction with the seeded teams/competition.
create table tests.fixture (key text primary key, id uuid not null);
insert into tests.fixture values
  ('m1', gen_random_uuid()), ('m2', gen_random_uuid());
insert into public.matches (id, competition_id, round_label, home_team_id, away_team_id, scheduled_at)
select f.id, '60000000-0000-4000-8000-000000000001', 'Test',
  '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', now()
from tests.fixture f;
grant select on tests.fixture to anon, authenticated;
create or replace function tests.m1() returns uuid language sql stable as $$ select id from tests.fixture where key = 'm1' $$;
create or replace function tests.m2() returns uuid language sql stable as $$ select id from tests.fixture where key = 'm2' $$;
create or replace function tests.home() returns uuid language sql immutable as $$ select '70000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function tests.away() returns uuid language sql immutable as $$ select '70000000-0000-4000-8000-000000000002'::uuid $$;

-- Player id for a shirt number in a seeded team's squad.
create or replace function tests.player(p_team uuid, p_shirt int)
returns uuid language sql stable security definer set search_path = '' as $$
  select sp.player_id from public.squad_players sp join public.squads s on s.id = sp.squad_id
  where s.team_id = p_team and sp.shirt_number = p_shirt;
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- Confirmed line-ups for a test match (kick-off requires them): shirts 1–11
-- start in a 4-4-2 (No. 1 in goal, No. 10 captain), 12–18 on the bench.
create or replace function tests.confirm_lineups(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; t uuid; v_lineup uuid; f jsonb;
begin
  select * into m from public.matches where id = p_match;
  select slots into f from public.formations where code = '4-4-2';
  foreach t in array array[m.home_team_id, m.away_team_id] loop
    insert into public.match_lineups (match_id, team_id, status, formation_code, confirmed_at)
    values (p_match, t, 'CONFIRMED', '4-4-2', now()) returning id into v_lineup;
    insert into public.lineup_players (lineup_id, player_id, shirt_number, role, position, slot_index, pitch_x, pitch_y,
                                       is_captain, is_goalkeeper, sort_order)
    select v_lineup, sp.player_id, sp.shirt_number,
      case when sp.shirt_number <= 11 then 'STARTER' else 'SUBSTITUTE' end::public.lineup_role,
      case when sp.shirt_number <= 11 then f -> (sp.shirt_number - 1) ->> 'position' end,
      case when sp.shirt_number <= 11 then sp.shirt_number - 1 end,
      case when sp.shirt_number <= 11 then (f -> (sp.shirt_number - 1) ->> 'x')::numeric end,
      case when sp.shirt_number <= 11 then (f -> (sp.shirt_number - 1) ->> 'y')::numeric end,
      sp.shirt_number = 10, sp.shirt_number in (1, 13), sp.shirt_number
    from public.squad_players sp join public.squads s on s.id = sp.squad_id
    join public.competitions c on c.id = m.competition_id
    where s.team_id = t and s.season_id = c.season_id and sp.active;
  end loop;
end $$;
select tests.confirm_lineups(tests.m1());
select tests.confirm_lineups(tests.m2());
grant execute on all functions in schema tests to anon, authenticated;
