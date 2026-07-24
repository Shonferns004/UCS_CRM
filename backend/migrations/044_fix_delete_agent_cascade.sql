DROP FUNCTION IF EXISTS delete_agent(UUID);

CREATE FUNCTION delete_agent(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations SET assigned_agent_id = NULL WHERE assigned_agent_id = p_id;
  DELETE FROM agent_phone_assignments WHERE user_id = p_id;
  DELETE FROM fro_whatsapp_assignments WHERE fro_worker_id = p_id;
  DELETE FROM notification_log WHERE worker_id = p_id;
  DELETE FROM users WHERE id = p_id;
END;
$$;
