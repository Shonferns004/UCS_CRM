-- 0001_init.sql
-- Sevak Library membership application database
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists public.applications (
  id                 bigint generated always as identity primary key,
  ref                text unique not null,
  payment_ref        text,
  data               jsonb not null default '{}'::jsonb,
  passport_photo     text,
  identity_photo     text,
  full_name          text,
  email              text,
  mobile             text,
  membership_type    text,
  membership_fee     numeric,
  start_date         date,
  end_date           date,
  identity_proof_type text,
  identity_number    text,
  status             text not null default 'SUBMITTED',
  transaction_id     text,
  membership_id      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_applications_status on public.applications(status);
create index if not exists idx_applications_ref   on public.applications(ref);
create index if not exists idx_applications_email on public.applications(email);

create table if not exists public.staff (
  id         bigint generated always as identity primary key,
  uid        uuid references auth.users(id) on delete cascade unique,
  email      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mail_log (
  id             bigint generated always as identity primary key,
  application_id bigint references public.applications(id) on delete set null,
  to_email       text,
  subject        text,
  body           text,
  membership_id  text,
  sent           boolean not null default false,
  error          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where uid = auth.uid());
$$;

-- ---------------------------------------------------------------
-- Application functions (public can call submit / record / lookup)
-- ---------------------------------------------------------------

create or replace function public.submit_application(
  p_data           jsonb,
  p_passport_photo text,
  p_identity_photo text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.applications;
  v_ref    text;
  v_payref text;
begin
  v_ref    := 'SL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_payref := 'SEV' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into public.applications (
    ref, payment_ref, data, passport_photo, identity_photo,
    full_name, email, mobile, membership_type, membership_fee,
    start_date, end_date, identity_proof_type, identity_number
  ) values (
    v_ref, v_payref, p_data, p_passport_photo, p_identity_photo,
    p_data ->> 'fullName',
    p_data ->> 'emailAddress',
    p_data ->> 'mobileNumber',
    p_data ->> 'membershipType',
    nullif(p_data ->> 'membershipFee', '')::numeric,
    nullif(p_data ->> 'startDate', '')::date,
    nullif(p_data ->> 'endDate', '')::date,
    p_data ->> 'identityProofType',
    p_data ->> 'identityNumber'
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.record_payment(
  p_ref            text,
  p_transaction_id text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.applications;
begin
  update public.applications
     set transaction_id = p_transaction_id,
         status = case when status = 'SUBMITTED' then 'PAYMENT_SUBMITTED' else status end,
         updated_at = now()
   where ref = p_ref
  returning * into v_row;

  if v_row is null then
    raise exception 'Application % not found', p_ref;
  end if;

  return v_row;
end;
$$;

create or replace function public.get_application_by_ref(p_ref text)
returns table(
  ref          text,
  status       text,
  membership_id text,
  full_name    text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.ref, a.status, a.membership_id, a.full_name, a.created_at
    from public.applications a
   where a.ref = p_ref;
$$;

-- ---------------------------------------------------------------
-- Staff-only functions
-- ---------------------------------------------------------------

create or replace function public.mark_payment_verified(p_id bigint)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.applications;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  update public.applications
     set status = 'VERIFIED',
         updated_at = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.approve_application(p_id bigint)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.applications;
  v_seq int;
  v_mid text;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select count(*) into v_seq
    from public.applications
   where status = 'APPROVED'
     and membership_id is not null;

  v_mid := 'SL-' || to_char(now(), 'YYYY') || '-' || lpad((v_seq + 1)::text, 4, '0');

  update public.applications
     set status = 'APPROVED',
         membership_id = v_mid,
         updated_at = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------

alter table public.applications enable row level security;
alter table public.staff       enable row level security;
alter table public.mail_log    enable row level security;

drop policy if exists "public can submit" on public.applications;
create policy "public can submit" on public.applications
  for insert with check (true);

drop policy if exists "staff select applications" on public.applications;
create policy "staff select applications" on public.applications
  for select using (public.is_staff());

drop policy if exists "staff update applications" on public.applications;
create policy "staff update applications" on public.applications
  for update using (public.is_staff());

drop policy if exists "staff select mail log" on public.mail_log;
create policy "staff select mail log" on public.mail_log
  for select using (public.is_staff());

-- ---------------------------------------------------------------
-- Storage bucket for application files
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('application-files', 'application-files', false)
on conflict (id) do nothing;

drop policy if exists "public upload application files" on storage.objects;
create policy "public upload application files" on storage.objects
  for insert with check (bucket_id = 'application-files');

drop policy if exists "staff read application files" on storage.objects;
create policy "staff read application files" on storage.objects
  for select using (bucket_id = 'application-files' and public.is_staff());

drop policy if exists "staff update application files" on storage.objects;
create policy "staff update application files" on storage.objects
  for update using (bucket_id = 'application-files' and public.is_staff());
-- 0002_sevakmedia_storage.sql
-- Ensure the SevakMedia bucket exists and grants the right permissions.
-- Public applicants can upload; staff can read/update.

insert into storage.buckets (id, name, public)
values ('SevakMedia', 'SevakMedia', false)
on conflict (id) do nothing;

drop policy if exists "public upload SevakMedia" on storage.objects;
create policy "public upload SevakMedia" on storage.objects
  for insert with check (bucket_id = 'SevakMedia');

drop policy if exists "staff read SevakMedia" on storage.objects;
create policy "staff read SevakMedia" on storage.objects
  for select using (bucket_id = 'SevakMedia' and public.is_staff());

drop policy if exists "staff update SevakMedia" on storage.objects;
create policy "staff update SevakMedia" on storage.objects
  for update using (bucket_id = 'SevakMedia' and public.is_staff());
