import db from '../config/db.js';

// Migrations are not auto-run in this repo, so the table the FRO bell depends on
// is created on boot. Idempotent: every statement is IF NOT EXISTS.
export async function ensureLeadAlertSchema() {
  await db._pool.query(`
    CREATE TABLE IF NOT EXISTS fro_lead_alerts (
      id            BIGSERIAL PRIMARY KEY,
      worker_id     UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      assignment_id INTEGER NOT NULL,
      lead_id       UUID,
      ngo_id        UUID,
      station       TEXT,
      source        TEXT,
      score         INTEGER,
      label         TEXT,
      title         TEXT NOT NULL,
      body          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      seen_at       TIMESTAMPTZ,
      attended_at   TIMESTAMPTZ
    )
  `);
  await db._pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS fro_lead_alerts_worker_assignment_uidx
      ON fro_lead_alerts (worker_id, assignment_id)
  `);
  await db._pool.query(`
    CREATE INDEX IF NOT EXISTS fro_lead_alerts_open_idx
      ON fro_lead_alerts (worker_id, created_at DESC)
      WHERE attended_at IS NULL
  `);
}

export default ensureLeadAlertSchema;
