-- 149: Beneficiaries mobile-app operators move into their own table.
-- Previously they were stored as workers with bnf_operator = true. This
-- migration creates the dedicated bnf_operators table, copies existing
-- operator rows over (preserving ids so operator_assignments stay valid), and
-- re-points operator_assignments.operator_id to bnf_operators instead of
-- workers. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS bnf_operators (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  login_id TEXT NOT NULL,
  password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS bnf_operators_login_id_key ON bnf_operators (login_id);

INSERT INTO bnf_operators (id, name, email, phone, login_id, password, is_active, created_by, created_at)
SELECT id, name, email, phone, login_id, password, is_active, created_by, created_at
FROM workers
WHERE bnf_operator = true
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  orphan UUID;
BEGIN
  -- ADD CONSTRAINT validates every existing row, and one bad row would abort
  -- this whole block (rolling the DROP back with it) with only a bare FK
  -- violation to go on. Name the blocking rows up front instead.
  SELECT a.operator_id INTO orphan
    FROM operator_assignments a
    LEFT JOIN bnf_operators o ON o.id = a.operator_id
   WHERE a.operator_id IS NOT NULL AND o.id IS NULL
   LIMIT 1;
  IF orphan IS NOT NULL THEN
    RAISE EXCEPTION 'operator_assignments has rows whose operator_id (%) is missing from bnf_operators — copy those workers into bnf_operators keeping their ids, or delete those rows, then re-run 149', orphan;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'operator_assignments'
      AND c.conname = 'operator_assignments_operator_id_fkey'
      AND pg_get_constraintdef(c.oid) LIKE '%workers%'
  ) THEN
    ALTER TABLE operator_assignments DROP CONSTRAINT operator_assignments_operator_id_fkey;
    ALTER TABLE operator_assignments ADD CONSTRAINT operator_assignments_operator_id_fkey
      FOREIGN KEY (operator_id) REFERENCES bnf_operators(id) ON DELETE CASCADE;
  END IF;
END $$;