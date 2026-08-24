# Fix: Cross-FRO / cross-station collections invisible in FRO's Collected modal & History

## Problem
When an FRO verifies/collects on another FRO's donor (manual verify, work-as, or receipt auto-credit),
the log is written with `fro_donor_logs.fro_worker_id = <collector>` but `assignment_id` points to the
ORIGINAL OWNER's assignment (different station/ngo). Every viewer scopes by the ASSIGNMENT's
`(station, ngo_id)` pair, so the collector's own collections get filtered out.

Live proof (DB): Mahima Redkar (scope ND-4/BSCT, ND-2/MANN) has 671 verified cross-FRO donations
worth ₹3,78,238 this month on assignments owned by Deepali Gautam at BSCT@ND-1/ND-6.
- Modal main query drops them (station not hers)
- The commit-b4f733b3 "Others" fallback only rescues rows whose ngo ∉ allowedNgoIds — here ngo=BSCT IS allowed, so they fall through both queries and vanish
- Visibility split for her month donations: 3,470 visible vs 3,857 dropped by the pair filter

## Root cause locations
1. `backend/src/controllers/froController.js` `getMyCollections` (~673): DB-level
   `.in('fro_assignments.station', …)` + `withStationNgoPairs` + `filterByScope`; plus the
   separate crossNgo query whose filter `!allowedNgoIds.includes(ngo_id)` misses same-NGO/
   different-station rows.
2. `getMyHistory` (~2810): pair-scoped → history table hides the same rows.
3. Dashboard stat queries (~449–457, ~529–556, ~1514+): money queries (COLLECTION_DATE_OR based)
   pair-filtered → disagree with card total (`getTotalCollectedByWorker`, unfiltered).
4. Admin `getBatchCollectionStats(..., ngoIds)` filters `.in('fro_assignments.ngo_id', ngoIds)`
   → per-NGO admin views attribute/exclude differently than fro-wise report (uses unfiltered total).

## Principle
Own-money rule: anything with `fro_donor_logs.fro_worker_id = me` counts/shows as MY collection,
regardless of assignment station/ngo. Pair scoping stays for DATA browsing (donor lists,
connected counts), not for money the user collected.

## Decisions (confirmed by user)
- Cross-FRO collections (log credited to me but assignment owned by another FRO) ALWAYS go
  under the `Others` tab in the Collected modal, even when the ngo is one of mine.
- Admin-side per-NGO scoping stays as-is; no admin report changes.

## Changes (all in backend unless noted)
1. `getMyCollections`: remove station/pair filters + `filterByScope` from the main query;
   delete the redundant crossNgo second query. Single pass bucketing:
   - `assignment.fro_worker_id === me && allowedNgoIds.includes(ngo)` → its real ngo tab
   - otherwise (cross-FRO / work-as / auto-credit / foreign ngo) → `others` tab
   Keep dedup, work-as masking, `?ngo_id` filter (others rows excluded when a specific tab picked).
2. `getMyHistory`: filter by `fro_worker_id = me` only (keep order/limit); include ngo name.
3. Dashboard self-money queries (~449–457 dailyDonations/totalDonations/today/month/FY donor
   donation queries, ~1514+ period stats): drop station-pair constraint, keep `.eq('fro_worker_id')`.
   Connected/disposition/data-count queries stay pair-scoped.
4. Frontend `ucs crm/src/panels/fro/pages/Dashboard.jsx`: no structural change (rows now arrive
   tagged ngo_id='others'; flat-array grouping + ngoMap['others'] tab already render).
5. Admin side: untouched.

## Verification
- API check for Mahima Redkar: `/fro/dashboard/collections` now lists her 671 cross-FRO rows;
  modal sum matches `getTotalCollectedByWorker`.
- `getMyHistory` returns them.
- Spot-check an in-scope FRO (e.g. Priya Tiwari) for regressions; dedup intact.
