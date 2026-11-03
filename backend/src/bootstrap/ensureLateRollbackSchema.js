import db from '../config/db.js';

// Idempotent bootstrap for the late-deduction rollback table.
//
// Payroll computes a month's late deduction from the pooled late minutes of
// that month. Sometimes that number is wrong for a harmless, non-payroll
// reason — a leave/proof was approved after the fact, a device recorded a bad
// punch, HR corrected the register late. An admin can roll the wrong part back
// for one worker and one month; the row is the audit trail and the amount that
// payroll subtracts from the computed deduction.
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS salary_late_rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  salary_month TEXT NOT NULL,
  -- Minutes of the month's lateness given back to the worker. This is the
  -- grace budget that was charged by mistake (180 by default), not an
  -- arbitrary day amount: payroll re-runs the same tier ladder on
  -- (total late minutes - waived_minutes).
  waived_minutes INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  -- Audit only: the admin may be a users row, not a workers row, so this
  -- deliberately carries no foreign key (a FK here rejected the insert).
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, salary_month)
);

CREATE INDEX IF NOT EXISTS idx_salary_late_rollbacks_month ON salary_late_rollbacks(salary_month);
`;

export async function ensureLateRollbackSchema() {
  try {
    await db._pool.query(CREATE_TABLE_SQL);
  } catch (e) {
    console.warn('[late rollback schema] skip:', e?.message || String(e));
  }
}
