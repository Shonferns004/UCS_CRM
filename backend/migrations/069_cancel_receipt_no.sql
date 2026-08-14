-- 069: Reuse receipt numbers freed by the Go Back / Undo actions.
--
-- When a receipt is cancelled (deleted, or its number released by Go Back), the
-- per-NGO counter from migration 068 keeps advancing, so the cancelled numbers
-- stay "used up" even though no receipt owns them any more. cancel_receipt_no()
-- lowers a project's counter back to the highest number still present on its
-- receipts, so the next allocated number continues from the last *live* number
-- (e.g. after cancelling 81913-81915 while 81912 is real, the next receipt is
-- 81913 again).
CREATE OR REPLACE FUNCTION cancel_receipt_no(p_project_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_max BIGINT;
BEGIN
  INSERT INTO receipt_no_counters (project_id, last_no)
  SELECT p_project_id, 0
  ON CONFLICT (project_id) DO NOTHING;

  SELECT COALESCE(MAX(CASE WHEN receipt_no ~ '^[0-9]+$' THEN receipt_no::bigint END), 0)
  INTO v_max
  FROM receipts
  WHERE project_id = p_project_id;

  UPDATE receipt_no_counters
  SET last_no = v_max
  WHERE project_id = p_project_id
    AND last_no > v_max;
END;
$$;
