-- 0003_admin_dashboard.sql
-- Admin dashboard support: rejection reason, reject RPC, staff delete.

alter table public.applications
  add column if not exists reject_reason text;

create or replace function public.reject_application(p_id bigint, p_reason text)
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
     set status = 'REJECTED',
         reject_reason = nullif(trim(p_reason), ''),
         updated_at = now()
   where id = p_id
  returning * into v_row;

  if v_row is null then
    raise exception 'Application not found';
  end if;

  return v_row;
end;
$$;

drop policy if exists "staff delete applications" on public.applications;
create policy "staff delete applications" on public.applications
  for delete using (public.is_staff());
