-- 0008_edit_application_photos.sql
-- Let staff replace the passport / identity photos of an application.

drop policy if exists "staff delete SevakMedia" on storage.objects;
create policy "staff delete SevakMedia" on storage.objects
  for delete using (bucket_id = 'SevakMedia' and public.is_staff());

create or replace function public.update_application(
  p_id              bigint,
  p_data            jsonb,
  p_transaction_id  text default null,
  p_passport_photo  text default null,
  p_identity_photo  text default null
)
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
     set data               = p_data,
         full_name          = p_data ->> 'fullName',
         email              = p_data ->> 'emailAddress',
         mobile             = p_data ->> 'mobileNumber',
         membership_type    = p_data ->> 'membershipType',
         membership_fee     = nullif(p_data ->> 'membershipFee', '')::numeric,
         start_date         = nullif(p_data ->> 'startDate', '')::date,
         end_date           = nullif(p_data ->> 'endDate', '')::date,
         identity_proof_type = p_data ->> 'identityProofType',
         identity_number    = nullif(p_data ->> 'identityNumber', ''),
         passport_photo     = coalesce(p_passport_photo, passport_photo),
         identity_photo     = coalesce(p_identity_photo, identity_photo),
         transaction_id     = coalesce(nullif(trim(p_transaction_id), ''), transaction_id),
         updated_at         = now()
   where id = p_id
  returning * into v_row;

  if v_row is null then
    raise exception 'Application not found';
  end if;

  return v_row;
end;
$$;
