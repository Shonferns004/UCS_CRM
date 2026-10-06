-- 0004_resume_payment.sql
-- Allow the public to resume payment for a submitted application.
-- get_application_by_ref is security definer and already callable by the public;
-- extend it to return the fields the resume-payment page needs.
-- Postgres cannot change an existing function's return type, so drop it first.

drop function if exists public.get_application_by_ref(p_ref text);

create or replace function public.get_application_by_ref(p_ref text)
returns table(
  ref             text,
  status          text,
  membership_id   text,
  full_name       text,
  created_at      timestamptz,
  payment_ref     text,
  membership_type text,
  membership_fee  numeric,
  start_date      date,
  end_date        date
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.ref, a.status, a.membership_id, a.full_name, a.created_at,
         a.payment_ref, a.membership_type, a.membership_fee, a.start_date, a.end_date
    from public.applications a
   where a.ref = p_ref;
$$;
