-- Monthly Planner: one row → event link PER NGO.
--
-- A planner row is identified on screen by (observance_date, festival), but the
-- row is assigned to an NGO. BSCT and MANN can both plan the same festival on
-- the same date. Under the original (observance_date, festival) key they shared
-- a SINGLE link row: the second "Create Event" overwrote the first, and the
-- surviving link was then returned for both NGOs.
--
-- That is what made a programme completed for MANN show up as completed for
-- BSCT — the Monthly Report resolved the link to MANN's event and printed its
-- photo against BSCT's row, and the grid offered BSCT's row a Download for an
-- event it never created.
--
-- 189 now creates the NGO-scoped key. This migration retires the old one on
-- databases that already have it, and normalises a link with no NGO to '' so
-- it stays one row per key (Postgres treats NULLs as distinct, which would let
-- duplicates slip past a unique index). Both statements are idempotent, and
-- the old index guaranteed one row per (date, festival), so the normalisation
-- below can never collide.

UPDATE event_head_planner_event_links SET ngo_id = '' WHERE ngo_id IS NULL;

ALTER TABLE event_head_planner_event_links ALTER COLUMN ngo_id SET DEFAULT '';
ALTER TABLE event_head_planner_event_links ALTER COLUMN ngo_id SET NOT NULL;

DROP INDEX IF EXISTS uq_event_head_planner_event_links_row;
