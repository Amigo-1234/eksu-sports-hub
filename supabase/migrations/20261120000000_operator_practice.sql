-- Operator practice (skills test) for applicants. Additive only.
--
-- An admin creates a private practice link for an operator application. The
-- applicant opens it and officiates a scripted MOCK match in the real
-- operator console running entirely in their browser (nothing touches real
-- matches, teams or players). At the end they type their name and submit;
-- the site scores the recorded events against the script and stores the
-- result here for admins to read before deciding on the application.
--
-- Practice never grants anything: becoming an operator remains the separate,
-- explicit invite step on an APPROVED application.

create table public.operator_practice_links (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.operator_applications (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  opened_at timestamptz,
  submitted_at timestamptz,
  submitted_name text check (submitted_name is null or char_length(btrim(submitted_name)) between 1 and 80),
  score smallint check (score is null or score between 0 and 100),
  result jsonb,
  revoked_at timestamptz,
  check ((submitted_at is null) = (score is null))
);
create index operator_practice_links_application_idx on public.operator_practice_links (application_id, created_at desc);

create trigger audit_admin_change after insert or update or delete on public.operator_practice_links
  for each row execute function private.audit_admin_change();

alter table public.operator_practice_links enable row level security;
alter table public.operator_practice_links force row level security;
revoke all on public.operator_practice_links from anon, authenticated;
grant select, insert, update on public.operator_practice_links to authenticated;
create policy "admins read practice links" on public.operator_practice_links for select to authenticated
  using (private.has_role('ADMIN'));
create policy "admins create practice links" on public.operator_practice_links for insert to authenticated
  with check (private.has_role('ADMIN'));
create policy "admins revoke practice links" on public.operator_practice_links for update to authenticated
  using (private.has_role('ADMIN')) with check (private.has_role('ADMIN'));

-- ── Public side (server-only, via the site's service role) ─────────────────
-- Open a practice link: status and the applicant's first name (nothing else).
create or replace function public.service_practice_open(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.operator_practice_links;
  v_name text;
begin
  select * into l from public.operator_practice_links where token = p_token;
  if not found then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  select split_part(btrim(full_name), ' ', 1) into v_name from public.operator_applications where id = l.application_id;
  if l.opened_at is null and l.submitted_at is null and l.revoked_at is null and l.expires_at > now() then
    update public.operator_practice_links set opened_at = now() where id = l.id;
  end if;
  return jsonb_build_object(
    'first_name', v_name,
    'status', case
      when l.revoked_at is not null then 'revoked'
      when l.submitted_at is not null then 'submitted'
      when l.expires_at <= now() then 'expired'
      else 'open' end,
    'score', case when l.submitted_at is not null then l.score end);
end $$;

-- Submit once. The score and breakdown are computed by the site's server
-- from the recorded events (never taken from the browser as-is).
create or replace function public.service_practice_submit(p_token text, p_name text, p_score int, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.operator_practice_links;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  select * into l from public.operator_practice_links where token = p_token for update;
  if not found then
    raise exception 'Not found' using errcode = 'EK404';
  end if;
  if l.revoked_at is not null or l.expires_at <= now() then
    raise exception 'This practice link is no longer active.' using errcode = 'EK409';
  end if;
  if l.submitted_at is not null then
    raise exception 'This practice has already been submitted.' using errcode = 'EK409';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Enter your name (up to 80 characters).' using errcode = 'EK422';
  end if;
  if p_score is null or p_score not between 0 and 100 or p_result is null or pg_column_size(p_result) > 20000 then
    raise exception 'Invalid result' using errcode = 'EK422';
  end if;
  update public.operator_practice_links
    set submitted_at = now(), submitted_name = v_name, score = p_score, result = p_result
    where id = l.id;
  return jsonb_build_object('ok', true, 'score', p_score);
end $$;

revoke all on function public.service_practice_open(text), public.service_practice_submit(text, text, int, jsonb) from public, anon, authenticated;
grant execute on function public.service_practice_open(text), public.service_practice_submit(text, text, int, jsonb) to service_role;
