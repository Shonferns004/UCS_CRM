import db from '../config/db.js';

// Per-stack FRO assignment history.
//
// donor_stacks.fro_worker_id only keeps the CURRENT holder, so every
// reassignment overwrote the previous FRO with no audit trail. This table is
// append-only: one row per assignment window (assigned_at -> unassigned_at).
// The "open" row is the one with unassigned_at IS NULL; it is closed when the
// stack is reassigned or unassigned.
//
// Migrations are not auto-run in this deployment, so this re-runs safely on
// every boot (CREATE ... IF NOT EXISTS), the same approach as
// ensureTemporaryDataAccessSchema and its siblings.

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS donor_stack_fro_history (
     id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     stack_id              uuid NOT NULL REFERENCES donor_stacks(id) ON DELETE CASCADE,
     fro_worker_id         uuid,
     fro_name              text,
     assigned_by_admin_id  uuid,
     assigned_at           timestamptz NOT NULL DEFAULT now(),
     unassigned_at         timestamptz,
     unassigned_reason     text
   )`,
  `CREATE INDEX IF NOT EXISTS donor_stack_fro_history_stack
     ON donor_stack_fro_history (stack_id, assigned_at DESC)`,
  `CREATE INDEX IF NOT EXISTS donor_stack_fro_history_open
     ON donor_stack_fro_history (stack_id)
     WHERE unassigned_at IS NULL`,
];

export async function ensureStackFroHistorySchema() {
  for (const s of STATEMENTS) {
    try {
      await db._pool.query(s);
    } catch (e) {
      // Never fatal for boot: the stack feature keeps working, only the
      // history endpoint reports the missing table.
      console.warn('[stack fro history schema] skip:', e?.message || String(e));
    }
  }
}
