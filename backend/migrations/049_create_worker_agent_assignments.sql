-- Junction table linking FRO workers to WhatsApp CRM agents (many-to-many)
CREATE TABLE IF NOT EXISTS worker_agent_assignments (
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
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
      waa.account_id AS assigned_account_id,
      wa.name AS assigned_account_name,
      wa.project AS assigned_account_project,
      wa.phone_number_id AS assigned_phone_number,
      (
        SELECT json_agg(json_build_object(
          'id', wa2.id,
          'name', wa2.name,
          'project', wa2.project,
          'phone_number_id', wa2.phone_number_id,
          'is_active', wa2.is_active
        ))
        FROM agent_phone_assignments apa2
        JOIN whatsapp_accounts wa2 ON wa2.id = apa2.account_id
        WHERE apa2.user_id = u.id AND wa2.is_active = true
      ) AS whatsapp_accounts
    FROM worker_agent_assignments waa
    JOIN users u ON u.id = waa.user_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = waa.account_id
    WHERE waa.worker_id = p_worker_id AND u.is_active = true
    ORDER BY u.name
  ) agent_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Get all workers assigned to a specific agent
CREATE OR REPLACE FUNCTION get_agent_workers(p_agent_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(worker_data)) INTO result FROM (
    SELECT
      w.id,
      w.name,
      w.email,
      w.phone,
      waa.account_id AS assigned_account_id,
      wa.name AS assigned_account_name,
      wa.project AS assigned_account_project,
      wa.phone_number_id AS assigned_phone_number
    FROM worker_agent_assignments waa
    JOIN workers w ON w.id = waa.worker_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = waa.account_id
    WHERE waa.user_id = p_agent_id
    ORDER BY w.name
  ) worker_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Assign an agent to a worker with optional account selection
CREATE OR REPLACE FUNCTION assign_agent_to_worker(p_worker_id UUID, p_agent_id UUID, p_account_id INTEGER DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO worker_agent_assignments (worker_id, user_id, account_id)
  VALUES (p_worker_id, p_agent_id, p_account_id)
  ON CONFLICT (worker_id, user_id) DO UPDATE SET account_id = EXCLUDED.account_id;
END;
$$;

-- Unassign an agent from a worker
CREATE OR REPLACE FUNCTION unassign_agent_from_worker(p_worker_id UUID, p_agent_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM worker_agent_assignments
  WHERE worker_id = p_worker_id AND user_id = p_agent_id;
END;
$$;

-- Search workers not yet assigned to a given agent
CREATE OR REPLACE FUNCTION search_workers_for_agent(p_agent_id UUID, p_search TEXT)
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
    WHERE (name ILIKE '%' || p_search || '%'
        OR email ILIKE '%' || p_search || '%'
        OR phone ILIKE '%' || p_search || '%')
      AND id NOT IN (
        SELECT worker_id FROM worker_agent_assignments WHERE user_id = p_agent_id
      )
    ORDER BY name
    LIMIT 20
  ) w;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
