-- Admin-led registration (additive to 20261005001400).
--
-- While public self-registration is switched off (PUBLIC_REGISTRATION_ENABLED,
-- a server-side flag in the Next.js app), Sports Directorate admins register
-- players and team rosters on their behalf. They use the SAME intake model:
-- one shared private.intake_registration() validates, de-duplicates and
-- stores every registration, public or admin. Admin-created registrations
-- get a reference, appear in the inbox, keep history, and still need
-- "Accept for screening" (which opens a PENDING screening, never CLEARED).
--
-- Changes:
--   * registrations.source ('PUBLIC' | 'ADMIN') and created_by (the admin).
--   * Documents become optional on admin-created entries (attached later or
--     not at all); the public path still requires both, as before.
--   * admin_create_registration — any non-archived window, open or closed
--     (admins may register after public intake closes).
--   * admin_update_registration_player / admin_update_registration_contact —
--     fix obvious intake mistakes before screening; each edit is an EDITED
--     history event + audit row with before/after (matric numbers masked).
--   * admin_attach_registration_document — records a document the server
--     stored for an entry (DOCUMENT_ATTACHED history event + audit).
--   * service_submit_registration keeps its signature, grants and behaviour.

-- ── 1. Columns ─────────────────────────────────────────────────────────────
alter table public.registrations
  add column source text not null default 'PUBLIC' check (source in ('PUBLIC', 'ADMIN')),
  add column created_by uuid references public.profiles (id);
alter table public.registrations add constraint registrations_admin_creator
  check (source = 'PUBLIC' or created_by is not null);

alter table public.registration_players alter column passport_photo_path drop not null;
alter table public.registration_players alter column student_id_document_path drop not null;

-- ── 2. Shared validation of one person ─────────────────────────────────────
/*
 * Checks one registration person against the competition (and, for a roster,
 * the roster's team). Raises EK422 with "Player n: …" messages. p_n labels
 * the person in messages (null → no prefix).
 */
create or replace function private.validate_registration_person(
  x jsonb, p_competition uuid, p_type public.registration_type, p_roster_team uuid, p_n int
) returns void language plpgsql stable security definer set search_path = '' as $$
declare v_pre text := case when p_n is null then '' else format('Player %s: ', p_n) end;
  v_key text := private.normalise_student_id(x ->> 'matric_number');
  v_fac uuid; v_dep uuid; v_team uuid; v_phone text;
  c_name text := (select name from public.competitions where id = p_competition);
begin
  begin
    v_fac := nullif(x ->> 'faculty_id', '')::uuid;
    v_dep := nullif(x ->> 'department_id', '')::uuid;
    v_team := coalesce(nullif(x ->> 'team_id', '')::uuid, p_roster_team);
  exception when others then
    raise exception '%some details are invalid', v_pre using errcode = 'EK422';
  end;
  if char_length(btrim(coalesce(x ->> 'full_name', ''))) not between 2 and 80 then
    raise exception '%enter the full name', v_pre using errcode = 'EK422';
  end if;
  if v_key is null or char_length(v_key) not between 3 and 40 then
    raise exception '%enter the matric / student number', v_pre using errcode = 'EK422';
  end if;
  if v_fac is null or not exists (select 1 from public.faculties where id = v_fac) then
    raise exception '%choose the faculty', v_pre using errcode = 'EK422';
  end if;
  if v_dep is not null and not exists (select 1 from public.departments where id = v_dep and faculty_id = v_fac) then
    raise exception '%the department does not belong to that faculty', v_pre using errcode = 'EK422';
  end if;
  if v_dep is null and exists (select 1 from public.departments where faculty_id = v_fac) then
    raise exception '%choose the department', v_pre using errcode = 'EK422';
  end if;
  if v_team is null then
    raise exception '%choose the team', v_pre using errcode = 'EK422';
  end if;
  if p_type = 'TEAM_ROSTER' and v_team <> p_roster_team then
    raise exception '%every roster player must be in the roster''s team', v_pre using errcode = 'EK422';
  end if;
  if not exists (select 1 from public.competition_entries ce join public.teams t on t.id = ce.team_id
      where ce.competition_id = p_competition and ce.team_id = v_team and t.active) then
    raise exception '%that team is not entered in %', v_pre, c_name using errcode = 'EK422';
  end if;
  if coalesce(x ->> 'level', '') not in ('100', '200', '300', '400', '500', '600', '700', 'PG', 'OTHER') then
    raise exception '%choose the level', v_pre using errcode = 'EK422';
  end if;
  if coalesce(x ->> 'position', '') not in ('GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'OTHER') then
    raise exception '%choose a preferred position', v_pre using errcode = 'EK422';
  end if;
  v_phone := nullif(regexp_replace(coalesce(x ->> 'phone', ''), '[\s()-]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception '%enter a valid phone number', v_pre using errcode = 'EK422';
  end if;
end $$;

-- ── 3. Shared intake (public and admin) ────────────────────────────────────
/*
 * Stores one registration. p_admin = false: the public path (window must be
 * OPEN inside its dates and allow this type; both documents required).
 * p_admin = true: an ADMIN registering on someone's behalf (any window that
 * is not archived; documents optional, but if given they must be this
 * entry's own stored objects). Duplicate rules are identical for both.
 */
create or replace function private.intake_registration(p jsonb, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.registration_windows; c public.competitions;
  v_id uuid; v_type public.registration_type; v_team uuid; v_ref text;
  v_name text := btrim(coalesce(p -> 'submitter' ->> 'name', ''));
  v_phone text := regexp_replace(coalesce(p -> 'submitter' ->> 'phone', ''), '[\s()-]', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p -> 'submitter' ->> 'email', ''))), '');
  x jsonb; i int := 0; v_pid uuid; v_key text; v_n int; v_photo text; v_doc text;
begin
  begin
    v_id := coalesce(nullif(p ->> 'id', '')::uuid, case when p_admin then gen_random_uuid() end);
    v_type := (p ->> 'type')::public.registration_type;
    v_team := nullif(p ->> 'team_id', '')::uuid;
  exception when others then
    raise exception 'The registration is incomplete' using errcode = 'EK422';
  end;
  if v_id is null or v_type is null then
    raise exception 'The registration is incomplete' using errcode = 'EK422';
  end if;

  select * into w from public.registration_windows where id = nullif(p ->> 'window_id', '')::uuid for share;
  if not found then
    raise exception 'Registration window not found' using errcode = 'EK404';
  end if;
  select * into c from public.competitions where id = w.competition_id;
  if p_admin then
    if w.status = 'ARCHIVED' or c.status = 'ARCHIVED' then
      raise exception 'That registration window is archived' using errcode = 'EK409';
    end if;
  else
    if not private.window_is_open(w) or c.status <> 'ACTIVE' then
      raise exception 'Registration for % is not open', c.name using errcode = 'EK409';
    end if;
    if v_type = 'PLAYER_SELF' and not w.allow_player_self_registration then
      raise exception 'Individual player registration is not open for this competition' using errcode = 'EK409';
    end if;
    if v_type = 'TEAM_ROSTER' and not w.allow_team_registration then
      raise exception 'Team registration is not open for this competition' using errcode = 'EK409';
    end if;
  end if;
  if exists (select 1 from public.registrations where id = v_id) then
    raise exception 'This registration was already submitted' using errcode = 'EK409';
  end if;

  if char_length(v_name) not between 2 and 80 then
    raise exception '%', case when p_admin and v_type = 'TEAM_ROSTER' then 'Enter the team official''s full name' else 'Enter your full name' end using errcode = 'EK422';
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Enter a valid phone number' using errcode = 'EK422';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 120) then
    raise exception 'Enter a valid email address, or leave it empty' using errcode = 'EK422';
  end if;
  if jsonb_typeof(p -> 'players') is distinct from 'array' or jsonb_array_length(p -> 'players') = 0 then
    raise exception 'Add at least one player' using errcode = 'EK422';
  end if;
  v_n := jsonb_array_length(p -> 'players');
  if v_type = 'PLAYER_SELF' and v_n <> 1 then
    raise exception 'An individual registration has exactly one player' using errcode = 'EK422';
  end if;
  if v_n > 40 then
    raise exception 'A roster can have at most 40 players' using errcode = 'EK422';
  end if;
  if v_type = 'TEAM_ROSTER' and v_team is null then
    raise exception 'Choose the team' using errcode = 'EK422';
  end if;
  if v_team is not null and not exists (select 1 from public.competition_entries ce join public.teams t on t.id = ce.team_id
      where ce.competition_id = c.id and ce.team_id = v_team and t.active) then
    raise exception 'That team is not entered in %', c.name using errcode = 'EK422';
  end if;

  v_ref := private.new_registration_reference(w.reference_code);
  insert into public.registrations (id, reference, registration_window_id, competition_id, season_id, team_id,
    submission_type, submitter_name, submitter_phone, submitter_email, status, submitted_at, source, created_by)
  values (v_id, v_ref, w.id, c.id, w.season_id, v_team, v_type, v_name, v_phone, v_email, 'SUBMITTED', now(),
    case when p_admin then 'ADMIN' else 'PUBLIC' end, case when p_admin then auth.uid() end);

  for x in select value from jsonb_array_elements(p -> 'players') loop
    i := i + 1;
    begin
      v_pid := coalesce(nullif(x ->> 'id', '')::uuid, case when p_admin then gen_random_uuid() end);
    exception when others then
      raise exception 'Player %: some details are invalid', i using errcode = 'EK422';
    end;
    if v_pid is null then
      raise exception 'Player %: some details are invalid', i using errcode = 'EK422';
    end if;
    perform private.validate_registration_person(x, c.id, v_type, v_team, i);
    v_key := private.normalise_student_id(x ->> 'matric_number');
    -- Documents: exactly the opaque objects the server stored for this person.
    v_photo := nullif(x ->> 'photo_path', '');
    v_doc := nullif(x ->> 'id_path', '');
    if (v_photo is null and not p_admin) or (v_photo is not null and (v_photo !~ ('^' || v_id || '/' || v_pid || '/photo\.(jpg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'registration-documents' and o.name = v_photo))) then
      raise exception 'Player %: upload a passport photograph', i using errcode = 'EK422';
    end if;
    if (v_doc is null and not p_admin) or (v_doc is not null and (v_doc !~ ('^' || v_id || '/' || v_pid || '/id\.(jpg|png|webp|pdf)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'registration-documents' and o.name = v_doc))) then
      raise exception 'Player %: upload a student ID card, course form or admission letter', i using errcode = 'EK422';
    end if;
    -- Duplicates within this roster, and against live submissions for this competition.
    if exists (select 1 from public.registration_players where registration_id = v_id and matric_key = v_key) then
      raise exception 'Player %: this matric number appears twice in the roster', i using errcode = 'EK409';
    end if;
    if exists (select 1 from public.registration_players where competition_id = c.id and matric_key = v_key
               and status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING')) then
      raise exception 'Player %: This student number may already have a registration. Please contact the Sports Directorate.', i
        using errcode = 'EK409';
    end if;

    insert into public.registration_players (id, registration_id, competition_id, full_name, matric_number, faculty_id,
      department_id, level, phone_number, preferred_position, team_id, passport_photo_path, student_id_document_path, sort_order)
    values (v_pid, v_id, c.id, btrim(x ->> 'full_name'), btrim(x ->> 'matric_number'), (x ->> 'faculty_id')::uuid,
      nullif(x ->> 'department_id', '')::uuid, x ->> 'level',
      nullif(regexp_replace(coalesce(x ->> 'phone', ''), '[\s()-]', '', 'g'), ''), x ->> 'position',
      coalesce(nullif(x ->> 'team_id', '')::uuid, v_team), v_photo, v_doc, i);
  end loop;

  perform private.registration_event(v_id, null, null, 'SUBMITTED', case when p_admin then 'Entered by an administrator' end);
  perform private.audit('REGISTRATION_SUBMITTED', 'registration', v_id, null, null, null, private.registration_summary(v_id));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'SUBMITTED', 'players', v_n,
    'competition', c.name, 'submitted_at', now());
exception
  when check_violation then
    raise exception 'Some details are invalid. Please review the form.' using errcode = 'EK422';
  when unique_violation then
    raise exception 'This student number may already have a registration. Please contact the Sports Directorate.' using errcode = 'EK409';
end $$;

-- Public path: unchanged contract (signature, grants, rate limit, rules).
create or replace function public.service_submit_registration(p jsonb, p_rate_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not private.rate_hit('register-submit', p_rate_key, 5, 600) then
    raise exception 'Too many submissions from this connection. Please wait a few minutes and try again.' using errcode = 'EK429';
  end if;
  r := private.intake_registration(p, false);
  return r - 'id';
end $$;

-- Audit summary now records where the registration came from.
create or replace function private.registration_summary(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status,
    'source', r.source, 'competition_id', r.competition_id, 'season_id', r.season_id, 'team_id', r.team_id,
    'window_id', r.registration_window_id, 'reason', r.status_reason,
    'players', (select count(*) from public.registration_players p where p.registration_id = r.id))
  from public.registrations r where r.id = p_id;
$$;

-- ── 4. Admin: create ───────────────────────────────────────────────────────
/* Same payload as the public submission; ids optional (generated). Returns { id, reference, … }. */
create or replace function public.admin_create_registration(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.intake_registration(p, true);
end $$;

-- ── 5. Admin: correct intake mistakes (before screening) ───────────────────
create or replace function private.person_snapshot(rp public.registration_players)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('full_name', rp.full_name, 'matric_number', private.mask_student_id(rp.matric_number),
    'faculty_id', rp.faculty_id, 'department_id', rp.department_id, 'level', rp.level,
    'phone', case when rp.phone_number is null then null else private.mask_student_id(rp.phone_number) end,
    'position', rp.preferred_position, 'team_id', rp.team_id);
$$;

create or replace function public.admin_update_registration_player(p_registration_player_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare rp public.registration_players; r public.registrations; v_new public.registration_players;
  v_key text := private.normalise_student_id(p ->> 'matric_number'); v_changed text[];
begin
  perform private.require_admin();
  select * into rp from public.registration_players where id = p_registration_player_id for update;
  if not found then
    raise exception 'Registration entry not found' using errcode = 'EK404';
  end if;
  r := private.open_registration_for_update(rp.registration_id);
  if rp.status <> 'SUBMITTED' then
    raise exception 'Only entries still waiting for a decision can be edited (this one is %)', lower(replace(rp.status::text, '_', ' '))
      using errcode = 'EK409';
  end if;
  perform private.validate_registration_person(p || jsonb_build_object('team_id', coalesce(nullif(p ->> 'team_id', ''), rp.team_id::text)),
    r.competition_id, r.submission_type, r.team_id, null);
  if exists (select 1 from public.registration_players where registration_id = r.id and matric_key = v_key and id <> rp.id) then
    raise exception 'This matric number already appears in this roster' using errcode = 'EK409';
  end if;
  if exists (select 1 from public.registration_players where competition_id = rp.competition_id and matric_key = v_key and id <> rp.id
             and status in ('SUBMITTED', 'ACCEPTED_FOR_SCREENING')) then
    raise exception 'This student number may already have a registration for this competition' using errcode = 'EK409';
  end if;

  update public.registration_players set
    full_name = btrim(p ->> 'full_name'), matric_number = btrim(p ->> 'matric_number'),
    faculty_id = (p ->> 'faculty_id')::uuid, department_id = nullif(p ->> 'department_id', '')::uuid,
    level = p ->> 'level', preferred_position = p ->> 'position',
    phone_number = nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[\s()-]', '', 'g'), ''),
    team_id = coalesce(nullif(p ->> 'team_id', '')::uuid, rp.team_id)
  where id = rp.id
  returning * into v_new;

  v_changed := array_remove(array[
    case when v_new.full_name is distinct from rp.full_name then 'name' end,
    case when v_new.matric_number is distinct from rp.matric_number then 'matric number' end,
    case when v_new.faculty_id is distinct from rp.faculty_id then 'faculty' end,
    case when v_new.department_id is distinct from rp.department_id then 'department' end,
    case when v_new.level is distinct from rp.level then 'level' end,
    case when v_new.phone_number is distinct from rp.phone_number then 'phone' end,
    case when v_new.preferred_position is distinct from rp.preferred_position then 'position' end,
    case when v_new.team_id is distinct from rp.team_id then 'team' end], null);
  if cardinality(v_changed) = 0 then
    raise exception 'Nothing was changed' using errcode = 'EK409';
  end if;
  perform private.registration_event(r.id, rp.id, 'SUBMITTED', 'EDITED', 'Corrected: ' || array_to_string(v_changed, ', '));
  perform private.audit('REGISTRATION_EDITED', 'registration', r.id, null, null,
    jsonb_build_object('registration_player_id', rp.id) || private.person_snapshot(rp),
    jsonb_build_object('registration_player_id', rp.id, 'changed', to_jsonb(v_changed)) || private.person_snapshot(v_new));
end $$;

create or replace function public.admin_update_registration_contact(
  p_registration_id uuid, p_name text, p_phone text, p_email text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.registrations; v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_changed text[] := '{}';
begin
  perform private.require_admin();
  r := private.open_registration_for_update(p_registration_id);
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Enter the full name' using errcode = 'EK422';
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Enter a valid phone number' using errcode = 'EK422';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 120) then
    raise exception 'Enter a valid email address, or leave it empty' using errcode = 'EK422';
  end if;
  if btrim(p_name) is distinct from r.submitter_name then v_changed := array_append(v_changed, 'name'); end if;
  if v_phone is distinct from r.submitter_phone then v_changed := array_append(v_changed, 'phone'); end if;
  if v_email is distinct from r.submitter_email then v_changed := array_append(v_changed, 'email'); end if;
  if cardinality(v_changed) = 0 then
    raise exception 'Nothing was changed' using errcode = 'EK409';
  end if;
  update public.registrations set submitter_name = btrim(p_name), submitter_phone = v_phone, submitter_email = v_email where id = r.id;
  perform private.registration_event(r.id, null, r.status::text, 'EDITED', 'Corrected contact: ' || array_to_string(v_changed, ', '));
  perform private.audit('REGISTRATION_EDITED', 'registration', r.id, null, null,
    jsonb_build_object('name', r.submitter_name, 'phone', private.mask_student_id(r.submitter_phone), 'email', r.submitter_email),
    jsonb_build_object('changed', to_jsonb(v_changed), 'name', btrim(p_name), 'phone', private.mask_student_id(v_phone), 'email', v_email));
end $$;

-- ── 6. Admin: attach a document the server stored ──────────────────────────
create or replace function public.admin_attach_registration_document(p_registration_player_id uuid, p_kind text, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare rp public.registration_players; r public.registrations; v_old text;
begin
  perform private.require_admin();
  select * into rp from public.registration_players where id = p_registration_player_id for update;
  if not found then
    raise exception 'Registration entry not found' using errcode = 'EK404';
  end if;
  r := private.open_registration_for_update(rp.registration_id);
  if rp.status <> 'SUBMITTED' then
    raise exception 'Documents can only be attached while the entry waits for a decision' using errcode = 'EK409';
  end if;
  if p_kind not in ('photo', 'id') then
    raise exception 'Choose the kind of document' using errcode = 'EK422';
  end if;
  if coalesce(p_path, '') !~ ('^' || r.id || '/' || rp.id || '/' || p_kind || case when p_kind = 'photo' then '\.(jpg|png|webp)$' else '\.(jpg|png|webp|pdf)$' end)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'registration-documents' and o.name = p_path) then
    raise exception 'The document was not stored correctly. Upload it again.' using errcode = 'EK422';
  end if;
  v_old := case when p_kind = 'photo' then rp.passport_photo_path else rp.student_id_document_path end;
  if p_kind = 'photo' then
    update public.registration_players set passport_photo_path = p_path where id = rp.id;
  else
    update public.registration_players set student_id_document_path = p_path where id = rp.id;
  end if;
  perform private.registration_event(r.id, rp.id, 'SUBMITTED', 'DOCUMENT_ATTACHED',
    case when p_kind = 'photo' then 'Passport photograph' else 'Student ID evidence' end || case when v_old is null then '' else ' (replaced)' end);
  perform private.audit('REGISTRATION_DOCUMENT_ATTACHED', 'registration', r.id, null, null,
    jsonb_build_object('registration_player_id', rp.id, 'kind', p_kind, 'had_document', v_old is not null),
    jsonb_build_object('registration_player_id', rp.id, 'kind', p_kind));
end $$;

-- ── 7. Admin read models: source + creator + editable ids ──────────────────
create or replace function public.admin_list_registrations(
  p_window_id uuid default null, p_competition_id uuid default null, p_season_id uuid default null,
  p_team_id uuid default null, p_faculty_id uuid default null, p_department_id uuid default null,
  p_type public.registration_type default null, p_status public.registration_status default null,
  p_from date default null, p_to date default null, p_search text default null, p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_key text := private.normalise_student_id(p_search);
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
begin
  perform private.require_admin();
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(st, n) from (
        select r.status::text st, count(*) n from public.registrations r
        where (p_window_id is null or r.registration_window_id = p_window_id)
          and (p_competition_id is null or r.competition_id = p_competition_id)
          and (p_season_id is null or r.season_id = p_season_id)
        group by r.status) q), '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(x.j order by x.at desc) from (
      select r.submitted_at as at, jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status, 'source', r.source,
        'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
        'submitter', r.submitter_name, 'submitter_phone', r.submitter_phone,
        'competition', jsonb_build_object('id', c.id, 'short_name', c.short_name),
        'season', se.name,
        'team', case when t.id is null then (select jsonb_build_object('id', pt.id, 'short_name', pt.short_name)
            from public.registration_players rp join public.teams pt on pt.id = rp.team_id where rp.registration_id = r.id limit 1)
          else jsonb_build_object('id', t.id, 'short_name', t.short_name) end,
        'players', (select count(*) from public.registration_players rp where rp.registration_id = r.id),
        'first_player', (select rp.full_name from public.registration_players rp where rp.registration_id = r.id order by rp.sort_order limit 1),
        'missing_documents', (select count(*) from public.registration_players rp where rp.registration_id = r.id
          and (rp.passport_photo_path is null or rp.student_id_document_path is null)),
        'flags', (select count(*) from public.registration_players rp where rp.registration_id = r.id
          and jsonb_array_length(private.registration_duplicates(rp.id)) > 0)) as j
      from public.registrations r
      join public.competitions c on c.id = r.competition_id
      join public.seasons se on se.id = r.season_id
      left join public.teams t on t.id = r.team_id
      where (p_window_id is null or r.registration_window_id = p_window_id)
        and (p_competition_id is null or r.competition_id = p_competition_id)
        and (p_season_id is null or r.season_id = p_season_id)
        and (p_type is null or r.submission_type = p_type)
        and (p_status is null or r.status = p_status)
        and (p_from is null or (r.submitted_at at time zone 'Africa/Lagos')::date >= p_from)
        and (p_to is null or (r.submitted_at at time zone 'Africa/Lagos')::date <= p_to)
        and (p_team_id is null or r.team_id = p_team_id
             or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.team_id = p_team_id))
        and (p_faculty_id is null or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.faculty_id = p_faculty_id))
        and (p_department_id is null or exists (select 1 from public.registration_players rp where rp.registration_id = r.id and rp.department_id = p_department_id))
        and (v_q is null or r.reference ilike '%' || v_q || '%' or r.submitter_name ilike '%' || v_q || '%'
             or (v_digits is not null and char_length(v_digits) >= 4 and regexp_replace(r.submitter_phone, '[^0-9]', '', 'g') like '%' || v_digits || '%')
             or exists (select 1 from public.registration_players rp where rp.registration_id = r.id
                        and (rp.full_name ilike '%' || v_q || '%' or rp.matric_key like '%' || v_key || '%')))
      order by r.submitted_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 500))
    ) x), '[]'::jsonb));
end $$;

create or replace function public.admin_registration_detail(p_registration_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.registrations where id = p_registration_id) then
    raise exception 'Registration not found' using errcode = 'EK404';
  end if;
  return (select jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'type', r.submission_type, 'status', r.status, 'status_reason', r.status_reason,
    'source', r.source, 'created_by', (select display_name from public.profiles where id = r.created_by),
    'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
    'reviewed_by', (select display_name from public.profiles where id = r.reviewed_by),
    'admin_notes', r.admin_notes,
    'submitter', jsonb_build_object('name', r.submitter_name, 'phone', r.submitter_phone, 'email', r.submitter_email),
    'window', jsonb_build_object('id', w.id, 'title', w.title, 'slug', w.slug),
    'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name),
    'season', jsonb_build_object('id', se.id, 'name', se.name),
    'team', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rp.id, 'full_name', rp.full_name, 'matric_number', rp.matric_number, 'level', rp.level,
        'phone', rp.phone_number, 'position', rp.preferred_position, 'status', rp.status, 'status_reason', rp.status_reason,
        'faculty', jsonb_build_object('id', f.id, 'name', f.name),
        'department', case when d.id is null then null else jsonb_build_object('id', d.id, 'name', d.name) end,
        'team', jsonb_build_object('id', pt.id, 'name', pt.name, 'short_name', pt.short_name),
        'photo_path', rp.passport_photo_path, 'id_path', rp.student_id_document_path,
        'duplicates', private.registration_duplicates(rp.id),
        'official_player', case when rp.official_player_id is null then null else jsonb_build_object(
          'id', rp.official_player_id, 'name', (select display_name from public.players where id = rp.official_player_id)) end,
        'screening', (select jsonb_build_object('id', s.id, 'status', s.status, 'decided_at', s.decided_at)
          from public.player_screenings s where s.id = rp.screening_id))
        order by rp.sort_order)
      from public.registration_players rp
      join public.faculties f on f.id = rp.faculty_id
      left join public.departments d on d.id = rp.department_id
      join public.teams pt on pt.id = rp.team_id
      where rp.registration_id = r.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'from', e.from_status, 'to', e.to_status, 'reason', e.reason, 'at', e.created_at,
        'player', (select full_name from public.registration_players where id = e.registration_player_id),
        'by', (select display_name from public.profiles where id = e.actor_id)) order by e.created_at desc)
      from public.registration_events e where e.registration_id = r.id), '[]'::jsonb))
  from public.registrations r
  join public.registration_windows w on w.id = r.registration_window_id
  join public.competitions c on c.id = r.competition_id
  join public.seasons se on se.id = r.season_id
  left join public.teams t on t.id = r.team_id
  where r.id = p_registration_id);
end $$;

-- Windows an admin can register into (open or closed, not archived), with what the form needs.
create or replace function public.admin_registration_intake_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'windows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'title', w.title, 'status', w.status, 'reference_code', w.reference_code,
        'competition', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name),
        'season', (select name from public.seasons where id = w.season_id),
        'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name, 'faculty_id', t.faculty_id) order by t.name)
          from public.competition_entries ce join public.teams t on t.id = ce.team_id
          where ce.competition_id = c.id and t.active), '[]'::jsonb))
        order by w.opens_at desc)
      from public.registration_windows w join public.competitions c on c.id = w.competition_id
      where w.status <> 'ARCHIVED' and c.status <> 'ARCHIVED'), '[]'::jsonb),
    'faculties', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'code', f.code,
        'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
          from public.departments d where d.faculty_id = f.id), '[]'::jsonb)) order by f.name)
      from public.faculties f), '[]'::jsonb));
end $$;

-- ── 8. Function privileges (nothing executable unless granted) ─────────────
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;

revoke execute on function
  public.admin_create_registration(jsonb),
  public.admin_update_registration_player(uuid, jsonb),
  public.admin_update_registration_contact(uuid, text, text, text),
  public.admin_attach_registration_document(uuid, text, text),
  public.admin_registration_intake_options(),
  public.service_submit_registration(jsonb, text),
  public.admin_list_registrations(uuid, uuid, uuid, uuid, uuid, uuid, public.registration_type, public.registration_status, date, date, text, integer),
  public.admin_registration_detail(uuid)
from public, anon, authenticated;
grant execute on function public.service_submit_registration(jsonb, text) to service_role;
grant execute on function
  public.admin_create_registration(jsonb),
  public.admin_update_registration_player(uuid, jsonb),
  public.admin_update_registration_contact(uuid, text, text, text),
  public.admin_attach_registration_document(uuid, text, text),
  public.admin_registration_intake_options(),
  public.admin_list_registrations(uuid, uuid, uuid, uuid, uuid, uuid, public.registration_type, public.registration_status, date, date, text, integer),
  public.admin_registration_detail(uuid)
to authenticated;
