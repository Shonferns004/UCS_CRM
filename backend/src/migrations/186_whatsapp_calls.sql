-- WhatsApp calling: outbound/inbound call records with their WebRTC signalling
-- state, so the inbox can offer the call button, run the call overlay, and keep
-- a per-contact history.
--
-- provider_call_id is unique because Meta redelivers webhook events; the unique
-- index makes an insert of a duplicate fail loudly instead of creating a second
-- row for one real call.
--
-- Rollback:
--   DROP TABLE IF EXISTS whatsapp_calls;

CREATE TABLE IF NOT EXISTS whatsapp_calls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  project           text,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id        uuid REFERENCES contacts(id) ON DELETE SET NULL,
  contact_wa_id     text,
  phone_number_id   text,
  provider          text NOT NULL DEFAULT 'meta',
  provider_call_id  text,
  client_ref        uuid,
  direction         text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','ringing','offered','accepted','connected',
                                        'rejected','terminated','failed','missed','expired')),
  sdp_offer         text,
  sdp_answer        text,
  agent_id          uuid,
  agent_label       text,
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer,
  end_reason        text,
  failure_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_calls_provider_call_id_key
  ON whatsapp_calls (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_calls_client_ref_idx
  ON whatsapp_calls (client_ref);

CREATE INDEX IF NOT EXISTS whatsapp_calls_conversation_idx
  ON whatsapp_calls (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_calls_contact_idx
  ON whatsapp_calls (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_calls_agent_idx
  ON whatsapp_calls (agent_id, created_at DESC);

-- Lets the inbox ask "is anything ringing right now?" without scanning history.
CREATE INDEX IF NOT EXISTS whatsapp_calls_active_idx
  ON whatsapp_calls (project, status)
  WHERE status IN ('queued','ringing','offered','accepted','connected');

COMMENT ON TABLE whatsapp_calls IS
  'WhatsApp call history and live signalling state for the FRO inbox';
COMMENT ON COLUMN whatsapp_calls.client_ref IS
  'Our id echoed back by Meta as biz_opaque_callback_data, so events survive a retry';
COMMENT ON COLUMN whatsapp_calls.provider_call_id IS
  'Meta call id; unique because Meta redelivers webhook events';
