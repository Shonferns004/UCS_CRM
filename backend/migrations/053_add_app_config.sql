CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_config (id, data)
VALUES (1, '{
  "api_base_url": "https://attendance-roan-zeta.vercel.app/api",
  "socket_url": "https://attendance-roan-zeta.vercel.app",
  "minimum_version": "1.0.0",
  "update_url": "",
  "announcement": null,
  "feature_flags": {},
  "ui_text": {}
}')
ON CONFLICT (id) DO NOTHING;
