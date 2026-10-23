import db from '../config/db.js';

// The `settings` table — a plain key/value store the backend already uses for
// runtime switches (office hours, incentive rules, daily lead target, ...).
//
// It is created outside the migration folder in this deployment, so this
// re-runs safely on every boot (CREATE ... IF NOT EXISTS), the same approach
// as ensureAuthSessionSchema / ensureTicketSchema / ensureTemporaryDataAccessSchema.
//
// The "Hide Old Donors" switch (services/oldDonorVisibility.js) lives here as
// the key `hide_old_donors`. Nothing else in this file is specific to that
// feature: this only guarantees the table the key/value store needs exists
// with a usable unique key.

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
     key   text PRIMARY KEY,
     value text
   )`,
  // The primary key already gives uniqueness; this index is a no-op for a
  // table that has one, and rescues a table that was created without one
  // (PostgREST's upsert needs a unique key to resolve the conflict).
  `CREATE UNIQUE INDEX IF NOT EXISTS settings_key_uniq ON settings (key)`,
];

export async function ensureSettingsSchema() {
  for (const s of STATEMENTS) {
    try {
      await db._pool.query(s);
    } catch (e) {
      // Lost a race with a parallel boot, or the role cannot CREATE. Not fatal
      // for the rest of the boot.
      console.warn('[settings schema] skip:', e?.message || String(e));
    }
  }
}
