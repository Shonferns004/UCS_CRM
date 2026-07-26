-- Junction table linking FRO workers to WhatsApp CRM agents (many-to-many)
CREATE TABLE IF NOT EXISTS worker_agent_assignments (
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (worker_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_agent_assignments_worker ON worker_agent_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_agent_assignments_user ON worker_agent_assignments(user_id);

-- Get all agents linked to a worker with their WhatsApp accounts
CREATE OR REPLACE FUNCTION get_worker_agents(p_worker_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(agent_data)) INTO result FROM (
    SELECT
      u.id,
      u.email,
      u.name,
      u.role,
      (
        SELECT json_agg(json_build_object(
          'id', wa.id,
          'name', wa.name,
          'project', wa.project,
          'phone_number_id', wa.phone_number_id,
          'is_active', wa.is_active
        ))
        FROM agent_phone_assignments apa
        JOIN whatsapp_accounts wa ON wa.id = apa.account_id
        WHERE apa.user_id = u.id AND wa.is_active = true
      ) AS whatsapp_accounts
    FROM worker_agent_assignments waa
    JOIN users u ON u.id = waa.user_id
    WHERE waa.worker_id = p_worker_id AND u.is_active = true
    ORDER BY u.name
  ) agent_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Assign an agent to a worker
CREATE OR REPLACE FUNCTION assign_agent_to_worker(p_worker_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO worker_agent_assignments (worker_id, user_id)
  VALUES (p_worker_id, p_user_id)
  ON CONFLICT (worker_id, user_id) DO NOTHING;
END;
$$;

-- Unassign an agent from a worker
CREATE OR REPLACE FUNCTION unassign_agent_from_worker(p_worker_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM worker_agent_assignments
  WHERE worker_id = p_worker_id AND user_id = p_user_id;
END;
$$;

-- Search workers for assignment (by name, email, or phone)
CREATE OR REPLACE FUNCTION search_workers_for_agent(p_query TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(w)) INTO result FROM (
    SELECT id, name, email, phone
    FROM workers
    WHERE name ILIKE '%' || p_query || '%'
       OR email ILIKE '%' || p_query || '%'
       OR phone ILIKE '%' || p_query || '%'
    ORDER BY name
    LIMIT 20
  ) w;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
