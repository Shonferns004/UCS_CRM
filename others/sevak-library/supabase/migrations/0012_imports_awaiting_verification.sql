-- 0012_imports_awaiting_verification.sql
-- Imported members were inserted directly as APPROVED. Move them to
-- PAYMENT_SUBMITTED ("awaiting verification") so staff can review each one
-- before marking them active, and make future imports behave the same way.
--
-- Also make approve_application preserve an already-assigned membership_id
-- (imported members keep their SL-2026-XXXX ID when staff verify+approve them
-- later, instead of being renumbered). Normal online applicants still get a
-- freshly generated ID because their membership_id is null until approval.

-- 1) Flip the members created by 0011 to awaiting verification.
update public.applications
   set status = 'PAYMENT_SUBMITTED',
       updated_at = now()
 where status = 'APPROVED'
   and membership_id in (
     'SL-2026-0001','SL-2026-0002','SL-2026-0003','SL-2026-0004',
     'SL-2026-0005','SL-2026-0006','SL-2026-0007','SL-2026-0008',
     'SL-2026-0009','SL-2026-0010','SL-2026-0011','SL-2026-0012'
   );

-- 2) Future spreadsheet imports start in awaiting verification too.
create or replace function public.import_members(p_rows jsonb)
returns table(imported bigint, skipped bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         jsonb;
  v_base    int;
  v_imported bigint := 0;
  v_skipped bigint := 0;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  select count(*) into v_base
    from public.applications
   where status = 'APPROVED'
     and membership_id is not null;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    if nullif(r ->> 'mobile', '') is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (select 1 from public.applications a where a.mobile = r ->> 'mobile') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_base := v_base + 1;

    insert into public.applications (
      ref,
      data,
      full_name,
      mobile,
      membership_type,
      membership_fee,
      start_date,
      end_date,
      status,
      membership_id
    ) values (
      'SL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
      coalesce(r -> 'data', '{}'::jsonb),
      r ->> 'fullName',
      r ->> 'mobile',
      nullif(r ->> 'membershipType', ''),
      nullif(r ->> 'membershipFee', '')::numeric,
      nullif(r ->> 'startDate', '')::date,
      nullif(r ->> 'endDate', '')::date,
      'PAYMENT_SUBMITTED',
      'SL-' || to_char(now(), 'YYYY') || '-' || lpad(v_base::text, 4, '0')
    );

    v_imported := v_imported + 1;
  end loop;

  return query select v_imported, v_skipped;
end;
$$;

-- 3) Keep an existing membership_id when re-approving (imported members).
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

  select * into v_row
    from public.applications
   where id = p_id;

  if v_row is null then
    raise exception 'Application not found';
  end if;

  if v_row.membership_id is null then
    select count(*) into v_seq
      from public.applications
     where status = 'APPROVED'
       and membership_id is not null;

    v_mid := 'SL-' || to_char(now(), 'YYYY') || '-' || lpad((v_seq + 1)::text, 4, '0');
  else
    v_mid := v_row.membership_id;
  end if;

  update public.applications
     set status = 'APPROVED',
         membership_id = v_mid,
         updated_at = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
