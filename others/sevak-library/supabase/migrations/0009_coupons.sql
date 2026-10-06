-- 0009_coupons.sql
-- Coupons / discount codes for the admin panel. Staff can create coupons and
-- email them to existing members. There is no online redemption: the code is
-- applied manually by staff (e.g. when editing the membership fee).

create table if not exists public.coupons (
  id             bigint generated always as identity primary key,
  code           text unique not null,
  description    text,
  discount_type  text not null default 'percent' check (discount_type in ('percent', 'flat')),
  discount_value numeric not null check (discount_value > 0),
  min_fee        numeric,
  valid_from     date,
  valid_until    date,
  max_uses       int check (max_uses is null or max_uses >= 0),
  uses_count     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.coupons enable row level security;

drop policy if exists "staff select coupons" on public.coupons;
create policy "staff select coupons" on public.coupons
  for select using (public.is_staff());

drop policy if exists "staff insert coupons" on public.coupons;
create policy "staff insert coupons" on public.coupons
  for insert with check (public.is_staff());

drop policy if exists "staff update coupons" on public.coupons;
create policy "staff update coupons" on public.coupons
  for update using (public.is_staff());

drop policy if exists "staff delete coupons" on public.coupons;
create policy "staff delete coupons" on public.coupons
  for delete using (public.is_staff());
