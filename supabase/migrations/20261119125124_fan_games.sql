-- Fan games: score predictions (with leaderboards) and Player of the Match.
-- Additive only. Same model as the Fan Zone: anonymous device cookie + the
-- light sign-in name; every read/write goes through service_role functions
-- called by the site's server; tables are closed to anon/authenticated.
--
-- Predictions: one per device per match, changeable until kick-off (status
-- SCHEDULED and scheduled time not passed). Points once the match is FT:
-- 3 for the exact score, 1 for the right result (home win / draw / away win).
--
-- Player of the Match: after full-time, for 48 hours. Candidates are players
-- who took part (confirmed line-up starters and used substitutes), plus any
-- player with a recorded event (covers matches without line-ups).

create table public.fan_predictions (
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  home smallint not null check (home between 0 and 30),
  away smallint not null check (away between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, device_id)
);
create index fan_predictions_device_idx on public.fan_predictions (device_id);

create table public.fan_potm_votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, device_id)
);
create index fan_potm_votes_match_idx on public.fan_potm_votes (match_id, player_id);

do $$
declare t text;
begin
  foreach t in array array['fan_predictions', 'fan_potm_votes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Points for one prediction against a full-time score (null until FT).
create or replace function private.fan_prediction_points(p_home int, p_away int, p_status public.match_status, p_fh int, p_fa int)
returns int language sql immutable set search_path = '' as $$
  select case
    when p_status <> 'FT' then null
    when p_home = p_fh and p_away = p_fa then 3
    when sign(p_home - p_away) = sign(p_fh - p_fa) then 1
    else 0 end $$;

create or replace function private.fan_potm_open(m public.matches) returns boolean
language sql stable set search_path = '' as $$
  select m.status = 'FT' and coalesce(m.finished_at, m.scheduled_at) > now() - interval '48 hours' $$;

-- Players eligible for Player of the Match (who took part).
create or replace function private.fan_potm_candidates(p_match uuid)
returns table (player_id uuid, name text, team_id uuid, shirt smallint)
language sql stable security definer set search_path = '' as $$
  with lineup as (
    select ls.player_id, coalesce(nullif(btrim(ls.display_name), ''), 'No. ' || ls.shirt_number) as name, ml.team_id, ls.shirt_number as shirt
    from public.match_lineups ml
    cross join lateral private.lineup_player_states(ml.id) ls
    where ml.match_id = p_match and ml.status = 'CONFIRMED' and (ls.role = 'STARTER' or ls.subbed_on or ls.entries > 0)
  ),
  ev as (
    select distinct on (pid) pid as player_id, p.display_name as name, e.team_id, null::smallint as shirt
    from public.match_events e
    cross join lateral (values (e.player_id), (e.related_player_id)) v(pid)
    join public.players p on p.id = v.pid
    where e.match_id = p_match and e.voided_at is null and v.pid is not null
    order by pid
  )
  select * from lineup
  union all
  select * from ev where name is not null and ev.player_id not in (select l.player_id from lineup l)
$$;

-- Prediction + Player of the Match state for one match, from this device's view.
create or replace function private.fan_match_games(p_match uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.matches;
  v_pred jsonb;
  v_potm jsonb := null;
begin
  select * into m from public.matches where id = p_match;

  select jsonb_build_object(
    'open', m.status = 'SCHEDULED' and m.scheduled_at > now(),
    'count', (select count(*) from public.fan_predictions where match_id = p_match),
    'mine', (select jsonb_build_object('home', fp.home, 'away', fp.away,
                      'points', private.fan_prediction_points(fp.home, fp.away, m.status, m.home_score, m.away_score))
             from public.fan_predictions fp where fp.match_id = p_match and fp.device_id = p_device),
    'popular', coalesce((select jsonb_agg(jsonb_build_object('home', x.home, 'away', x.away, 'n', x.n) order by x.n desc, x.home, x.away)
                from (select home, away, count(*) as n from public.fan_predictions where match_id = p_match
                      group by home, away order by count(*) desc, home, away limit 3) x), '[]'::jsonb),
    'exact', case when m.status = 'FT' then (select count(*) from public.fan_predictions
                  where match_id = p_match and home = m.home_score and away = m.away_score) end
  ) into v_pred;

  if m.status = 'FT' then
    with c as (select * from private.fan_potm_candidates(p_match)),
    v as (select player_id, count(*) as n from public.fan_potm_votes where match_id = p_match group by player_id),
    ranked as (select c.*, coalesce(v.n, 0) as votes from c left join v using (player_id))
    select jsonb_build_object(
      'open', private.fan_potm_open(m),
      'closes_at', coalesce(m.finished_at, m.scheduled_at) + interval '48 hours',
      'total', (select count(*) from public.fan_potm_votes where match_id = p_match),
      'mine', (select pv.player_id from public.fan_potm_votes pv where pv.match_id = p_match and pv.device_id = p_device),
      'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', r.player_id, 'name', r.name, 'team_id', r.team_id,
                       'shirt', r.shirt, 'votes', r.votes) order by r.votes desc, r.name) from ranked r), '[]'::jsonb)
    ) into v_potm;
  end if;

  return jsonb_build_object('prediction', v_pred, 'potm', v_potm);
end $$;

-- ── Service API (server-side only) ─────────────────────────────────────────
create or replace function public.service_fan_games(p_match_id uuid, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.match_is_public(p_match_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  return private.fan_match_games(p_match_id, private.fan_device_or_null(p_token));
end $$;

-- p_action: 'predict' {home, away} | 'unpredict' | 'potm' {player_id}
create or replace function public.service_fan_games_act(p_token text, p_match_id uuid, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.notification_devices;
  m public.matches;
  v_home int;
  v_away int;
  v_player uuid;
begin
  d := private.audience_device(p_token);
  if not private.match_is_public(p_match_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  if not private.rate_hit('fan-act', d.id::text, 60, 60) then
    raise exception 'Slow down a little and try again.' using errcode = 'EK429';
  end if;
  select * into m from public.matches where id = p_match_id;

  if p_action in ('predict', 'unpredict') then
    if not (m.status = 'SCHEDULED' and m.scheduled_at > now()) then
      raise exception 'Predictions close at kick-off.' using errcode = 'EK409';
    end if;
    if p_action = 'unpredict' then
      delete from public.fan_predictions where match_id = m.id and device_id = d.id;
    else
      if not exists (select 1 from public.site_visitors where device_id = d.id) then
        raise exception 'Tell us your name first, so you show up on the leaderboard.' using errcode = 'EK401';
      end if;
      v_home := (p ->> 'home')::int;
      v_away := (p ->> 'away')::int;
      if v_home is null or v_away is null or v_home not between 0 and 30 or v_away not between 0 and 30 then
        raise exception 'Pick a score for both teams.' using errcode = 'EK422';
      end if;
      insert into public.fan_predictions (match_id, device_id, home, away) values (m.id, d.id, v_home, v_away)
        on conflict (match_id, device_id) do update set home = excluded.home, away = excluded.away, updated_at = now();
    end if;

  elsif p_action = 'potm' then
    if not private.fan_potm_open(m) then
      raise exception 'Player of the Match voting is not open.' using errcode = 'EK409';
    end if;
    v_player := (p ->> 'player_id')::uuid;
    if v_player is null or not exists (select 1 from private.fan_potm_candidates(m.id) c where c.player_id = v_player) then
      raise exception 'Pick a player who played in this match.' using errcode = 'EK422';
    end if;
    insert into public.fan_potm_votes (match_id, device_id, player_id) values (m.id, d.id, v_player)
      on conflict (match_id, device_id) do update set player_id = excluded.player_id, created_at = now();
  else
    raise exception 'Unknown action' using errcode = 'EK422';
  end if;

  return private.fan_match_games(m.id, d.id);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid request' using errcode = 'EK422';
end $$;

-- Leaderboard. p_period: 'week' (matches since Monday 00:00 WAT) or 'all'.
-- Only finished (FT) matches score. Ties share a rank (more exact scores first).
create or replace function public.service_fan_leaderboard(p_period text default 'all', p_competition_id uuid default null,
  p_token text default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz;
  v_device uuid := private.fan_device_or_null(p_token);
  v_rows jsonb;
  v_me jsonb;
  v_players int;
begin
  if p_period not in ('week', 'all') then
    raise exception 'Unknown period' using errcode = 'EK422';
  end if;
  v_since := case when p_period = 'week'
    then (date_trunc('week', now() at time zone 'Africa/Lagos')) at time zone 'Africa/Lagos' else '-infinity'::timestamptz end;

  with scored as (
    select fp.device_id,
           private.fan_prediction_points(fp.home, fp.away, m.status, m.home_score, m.away_score) as pts,
           (fp.home = m.home_score and fp.away = m.away_score) as exact
    from public.fan_predictions fp
    join public.matches m on m.id = fp.match_id
    where m.status = 'FT' and m.scheduled_at >= v_since
      and (p_competition_id is null or m.competition_id = p_competition_id)
      and private.match_is_public(m.id)
  ),
  totals as (
    select s.device_id, v.display_name as name, sum(s.pts)::int as points, count(*) filter (where s.exact)::int as exact,
           count(*)::int as played
    from scored s join public.site_visitors v on v.device_id = s.device_id
    group by s.device_id, v.display_name
  ),
  ranked as (
    select *, rank() over (order by points desc, exact desc) as rank from totals
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', r.name, 'points', r.points, 'exact', r.exact,
                'played', r.played, 'me', r.device_id = v_device) order by r.rank, r.name)
              from (select * from ranked order by rank, name limit greatest(1, least(p_limit, 100))) r), '[]'::jsonb),
    (select jsonb_build_object('rank', r.rank, 'name', r.name, 'points', r.points, 'exact', r.exact, 'played', r.played)
       from ranked r where r.device_id = v_device),
    (select count(*)::int from ranked)
  into v_rows, v_me, v_players;

  return jsonb_build_object('period', p_period, 'rows', v_rows, 'me', v_me, 'players', v_players);
end $$;

revoke all on function public.service_fan_games(uuid, text) from public, anon, authenticated;
revoke all on function public.service_fan_games_act(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.service_fan_leaderboard(text, uuid, text, int) from public, anon, authenticated;
grant execute on function public.service_fan_games(uuid, text) to service_role;
grant execute on function public.service_fan_games_act(text, uuid, text, jsonb) to service_role;
grant execute on function public.service_fan_leaderboard(text, uuid, text, int) to service_role;
revoke all on function private.fan_match_games(uuid, uuid), private.fan_potm_candidates(uuid),
  private.fan_potm_open(public.matches), private.fan_prediction_points(int, int, public.match_status, int, int)
  from public, anon, authenticated;
