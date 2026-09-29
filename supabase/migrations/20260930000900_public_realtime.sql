-- Public data + realtime (additive).
--
--   1. Public read surface: draft competitions (and everything under them) are
--      invisible to the public; internal correction notes are not public.
--   2. Public RPCs returning exactly what the public app renders: canonical
--      match state + events (with shirt numbers), and the live-score board.
--   3. Realtime: every authoritative match change broadcasts a small hint on
--      private channels `match:{id}` and `scores:live`. Clients may only
--      listen (no insert policy), and always refetch canonical state.

-- ── 1. Public read surface ─────────────────────────────────────────────────
-- Admin correction notes / operator payloads are internal.
revoke select (payload, void_reason) on public.match_events from anon;

drop policy if exists "competitions are public" on public.competitions;
create policy "published competitions are public" on public.competitions
  for select to anon, authenticated
  using (status <> 'DRAFT' or private.is_staff());

-- Children follow their competition (RLS on competitions applies inside the
-- subqueries, so anon only "sees" rows of published competitions).
drop policy if exists "matches are public" on public.matches;
create policy "matches of published competitions are public" on public.matches
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = matches.competition_id));

drop policy if exists "match events are public" on public.match_events;
create policy "events of visible matches are public" on public.match_events
  for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_events.match_id));

drop policy if exists "match_periods are public" on public.match_periods;
create policy "periods of visible matches are public" on public.match_periods
  for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_periods.match_id));

drop policy if exists "standings are public" on public.standings;
create policy "standings of published competitions are public" on public.standings
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = standings.competition_id));

drop policy if exists "competition_entries are public" on public.competition_entries;
create policy "entries of published competitions are public" on public.competition_entries
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_entries.competition_id));

drop policy if exists "competition_stages are public" on public.competition_stages;
create policy "stages of published competitions are public" on public.competition_stages
  for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_stages.competition_id));

-- ── 2. Public RPCs ─────────────────────────────────────────────────────────
create or replace function private.public_match_row(m public.matches)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'status', m.status, 'seq', m.seq,
    'home_score', m.home_score, 'away_score', m.away_score,
    'scheduled_at', m.scheduled_at, 'status_note', m.status_note,
    'started_at', m.started_at, 'finished_at', m.finished_at,
    'current_period', m.current_period,
    'period_started_at', m.period_started_at, 'period_ended_at', m.period_ended_at,
    'period_offset_seconds', m.period_offset_seconds, 'clock_running', m.clock_running,
    'paused_at', m.paused_at, 'accumulated_pause_seconds', m.accumulated_pause_seconds,
    'stoppage_seconds', m.stoppage_seconds
  );
$$;

create or replace function private.public_event(e public.match_events)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'seq', e.seq, 'type', e.type, 'period', e.period,
    'minute', e.minute, 'minute_extra', e.minute_extra, 'team_id', e.team_id,
    'shirt_number', private.shirt_for(e.match_id, e.team_id, e.player_id),
    'related_shirt_number', private.shirt_for(e.match_id, e.team_id, e.related_player_id),
    'player_name', (select p.display_name from public.players p where p.id = e.player_id),
    'related_player_name', (select p.display_name from public.players p where p.id = e.related_player_id),
    'voided', e.voided_at is not null
  );
$$;

create or replace function private.match_is_public(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m join public.competitions c on c.id = m.competition_id
    where m.id = p_match_id and c.status <> 'DRAFT'
  );
$$;

/*
 * Canonical public state of one match. `p_after_seq` returns only events
 * recorded after the caller's last known seq (gap recovery); `voided_ids`
 * always lists every voided event so clients reconcile voids of old events.
 */
create or replace function public.public_match_feed(p_match_id uuid, p_after_seq bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches;
begin
  if not private.match_is_public(p_match_id) then
    return null;
  end if;
  select * into m from public.matches where id = p_match_id;
  return jsonb_build_object(
    'match', private.public_match_row(m),
    'events', coalesce((
      select jsonb_agg(private.public_event(e) order by e.seq)
      from public.match_events e where e.match_id = p_match_id and e.seq > coalesce(p_after_seq, 0)
    ), '[]'::jsonb),
    'voided_ids', coalesce((
      select jsonb_agg(e.id order by e.seq)
      from public.match_events e where e.match_id = p_match_id and e.voided_at is not null
    ), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end $$;

/* Everything currently in play, for live score cards (home + /live). */
create or replace function public.public_live_scores()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_time', clock_timestamp(),
    'matches', coalesce((
      select jsonb_agg(private.public_match_row(m) || jsonb_build_object(
        'last_event', (
          select private.public_event(e) from public.match_events e
          where e.match_id = m.id and e.voided_at is null order by e.seq desc limit 1)
      ) order by m.scheduled_at)
      from public.matches m join public.competitions c on c.id = m.competition_id
      where m.status in ('1H', 'HT', '2H') and c.status <> 'DRAFT'
    ), '[]'::jsonb)
  );
$$;

-- ── 3. Realtime hints from authoritative writes ─────────────────────────────
create or replace function private.after_match_change(p_match_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_hint jsonb;
begin
  select * into m from public.matches where id = p_match_id;
  v_hint := jsonb_build_object(
    'match_id', m.id, 'seq', m.seq, 'kind', p_kind, 'status', m.status,
    'home_score', m.home_score, 'away_score', m.away_score
  );
  perform pg_notify('match_changes', v_hint::text);
  -- Draft competitions stay private; the hint is delivered after commit.
  if private.match_is_public(p_match_id) then
    begin
      perform realtime.send(v_hint, 'match_changed', 'match:' || m.id::text, true);
      perform realtime.send(v_hint, 'match_changed', 'scores:live', true);
    exception when others then
      -- Realtime is a hint; it must never block or roll back a match write.
      raise warning 'realtime hint not sent for match %: %', p_match_id, sqlerrm;
    end;
  end if;
end $$;

-- Listen-only access to the public score channels (no insert policy: clients
-- cannot publish fake hints on these private channels).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "public score channels are listen-only" on realtime.messages';
    execute $p$create policy "public score channels are listen-only" on realtime.messages
      for select to anon, authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (realtime.topic() = 'scores:live' or realtime.topic() ~ '^match:[0-9a-f-]{36}$')
      )$p$;
  end if;
end $$;

-- ── 4. Privilege hygiene (see 20260928000700) ──────────────────────────────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
revoke execute on function public.public_match_feed(uuid, bigint), public.public_live_scores() from public;
grant execute on function public.public_match_feed(uuid, bigint), public.public_live_scores() to anon, authenticated;
