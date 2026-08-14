-- 071: Add "PUM" as a selectable Received Bank source in the audit entry modal.
-- Idempotent: does nothing if a source named PUM already exists.
INSERT INTO bank_audit_sources (name, is_active, sort_order)
SELECT 'PUM', true, COALESCE(MAX(sort_order), 0) + 1 FROM bank_audit_sources
WHERE NOT EXISTS (SELECT 1 FROM bank_audit_sources WHERE name = 'PUM');
