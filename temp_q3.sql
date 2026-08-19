SELECT COUNT(*) as total FROM receipts r WHERE r.donor_id IS NULL AND r.log_id IS NULL AND (r.agent_name IS NULL OR r.agent_name = '' OR r.agent_name ILIKE '%suspense%');
