-- 072: NGO Allocation Management + Multi-NGO Salary Allocation & Tracking.
--
-- Adds the supporting schema for:
--   * worker_people_allocations  — an employee's people/employment split across
--     NGOs (percentages summing to 100). Backfilled to 100% of the worker's
--     single legacy NGO so existing records keep working unchanged.
--   * salary_allocations         — monthly snapshots of an employee's salary
--     funding split across NGOs (% + rupees). Backfilled for the current month
--     from the existing worker_ngo_allocations split (which continues to power
--     payroll).
--   * salary_payments            — payment/allocation transaction records per
--     employee, per NGO, per month.
--   * ngo_allocation_settings    — org-wide default/target allocation % per NGO.
--
-- Also seeds the "OTHER" NGO (code OTHER) and backfills workers with a
-- NULL / unrecognized ngo_id to it, so the "Volunteers by NGO" distribution is
-- complete.
--
-- Fully idempotent: safe to run more than once. Existing data is preserved.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Seed the four default NGOs (idempotent by code).
-- ---------------------------------------------------------------------------
INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'BSCT', 'BSCT', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'BSCT');

INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'MANN', 'MANN', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'MANN');

INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'AFLF', 'AFLF', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'AFLF');

INSERT INTO ngos (name, code, is_active, created_at)
SELECT 'Other', 'OTHER', true, now()
WHERE NOT EXISTS (SELECT 1 FROM ngos WHERE code = 'OTHER');

-- ---------------------------------------------------------------------------
-- 2. Backfill workers with a NULL / unrecognized ngo_id to the "Other" NGO.
--    (Unrecognized = ngo_id that no longer exists in ngos.)
-- ---------------------------------------------------------------------------
UPDATE workers
SET ngo_id = (SELECT id FROM ngos WHERE code = 'OTHER')
WHERE ngo_id IS NULL
   OR ngo_id NOT IN (SELECT id FROM ngos);

-- ---------------------------------------------------------------------------
-- 3. worker_people_allocations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_people_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  ngo_id UUID NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  allocation_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  effective_from DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, ngo_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_people_allocations_worker
  ON worker_people_allocations (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_people_allocations_ngo
  ON worker_people_allocations (ngo_id);

-- Backfill: every worker with a primary NGO becomes a 100% allocation to that
-- NGO (idempotent — only workers without any people allocation row).
INSERT INTO worker_people_allocations (worker_id, ngo_id, allocation_percentage, effective_from, status)
SELECT w.id, w.ngo_id, 100, date_trunc('month', w.created_at)::date, 'active'
FROM workers w
WHERE w.ngo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM worker_people_allocations pa WHERE pa.worker_id = w.id
  );

-- ---------------------------------------------------------------------------
-- 4. salary_allocations (monthly snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salary_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  ngo_id UUID NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  salary_month DATE NOT NULL,
  allocation_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  allocation_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, ngo_id, salary_month)
);

CREATE INDEX IF NOT EXISTS idx_salary_allocations_worker_month
  ON salary_allocations (worker_id, salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_allocations_ngo_month
  ON salary_allocations (ngo_id, salary_month);

-- Backfill the current month from the active salary_history + the existing
-- worker_ngo_allocations rupee split. Only applies when a worker has an active
-- salary record and at least one NGO allocation row, and only for months that
-- do not already have a snapshot (idempotent).
INSERT INTO salary_allocations (worker_id, ngo_id, salary_month, allocation_percentage, allocation_amount, status)
SELECT
  wa.worker_id,
  wa.ngo_id,
  date_trunc('month', CURRENT_DATE)::date,
  CASE WHEN sh.salary > 0 THEN ROUND((wa.salary_portion / sh.salary) * 100, 2) ELSE 0 END,
  wa.salary_portion,
  'active'
FROM worker_ngo_allocations wa
JOIN (
  SELECT DISTINCT ON (worker_id) worker_id, salary
  FROM salary_history
  ORDER BY worker_id, from_month DESC
) sh ON sh.worker_id = wa.worker_id
WHERE sh.salary > 0
  AND wa.salary_portion > 0
  AND NOT EXISTS (
    SELECT 1 FROM salary_allocations sa
    WHERE sa.worker_id = wa.worker_id
      AND sa.salary_month = date_trunc('month', CURRENT_DATE)::date
  );

-- ---------------------------------------------------------------------------
-- 5. salary_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  ngo_id UUID NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  salary_allocation_id UUID REFERENCES salary_allocations(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  salary_month DATE NOT NULL,
  payment_date TIMESTAMPTZ,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_worker_month
  ON salary_payments (worker_id, salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_payments_ngo_month
  ON salary_payments (ngo_id, salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_payments_status
  ON salary_payments (payment_status);

-- ---------------------------------------------------------------------------
-- 6. ngo_allocation_settings (org-wide default/target % per NGO)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ngo_allocation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngo_id UUID NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  allocation_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ngo_id)
);

-- Seed the settings from the current people-allocation distribution so the
-- Settings screen opens with realistic numbers (idempotent).
INSERT INTO ngo_allocation_settings (ngo_id, allocation_percentage)
SELECT ngo_id, ROUND((SUM(allocation_percentage) * 100.0 /
  NULLIF((SELECT SUM(allocation_percentage) FROM worker_people_allocations), 0)), 2)
FROM worker_people_allocations
WHERE worker_id IN (SELECT id FROM workers WHERE employment_status = 'active')
GROUP BY ngo_id
HAVING SUM(allocation_percentage) > 0
ON CONFLICT (ngo_id) DO NOTHING;
