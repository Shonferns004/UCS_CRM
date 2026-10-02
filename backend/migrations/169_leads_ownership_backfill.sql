-- 169: give legacy leads a real owner so the recruiter panel can show them again.
--
-- The problem
-- -----------
-- Commit 9ce76172 scoped GET /api/leads to the calling recruiter:
--
--   recruiter_id = me OR created_by = me OR created_by_name = me
--                      OR scheduled_by_name = me
--
-- (backend/src/controllers/leadController.js -> recruiterOwner(),
--  backend/src/models/leadModel.js -> ownerOrFilter()).
--
-- Leads entered from the recruiter's own panel always carry created_by = the
-- recruiter, so those kept showing. Leads typed by HR/admin/telecaller on the
-- recruiter's behalf, and every row that predates the created_by column, carry
-- none of the four stamps — so they exist, HR still counts them, and the recruiter
-- sees "No leads found." New leads stayed visible partly because
-- client/src/panels/recruiter/store.jsx pins anything just created into
-- createdLeadsRef and re-merges it regardless of what the server returns.
--
-- Who actually owns those rows is not recorded anywhere: the recruiter only ever
-- existed as a display name on the entry, and it was the entering HR user whose
-- name got stamped. So this cannot be derived — it has to be decided. Two rules,
-- most explicit first:
--
--   1. Manual map. lead_ownership_backfill_map maps a stamp that appears on the
--      orphaned rows (usually created_by_name) to the users.id that owns them.
--      Ships empty; HR fills it in when more than one recruiter exists.
--
--   2. By elimination. When the CRM holds exactly one recruiter account, every
--      orphaned row is that recruiter's — there is nobody else it could belong
--      to, so this cannot expose a colleague's work. Skipped outright as soon as
--      a second recruiter exists.
--
-- Anything neither rule resolves is left alone and reported by
-- scripts/audit-lead-ownership.mjs, so a human decides it rather than a query
-- guessing.
--
-- Safety
-- ------
-- Idempotent, and only ever writes recruiter_id on rows where it is currently
-- NULL and created_by is also NULL. A lead that already has an owner, or that a
-- recruiter personally typed (created_by set), is never touched, so re-running
-- this cannot reassign live work or undo an HR transfer. recruiter_id is written
-- through a join against public.users so the value always satisfies the
-- leads_recruiter_id_fkey foreign key.

-- ── 1. The manual map ────────────────────────────────────────────────────────
-- stamp_name is matched case-insensitively and whitespace-trimmed against
-- created_by_name, because that is the only clue most orphaned rows carry.
create table if not exists public.lead_ownership_backfill_map (
  stamp_name     text primary key,
  owner_user_id  bigint not null,
  note           text,
  created_at     timestamptz not null default now(),
  applied_at     timestamptz
);

comment on table public.lead_ownership_backfill_map is
  'Manual owner attribution for legacy leads: rows whose created_by_name matches stamp_name are assigned to users.id = owner_user_id. Written by HR/admin, applied by migration 169 and re-applied by ensureLeadOwnershipSchema on boot.';

-- A mapping to a user who does not exist would fail the FK on leads, so the
-- foreign key is declared here rather than trusted. ON DELETE CASCADE rather than
-- RESTRICT: the map is a pending instruction, not a permanent claim on the user,
-- so removing a recruiter drops their pending mapping (their leads fall back to
-- being unowned, which is the status quo) instead of blocking the deletion with a
-- constraint error nobody would recognise.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_ownership_backfill_map_owner_fkey'
  ) then
    alter table public.lead_ownership_backfill_map
      add constraint lead_ownership_backfill_map_owner_fkey
      foreign key (owner_user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- ── 2. Rule 1: apply the manual map ──────────────────────────────────────────
update public.leads l
   set recruiter_id = m.owner_user_id
  from public.lead_ownership_backfill_map m
 where l.recruiter_id is null
   and l.created_by is null
   and lower(btrim(coalesce(l.created_by_name, ''))) = lower(btrim(m.stamp_name));

-- ── 3. Rule 2: sole-recruiter elimination ────────────────────────────────────
-- Recruiter roles as authMiddleware.js normalises them: ROLE_ALIASES maps
-- 'hr-recruiter' to 'recruiter', so both spellings occur in users.role.
with sole_recruiter as (
  select min(u.id) as id
    from public.users u
   where lower(btrim(coalesce(u.role, ''))) in ('recruiter', 'hr-recruiter', 'hr recruiter')
   having count(*) = 1
)
update public.leads l
   set recruiter_id = s.id
  from sole_recruiter s
 where l.recruiter_id is null
   and l.created_by is null;

-- ── 4. Indexes for the scoped read ───────────────────────────────────────────
-- getAllLeads() filters on recruiter_id / created_by through a single .or() and
-- then orders by created_at desc. Without these the scoped query degrades to a
-- sequential scan of the whole table once the recruiter's slice is small.
--
-- Guarded per column because the whole file runs as one implicit transaction: a
-- missing column would abort the statement and roll back the attribution above
-- with it. An index is only an optimisation, so skipping one is always safe.
do $$
declare
  has_recruiter_id boolean;
  has_created_by   boolean;
  has_creator_name boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'recruiter_id'
  ) into has_recruiter_id;
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'created_by'
  ) into has_created_by;
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'created_by_name'
  ) into has_creator_name;

  if has_recruiter_id then
    execute 'create index if not exists leads_recruiter_id_created_at_idx
               on public.leads (recruiter_id, created_at desc)';
  end if;
  if has_created_by then
    execute 'create index if not exists leads_created_by_created_at_idx
               on public.leads (created_by, created_at desc)';
  end if;
  if has_creator_name then
    execute 'create index if not exists leads_created_by_name_lower_idx
               on public.leads (lower(btrim(created_by_name)))';
  end if;
end $$;

-- ── 5. Record that the map has been consumed ─────────────────────────────────
update public.lead_ownership_backfill_map m
   set applied_at = now()
 where m.applied_at is null
   and exists (
     select 1 from public.leads l
      where l.recruiter_id = m.owner_user_id
        and lower(btrim(coalesce(l.created_by_name, ''))) = lower(btrim(m.stamp_name))
   );
