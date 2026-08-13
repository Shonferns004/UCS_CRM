-- Cleanup: rows imported before blank receipt numbers were stored as NULL
-- still carry '' in receipt_no, which collides with the UNIQUE(project_id,
-- receipt_no) index on re-import. Normalize them to NULL (the unique index
-- exempts NULLs).
UPDATE receipts SET receipt_no = NULL WHERE receipt_no = '';
