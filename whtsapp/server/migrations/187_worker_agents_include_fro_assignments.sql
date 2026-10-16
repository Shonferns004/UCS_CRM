-- 187: get_worker_agents must honour fro_whatsapp_assignments.
--
-- The WhatsApp inbox an FRO sees is built by the auto-login path
-- (froWhatsAppAuthController -> get_worker_agents RPC). That function only read
-- worker_agent_assignments, whose primary key is (worker_id, user_id): exactly
-- ONE WhatsApp account per worker-user. fro_whatsapp_assignments -- the roster
-- the "WhatsApp Accounts" admin UI writes -- was never consulted, so an FRO
-- granted several numbers still opened a single inbox and every extra grant was
-- silently ignored.
--
-- This rewrites the function to emit one row per (agent user, account), where
-- the accounts are the union of the agent's own worker_agent_assignments row and
-- every ACTIVE fro_whatsapp_assignments grant for the worker. Duplicates (the
-- same account reachable through both tables) collapse via DISTINCT ON, so an
-- account never yields two sessions. The returned shape is unchanged, so the
-- auto-login controller needs no change.

CREATE OR REPLACE FUNCTION public.get_worker_agents(p_worker_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT DISTINCT ON (id, assigned_account_id)
      id,
      email,
      name,
      role,
      assigned_account_id,
      assigned_account_name,
      assigned_account_project,
      assigned_phone_number,
      whatsapp_accounts
    FROM (
      -- 1) The agent's own assigned account (original behaviour).
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

      UNION ALL

      -- 2) Every active fro_whatsapp_assignments grant for this worker, mapped
      --    onto the worker's WhatsApp agent user(s).
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        fwa.whatsapp_account_id AS assigned_account_id,
        wa.name AS assigned_account_name,
        wa.project AS assigned_account_project,
        wa.phone_number_id AS assigned_phone_number,
        NULL::json AS whatsapp_accounts
      FROM fro_whatsapp_assignments fwa
      JOIN worker_agent_assignments waa ON waa.worker_id = fwa.fro_worker_id
      JOIN users u ON u.id = waa.user_id AND u.is_active = true
      JOIN whatsapp_accounts wa ON wa.id = fwa.whatsapp_account_id
      WHERE fwa.fro_worker_id = p_worker_id
        AND COALESCE(fwa.is_active, true) = true
    ) src
    ORDER BY id, assigned_account_id
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;
