import db from '../config/db.js';

// Operator event workspace — fully separate from event_head_*.
// Operator dashboard data: a daily event (with selfie) plus the state and
// operator assignment for that day. Idempotent on boot.
export async function ensureOperatorSchema() {
  await db._pool.query(`CREATE TABLE IF NOT EXISTS operator_events (
       id          SERIAL PRIMARY KEY,
       title       TEXT NOT NULL,
       description TEXT,
       event_date  DATE,
       start_time  TEXT,
       end_time    TEXT,
       location    TEXT,
       state       TEXT,
       city        TEXT,
       selfie_url  TEXT,
       created_by  TEXT,
       created_at  TIMESTAMPTZ DEFAULT NOW(),
       updated_at  TIMESTAMPTZ DEFAULT NOW()
     )`);

  await db._pool.query(`ALTER TABLE operator_events ADD COLUMN IF NOT EXISTS city TEXT`);

  const { rows: typeRows } = await db._pool.query(
    `SELECT format_type(a.atttypid, a.atttypmod) AS t
     FROM pg_attribute a
     WHERE a.attrelid = 'workers'::regclass AND a.attname = 'id'`
  );
  const workerIdType = (typeRows[0] && typeRows[0].t) || 'bigint';

  await db._pool.query(`CREATE TABLE IF NOT EXISTS operator_assignments (
       id              SERIAL PRIMARY KEY,
       operator_id     ${workerIdType} REFERENCES workers(id) ON DELETE CASCADE,
       state           TEXT,
       city            TEXT,
       selfie_url      TEXT,
       event_id        INT REFERENCES operator_events(id) ON DELETE CASCADE,
       assignment_date DATE,
       created_at      TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE (operator_id, assignment_date, event_id)
     )`);

  await db._pool.query(`ALTER TABLE operator_assignments ADD COLUMN IF NOT EXISTS city TEXT`);
  await db._pool.query(`ALTER TABLE operator_assignments ADD COLUMN IF NOT EXISTS selfie_url TEXT`);

  const steps = [
    `CREATE INDEX IF NOT EXISTS idx_operator_events_date ON operator_events (event_date)`,
    `CREATE INDEX IF NOT EXISTS idx_operator_assignments_operator ON operator_assignments (operator_id, assignment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_operator_assignments_event ON operator_assignments (event_id)`,
  ];

  for (const sql of steps) {
    await db._pool.query(sql);
  }
}