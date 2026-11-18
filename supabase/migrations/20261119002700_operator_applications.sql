-- Operator recruitment: public applications to become a match operator.
-- Additive only. Applicants never get an account from applying: an admin
-- reviews (shortlist / approve / reject) and, as a separate explicit step,
-- invites an approved applicant through the existing staff invite flow.
--
-- Access: the public cannot read or write this table. Submissions go through
-- service_submit_operator_application (service role only, called by the
-- server after its own validation), which rate-limits per caller and refuses
-- a second open application for the same email. Admins read and review under
-- RLS; every change is audited.

create table public.operator_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  email text not null check (char_length(email) <= 200 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_key text generated always as (lower(btrim(email))) stored,
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  department text not null default '' check (char_length(department) <= 80),
  level text not null default '' check (char_length(level) <= 20),
  experience text not null default '' check (char_length(experience) <= 1500),
  available_days text[] not null
    check (cardinality(available_days) between 2 and 3
           and available_days <@ array['MON','TUE','WED','THU','FRI','SAT','SUN']),
  periods text[] not null
    check (cardinality(periods) between 1 and 3 and periods <@ array['MORNING','AFTERNOON','EVENING']),
  can_attend boolean not null,
  answer_why text not null check (char_length(btrim(answer_why)) between 20 and 1500),
  answer_wrong_goal text not null check (char_length(btrim(answer_wrong_goal)) between 10 and 1500),
  answer_offline text not null check (char_length(btrim(answer_offline)) between 10 and 1500),
  commits_accuracy boolean not null,
  status text not null default 'NEW'
    check (status in ('NEW', 'SHORTLISTED', 'APPROVED', 'REJECTED', 'INVITED')),
  review_notes text not null default '' check (char_length(review_notes) <= 4000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  invited_user_id uuid,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_applications_invited check (status <> 'INVITED' or invited_user_id is not null)
);

-- One application under review per email (a rejected applicant may apply again later).
create unique index operator_applications_one_open
  on public.operator_applications (email_key) where status in ('NEW', 'SHORTLISTED', 'APPROVED');
create index operator_applications_status_idx on public.operator_applications (status, created_at desc);

create trigger operator_applications_touch before update on public.operator_applications
  for each row execute function private.touch_updated_at();
create trigger audit_admin_change after insert or update or delete on public.operator_applications
  for each row execute function private.audit_admin_change();

alter table public.operator_applications enable row level security;
alter table public.operator_applications force row level security;
revoke all on public.operator_applications from anon, authenticated;
grant select, update on public.operator_applications to authenticated;

create policy "admins read operator applications" on public.operator_applications for select to authenticated
  using (private.has_role('ADMIN'));
create policy "admins review operator applications" on public.operator_applications for update to authenticated
  using (private.has_role('ADMIN')) with check (private.has_role('ADMIN'));

-- Public submission (server-side only). Returns the applicant's reference.
create or replace function public.service_submit_operator_application(p jsonb, p_rate_key text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[\s()-]', '', 'g'), '');
  v_ref text;
  v_days text[]; v_periods text[];
begin
  if not private.rate_hit('operator-apply', p_rate_key, 3, 3600) then
    raise exception 'Too many applications from this connection. Please try again later.' using errcode = 'EK429';
  end if;
  begin
    v_days := array(select distinct jsonb_array_elements_text(p -> 'available_days'));
    v_periods := array(select distinct jsonb_array_elements_text(p -> 'periods'));
  exception when others then
    raise exception 'The application is incomplete' using errcode = 'EK422';
  end;
  if exists (select 1 from public.operator_applications where email_key = v_email and status in ('NEW', 'SHORTLISTED', 'APPROVED')) then
    raise exception 'We already have an application from this email address. We will be in touch.' using errcode = 'EK409';
  end if;
  if exists (select 1 from public.operator_applications where email_key = v_email and status = 'INVITED') then
    raise exception 'This email address already belongs to an EKSU Sports Hub operator.' using errcode = 'EK409';
  end if;

  v_ref := 'OPA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  begin
    insert into public.operator_applications (
      reference, full_name, email, phone, department, level, experience, available_days, periods,
      can_attend, answer_why, answer_wrong_goal, answer_offline, commits_accuracy)
    values (
      v_ref, btrim(p ->> 'full_name'), v_email, v_phone,
      btrim(coalesce(p ->> 'department', '')), btrim(coalesce(p ->> 'level', '')), btrim(coalesce(p ->> 'experience', '')),
      v_days, v_periods,
      (p ->> 'can_attend')::boolean, btrim(p ->> 'answer_why'), btrim(p ->> 'answer_wrong_goal'), btrim(p ->> 'answer_offline'),
      (p ->> 'commits_accuracy')::boolean);
  exception
    when unique_violation then
      raise exception 'We already have an application from this email address. We will be in touch.' using errcode = 'EK409';
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'Please check your answers: some required details are missing or too long.' using errcode = 'EK422';
  end;
  return v_ref;
end $$;

revoke all on function public.service_submit_operator_application(jsonb, text) from public, anon, authenticated;
grant execute on function public.service_submit_operator_application(jsonb, text) to service_role;
