-- 176: Event Head — festival-suggestion Beneficiary provenance.
-- Before this migration every stored suggestion could carry the NGO's
-- auto-filled group (BSCT -> Visually Impaired, AFLF -> Underprivileged
-- Families, MANN -> Women) with no way to tell it from a category the user
-- actually picked in the planner's Beneficiary dropdown. beneficiary_picked
-- records the difference: written as true whenever generation or the dropdown
-- stores a real choice, and false when nothing was chosen.
--
-- Default false hides every pre-existing row, then the backfill re-marks the
-- legacy values that can only be hand-picks: the NGO's mapped group was
-- auto-filled back then, so anything else in the column was typed by a person
-- (unknown codes included — the map only ever covered those three NGOs). Reads
-- withhold the beneficiary unless the flag is set, which is how the grid, the
-- Excel/PDF export and the Calendar report stop showing a category nobody
-- chose without losing the picks that were really made.
-- Idempotent: safe to re-run (the UPDATE only ever sets true, so values
-- cleared or chosen after the first run are left exactly as the app wrote
-- them). Restart the backend afterwards: the column probe is cached for the
-- life of the process.

ALTER TABLE event_head_festival_suggestions
  ADD COLUMN IF NOT EXISTS beneficiary_picked BOOLEAN NOT NULL DEFAULT false;

UPDATE event_head_festival_suggestions s
SET beneficiary_picked = true
FROM ngos n
WHERE n.id = s.ngo_id
  AND s.beneficiary IS NOT NULL
  AND s.beneficiary IS DISTINCT FROM (
    CASE lower(trim(n.code))
      WHEN 'bsct' THEN 'Visually Impaired'
      WHEN 'aflf' THEN 'Underprivileged Families'
      WHEN 'mann'  THEN 'Women'
      ELSE NULL
    END
  );
