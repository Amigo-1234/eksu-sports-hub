-- Search, registered teams, and a live Fan Zone. Additive only.
--
-- 1. public_registered_teams(): active teams with a current-season squad
--    (registered through the portal), so fans can follow them before their
--    first fixture.
-- 2. public_search_players(q): the same players and fields a team page
--    already shows publicly (name, shirt number, team) — active squad members
--    cleared in screening this season. No ids, student numbers or screening
--    details.
-- 3. Live Fan Zone: every Fan Zone change sends a broadcast hint on
--    fan:{match|news}:{id} (listen-only for the public, like the score
--    channels); clients refetch. Emoji reactions ("bursts") are counted and
--    broadcast so everyone watching sees them float up.

-- ── 1. Registered teams ────────────────────────────────────────────────────
create or replace function public.public_registered_teams()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct t.id
  from public.teams t
  join public.squads s on s.team_id = t.id
  join public.seasons se on se.id = s.season_id and se.is_current and se.archived_at is null
  where t.active and exists (select 1 from public.squad_players sp where sp.squad_id = s.id and sp.active)
$$;
revoke execute on function public.public_registered_teams() from public;
grant execute on function public.public_registered_teams() to anon, authenticated;

-- ── 2. Player search ───────────────────────────────────────────────────────
create or replace function public.public_search_players(p_q text, p_limit int default 20)
returns table (player_name text, shirt_number integer, team_id uuid)
language sql stable security definer set search_path = '' as $$
  with q as (
    select replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') as term
  )
  select p.display_name, sp.shirt_number::integer, t.id
  from q, public.teams t
  join public.squads s on s.team_id = t.id
  join public.seasons se on se.id = s.season_id and se.is_current and se.archived_at is null
  join public.squad_players sp on sp.squad_id = s.id and sp.active
  join public.players p on p.id = sp.player_id
  where char_length(q.term) between 2 and 60
    and t.active
    and p.display_name ilike '%' || q.term || '%'
    and exists (
      select 1 from public.player_screenings ps
      where ps.player_id = sp.player_id and ps.team_id = t.id and ps.season_id = s.season_id and ps.status = 'CLEARED')
  order by (p.display_name ilike q.term || '%') desc, p.display_name
  limit greatest(1, least(coalesce(p_limit, 20), 50))
$$;
revoke execute on function public.public_search_players(text, int) from public;
grant execute on function public.public_search_players(text, int) to anon, authenticated;

-- ── 3. Live Fan Zone ───────────────────────────────────────────────────────
create or replace function private.fan_hint(p_kind text, p_id text, p_what text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind is null or p_id is null then return; end if;
  perform realtime.send(jsonb_build_object('kind', p_kind, 'id', p_id, 'what', p_what), 'fan_changed', 'fan:' || p_kind || ':' || p_id, true);
exception when others then
  null; -- a hint must never block a fan action
end $$;

create or replace function private.fan_hint_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := coalesce(new, old);
  v_kind text;
  v_id text;
begin
  case tg_table_name
    when 'fan_comments', 'fan_reactions' then v_kind := r.target_kind; v_id := r.target_id;
    when 'fan_comment_likes' then
      select c.target_kind, c.target_id into v_kind, v_id from public.fan_comments c where c.id = r.comment_id;
    else v_kind := 'match'; v_id := r.match_id::text; -- votes, predictions, Player of the Match
  end case;
  perform private.fan_hint(v_kind, v_id, case when tg_table_name in ('fan_votes', 'fan_predictions', 'fan_potm_votes') then 'games' else 'feed' end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['fan_comments', 'fan_reactions', 'fan_comment_likes', 'fan_votes', 'fan_predictions', 'fan_potm_votes'] loop
    execute format('create trigger fan_hint after insert or update or delete on public.%I for each row execute function private.fan_hint_trigger()', t);
  end loop;
end $$;

-- Listen-only access to the Fan Zone channels (no insert policy: the public
-- cannot publish on them; only the database sends).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "public fan channels are listen-only" on realtime.messages';
    execute $p$create policy "public fan channels are listen-only" on realtime.messages
      for select to anon, authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and realtime.topic() ~ '^fan:(match|news):[a-z0-9-]{3,100}$'
      )$p$;
  end if;
end $$;

-- Emoji bursts.
create table public.fan_bursts (
  target_kind text not null check (target_kind in ('match', 'news')),
  target_id text not null check (target_id ~ '^[a-z0-9-]{3,100}$'),
  emoji text not null check (emoji in ('fire', 'goal', 'laugh', 'clap', 'shock', 'cry')),
  n integer not null default 0,
  primary key (target_kind, target_id, emoji)
);
alter table public.fan_bursts enable row level security;
alter table public.fan_bursts force row level security;
revoke all on public.fan_bursts from anon, authenticated;

create or replace function private.fan_burst_counts(p_kind text, p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(emoji, n), '{}'::jsonb) from public.fan_bursts where target_kind = p_kind and target_id = p_id
$$;

create or replace function public.service_fan_bursts(p_kind text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.fan_target_ok(p_kind, p_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  return private.fan_burst_counts(p_kind, p_id);
end $$;

create or replace function public.service_fan_burst(p_token text, p_kind text, p_id text, p_emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.notification_devices;
begin
  d := private.audience_device(p_token);
  if not private.fan_target_ok(p_kind, p_id) then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  if p_emoji not in ('fire', 'goal', 'laugh', 'clap', 'shock', 'cry') then
    raise exception 'Unknown reaction' using errcode = 'EK422';
  end if;
  if not private.rate_hit('fan-burst', d.id::text, 30, 30) then
    raise exception 'Easy! Too many reactions.' using errcode = 'EK429';
  end if;
  insert into public.fan_bursts (target_kind, target_id, emoji, n) values (p_kind, p_id, p_emoji, 1)
    on conflict (target_kind, target_id, emoji) do update set n = public.fan_bursts.n + 1;
  begin
    perform realtime.send(jsonb_build_object('emoji', p_emoji), 'fan_burst', 'fan:' || p_kind || ':' || p_id, true);
  exception when others then
    null;
  end;
  return private.fan_burst_counts(p_kind, p_id);
end $$;

revoke all on function public.service_fan_bursts(text, text), public.service_fan_burst(text, text, text, text) from public, anon, authenticated;
grant execute on function public.service_fan_bursts(text, text), public.service_fan_burst(text, text, text, text) to service_role;
revoke all on function private.fan_hint(text, text, text), private.fan_hint_trigger(), private.fan_burst_counts(text, text)
  from public, anon, authenticated;
