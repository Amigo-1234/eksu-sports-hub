-- Row Level Security and table privileges.
--
-- Principles
--   * RLS is enabled on every table.
--   * anon/authenticated never get INSERT/UPDATE/DELETE on match state,
--     standings or audit: those change only through SECURITY DEFINER RPCs.
--   * Public sports data is readable by everyone; operational data is not.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','user_roles','sports','seasons','faculties','departments','venues',
    'competitions','competition_stages','competition_groups','competition_entries','teams',
    'players','squads','squad_players','matches','match_periods','event_types','match_events',
    'operator_assignments','match_intents','standings','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- Start from nothing; grant back only what each role needs.
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Public sports data: read-only for everyone ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'sports','seasons','faculties','departments','venues','competitions','competition_stages',
    'competition_groups','competition_entries','teams','event_types','match_periods','standings'
  ] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy "%s are public" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- Matches and events are public, but operational columns are not: column
-- grants hide who operates/records from anonymous and ordinary users.
grant select (
  id, competition_id, stage_id, group_id, round_label, home_team_id, away_team_id, venue_id,
  scheduled_at, status, status_note, home_score, away_score, seq, current_period,
  period_started_at, period_ended_at, period_offset_seconds, clock_running, paused_at,
  accumulated_pause_seconds, stoppage_seconds, started_at, finished_at, created_at, updated_at
) on public.matches to anon, authenticated;
create policy "matches are public" on public.matches for select to anon, authenticated using (true);

grant select (
  id, match_id, seq, type, period, minute, minute_extra, team_id, player_id, related_player_id,
  payload, recorded_at, voided_at, void_reason
) on public.match_events to anon, authenticated;
create policy "match events are public" on public.match_events for select to anon, authenticated using (true);

-- ── Squads: staff only (no public player data in this phase) ───────────────
grant select on public.players, public.squads, public.squad_players to authenticated;
create policy "staff read players" on public.players for select to authenticated using (private.is_staff());
create policy "staff read squads" on public.squads for select to authenticated using (private.is_staff());
create policy "staff read squad players" on public.squad_players for select to authenticated using (private.is_staff());

-- ── Identity ───────────────────────────────────────────────────────────────
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "read own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or private.has_role('ADMIN'));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.roles to authenticated;
create policy "roles readable by signed-in users" on public.roles for select to authenticated using (true);

grant select on public.user_roles to authenticated;
create policy "read own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or private.has_role('ADMIN'));

-- ── Operational ────────────────────────────────────────────────────────────
grant select on public.operator_assignments to authenticated;
create policy "read own assignments; admins/managers read all" on public.operator_assignments
  for select to authenticated
  using ((user_id = auth.uid() and active) or private.has_role('ADMIN') or private.has_role('MANAGER'));

-- Audit: admins may read; nobody may write directly (RPCs insert as owner).
grant select on public.audit_log to authenticated;
create policy "admins read audit" on public.audit_log for select to authenticated using (private.has_role('ADMIN'));

-- match_intents: internal ledger, no client access at all (RLS on, no policy).
