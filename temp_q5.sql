SELECT COUNT(*) as stuck_entries FROM bank_audit_entries WHERE receipt_id IS NOT NULL AND status != 'verified';
