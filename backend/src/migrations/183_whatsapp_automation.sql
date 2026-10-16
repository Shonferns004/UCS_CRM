-- 183: WhatsApp keyword automations.
--
-- Ports the standalone app's automation engine onto the CRM's own conversation
-- model. It decides ONLY whether an automatic customer reply is sent; it adds no
-- agent-assignment behaviour, so conversations keep their existing manual
-- assignment and ownership rules untouched.
--
-- Adaptations from the source (whtsapp/backend/src/db/automation.schema.sql),
-- forced by the CRM schema:
--   * conversations/messages/contacts ids are UUID here, not INTEGER.
--   * There is no `tags` catalogue yet, so the optional tag-on-fire column is
--     left out entirely rather than pointing at a table that does not exist.
--   * There is no `staff` table, so created_by is free TEXT.
--   * Isolation follows the CRM convention -- a project text column carrying
--     bsct / aflf / mann / ucs -- not the standalone's single-tenant layout.
--
-- SAFETY: `whatsapp_automation_settings.enabled` defaults to FALSE and the inbound
-- webhook consults it before anything else. With the default in place this module
-- cannot send a message on its own. Turning it on is a deliberate admin action.
--
-- Additive only: no ALTER, DROP or TRUNCATE on any existing table. Every
-- statement is IF NOT EXISTS so the file is safely re-runnable, matching the
-- hand-applied migration convention in this deployment (no runner, no ledger).

-- Single global toggle row. enabled defaults FALSE: automations are OFF on deploy.
CREATE TABLE IF NOT EXISTS whatsapp_automation_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keyword rules. Matching is always case-insensitive; match_type adds the
-- optional exact / prefix / suffix / whole-word behaviour.
CREATE TABLE IF NOT EXISTS whatsapp_automation_rules (
  id                SERIAL PRIMARY KEY,
  project           TEXT,
  name              TEXT NOT NULL,
  keyword           TEXT NOT NULL,
  match_type        TEXT NOT NULL DEFAULT 'contains'
                      CHECK (match_type IN ('contains','exact','starts_with','ends_with','whole_word')),
  reply_text        TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Higher priority wins; id breaks ties so evaluation order is deterministic.
  priority          INTEGER NOT NULL DEFAULT 0,
  -- Per-conversation cooldown. 0 means no cooldown.
  cooldown_seconds  INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0),
  -- Optional approved template, used only when the 24h window is closed.
  -- Free-form text is never sent outside that window.
  template_name       TEXT,
  template_language   TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_automation_rules_name_key
  ON whatsapp_automation_rules (LOWER(name));

CREATE INDEX IF NOT EXISTS whatsapp_automation_rules_enabled_idx
  ON whatsapp_automation_rules (enabled, priority DESC, id);

CREATE INDEX IF NOT EXISTS whatsapp_automation_rules_project_idx
  ON whatsapp_automation_rules (project);

-- Per (conversation, rule) cooldown lock. The composite primary key makes a
-- concurrent webhook burst race for exactly one claim, so a customer cannot
-- receive two copies of the same rule's reply.
CREATE TABLE IF NOT EXISTS whatsapp_automation_rule_state (
  conversation_id  UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  rule_id          INTEGER NOT NULL REFERENCES whatsapp_automation_rules (id) ON DELETE CASCADE,
  last_sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, rule_id)
);

-- Append-only audit. `detail` carries human-readable context and safe error
-- messages only -- never access tokens, app secrets or credentials.
CREATE TABLE IF NOT EXISTS whatsapp_automation_logs (
  id                  BIGSERIAL PRIMARY KEY,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action              TEXT NOT NULL CHECK (action IN ('keyword_reply')),
  result              TEXT NOT NULL
                        CHECK (result IN ('processing','sent','failed','skipped','blocked')),
  project             TEXT,
  conversation_id     UUID REFERENCES public.conversations (id) ON DELETE SET NULL,
  contact_id          UUID REFERENCES public.contacts (id) ON DELETE SET NULL,
  trigger_message_id  UUID REFERENCES public.messages (id) ON DELETE SET NULL,
  message_id          UUID REFERENCES public.messages (id) ON DELETE SET NULL,
  rule_id             INTEGER REFERENCES whatsapp_automation_rules (id) ON DELETE SET NULL,
  rule_name           TEXT,
  detail              TEXT,
  wa_message_id       TEXT
);

CREATE INDEX IF NOT EXISTS whatsapp_automation_logs_created_idx
  ON whatsapp_automation_logs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS whatsapp_automation_logs_rule_idx
  ON whatsapp_automation_logs (rule_id, created_at DESC);

-- Duplicate-webhook backstop: at most one keyword reply per (inbound message,
-- rule). A Meta redelivery therefore cannot send a second automatic reply.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_automation_logs_keyword_once
  ON whatsapp_automation_logs (trigger_message_id, rule_id)
  WHERE action = 'keyword_reply' AND trigger_message_id IS NOT NULL;

-- The single toggle row the webhook reads. Inserted here so the feature has a
-- definite OFF state from the moment the tables exist.
INSERT INTO whatsapp_automation_settings (id, enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;