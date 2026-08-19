SELECT COUNT(*) FROM bank_audit_entries WHERE donor_id IS NOT NULL AND (agent_name IS NULL OR agent_name = '') AND status != 'verified';
