-- Admin dashboard support (additive).
--
--   1. Columns the admin UI manages that did not exist yet.
--   2. Staff deactivation respected by the role helpers.
--   3. ADMIN-only write policies on reference data, audited by trigger.
--   4. ADMIN RPCs for everything touching match state, assignments, roles
--      and corrections (never raw table writes from the client).
--   5. Privilege hygiene for all functions (see 20260928000700).

-- ── 1. Columns ─────────────────────────────────────────────────────────────
alter table public.seasons add column archived_at timestamptz;
alter table public.seasons add constraint seasons_current_not_archived check (not (is_current and archived_at is not null));

alter table public.competitions
  add column status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  add column extra_time_enabled boolean not null default false,
  add column penalties_enabled boolean not null default false;

alter table public.teams
  add column slug text,
  add column active boolean not null default true;
update public.teams set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) || '-' || lower(code)
where slug is null;
alter table public.teams alter column slug set not null;
alter table public.teams add constraint teams_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create unique index teams_slug_unique on public.teams (slug);

alter table public.squad_players
  add column position text check (position in ('GK', 'DF', 'MF', 'FW')),
  add column is_captain boolean not null default false;
create unique index squad_players_one_captain on public.squad_players (squad_id) where is_captain;

alter table public.venues add column notes text not null default '';

alter table public.profiles add column deactivated_at timestamptz;

-- ── 2. Deactivated staff lose all role-based access immediately ────────────
create or replace function private.has_role(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and r.code = p_code and p.deactivated_at is null
  );
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and r.code in ('ADMIN', 'MANAGER', 'OPERATOR') and p.deactivated_at is null
  );
$$;

create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode = 'EK401';
  end if;
  if not private.has_role('ADMIN') then
    raise exception 'Administrator access required' using errcode = 'EK403';
  end if;
end $$;

-- ── 3. Reference data: ADMIN writes through RLS, audited by trigger ────────
create or replace function private.audit_admin_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_state, after_state)
  values (
    auth.uid(),
    'ADMIN_' || tg_op,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

-- Deleting is only offered where nothing cascades away with the row, and only
-- while nothing depends on it. Seasons, competitions, teams and squads are
-- archived/deactivated instead (their foreign keys cascade to history).
create or replace function private.guard_admin_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := to_jsonb(old);
  v_id uuid := (o ->> 'id')::uuid;
  v_reason text;
begin
  if tg_table_name = 'faculties' then
    v_reason := case
      when exists (select 1 from public.departments where faculty_id = v_id) then 'it still has departments'
      when exists (select 1 from public.teams where faculty_id = v_id) then 'teams still belong to it' end;
  elsif tg_table_name = 'departments' then
    v_reason := case when exists (select 1 from public.teams where department_id = v_id) then 'teams still belong to it' end;
  elsif tg_table_name = 'venues' then
    v_reason := case when exists (select 1 from public.matches where venue_id = v_id) then 'fixtures are played there' end;
  elsif tg_table_name = 'competition_stages' then
    v_reason := case
      when exists (select 1 from public.matches where stage_id = v_id) then 'fixtures belong to it'
      when exists (select 1 from public.competition_entries where stage_id = v_id) then 'teams are entered in it'
      when exists (select 1 from public.competition_groups where stage_id = v_id) then 'it still has groups' end;
  elsif tg_table_name = 'competition_groups' then
    v_reason := case
      when exists (select 1 from public.matches where group_id = v_id) then 'fixtures belong to it'
      when exists (select 1 from public.competition_entries where group_id = v_id) then 'teams are drawn in it' end;
  elsif tg_table_name = 'competition_entries' then
    v_reason := case when exists (
      select 1 from public.matches m where m.competition_id = (o ->> 'competition_id')::uuid
        and (o ->> 'team_id')::uuid in (m.home_team_id, m.away_team_id)) then 'the team has fixtures in this competition' end;
  elsif tg_table_name = 'squad_players' then
    v_reason := case when exists (
      select 1 from public.match_events e join public.squads s on s.id = (o ->> 'squad_id')::uuid
      where s.team_id = e.team_id and (o ->> 'player_id')::uuid in (e.player_id, e.related_player_id))
      then 'the player appears in recorded match events' end;
  elsif tg_table_name = 'players' then
    v_reason := case when exists (select 1 from public.squad_players where player_id = v_id) then 'the player is in a squad' end;
  end if;
  if v_reason is not null then
    raise exception 'Cannot delete: %', v_reason using errcode = 'EK409';
  end if;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','faculties','departments','venues','competitions','competition_stages',
    'competition_groups','competition_entries','teams','players','squads','squad_players'
  ] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy "admins insert %s" on public.%I for insert to authenticated with check (private.has_role(''ADMIN''))', t, t);
    execute format('create policy "admins update %s" on public.%I for update to authenticated using (private.has_role(''ADMIN'')) with check (private.has_role(''ADMIN''))', t, t);
    execute format('create trigger audit_admin_change after insert or update or delete on public.%I for each row execute function private.audit_admin_change()', t);
  end loop;
  foreach t in array array[
    'faculties','departments','venues','competition_stages','competition_groups',
    'competition_entries','players','squad_players'
  ] loop
    execute format('grant delete on public.%I to authenticated', t);
    execute format('create policy "admins delete %s" on public.%I for delete to authenticated using (private.has_role(''ADMIN''))', t, t);
    execute format('create trigger guard_admin_delete before delete on public.%I for each row execute function private.guard_admin_delete()', t);
  end loop;
end $$;

-- is_current is unique; switching seasons must be atomic.
create or replace function public.admin_set_current_season(p_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.seasons where id = p_season_id and archived_at is null) then
    raise exception 'Season not found or archived' using errcode = 'EK404';
  end if;
  update public.seasons set is_current = false where is_current and id <> p_season_id;
  update public.seasons set is_current = true where id = p_season_id;
end $$;

-- ── 4a. Fixtures ───────────────────────────────────────────────────────────
create or replace function private.validate_fixture(
  p_competition_id uuid, p_stage_id uuid, p_group_id uuid, p_home uuid, p_away uuid, p_venue uuid, p_scheduled_at timestamptz
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_competition_id is null or p_home is null or p_away is null or p_scheduled_at is null then
    raise exception 'Competition, both teams and kick-off are required' using errcode = 'EK422';
  end if;
  if p_home = p_away then
    raise exception 'Home and away team must be different' using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.competitions where id = p_competition_id) then
    raise exception 'Competition not found' using errcode = 'EK404';
  end if;
  if exists (select 1 from public.competitions where id = p_competition_id and status = 'ARCHIVED') then
    raise exception 'Competition is archived' using errcode = 'EK409';
  end if;
  if (select count(*) from public.competition_entries where competition_id = p_competition_id and team_id in (p_home, p_away)) < 2 then
    raise exception 'Both teams must be entered in the competition' using errcode = 'EK422';
  end if;
  if p_stage_id is not null and not exists (select 1 from public.competition_stages where id = p_stage_id and competition_id = p_competition_id) then
    raise exception 'Stage does not belong to this competition' using errcode = 'EK422';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.competition_groups g where g.id = p_group_id and g.stage_id = p_stage_id
  ) then
    raise exception 'Group does not belong to the selected stage' using errcode = 'EK422';
  end if;
  if p_venue is not null and not exists (select 1 from public.venues where id = p_venue) then
    raise exception 'Venue not found' using errcode = 'EK404';
  end if;
end $$;

create or replace function public.admin_create_match(
  p_competition_id uuid, p_stage_id uuid, p_group_id uuid, p_round_label text,
  p_home_team_id uuid, p_away_team_id uuid, p_venue_id uuid, p_scheduled_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  perform private.validate_fixture(p_competition_id, p_stage_id, p_group_id, p_home_team_id, p_away_team_id, p_venue_id, p_scheduled_at);
  insert into public.matches (competition_id, stage_id, group_id, round_label, home_team_id, away_team_id, venue_id, scheduled_at)
  values (p_competition_id, p_stage_id, p_group_id, coalesce(btrim(p_round_label), ''), p_home_team_id, p_away_team_id, p_venue_id, p_scheduled_at)
  returning id into v_id;
  perform private.audit('FIXTURE_CREATED', 'match', v_id, v_id, null, null, private.match_snapshot(v_id));
  return v_id;
end $$;

-- Fixture details only; never touches score, clock or sequence.
create or replace function public.admin_update_fixture(
  p_match_id uuid, p_stage_id uuid, p_group_id uuid, p_round_label text,
  p_home_team_id uuid, p_away_team_id uuid, p_venue_id uuid, p_scheduled_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status <> 'SCHEDULED' then
    raise exception 'Only scheduled fixtures can be edited (match is %)', m.status using errcode = 'EK409';
  end if;
  perform private.validate_fixture(m.competition_id, p_stage_id, p_group_id, p_home_team_id, p_away_team_id, p_venue_id, p_scheduled_at);
  v_before := to_jsonb(m);
  update public.matches set
    stage_id = p_stage_id, group_id = p_group_id, round_label = coalesce(btrim(p_round_label), ''),
    home_team_id = p_home_team_id, away_team_id = p_away_team_id, venue_id = p_venue_id, scheduled_at = p_scheduled_at
  where id = p_match_id;
  perform private.audit('FIXTURE_UPDATED', 'match', p_match_id, p_match_id, null, v_before,
    (select to_jsonb(x) from public.matches x where x.id = p_match_id));
end $$;

-- POSTPONED / CANCELLED / ABANDONED with a mandatory reason.
create or replace function public.admin_set_match_outcome(p_match_id uuid, p_status public.match_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if not (
    (p_status = 'POSTPONED' and m.status = 'SCHEDULED') or
    (p_status = 'CANCELLED' and m.status in ('SCHEDULED', 'POSTPONED')) or
    (p_status = 'ABANDONED' and m.status in ('1H', 'HT', '2H'))
  ) then
    raise exception 'Cannot mark a % match as %', m.status, p_status using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);
  if p_status = 'ABANDONED' then
    perform private.fold_pause(p_match_id);
    update public.matches set clock_running = false, period_ended_at = now(), finished_at = now() where id = p_match_id;
    update public.match_periods set ended_at = now() where match_id = p_match_id and ended_at is null;
  end if;
  update public.matches set status = p_status, status_note = btrim(p_reason) where id = p_match_id;
  perform private.bump_seq(p_match_id);
  perform private.audit('MATCH_' || p_status::text, 'match', p_match_id, p_match_id, null, v_before,
    private.match_snapshot(p_match_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'MATCH_' || p_status::text);
end $$;

-- Postponed → scheduled at a new time.
create or replace function public.admin_reschedule_match(p_match_id uuid, p_scheduled_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  if p_scheduled_at is null then
    raise exception 'A new kick-off time is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status <> 'POSTPONED' then
    raise exception 'Only postponed matches can be rescheduled' using errcode = 'EK409';
  end if;
  v_before := private.match_snapshot(p_match_id);
  update public.matches set status = 'SCHEDULED', scheduled_at = p_scheduled_at,
    status_note = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_match_id;
  perform private.bump_seq(p_match_id);
  perform private.audit('MATCH_RESCHEDULED', 'match', p_match_id, p_match_id, null, v_before,
    private.match_snapshot(p_match_id) || jsonb_build_object('detail', p_scheduled_at));
  perform private.after_match_change(p_match_id, 'MATCH_RESCHEDULED');
end $$;

-- ── 4b. Operator assignments ───────────────────────────────────────────────
create or replace function private.is_active_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user and r.code in ('ADMIN', 'MANAGER', 'OPERATOR') and p.deactivated_at is null
  );
$$;

-- Replace the match's active assignments with PRIMARY (+ optional BACKUP).
create or replace function public.admin_assign_operators(p_match_id uuid, p_primary uuid, p_backup uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_before jsonb;
begin
  perform private.require_admin();
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status in ('FT', 'CANCELLED', 'ABANDONED') then
    raise exception 'Cannot change operators on a % match', m.status using errcode = 'EK409';
  end if;
  if p_primary is null then
    raise exception 'A primary operator is required' using errcode = 'EK422';
  end if;
  if p_backup is not null and p_backup = p_primary then
    raise exception 'Primary and backup must be different people' using errcode = 'EK422';
  end if;
  if not private.is_active_staff(p_primary) or (p_backup is not null and not private.is_active_staff(p_backup)) then
    raise exception 'Operators must be active staff with an operator role' using errcode = 'EK422';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role)), '[]'::jsonb) into v_before
  from public.operator_assignments where match_id = p_match_id and active;

  update public.operator_assignments set active = false, revoked_at = now()
  where match_id = p_match_id and active and user_id not in (p_primary, coalesce(p_backup, p_primary));
  -- Demote first so the one-active-primary index never sees two primaries.
  update public.operator_assignments set role = 'BACKUP'
  where match_id = p_match_id and active and role = 'PRIMARY' and user_id <> p_primary;

  insert into public.operator_assignments (match_id, user_id, role, active, assigned_by)
  values (p_match_id, p_primary, 'PRIMARY', true, auth.uid())
  on conflict (match_id, user_id) do update set role = 'PRIMARY', active = true, revoked_at = null, assigned_by = auth.uid(), assigned_at = now();
  if p_backup is not null then
    insert into public.operator_assignments (match_id, user_id, role, active, assigned_by)
    values (p_match_id, p_backup, 'BACKUP', true, auth.uid())
    on conflict (match_id, user_id) do update set role = 'BACKUP', active = true, revoked_at = null, assigned_by = auth.uid(), assigned_at = now();
  end if;

  perform private.audit('OPERATORS_ASSIGNED', 'match', p_match_id, p_match_id, null, v_before,
    (select jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role)) from public.operator_assignments where match_id = p_match_id and active));
end $$;

create or replace function public.admin_clear_assignments(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role)), '[]'::jsonb) into v_before
  from public.operator_assignments where match_id = p_match_id and active;
  update public.operator_assignments set active = false, revoked_at = now() where match_id = p_match_id and active;
  perform private.audit('OPERATORS_CLEARED', 'match', p_match_id, p_match_id, null, v_before, '[]'::jsonb);
end $$;

-- ── 4c. Corrections (through events, never score fields) ───────────────────
create or replace function private.after_correction(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  perform private.recompute_score(p_match_id);
  perform private.bump_seq(p_match_id);
  select * into m from public.matches where id = p_match_id;
  if m.status = 'FT' then
    perform private.recompute_standings(m.competition_id);
  end if;
end $$;

create or replace function public.admin_void_event(p_match_id uuid, p_event_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; e public.match_events;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A correction reason is required' using errcode = 'EK422';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  select * into e from public.match_events where id = p_event_id and match_id = p_match_id for update;
  if not found then
    raise exception 'Event not found in this match' using errcode = 'EK404';
  end if;
  if e.voided_at is not null then
    raise exception 'This event has already been voided' using errcode = 'EK409';
  end if;
  update public.match_events set voided_at = now(), voided_by = auth.uid(), void_reason = 'Admin correction: ' || btrim(p_reason)
  where id = p_event_id;
  perform private.after_correction(p_match_id);
  perform private.audit('ADMIN_EVENT_VOIDED', 'match_event', p_event_id, p_match_id, null, to_jsonb(e),
    (select to_jsonb(x) from public.match_events x where x.id = p_event_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'ADMIN_EVENT_VOIDED');
  return private.canonical_state(p_match_id);
end $$;

-- Add a missing event after the fact (live, FT or abandoned matches).
create or replace function public.admin_add_event(
  p_match_id uuid, p_event_id uuid, p_type text, p_team_id uuid, p_period integer,
  p_minute integer, p_minute_extra integer, p_player_id uuid, p_related_player_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.matches; et public.event_types; v_seq bigint; v_lo int; v_hi int;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A correction reason is required' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.match_events where id = p_event_id) then
    if not exists (select 1 from public.match_events where id = p_event_id and match_id = p_match_id) then
      raise exception 'Event id already used on another match' using errcode = 'EK422';
    end if;
    return private.canonical_state(p_match_id, true);
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if m.status not in ('1H', 'HT', '2H', 'FT', 'ABANDONED') then
    raise exception 'Events can only be added to started matches' using errcode = 'EK409';
  end if;
  select * into et from public.event_types where code = p_type;
  if not found then
    raise exception 'Unknown event type %', p_type using errcode = 'EK422';
  end if;
  if p_team_id is null or p_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Team is not playing in this match' using errcode = 'EK422';
  end if;
  if p_period is null or p_period < 1 or p_period > coalesce(m.current_period, 0) then
    raise exception 'Period % has not been played', p_period using errcode = 'EK422';
  end if;
  v_lo := case p_period when 1 then 0 else 45 end;
  v_hi := case p_period when 1 then 45 else 90 end;
  if p_minute is null or p_minute < v_lo or p_minute > v_hi
     or coalesce(p_minute_extra, 0) < 0 or coalesce(p_minute_extra, 0) > 60
     or (coalesce(p_minute_extra, 0) > 0 and p_minute <> v_hi) then
    raise exception 'Minute %+% is not valid for period %', p_minute, coalesce(p_minute_extra, 0), p_period using errcode = 'EK422';
  end if;
  if et.requires_player and p_player_id is null then
    raise exception '% requires a player', et.name using errcode = 'EK422';
  end if;
  if et.requires_related_player and p_related_player_id is null then
    raise exception '% requires the player coming on', et.name using errcode = 'EK422';
  end if;
  if not et.requires_related_player and p_related_player_id is not null then
    raise exception '% does not take a second player', et.name using errcode = 'EK422';
  end if;
  if p_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_player_id) is null then
    raise exception 'Player is not in this team''s squad' using errcode = 'EK422';
  end if;
  if p_related_player_id is not null and private.shirt_for(p_match_id, p_team_id, p_related_player_id) is null then
    raise exception 'Player coming on is not in this team''s squad' using errcode = 'EK422';
  end if;

  v_seq := private.bump_seq(p_match_id);
  insert into public.match_events (
    id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
    payload, recorded_by
  ) values (
    p_event_id, p_match_id, v_seq, p_type, p_period, p_minute, coalesce(p_minute_extra, 0), p_team_id,
    p_player_id, p_related_player_id, jsonb_build_object('admin_correction', btrim(p_reason)), auth.uid()
  );
  perform private.after_correction(p_match_id);
  perform private.audit('ADMIN_EVENT_ADDED', 'match_event', p_event_id, p_match_id, null, null,
    (select to_jsonb(x) from public.match_events x where x.id = p_event_id) || jsonb_build_object('detail', btrim(p_reason)));
  perform private.after_match_change(p_match_id, 'ADMIN_EVENT_ADDED');
  return private.canonical_state(p_match_id);
end $$;

-- ── 4d. Staff: roles and activation ────────────────────────────────────────
create or replace function public.admin_grant_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  perform private.require_admin();
  select id into v_role from public.roles where code = p_role;
  if v_role is null then
    raise exception 'Unknown role %', p_role using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'EK404';
  end if;
  insert into public.user_roles (user_id, role_id, granted_by) values (p_user_id, v_role, auth.uid())
  on conflict (user_id, role_id) do nothing;
  if found then
    perform private.audit('ROLE_GRANTED', 'profile', p_user_id, null, null, null, jsonb_build_object('role', p_role));
  end if;
end $$;

create or replace function public.admin_revoke_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_role = 'ADMIN' and p_user_id = auth.uid() then
    raise exception 'You cannot remove your own administrator role' using errcode = 'EK409';
  end if;
  delete from public.user_roles ur using public.roles r
  where r.id = ur.role_id and ur.user_id = p_user_id and r.code = p_role;
  if found then
    perform private.audit('ROLE_REVOKED', 'profile', p_user_id, null, null, jsonb_build_object('role', p_role), null);
  end if;
end $$;

create or replace function public.admin_set_staff_active(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before timestamptz;
begin
  perform private.require_admin();
  if p_user_id = auth.uid() and not p_active then
    raise exception 'You cannot deactivate your own account' using errcode = 'EK409';
  end if;
  select deactivated_at into v_before from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'EK404';
  end if;
  update public.profiles set deactivated_at = case when p_active then null else coalesce(deactivated_at, now()) end
  where id = p_user_id;
  if not p_active then
    -- A deactivated operator must not stay in control of a live match.
    update public.matches set active_operator_id = null where active_operator_id = p_user_id;
  end if;
  perform private.audit(case when p_active then 'STAFF_REACTIVATED' else 'STAFF_DEACTIVATED' end,
    'profile', p_user_id, null, null, jsonb_build_object('deactivated_at', v_before),
    jsonb_build_object('deactivated_at', (select deactivated_at from public.profiles where id = p_user_id)));
end $$;

create or replace function public.admin_list_staff()
returns table (
  user_id uuid, email text, display_name text, roles text[], deactivated_at timestamptz,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, active_assignments bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select p.id, u.email::text, p.display_name,
    coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}'),
    p.deactivated_at, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
    (select count(*) from public.operator_assignments a where a.user_id = p.id and a.active)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles ur on ur.user_id = p.id
  left join public.roles r on r.id = ur.role_id
  group by p.id, u.id
  order by p.display_name;
end $$;

-- ── 4e. Read models for monitoring/inspection ──────────────────────────────
create or replace function public.admin_match_detail(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  return jsonb_build_object(
    'state', private.canonical_state(p_match_id),
    'match', (select to_jsonb(m) || jsonb_build_object(
        'active_operator_name', (select display_name from public.profiles where id = m.active_operator_id))
      from public.matches m where m.id = p_match_id),
    'periods', coalesce((select jsonb_agg(to_jsonb(p) order by p.period) from public.match_periods p where p.match_id = p_match_id), '[]'::jsonb),
    'recorders', coalesce((select jsonb_object_agg(e.id, pr.display_name)
      from public.match_events e join public.profiles pr on pr.id = e.recorded_by where e.match_id = p_match_id), '{}'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', a.user_id, 'role', a.role, 'active', a.active, 'assigned_at', a.assigned_at,
        'revoked_at', a.revoked_at, 'prep_completed_at', a.prep_completed_at,
        'display_name', pr.display_name, 'email', u.email) order by a.active desc, a.role)
      from public.operator_assignments a join public.profiles pr on pr.id = a.user_id join auth.users u on u.id = a.user_id
      where a.match_id = p_match_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'at', a.created_at, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
        'actor', pr.display_name, 'before', a.before_state, 'after', a.after_state) order by a.created_at desc)
      from public.audit_log a left join public.profiles pr on pr.id = a.actor_id
      where a.match_id = p_match_id), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_live_matches()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'match', private.match_snapshot(m.id),
      'scheduled_at', m.scheduled_at,
      'round_label', m.round_label,
      'competition', c.short_name,
      'home', ht.short_name, 'home_code', ht.code, 'away', at.short_name, 'away_code', at.code,
      'venue', v.short_name,
      'operator', (select display_name from public.profiles where id = m.active_operator_id),
      'last_event', (select jsonb_build_object('type', e.type, 'minute', e.minute, 'minute_extra', e.minute_extra,
                       'recorded_at', e.recorded_at, 'voided', e.voided_at is not null)
                     from public.match_events e where e.match_id = m.id order by e.seq desc limit 1),
      'last_activity_at', (select max(a.created_at) from public.audit_log a where a.match_id = m.id)
    ) order by m.scheduled_at)
    from public.matches m
    join public.competitions c on c.id = m.competition_id
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
    left join public.venues v on v.id = m.venue_id
    where m.status in ('1H', 'HT', '2H')
  ), '[]'::jsonb);
end $$;

-- ── 5. Privilege hygiene (new functions default to EXECUTE for PUBLIC) ─────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.server_time() to anon, authenticated;
grant execute on function
  public.start_match(uuid, uuid),
  public.end_period(uuid, uuid),
  public.start_period(uuid, uuid),
  public.pause_match(uuid, uuid, text),
  public.resume_match(uuid, uuid),
  public.set_stoppage(uuid, uuid, integer),
  public.record_event(uuid, uuid, text, uuid, integer, integer, uuid, uuid, timestamptz, boolean, jsonb),
  public.void_event(uuid, uuid, uuid, text),
  public.finalise_match(uuid, uuid, integer, integer),
  public.take_over_match(uuid, uuid),
  public.operator_match_state(uuid),
  public.update_assignment_prep(uuid, jsonb),
  public.admin_recompute_standings(uuid),
  public.admin_set_current_season(uuid),
  public.admin_create_match(uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz),
  public.admin_update_fixture(uuid, uuid, uuid, text, uuid, uuid, uuid, timestamptz),
  public.admin_set_match_outcome(uuid, public.match_status, text),
  public.admin_reschedule_match(uuid, timestamptz, text),
  public.admin_assign_operators(uuid, uuid, uuid),
  public.admin_clear_assignments(uuid),
  public.admin_void_event(uuid, uuid, text),
  public.admin_add_event(uuid, uuid, text, uuid, integer, integer, integer, uuid, uuid, text),
  public.admin_grant_role(uuid, text),
  public.admin_revoke_role(uuid, text),
  public.admin_set_staff_active(uuid, boolean),
  public.admin_list_staff(),
  public.admin_match_detail(uuid),
  public.admin_live_matches()
to authenticated;
