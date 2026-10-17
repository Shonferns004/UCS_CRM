import db from '../config/db.js';

// High Tier provenance, snapshotted onto the COLLECTION row.
//
// fro_assignments already carries the High Tier markers (see
// ensureHighTierProvenanceSchema), but they are transactional, not historical:
// highTierRestore sets batch_type back to high_tier_prev_batch_type and NULLs
// high_tier_batch_id / high_tier_source_station / high_tier_distributed_at. So
// the moment a batch is sent back to its source station, every rupee it produced
// stops looking like High Tier money — the "how much did this FRO pull out of
// High Tier data" question would silently reset to zero on restore.
//
// The fix is to copy the classification onto fro_donor_logs, which is never
// rewritten, and read it there:
//
//   was_high_tier             the durable answer. Written just before a restore
//                             clears the assignment's markers, and read by every
//                             collection aggregate (FRO Collected card, admin
//                             Collection card, FRO-wise report, batch card).
//   high_tier_batch_id        which batch produced the money (per-batch reports)
//   high_tier_source_station  the station the data was sourced from
//
// The columns are deliberately nullable apart from the boolean: a log predating
// High Tier, or one whose delivery flow never records a batch, simply carries
// false / NULL and is counted as normal collection. Only the High Tier split
// reads them; the collection total and its attribution never reference them, so
// no existing figure can move.
//
// Reruns safely on every boot via ADD COLUMN IF NOT EXISTS.
export async function ensureHighTierCollectionSnapshot() {
  await db._pool.query(
    `ALTER TABLE fro_donor_logs ADD COLUMN IF NOT EXISTS was_high_tier boolean NOT NULL DEFAULT false`
  );
  await db._pool.query(
    `ALTER TABLE fro_donor_logs ADD COLUMN IF NOT EXISTS high_tier_batch_id uuid NULL`
  );
  await db._pool.query(
    `ALTER TABLE fro_donor_logs ADD COLUMN IF NOT EXISTS high_tier_source_station text NULL`
  );
}

export default ensureHighTierCollectionSnapshot;
