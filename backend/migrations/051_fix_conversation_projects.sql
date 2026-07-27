-- Enable Supabase Realtime on messages and conversations tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Backfill conversations with NULL project
-- Strategy: match assigned_agent_id -> worker_agent_assignments -> whatsapp_accounts.project
UPDATE conversations c
SET project = waa.project
FROM worker_agent_assignments waa
WHERE c.project IS NULL
  AND c.assigned_agent_id = waa.user_id
  AND waa.account_id IS NOT NULL;

-- Also try via fro_whatsapp_assignments
UPDATE conversations c
SET project = fwa.project
FROM fro_whatsapp_assignments fwa
WHERE c.project IS NULL
  AND c.assigned_agent_id = fwa.fro_worker_id
  AND fwa.is_active = true;

-- Log remaining NULLs so admin can manually fix
SELECT c.id, c.contact_id, c.assigned_agent_id, c.created_at
FROM conversations c
WHERE c.project IS NULL;
