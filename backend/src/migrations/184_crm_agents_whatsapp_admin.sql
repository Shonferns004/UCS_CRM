-- 184: WhatsApp-specific admin flag on CRM agents.
--
-- Phase D. Agent logins sign in through crm_agents and are issued a token whose
-- role is 'fro' (authController.js:178) -- indistinguishable from an ordinary FRO
-- login. That is why WhatsApp administration could not be granted by role
-- without also granting CRM administration: there is no WhatsApp-only role in
-- the CRM's role vocabulary.
--
-- So the permission is a separate boolean on the agent row rather than a role.
-- It grants access to the WhatsApp admin surface ONLY:
--     * WhatsApp account + agent assignment management
--     * Keyword automations and their settings
-- It confers nothing in any other panel. crm_agents rows are not consulted by
-- any CRM guard, so flipping this to true cannot reach /accounts, /sa, /hr or
-- any other module. An agent with this flag is still an ordinary FRO everywhere
-- else.
--
-- Additive: one nullable-then-defaulted column, no data change, no rewrite.
-- Existing 55 agents default to FALSE and are unaffected.
--
-- Rollback: ALTER TABLE crm_agents DROP COLUMN whatsapp_admin;

ALTER TABLE public.crm_agents
  ADD COLUMN IF NOT EXISTS whatsapp_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_agents.whatsapp_admin IS
  'WhatsApp admin panel access. Grants ONLY the WhatsApp admin surface '
  '(accounts, agent assignment, automations). Does NOT grant any CRM role.';

-- Read-side index is unnecessary at 55 rows and would only add write cost.