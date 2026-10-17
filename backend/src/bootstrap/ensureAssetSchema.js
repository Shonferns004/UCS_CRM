import db from '../config/db.js';

// Idempotent bootstrap for the Asset Register (assets). The base table and most
// columns live in the database; the Add/Edit asset form in the Accounts panel
// additionally writes `company`, which was added by migration
// 116_add_asset_company.sql in the WhatsApp server tree but never reached the
// RDS schema the backend talks to. Without the column the INSERT fails with
// "column \"company\" of relation \"assets\" does not exist", so "+ Add Asset"
// never saved. Every statement below is ADD COLUMN IF NOT EXISTS, so this is
// safe on installations where the column already exists.
const ENSURE_COLUMNS_SQL = `
ALTER TABLE assets ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sim_operator TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sim_plan NUMERIC;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS storage TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ram TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS processor TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS motherboard TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS team_leader TEXT;
`;

export async function ensureAssetSchema() {
  try {
    await db._pool.query(ENSURE_COLUMNS_SQL);
    console.log('assets register columns ready');
  } catch (e) {
    console.warn('[asset schema] skip:', e?.message || String(e));
  }
}
