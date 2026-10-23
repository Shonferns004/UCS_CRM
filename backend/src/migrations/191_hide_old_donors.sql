-- 191_hide_old_donors.sql
--
-- "Hide Old Donors" — one global admin switch (NGO admin -> Station Management)
-- that hides every OLD-station donor from the field teams.
--
-- When it is ON, every FRO is narrowed to the FRESH (FD-*) stations, so the old
-- station's donors, their follow-ups, their scheduled calls, callbacks,
-- promises, their history and their donor timelines all disappear from the FRO
-- panel at once. Turning it off brings everything straight back.
--
-- The switch itself is a row in the existing `settings` key/value table:
--   key   = 'hide_old_donors'
--   value = '1' (hidden) | '0' (visible)
-- Nothing else is stored; the state is global, not per NGO.
--
-- NOTE ON HOW SCHEMA IS APPLIED IN THIS DEPLOYMENT:
-- Migrations are NOT auto-run here. The authoritative, idempotent version of
-- this DDL lives in backend/src/bootstrap/ensureSettingsSchema.js and
-- re-applies on every boot. This file is the tracked documentation copy,
-- mirroring the convention of backend/src/migrations/19x files.
--
-- Rollback:
--   DELETE FROM settings WHERE key = 'hide_old_donors';
--   (Only removes the switch's row. Dropping the settings table itself would
--   destroy every other runtime switch, so it is left alone.)

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text
);

-- The primary key already gives uniqueness; this index is a no-op for a table
-- that has one, and rescues a table that was created without one (PostgREST's
-- upsert needs a unique key to resolve the conflict).
CREATE UNIQUE INDEX IF NOT EXISTS settings_key_uniq ON settings (key);

-- Default state: old donors are VISIBLE. The switch is opt-in, so a fresh
-- install behaves exactly like the current system.
INSERT INTO settings (key, value)
VALUES ('hide_old_donors', '0')
ON CONFLICT (key) DO NOTHING;
