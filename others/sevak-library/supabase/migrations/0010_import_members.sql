-- 0010_import_members.sql
-- Allow staff to bulk-import existing members (from a spreadsheet upload in the
-- admin panel). Each row is inserted directly as an APPROVED member:
--   - membership IDs are auto-generated SL-YYYY-XXXX, continuing from the
--     current count of approved members (same rule as approve_application),
--   - transaction_id / email are left null (payments were collected offline),
--   - extra sheet columns (degree, amountReceived, paymentMode, receiptNo,
--     daysLeft, remarks, registrationDate) are stored inside the `data` jsonb,
--   - rows whose mobile already exists are skipped and reported as skipped.

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
      'APPROVED',
      'SL-' || to_char(now(), 'YYYY') || '-' || lpad(v_base::text, 4, '0')
    );

    v_imported := v_imported + 1;
  end loop;

  return query select v_imported, v_skipped;
end;
$$;
