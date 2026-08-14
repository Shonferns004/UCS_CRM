-- 068: Per-NGO receipt numbers — the next receipt number for an NGO is the
-- highest number already present for that NGO + 1 (NOT a shared global
-- sequence). Migration 064's receipts_no_seq is superseded and left in place
-- (unused).
--
-- Atomicity: next_receipt_no() locks the per-NGO counter row, so concurrent
-- calls for the same NGO never receive the same number. Each call also skips
-- past the current per-NGO max in case imported receipts carry higher book
-- numbers. The UNIQUE(project_id, receipt_no) constraint from migration 064
-- is the backstop.
CREATE TABLE IF NOT EXISTS receipt_no_counters (
  project_id TEXT PRIMARY KEY,
  last_no BIGINT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_receipt_no(p_project_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  -- Seed the counter from the current per-NGO max on first use.
  INSERT INTO receipt_no_counters (project_id, last_no)
  SELECT p_project_id, COALESCE(MAX(CASE WHEN receipt_no ~ '^[0-9]+$' THEN receipt_no::bigint END), 0)
  FROM receipts
  WHERE project_id = p_project_id
  ON CONFLICT (project_id) DO NOTHING;

  -- Lock the counter row so concurrent calls for this NGO serialize.
  SELECT last_no INTO v_next
  FROM receipt_no_counters
  WHERE project_id = p_project_id
  FOR UPDATE;

  -- +1 over what is allocated, and never below the current table max + 1
  -- (imports can add higher book numbers at any time).
  v_next := GREATEST(
    v_next + 1,
    COALESCE((SELECT MAX(CASE WHEN receipt_no ~ '^[0-9]+$' THEN receipt_no::bigint END)
              FROM receipts WHERE project_id = p_project_id), v_next) + 1
  );

  UPDATE receipt_no_counters SET last_no = v_next WHERE project_id = p_project_id;

  RETURN v_next::TEXT;
END;
$$;
