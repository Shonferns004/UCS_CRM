import db from '../config/db.js';

// High Tier provenance on fro_assignments.
//
// When an admin moves a source station's data into High Tier, the rows change
// owner: station -> target, batch_type -> 'high_tier'. Without extra columns the
// origin is lost, so there is no way to know the data belonged to (say) BOD-2,
// and therefore no way to take that specific batch back.
//
// high_tier_source_station  the station the row came from (e.g. 'BOD-2')
// high_tier_prev_batch_type the batch_type before the move (new_data/old_data/
//                           NULL), so a restore can put the row back into the
//                           right New/Old bucket instead of High Tier
// high_tier_batch_id        groups one distribute operation, so multiple
//                           sources living in the same target station stay
//                           independently restorable
// high_tier_distributed_at  when the move happened (also shown in the admin
//                           batch list)
//
// Reruns safely on every boot via ADD COLUMN IF NOT EXISTS.
export async function ensureHighTierProvenanceSchema() {
  try {
    await db._pool.query(`ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS high_tier_source_station text NULL`);
    await db._pool.query(`ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS high_tier_prev_batch_type text NULL`);
    await db._pool.query(`ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS high_tier_batch_id uuid NULL`);
    await db._pool.query(`ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS high_tier_distributed_at TIMESTAMPTZ NULL`);
    // Batch lookup / restore scans by batch id; partial index keeps it tiny.
    // CONCURRENTLY so a big fro_assignments table is not locked at boot. That
    // must run outside a transaction block — pool.query sends it as a single
    // statement, which qualifies. A failed CONCURRENTLY build leaves an INVALID
    // index behind under the same name, and CREATE ... IF NOT EXISTS would then
    // skip it forever, so check for a valid index first and only (re)build when
    // one is genuinely absent. Without this guard a plain IF NOT EXISTS would
    // hide a broken index; without the check-before-build we would rebuild it on
    // every single boot.
    const { rows: idxRows } = await db._pool.query(
      `SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('public.idx_fro_assignments_high_tier_batch')
          AND indisvalid`
    );
    if (idxRows.length === 0) {
      await db._pool.query(`DROP INDEX IF EXISTS idx_fro_assignments_high_tier_batch`);
      await db._pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fro_assignments_high_tier_batch ON fro_assignments (high_tier_batch_id) WHERE high_tier_batch_id IS NOT NULL`);
    }
  } catch (error) {
    throw error;
  }
}

export default ensureHighTierProvenanceSchema;
