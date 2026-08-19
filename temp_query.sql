SELECT id, status, receipt_id, receipt_no, donor_id, agent_name, payer_name, amount FROM bank_audit_entries WHERE receipt_id IS NOT NULL AND status != 'verified' ORDER BY id DESC LIMIT 15;
