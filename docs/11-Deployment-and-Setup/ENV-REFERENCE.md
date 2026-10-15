# UCS CRM — Environment Variable Reference (Names & Descriptions)

> **Document ID:** 11-Deployment-and-Setup/ENV-REFERENCE
> **Status:** Verified from `.env.example` files. **Values are never recorded.**
> **Generated:** 2026-10-13
> **Sources:** `backend/.env.example`, `client/.env.example`, code references (`CRON_API_KEY`, `ENV_ADMIN_KEY`, `VERCEL`)

## Backend

| Variable | Purpose (from `.env.example` sections/comments) |
| --- | --- |
| `JWT_SECRET` | Secret used to sign/verify JWTs. |
| `PORT` | HTTP port the API listens on (example uses 5000). |
| `WHATSAPP_MASTER_EMAIL` / `WHATSAPP_MASTER_PASSWORD` | WhatsApp CRM master login credentials. |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_API_VERSION` / `WHATSAPP_WABA_ID` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_TEMPLATE_NAME` | WhatsApp Cloud API configuration. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed admin credentials. |
| `BACKUP_SCHEDULE` / `BACKUP_RETENTION_DAYS` / `BACKUP_MONTHLY_RETENTION_DAYS` | Postgres/AWS Backup scheduling & retention policy. |
| `BACKUP_S3_BUCKET` / `BACKUP_S3_PREFIX` | Backup storage location. |
| `RDS_INSTANCE_IDENTIFIER` / `AWS_REGION` | RDS backup target. |
| `LOCAL_DB_ACCESS` / `LOCAL_DB_ACCESS_RULE_TTL_HOURS` | Developer DB access gating (see `middleware/localDbAccess.js`). |
| `HEAD_AWS_ACCESS_KEY_ID` / `HEAD_AWS_SECRET_ACCESS_KEY` / `HEAD_S3_BUCKET` / `HEAD_S3_REGION` | HEAD-environment S3 access (dual-S3 setup). |
| `UPSTREAM_AWS_ACCESS_KEY_ID` / `UPSTREAM_AWS_SECRET_ACCESS_KEY` / `UPSTREAM_S3_BUCKET` / `UPSTREAM_S3_REGION` | Upstream production S3 access. |
| `SEVAK_SUPABASE_URL` / `SEVAK_SUPABASE_SERVICE_ROLE_KEY` | Sevak Library Supabase backend credentials. |

Additional names referenced in code (Verified):

| Variable | Purpose |
| --- | --- |
| `CRON_API_KEY` | Protects `/api/cron/*` endpoints. |
| `ENV_ADMIN_KEY` | Admin key used by `requireAdminKey` middleware (env-admin/dev surfaces). |
| `VERCEL` | When set, app skips `app.listen`/Socket.IO (serverless mode). |
| Database connection name(s) | Consumed by `src/config/db.js` (Supabase URL/service key; exact name in the config file). |
| AI provider names | Groq/Gemini/OCR keys referenced by config modules — exact names live in `src/config/groq.js`, `src/utils/geminiClient.js`, email config, payments config, Firebase config, Google Sheets service. Check each config file for the precise variable name before provisioning. |

> **Security note:** `VITE_`-prefixed variables are inlined into the public JS bundle. Never place secrets there. See `docs/security/SECRETS-MANAGEMENT.md`.

## Client

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL for the API (defaults used in `lib/apiBase.js`). |
| `VITE_SOCKET_URL` | Socket.IO server URL (falls back to API base minus `/api`). |

## Provisioning checklist

1. Copy `backend/.env.example` → `backend/.env` and fill required keys only.
2. Supply `JWT_SECRET`, database credentials, `CRON_API_KEY`, AI/WhatsApp/payment keys as needed.
3. Never commit `.env`; `.gitignore` already excludes it.