import db from '../config/db.js';

// Idempotent bootstrap for the SIM Locker (sim_inventory). The base table comes
// from migrations/088_sim_inventory.sql; this only adds the human-friendly
// `sim_name` label so a spare SIM can be recognised on sight ("Delhi Jio
// spare", "Warehouse Airtel", ...) alongside its sim_number. Safe on existing
// installations because every statement is ADD COLUMN IF NOT EXISTS.
const ENSURE_COLUMNS_SQL = `
ALTER TABLE sim_inventory ADD COLUMN IF NOT EXISTS sim_name TEXT;
`;

// Older rows were written with the sim_cards status vocabulary ('Active' /
// 'Expiring Soon') by a status bug, and every UI-created spare with no expiry
// date was stored as 'Inactive'. Neither is a valid INVENTORY_STATUSES value,
// so those rows could never appear as Available. Repair them here so the
// existing data lines up with the Locker without touching real assignments.
const REPAIR_STATUS_SQL = `
UPDATE sim_inventory SET status = 'Assigned'
  WHERE status IN ('Active', 'Expiring Soon') AND mobile_id IS NOT NULL;

UPDATE sim_inventory SET status = 'Available'
  WHERE status IN ('Active', 'Expiring Soon') AND mobile_id IS NULL;

UPDATE sim_inventory SET status = 'Available'
  WHERE status = 'Inactive' AND mobile_id IS NULL AND expiry_date IS NULL;

UPDATE sim_inventory SET status = 'Expired'
  WHERE status = 'Inactive' AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE;
`;

export async function ensureSimInventorySchema() {
  try {
    await db._pool.query(ENSURE_COLUMNS_SQL);
    console.log('sim_inventory sim_name column ready');
  } catch (e) {
    console.warn('[sim inventory schema] skip columns:', e?.message || String(e));
  }
  try {
    await db._pool.query(REPAIR_STATUS_SQL);
    console.log('sim_inventory legacy statuses normalised');
  } catch (e) {
    console.warn('[sim inventory schema] skip status repair:', e?.message || String(e));
  }
}
