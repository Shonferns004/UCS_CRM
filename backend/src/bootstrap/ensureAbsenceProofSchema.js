import db from '../config/db.js';

// Idempotent bootstrap for the absence-proof table.
// A worker who was absent on a day covered by a REJECTED or PENDING leave
// uploads a proof from the app home screen; the admin reviews it on the
// admin UCS app home screen. Approved proof keeps that month's late grace;
// rejected / never uploaded forfeits it ONCE per calendar month.
// A no-leave absence never gets a proof row (auto-forfeit, no second chance).
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS absence_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  leave_id UUID REFERENCES leaves(id) ON DELETE SET NULL,
  proof_data TEXT,
  proof_mime TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_remark TEXT,
  reviewed_by UUID REFERENCES workers(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, date)
);

CREATE INDEX IF NOT EXISTS idx_absence_proofs_status ON absence_proofs(status);
CREATE INDEX IF NOT EXISTS idx_absence_proofs_worker_date ON absence_proofs(worker_id, date);
`;

export async function ensureAbsenceProofSchema() {
  try {
    await db._pool.query(CREATE_TABLE_SQL);
    console.log('absence_proofs table ready');
  } catch (e) {
    console.warn('[absence proof schema] skip:', e?.message || String(e));
  }
}
