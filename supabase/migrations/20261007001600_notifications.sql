-- Notifications v1: anonymous Web Push alerts for followed matches and teams.
--
-- No accounts. A device is an opaque, server-generated install token (kept by
-- the browser in an httpOnly cookie; only its SHA-256 hash is stored here).
-- A device follows matches and/or teams and chooses event types; the server
-- decides every word of every notification from canonical match data.
--
--   match write (any sanctioned RPC)
--     → deferred constraint trigger, same transaction, at COMMIT
--     → notification_outbox row (unique event_key: one intent per event)
--     → dispatcher (Next.js route, service_role) claims work:
--         fan-out to devices (match follow overrides team follows; one
--         delivery per device per outbox row), then pending deliveries
--     → Web Push → report SENT / RETRY / GONE (subscription invalidated)
--
-- Push is supplementary: trigger bodies never raise (a notification problem
-- can never roll back or block a match write), and Realtime / match
-- operation are independent of it.
--
-- Tables have FORCE RLS and NO client grants. Browsers reach them only
-- through the Next.js server, which calls the service_* functions below
-- (service_role only).

-- ── 0. Vocabulary ──────────────────────────────────────────────────────────
-- Preference keys a device can choose (STATUS = postponed / cancelled /
-- abandoned; SCORE_CORRECTION follows the GOAL preference).
create or replace function private.notification_pref_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array['REMINDER', 'KICKOFF', 'GOAL', 'YELLOW_CARD', 'RED_CARD', 'HALF_TIME', 'SECOND_HALF', 'FULL_TIME', 'STATUS'];
$$;

create or replace function private.notification_pref_for(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case p_type
    when 'MATCH_REMINDER' then 'REMINDER'
    when 'POSTPONED' then 'STATUS' when 'CANCELLED' then 'STATUS' when 'ABANDONED' then 'STATUS'
    when 'SCORE_CORRECTION' then 'GOAL'
    else p_type end;
$$;

create or replace function private.valid_pref_events(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and cardinality(p) <= 9 and p <@ private.notification_pref_keys();
$$;

-- ── 1. Devices, subscriptions, preferences ─────────────────────────────────
create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  platform text not null default 'other' check (platform in ('ios', 'android', 'desktop', 'other')),
  standalone boolean not null default false,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://[^\s]+$' and char_length(endpoint) <= 1024),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalid_reason text
);
-- One live subscription per device, and an endpoint belongs to one device.
create unique index push_subscriptions_one_active on public.push_subscriptions (device_id) where invalidated_at is null;
create unique index push_subscriptions_endpoint_active on public.push_subscriptions (endpoint) where invalidated_at is null;
create trigger push_subscriptions_touch before update on public.push_subscriptions
  for each row execute function private.touch_updated_at();

create table public.match_notification_preferences (
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  -- false = muted: overrides any team follow for this match.
  enabled boolean not null default true,
  events text[] not null check (private.valid_pref_events(events)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, match_id)
);
create index match_notification_preferences_match_idx on public.match_notification_preferences (match_id);
create trigger match_notification_preferences_touch before update on public.match_notification_preferences
  for each row execute function private.touch_updated_at();

create table public.team_notification_preferences (
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  enabled boolean not null default true,
  events text[] not null check (private.valid_pref_events(events)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, team_id)
);
create index team_notification_preferences_team_idx on public.team_notification_preferences (team_id);
create trigger team_notification_preferences_touch before update on public.team_notification_preferences
  for each row execute function private.touch_updated_at();

-- ── 2. Outbox and deliveries ───────────────────────────────────────────────
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  -- One intent per real-world event: retries, replays and repeated hints
  -- can never enqueue the same notification twice.
  event_key text not null unique,
  match_id uuid not null references public.matches (id) on delete cascade,
  notification_type text not null check (notification_type in ('MATCH_REMINDER', 'KICKOFF', 'GOAL', 'YELLOW_CARD', 'RED_CARD',
    'HALF_TIME', 'SECOND_HALF', 'FULL_TIME', 'POSTPONED', 'CANCELLED', 'ABANDONED', 'SCORE_CORRECTION')),
  source_event_id uuid references public.match_events (id) on delete cascade,
  -- SCORE_CORRECTION: only devices that actually received this goal.
  corrects_outbox_id uuid references public.notification_outbox (id) on delete cascade,
  payload jsonb not null,
  -- REMINDER: the kick-off time it was computed for (stale if it changes).
  scheduled_for timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING', 'FANNED_OUT', 'CANCELLED', 'EXPIRED')),
  recipients integer,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where status = 'PENDING';
create index notification_outbox_match_idx on public.notification_outbox (match_id);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'GONE', 'CANCELLED', 'SKIPPED')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_status_code integer,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- One event → at most one notification per device.
  unique (outbox_id, device_id)
);
create index notification_deliveries_due_idx on public.notification_deliveries (next_attempt_at) where status in ('PENDING', 'SENDING');
create index notification_deliveries_device_idx on public.notification_deliveries (device_id);

-- Dispatcher location for the optional immediate kick (pg_net). The bearer
-- secret lives in Supabase Vault as 'notifications_dispatch_secret'.
create table private.notification_config (
  id boolean primary key default true check (id),
  dispatch_url text check (dispatch_url is null or dispatch_url ~ '^https?://')
);
insert into private.notification_config (id) values (true);

-- ── 3. Notification content (server-side only, from canonical data) ────────
create or replace function private.notification_minute(e public.match_events)
returns text language sql immutable set search_path = '' as $$
  select e.minute::text || case when e.minute_extra > 0 then '+' || e.minute_extra::text else '' end || '''';
$$;

/*
 * Score from the non-voided scoring events up to (and including) p_upto_seq
 * (null: all) — exact for the moment of the event, however late the
 * notification is built, and independent of when the cached score updates.
 */
create or replace function private.notification_score(p_match_id uuid, p_upto_seq bigint)
returns integer[] language sql stable security definer set search_path = '' as $$
  select array[
    count(*) filter (where (et.scores_for = 'SELF' and e.team_id = m.home_team_id) or (et.scores_for = 'OPPONENT' and e.team_id = m.away_team_id))::int,
    count(*) filter (where (et.scores_for = 'SELF' and e.team_id = m.away_team_id) or (et.scores_for = 'OPPONENT' and e.team_id = m.home_team_id))::int]
  from public.matches m
  left join public.match_events e on e.match_id = m.id and e.voided_at is null and (p_upto_seq is null or e.seq <= p_upto_seq)
  left join public.event_types et on et.code = e.type
  where m.id = p_match_id
  group by m.id;
$$;

/* Title/body/url/tag for one notification. Names only (never identities); a missing player is simply omitted. */
create or replace function private.notification_content(p_match_id uuid, p_type text, p_event_id uuid, p_tag text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.matches; e public.match_events; home text; away text; comp text; venue text; prefix text := '';
  score text; who text; team text; title text; body text; mins int; sc integer[];
begin
  select * into m from public.matches where id = p_match_id;
  select name into home from public.teams where id = m.home_team_id;
  select name into away from public.teams where id = m.away_team_id;
  select short_name into comp from public.competitions where id = m.competition_id;
  select name into venue from public.venues where id = m.venue_id;
  if m.is_demo then
    prefix := case when coalesce(m.round_label, '') ~* 'test' then 'TEST · ' else 'DEMO · ' end;
  end if;
  if p_event_id is not null then
    select * into e from public.match_events where id = p_event_id;
  end if;
  -- A goal: the score at that goal. Anything else (incl. a correction): the score now.
  sc := private.notification_score(m.id, case when p_type = 'GOAL' then e.seq end);
  score := format('%s %s–%s %s', home, sc[1], sc[2], away);
  if p_event_id is not null then
    select name into team from public.teams where id = e.team_id;
    who := nullif(btrim(coalesce((select display_name from public.players where id = e.player_id),
      (select display_name from public.demo_lineup_players where id = e.demo_player_id), '')), '');
  end if;

  case p_type
    when 'GOAL' then
      title := case e.type when 'OWN_GOAL' then 'OWN GOAL ⚽' when 'PENALTY_GOAL' then 'PENALTY GOAL ⚽' else 'GOAL ⚽' end;
      body := score || E'\n' || private.notification_minute(e) || coalesce(' · ' || who || case when e.type = 'OWN_GOAL' then ' (own goal)' else '' end, '');
    when 'YELLOW_CARD' then
      title := 'YELLOW CARD 🟨';
      body := team || E'\n' || coalesce(who || ' · ', '') || private.notification_minute(e);
    when 'RED_CARD' then
      title := case e.type when 'SECOND_YELLOW' then 'SECOND YELLOW 🟥' else 'RED CARD 🟥' end;
      body := team || E'\n' || coalesce(who || ' sent off · ', 'Player sent off · ') || private.notification_minute(e);
    when 'KICKOFF' then
      title := 'KICK-OFF';
      body := format('%s vs %s is under way', home, away);
    when 'HALF_TIME' then
      title := 'HALF-TIME';
      body := score;
    when 'SECOND_HALF' then
      title := 'SECOND HALF';
      body := score || E'\nThe second half is under way';
    when 'FULL_TIME' then
      title := 'FULL-TIME';
      body := score || coalesce(E'\nFull-time at ' || venue, '');
    when 'POSTPONED' then
      title := 'POSTPONED';
      body := format('%s vs %s has been postponed', home, away);
    when 'CANCELLED' then
      title := 'CANCELLED';
      body := format('%s vs %s has been cancelled', home, away);
    when 'ABANDONED' then
      title := 'ABANDONED';
      body := score || E'\nThe match has been abandoned';
    when 'MATCH_REMINDER' then
      mins := greatest(1, round(extract(epoch from (m.scheduled_at - now())) / 60)::int);
      title := upper(comp);
      body := format('%s vs %s starts in %s minute%s · %s', home, away, mins, case when mins = 1 then '' else 's' end,
        to_char(m.scheduled_at at time zone 'Africa/Lagos', 'HH24:MI'));
    when 'SCORE_CORRECTION' then
      title := 'SCORE CORRECTION';
      body := score || E'\nThe previous goal has been removed';
  end case;
  return jsonb_build_object('title', prefix || title, 'body', body, 'url', '/matches/' || m.id, 'tag', p_tag,
    'match_id', m.id, 'type', p_type);
end $$;

/* Insert one intent (idempotent on event_key). Never raises: push must not block match writes. */
create or replace function private.notification_enqueue(
  p_key text, p_match_id uuid, p_type text, p_event_id uuid default null, p_corrects uuid default null, p_scheduled_for timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tag text;
begin
  if not private.match_is_public(p_match_id) then
    return null;
  end if;
  v_tag := coalesce((select payload ->> 'tag' from public.notification_outbox where id = p_corrects), p_key);
  insert into public.notification_outbox (event_key, match_id, notification_type, source_event_id, corrects_outbox_id, payload, scheduled_for)
  values (p_key, p_match_id, p_type, p_event_id, p_corrects, private.notification_content(p_match_id, p_type, p_event_id, v_tag), p_scheduled_for)
  on conflict (event_key) do nothing
  returning id into v_id;
  return v_id;
exception when others then
  raise warning 'notification not enqueued (%): %', p_key, sqlerrm;
  return null;
end $$;

-- ── 4. Transactional outbox triggers (fire at COMMIT, never raise) ─────────
create or replace function private.notify_on_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.match_events; m public.matches; v_type text; v_goal public.notification_outbox;
begin
  begin
    select * into e from public.match_events where id = new.id;
    select * into m from public.matches where id = new.match_id;
    if e.id is null or m.id is null then
      return null;
    end if;
    v_type := case when e.type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL') then 'GOAL'
      when e.type = 'YELLOW_CARD' then 'YELLOW_CARD'
      when e.type in ('RED_CARD', 'SECOND_YELLOW') then 'RED_CARD' end;   -- substitutions / missed penalties: no push
    if v_type is null then
      return null;
    end if;

    if tg_op = 'INSERT' then
      -- Live events only: retroactive admin corrections after full-time do not alert anyone.
      if e.voided_at is null and m.status in ('1H', 'HT', '2H') then
        perform private.notification_enqueue('EVT:' || e.id, m.id, v_type, e.id);
      end if;
    elsif old.voided_at is null and new.voided_at is not null then
      select * into v_goal from public.notification_outbox where event_key = 'EVT:' || e.id;
      if v_goal.id is not null then
        -- Not delivered yet: simply never send it.
        update public.notification_outbox set status = 'CANCELLED', processed_at = now() where id = v_goal.id and status = 'PENDING';
        update public.notification_deliveries set status = 'CANCELLED' where outbox_id = v_goal.id and status in ('PENDING', 'SENDING');
        -- A goal some devices already saw: tell exactly those devices the score changed back.
        if v_type = 'GOAL' and exists (select 1 from public.notification_deliveries where outbox_id = v_goal.id and status = 'SENT') then
          perform private.notification_enqueue('VOID:' || e.id, m.id, 'SCORE_CORRECTION', e.id, v_goal.id);
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'notify_on_event failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

create constraint trigger match_events_notify_insert after insert on public.match_events
  deferrable initially deferred for each row execute function private.notify_on_event();
create constraint trigger match_events_notify_void after update of voided_at on public.match_events
  deferrable initially deferred for each row execute function private.notify_on_event();

create or replace function private.notify_on_match_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.status is distinct from old.status then
      if old.status = 'SCHEDULED' and new.status = '1H' then
        perform private.notification_enqueue('KO:' || new.id, new.id, 'KICKOFF');
      elsif new.status = 'HT' and old.status = '1H' then
        perform private.notification_enqueue('HT:' || new.id, new.id, 'HALF_TIME');
      elsif new.status = '2H' and old.status = 'HT' then
        perform private.notification_enqueue('2H:' || new.id, new.id, 'SECOND_HALF');
      elsif new.status = 'FT' then
        perform private.notification_enqueue('FT:' || new.id, new.id, 'FULL_TIME');
      elsif new.status in ('POSTPONED', 'CANCELLED', 'ABANDONED') then
        perform private.notification_enqueue(format('ST:%s:%s:%s', new.status, new.id, floor(extract(epoch from now()))::bigint),
          new.id, new.status::text);
      end if;
      -- Not scheduled any more: a pending reminder must never go out.
      if new.status <> 'SCHEDULED' then
        perform private.cancel_reminders(new.id);
      end if;
    end if;
    -- Kick-off moved: reminders computed for the old time are stale.
    if new.scheduled_at is distinct from old.scheduled_at then
      perform private.cancel_reminders(new.id);
    end if;
  exception when others then
    raise warning 'notify_on_match_status failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

create or replace function private.cancel_reminders(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.notification_deliveries d set status = 'CANCELLED'
  from public.notification_outbox o
  where o.id = d.outbox_id and o.match_id = p_match_id and o.notification_type = 'MATCH_REMINDER' and d.status in ('PENDING', 'SENDING');
  update public.notification_outbox set status = 'CANCELLED', processed_at = now()
  where match_id = p_match_id and notification_type = 'MATCH_REMINDER' and status = 'PENDING';
$$;

create constraint trigger matches_notify_status after update of status, scheduled_at on public.matches
  deferrable initially deferred for each row execute function private.notify_on_match_status();

/* "Starting soon" intents for public SCHEDULED matches kicking off within p_lead (one per kick-off time). */
create or replace function private.enqueue_due_reminders(p_lead interval default interval '15 minutes')
returns integer language plpgsql security definer set search_path = '' as $$
declare m record; n int := 0;
begin
  for m in select id, scheduled_at from public.matches
    where status = 'SCHEDULED' and scheduled_at > now() and scheduled_at <= now() + p_lead
      and exists (select 1 from public.match_notification_preferences p where p.match_id = matches.id and p.enabled and 'REMINDER' = any(p.events)
                  union all
                  select 1 from public.team_notification_preferences t where t.team_id in (matches.home_team_id, matches.away_team_id)
                    and t.enabled and 'REMINDER' = any(t.events) and not matches.is_demo)
  loop
    if private.notification_enqueue(format('REM:%s:%s', m.id, floor(extract(epoch from m.scheduled_at))::bigint),
         m.id, 'MATCH_REMINDER', null, null, m.scheduled_at) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ── 5. Recipients (match follow overrides team follows; one row per device) ─
create or replace function private.notification_recipients(p_outbox_id uuid)
returns table (device_id uuid) language sql stable security definer set search_path = '' as $$
  with o as (select * from public.notification_outbox where id = p_outbox_id),
  m as (select mm.* from public.matches mm join o on o.match_id = mm.id)
  select d.id
  from public.notification_devices d
  cross join o cross join m
  left join public.match_notification_preferences mp on mp.device_id = d.id and mp.match_id = o.match_id
  where d.push_enabled
    and exists (select 1 from public.push_subscriptions s where s.device_id = d.id and s.invalidated_at is null)
    and case
      -- Correction: exactly the devices that received the goal (unless they muted the match since).
      when o.notification_type = 'SCORE_CORRECTION' then
        exists (select 1 from public.notification_deliveries x where x.outbox_id = o.corrects_outbox_id and x.device_id = d.id and x.status = 'SENT')
        and coalesce(mp.enabled, true)
      -- An explicit match preference decides alone (including "muted").
      when mp.device_id is not null then mp.enabled and private.notification_pref_for(o.notification_type) = any(mp.events)
      -- Demo / TEST matches only reach devices that follow that match.
      when m.is_demo then false
      else exists (select 1 from public.team_notification_preferences t
        where t.device_id = d.id and t.team_id in (m.home_team_id, m.away_team_id) and t.enabled
          and private.notification_pref_for(o.notification_type) = any(t.events))
    end;
$$;

-- ── 6. Dispatcher (service_role only) ──────────────────────────────────────
/*
 * One dispatcher pass: enqueue due reminders, fan out pending intents into
 * deliveries (idempotent), then lease up to p_limit due deliveries and return
 * what the server needs to send them. Stale work is retired, not sent:
 * intents older than 30 minutes expire; reminders whose match is no longer
 * scheduled / has kicked off / moved are cancelled.
 */
create or replace function public.service_notification_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.notification_outbox; v_n int; v_out jsonb;
begin
  perform private.enqueue_due_reminders();

  for o in select * from public.notification_outbox where status = 'PENDING' order by created_at limit 50 for update skip locked loop
    if o.created_at < now() - interval '30 minutes'
       or (o.notification_type = 'MATCH_REMINDER' and not exists (
             select 1 from public.matches m where m.id = o.match_id and m.status = 'SCHEDULED' and m.scheduled_at = o.scheduled_for and m.scheduled_at > now())) then
      update public.notification_outbox set status = case when o.notification_type = 'MATCH_REMINDER' then 'CANCELLED' else 'EXPIRED' end,
        processed_at = now() where id = o.id;
      continue;
    end if;
    insert into public.notification_deliveries (outbox_id, device_id)
    select o.id, r.device_id from private.notification_recipients(o.id) r
    on conflict (outbox_id, device_id) do nothing;
    get diagnostics v_n = row_count;
    update public.notification_outbox set status = 'FANNED_OUT', processed_at = now(), recipients = v_n where id = o.id;
  end loop;

  -- Retire deliveries that became stale while waiting (reminders after kick-off, old events).
  update public.notification_deliveries d set status = 'CANCELLED'
  from public.notification_outbox ob
  where ob.id = d.outbox_id and d.status in ('PENDING', 'SENDING')
    and (ob.status = 'CANCELLED' or ob.created_at < now() - interval '2 hours'
      or (ob.notification_type = 'MATCH_REMINDER' and not exists (
            select 1 from public.matches m where m.id = ob.match_id and m.status = 'SCHEDULED' and m.scheduled_at = ob.scheduled_for and m.scheduled_at > now())));

  with due as (
    select d.id from public.notification_deliveries d
    where (d.status = 'PENDING' or (d.status = 'SENDING' and d.locked_until < now()))
      and d.next_attempt_at <= now()
    order by d.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ), leased as (
    update public.notification_deliveries d set status = 'SENDING', attempts = d.attempts + 1, locked_until = now() + interval '2 minutes'
    from due where d.id = due.id
    returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'payload', ob.payload, 'ttl', case when ob.notification_type = 'MATCH_REMINDER' then 900 else 3600 end,
      'urgency', case when ob.notification_type in ('GOAL', 'RED_CARD', 'KICKOFF', 'FULL_TIME', 'SCORE_CORRECTION') then 'high' else 'normal' end)), '[]'::jsonb)
  into v_out
  from leased l
  join public.notification_outbox ob on ob.id = l.outbox_id
  join public.push_subscriptions s on s.device_id = l.device_id and s.invalidated_at is null;

  -- Leased deliveries whose device lost its subscription meanwhile.
  update public.notification_deliveries d set status = 'SKIPPED', locked_until = null
  where d.status = 'SENDING' and d.locked_until > now()
    and not exists (select 1 from public.push_subscriptions s where s.device_id = d.device_id and s.invalidated_at is null);

  -- Housekeeping (occasionally): delivery history is kept for 14 days.
  if random() < 0.05 then
    delete from public.notification_outbox where created_at < now() - interval '14 days';
  end if;
  return v_out;
end $$;

/*
 * Results from the sender: [{id, result: SENT|RETRY|GONE|FAILED, code?, error?}].
 * GONE (404/410): the subscription is dead → invalidated, never retried.
 * RETRY: exponential back-off (30s, 60s, 120s, …), at most 5 attempts.
 */
create or replace function public.service_notification_report(p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; d public.notification_deliveries; n_sent int := 0; n_retry int := 0; n_gone int := 0; n_failed int := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into d from public.notification_deliveries where id = (r ->> 'id')::uuid and status = 'SENDING' for update;
    if d.id is null then
      continue;
    end if;
    case r ->> 'result'
      when 'SENT' then
        update public.notification_deliveries set status = 'SENT', sent_at = now(), locked_until = null,
          last_status_code = nullif(r ->> 'code', '')::int, last_error = null where id = d.id;
        n_sent := n_sent + 1;
      when 'GONE' then
        update public.notification_deliveries set status = 'GONE', locked_until = null,
          last_status_code = nullif(r ->> 'code', '')::int, last_error = left(r ->> 'error', 200) where id = d.id;
        update public.push_subscriptions set invalidated_at = now(), invalid_reason = 'push service: ' || coalesce(r ->> 'code', 'gone')
        where device_id = d.device_id and invalidated_at is null;
        update public.notification_devices set push_enabled = false where id = d.device_id;
        n_gone := n_gone + 1;
      when 'RETRY' then
        if d.attempts >= 5 then
          update public.notification_deliveries set status = 'FAILED', locked_until = null,
            last_status_code = nullif(r ->> 'code', '')::int, last_error = left(r ->> 'error', 200) where id = d.id;
          n_failed := n_failed + 1;
        else
          update public.notification_deliveries set status = 'PENDING', locked_until = null,
            next_attempt_at = now() + make_interval(secs => 30 * power(2, d.attempts - 1)),
            last_status_code = nullif(r ->> 'code', '')::int, last_error = left(r ->> 'error', 200) where id = d.id;
          n_retry := n_retry + 1;
        end if;
      else
        update public.notification_deliveries set status = 'FAILED', locked_until = null,
          last_status_code = nullif(r ->> 'code', '')::int, last_error = left(r ->> 'error', 200) where id = d.id;
        n_failed := n_failed + 1;
    end case;
  end loop;
  return jsonb_build_object('sent', n_sent, 'retry', n_retry, 'gone', n_gone, 'failed', n_failed);
end $$;

-- Optional immediate kick: when pg_net is installed and a dispatcher URL +
-- Vault secret are configured, every new intent wakes the dispatcher right
-- after commit (pg_net sends after commit). Otherwise the per-minute cron
-- picks it up. Never raises.
create or replace function private.notification_kick()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select dispatch_url into v_url from private.notification_config;
  if v_url is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'notifications_dispatch_secret';
  if v_secret is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 5000)'
    using v_url, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret);
exception when others then
  raise warning 'notification kick failed: %', sqlerrm;
end $$;

create or replace function private.notification_outbox_kick()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notification_kick();
  return null;
end $$;
create trigger notification_outbox_kick after insert on public.notification_outbox
  for each statement execute function private.notification_outbox_kick();

-- ── 7. Device API (service_role only; the server passes the raw token) ─────
create or replace function private.notification_device(p_token text)
returns public.notification_devices language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then
    raise exception 'Unknown device' using errcode = 'EK401';
  end if;
  update public.notification_devices set last_seen_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning * into d;
  if d.id is null then
    raise exception 'Unknown device' using errcode = 'EK401';
  end if;
  return d;
end $$;

/* New anonymous device. Returns the raw token ONCE (the server stores it in an httpOnly cookie). */
create or replace function public.service_notify_register(p_platform text, p_standalone boolean, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  -- Per network, generous: campus Wi-Fi puts hundreds of phones behind one IP.
  if not private.rate_hit('notify-register', p_rate_key, 300, 600) then
    raise exception 'Too many requests. Please try again later.' using errcode = 'EK429';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.notification_devices (token_hash, platform, standalone)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'),
    case when p_platform in ('ios', 'android', 'desktop') then p_platform else 'other' end, coalesce(p_standalone, false));
  return jsonb_build_object('token', v_token);
end $$;

/* This device's follows and push state (with enough match/team context to render the manage page). */
create or replace function public.service_notify_state(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  return jsonb_build_object(
    'push_enabled', d.push_enabled and exists (select 1 from public.push_subscriptions s where s.device_id = d.id and s.invalidated_at is null),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('match_id', p.match_id, 'enabled', p.enabled, 'events', to_jsonb(p.events),
        'home', (select name from public.teams where id = m.home_team_id), 'away', (select name from public.teams where id = m.away_team_id),
        'competition', (select short_name from public.competitions where id = m.competition_id),
        'scheduled_at', m.scheduled_at, 'status', m.status) order by m.scheduled_at desc)
      from public.match_notification_preferences p join public.matches m on m.id = p.match_id
      where p.device_id = d.id and private.match_is_public(m.id)), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', p.team_id, 'enabled', p.enabled, 'events', to_jsonb(p.events),
        'name', t.name, 'short_name', t.short_name) order by t.name)
      from public.team_notification_preferences p join public.teams t on t.id = p.team_id
      where p.device_id = d.id), '[]'::jsonb));
end $$;

create or replace function private.notify_rate(d public.notification_devices, p_rate_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.rate_hit('notify-write', d.id::text, 120, 600) or not private.rate_hit('notify-write-ip', p_rate_key, 3000, 600) then
    raise exception 'Too many changes. Please wait a moment and try again.' using errcode = 'EK429';
  end if;
end $$;

create or replace function public.service_notify_set_match(p_token text, p_match_id uuid, p_enabled boolean, p_events text[], p_rate_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  if p_match_id is null or not private.match_is_public(p_match_id) then
    raise exception 'Match not found' using errcode = 'EK404';
  end if;
  if not private.valid_pref_events(coalesce(p_events, '{}')) then
    raise exception 'Unknown notification type' using errcode = 'EK422';
  end if;
  if (select count(*) from public.match_notification_preferences where device_id = d.id) >= 200
     and not exists (select 1 from public.match_notification_preferences where device_id = d.id and match_id = p_match_id) then
    raise exception 'You follow too many matches. Remove some first.' using errcode = 'EK409';
  end if;
  insert into public.match_notification_preferences (device_id, match_id, enabled, events)
  values (d.id, p_match_id, coalesce(p_enabled, true), (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_events) x))
  on conflict (device_id, match_id) do update set enabled = excluded.enabled, events = excluded.events;
end $$;

create or replace function public.service_notify_remove_match(p_token text, p_match_id uuid, p_rate_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  delete from public.match_notification_preferences where device_id = d.id and match_id = p_match_id;
end $$;

create or replace function public.service_notify_set_team(p_token text, p_team_id uuid, p_enabled boolean, p_events text[], p_rate_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  if p_team_id is null or not exists (select 1 from public.teams where id = p_team_id and active) then
    raise exception 'Team not found' using errcode = 'EK404';
  end if;
  if not private.valid_pref_events(coalesce(p_events, '{}')) then
    raise exception 'Unknown notification type' using errcode = 'EK422';
  end if;
  if (select count(*) from public.team_notification_preferences where device_id = d.id) >= 50
     and not exists (select 1 from public.team_notification_preferences where device_id = d.id and team_id = p_team_id) then
    raise exception 'You follow too many teams. Remove some first.' using errcode = 'EK409';
  end if;
  insert into public.team_notification_preferences (device_id, team_id, enabled, events)
  values (d.id, p_team_id, coalesce(p_enabled, true), (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_events) x))
  on conflict (device_id, team_id) do update set enabled = excluded.enabled, events = excluded.events;
end $$;

create or replace function public.service_notify_remove_team(p_token text, p_team_id uuid, p_rate_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  delete from public.team_notification_preferences where device_id = d.id and team_id = p_team_id;
end $$;

/* Save (or replace) this device's push subscription. An endpoint moves to the latest device that presents it. */
create or replace function public.service_notify_set_subscription(
  p_token text, p_endpoint text, p_p256dh text, p_auth text, p_platform text default null, p_standalone boolean default null, p_rate_key text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  if coalesce(p_endpoint, '') !~ '^https://[^\s]+$' or char_length(p_endpoint) > 1024
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'Invalid push subscription' using errcode = 'EK422';
  end if;
  if exists (select 1 from public.push_subscriptions where device_id = d.id and invalidated_at is null
             and endpoint = p_endpoint and p256dh = p_p256dh and auth = p_auth) then
    update public.push_subscriptions set updated_at = now() where device_id = d.id and invalidated_at is null;
  else
    update public.push_subscriptions set invalidated_at = now(), invalid_reason = 'replaced'
    where invalidated_at is null and (device_id = d.id or endpoint = p_endpoint);
    insert into public.push_subscriptions (device_id, endpoint, p256dh, auth) values (d.id, p_endpoint, p_p256dh, p_auth);
  end if;
  update public.notification_devices set push_enabled = true,
    platform = case when p_platform in ('ios', 'android', 'desktop') then p_platform else platform end,
    standalone = coalesce(p_standalone, standalone)
  where id = d.id;
end $$;

/* "Disable all notifications": subscription dropped, follows removed, nothing pending is sent. */
create or replace function public.service_notify_disable_all(p_token text, p_rate_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_devices;
begin
  d := private.notification_device(p_token);
  perform private.notify_rate(d, p_rate_key);
  update public.push_subscriptions set invalidated_at = now(), invalid_reason = 'disabled by user' where device_id = d.id and invalidated_at is null;
  update public.notification_devices set push_enabled = false where id = d.id;
  delete from public.match_notification_preferences where device_id = d.id;
  delete from public.team_notification_preferences where device_id = d.id;
  update public.notification_deliveries set status = 'CANCELLED' where device_id = d.id and status in ('PENDING', 'SENDING');
end $$;

-- ── 8. Row level security and privileges ───────────────────────────────────
alter table public.notification_devices enable row level security;
alter table public.notification_devices force row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
alter table public.match_notification_preferences enable row level security;
alter table public.match_notification_preferences force row level security;
alter table public.team_notification_preferences enable row level security;
alter table public.team_notification_preferences force row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;
alter table private.notification_config enable row level security;
alter table private.notification_config force row level security;

revoke all on public.notification_devices, public.push_subscriptions, public.match_notification_preferences,
  public.team_notification_preferences, public.notification_outbox, public.notification_deliveries
  from public, anon, authenticated;
revoke all on private.notification_config from public, anon, authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on function
  public.service_notification_claim(integer),
  public.service_notification_report(jsonb),
  public.service_notify_register(text, boolean, text),
  public.service_notify_state(text),
  public.service_notify_set_match(text, uuid, boolean, text[], text),
  public.service_notify_remove_match(text, uuid, text),
  public.service_notify_set_team(text, uuid, boolean, text[], text),
  public.service_notify_remove_team(text, uuid, text),
  public.service_notify_set_subscription(text, text, text, text, text, boolean, text),
  public.service_notify_disable_all(text, text)
from public, anon, authenticated;
grant execute on function
  public.service_notification_claim(integer),
  public.service_notification_report(jsonb),
  public.service_notify_register(text, boolean, text),
  public.service_notify_state(text),
  public.service_notify_set_match(text, uuid, boolean, text[], text),
  public.service_notify_remove_match(text, uuid, text),
  public.service_notify_set_team(text, uuid, boolean, text[], text),
  public.service_notify_remove_team(text, uuid, text),
  public.service_notify_set_subscription(text, text, text, text, text, boolean, text),
  public.service_notify_disable_all(text, text)
to service_role;
