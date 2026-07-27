-- Enable Supabase Realtime on messages and conversations tables
-- (skip if already added — causes 42710 error)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill conversations with NULL project
-- Match via worker_agent_assignments -> whatsapp_accounts.project
UPDATE conversations c
SET project = wa.project
FROM worker_agent_assignments waa
JOIN whatsapp_accounts wa ON wa.id = waa.account_id
WHERE c.project IS NULL
  AND c.assigned_agent_id = waa.user_id
  AND waa.account_id IS NOT NULL
  AND wa.project IS NOT NULL;

-- Also try via fro_whatsapp_assignments -> whatsapp_accounts.project
UPDATE conversations c
SET project = wa.project
FROM fro_whatsapp_assignments fwa
JOIN whatsapp_accounts wa ON wa.id = fwa.whatsapp_account_id
WHERE c.project IS NULL
  AND c.assigned_agent_id = fwa.fro_worker_id
  AND fwa.is_active = true
  AND wa.project IS NOT NULL;

-- Log remaining NULLs so admin can manually fix
SELECT c.id, c.contact_id, c.assigned_agent_id, c.created_at
FROM conversations c
WHERE c.project IS NULL;
