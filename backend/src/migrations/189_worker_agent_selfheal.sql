-- 189: self-heal the worker -> agent user link for FRO WhatsApp grants.
--
-- get_worker_agents (188) maps each active fro_whatsapp_assignments grant onto
-- an agent `users` row, resolving that user from worker_agent_assignments first
-- and only then from an email match. Any worker whose email never matched an
-- agent user -- a typo ("...@gmail,com"), a placeholder ("...@example.com"), or
-- no agent account at all -- resolved to nothing, so the FRO panel stayed empty
-- even though the Accounts panel (which reads fro_whatsapp_assignments directly)
-- showed the grant.
--
-- ensure_worker_agents() removes the email dependency: for any worker holding at
-- least one active grant it guarantees an agent `users` row exists (reusing an
-- email match, then an unambiguous same-name unclaimed agent, else creating one)
-- and persists the worker_agent_assignments mapping. get_worker_agents() calls it
-- first, so the mapping heals on every panel load instead of depending on email
-- coincidence. Idempotent and safe to run repeatedly.

DROP FUNCTION IF EXISTS public.ensure_worker_agents(uuid);

CREATE OR REPLACE FUNCTION public.ensure_worker_agents(p_worker_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_worker    public.workers%ROWTYPE;
  v_user_id   uuid;
  v_email     text;
  v_name_hits integer;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id;
  IF NOT FOUND THEN
    RETURN '{}'::json;
  END IF;

  -- Only workers who actually hold a WhatsApp number need an agent identity.
  IF NOT EXISTS (
    SELECT 1 FROM public.fro_whatsapp_assignments
    WHERE fro_worker_id = p_worker_id AND COALESCE(is_active, true)
  ) THEN
    RETURN '{}'::json;
  END IF;

  -- 1) an existing mapping wins.
  SELECT user_id INTO v_user_id
  FROM public.worker_agent_assignments
  WHERE worker_id = p_worker_id
  ORDER BY user_id
  LIMIT 1;

  -- 2) otherwise the agent user whose email matches the worker's.
  IF v_user_id IS NULL AND NULLIF(trim(v_worker.email), '') IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE lower(email) = lower(trim(v_worker.email))
    ORDER BY is_active DESC, created_at
    LIMIT 1;
  END IF;

  -- 3) otherwise reuse an unclaimed agent user with the same name, only when it
  --    is unambiguous (exactly one candidate) so identities are never mis-merged.
  IF v_user_id IS NULL THEN
    SELECT count(*) INTO v_name_hits
    FROM public.users u
    WHERE u.role = 'agent'
      AND lower(u.name) = lower(v_worker.name)
      AND NOT EXISTS (
        SELECT 1 FROM public.worker_agent_assignments w2 WHERE w2.user_id = u.id
      );

    IF v_name_hits = 1 THEN
      SELECT u.id INTO v_user_id
      FROM public.users u
      WHERE u.role = 'agent'
        AND lower(u.name) = lower(v_worker.name)
        AND NOT EXISTS (
          SELECT 1 FROM public.worker_agent_assignments w2 WHERE w2.user_id = u.id
        )
      LIMIT 1;
    END IF;
  END IF;

  -- 4) otherwise create a fresh agent login for this worker.
  IF v_user_id IS NULL THEN
    v_email := COALESCE(NULLIF(trim(v_worker.email), ''), p_worker_id::text || '@fro.local');

    SELECT id INTO v_user_id FROM public.users WHERE lower(email) = lower(v_email) LIMIT 1;

    IF v_user_id IS NULL THEN
      INSERT INTO public.users (name, email, password_hash, role, is_active)
      VALUES (
        COALESCE(NULLIF(trim(v_worker.name), ''), v_email),
        v_email,
        crypt(gen_random_uuid()::text, gen_salt('bf')),
        'agent',
        true
      )
      ON CONFLICT (email) DO NOTHING;

      SELECT id INTO v_user_id FROM public.users WHERE lower(email) = lower(v_email) LIMIT 1;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN '{}'::json;
  END IF;

  -- Persist the mapping for every active grant. worker_agent_assignments is keyed
  -- (worker_id, user_id) and carries a single account_id, so keep the lowest
  -- account id; get_worker_agents still reads the grants themselves for the
  -- per-account rows.
  INSERT INTO public.worker_agent_assignments (worker_id, user_id, account_id)
  SELECT p_worker_id, v_user_id, min(fwa.whatsapp_account_id)
  FROM public.fro_whatsapp_assignments fwa
  WHERE fwa.fro_worker_id = p_worker_id AND COALESCE(fwa.is_active, true)
  ON CONFLICT (worker_id, user_id)
  DO UPDATE SET account_id = EXCLUDED.account_id;

  RETURN json_build_object('user_id', v_user_id);
END;
$function$;

-- get_worker_agents now self-heals before it reads (body unchanged from 188).
CREATE OR REPLACE FUNCTION public.get_worker_agents(p_worker_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  PERFORM public.ensure_worker_agents(p_worker_id);

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

-- Backfill now so existing panels light up without waiting for a panel load.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT fro_worker_id
    FROM public.fro_whatsapp_assignments
    WHERE COALESCE(is_active, true)
  LOOP
    PERFORM public.ensure_worker_agents(r.fro_worker_id);
  END LOOP;
END $$;
