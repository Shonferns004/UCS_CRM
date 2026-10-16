-- 188: FRO WhatsApp grants must resolve the worker's agent identity.
--
-- get_worker_agents (187) unions fro_whatsapp_assignments -- the roster the
-- "WhatsApp Accounts" admin UI writes -- but arm 2 joined it to
-- worker_agent_assignments to find the agent `users` row. That join is empty
-- for any FRO who was granted a number without also having a
-- worker_agent_assignments row, which is every grant the admin UI creates: the
-- UI only writes fro_whatsapp_assignments. The result was "No WhatsApp agents
-- assigned" for grants that clearly exist (58 of 62 live grants at the time).
--
-- Two changes:
--   1. backfill worker_agent_assignments for those existing grants so the
--      mapping is persisted (arm 1 and the rest of the schema stay consistent);
--   2. fall back to the agent `users` row whose email matches the worker's, so a
--      grant resolves even without an explicit mapping row.
--
-- Matching by email is safe: create_agent (the only writer of agent `users`
-- rows) is fed the FRO's own email, and lower(email) is how the two identities
-- already correspond for the clear majority of the grants.

-- 1) Backfill one mapping row per (worker, agent user) for active grants.
INSERT INTO public.worker_agent_assignments (worker_id, user_id, account_id)
SELECT DISTINCT ON (fwa.fro_worker_id)
       fwa.fro_worker_id, u.id, fwa.whatsapp_account_id
FROM public.fro_whatsapp_assignments fwa
JOIN public.workers w ON w.id = fwa.fro_worker_id
JOIN public.users  u ON lower(u.email) = lower(w.email) AND u.is_active
WHERE COALESCE(fwa.is_active, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.worker_agent_assignments waa
    WHERE waa.worker_id = fwa.fro_worker_id
  )
ORDER BY fwa.fro_worker_id, fwa.whatsapp_account_id
ON CONFLICT (worker_id, user_id) DO NOTHING;

-- 2) Rewrite get_worker_agents: arm 2 resolves the agent user from
--    worker_agent_assignments, falling back to an email match.
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

      -- 2) Every active fro_whatsapp_assignments grant, mapped onto the worker's
      --    agent user: the explicit worker_agent_assignments row first, else the
      --    active users row whose email matches the worker's.
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
      JOIN workers w ON w.id = fwa.fro_worker_id
      JOIN whatsapp_accounts wa ON wa.id = fwa.whatsapp_account_id
      JOIN LATERAL (
        SELECT uu.id, uu.email, uu.name, uu.role
        FROM (
          SELECT uu2.id, uu2.email, uu2.name, uu2.role
          FROM worker_agent_assignments waa2
          JOIN users uu2 ON uu2.id = waa2.user_id
          WHERE waa2.worker_id = fwa.fro_worker_id AND uu2.is_active = true
          UNION ALL
          SELECT uu3.id, uu3.email, uu3.name, uu3.role
          FROM users uu3
          WHERE lower(uu3.email) = lower(w.email) AND uu3.is_active = true
        ) uu
        LIMIT 1
      ) u ON true
      WHERE fwa.fro_worker_id = p_worker_id
        AND COALESCE(fwa.is_active, true) = true
    ) src
    ORDER BY id, assigned_account_id
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;
