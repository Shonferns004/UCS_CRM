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
