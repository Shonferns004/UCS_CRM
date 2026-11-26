# Deploying OpenWA on Render

Render runs a **stateless container**. Two settings make the gateway work there, and without both a
restart costs you every QR code:

| Setting | Why |
|---|---|
| `BAILEYS_AUTH_STORE=database` | creds + Signal keys live in Postgres instead of `./data/baileys` |
| `API_MASTER_KEY` | the admin API key is re-seeded from this env var on every boot |

Everything else on the disk is disposable: `./data/main.sqlite` (API keys, audit log), the plugin
registry, and media (which goes to S3/R2).

## 1. Database

Render's own free Postgres **expires 30 days after creation**, so use an external one:

- **Neon** free tier — 0.5 GB, autosuspends compute after ~5 min idle (wakes in ~500 ms)
- **Supabase** free — 500 MB, project pauses after 7 days of inactivity

Create a database, then set:

```
DATABASE_TYPE=postgres
DATABASE_HOST=<host>
DATABASE_PORT=5432
DATABASE_USERNAME=<user>
DATABASE_PASSWORD=<password>
DATABASE_NAME=<db>
DATABASE_SSL=true
POSTGRES_SCHEMA=openwa
```

Schema `openwa` must exist (`CREATE SCHEMA IF NOT EXISTS openwa;`). Migrations — including the
`baileys_auth_state` table — run automatically at boot on Postgres.

## 2. Media bucket

Create a Cloudflare R2 bucket (or any S3-compatible bucket) and set:

```
STORAGE_TYPE=s3
S3_BUCKET=ucs-openwa
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## 3. The service

Blueprint (recommended): push the repo, then **New → Blueprint** and point Render at `render.yaml`
in the repository root. It builds `openwa/Dockerfile` with `rootDir: openwa`.

Manual alternative: **New → Web Service → Docker**

| Field | Value |
|---|---|
| Root Directory | `openwa` |
| Dockerfile Path | `./Dockerfile` |
| Health Check Path | `/api/health` |
| Instance Type | Free (testing) / **Standard 2 GB** (real use) |

Do **not** set `PORT` yourself — Render injects it and the app already listens on `process.env.PORT`.
Do not attach a disk; the point is that none is needed.

## 4. Wire up the CRM backend

1. Copy `API_MASTER_KEY` into the CRM backend as `OPENWA_API_KEY`.
2. Set `OPENWA_URL=https://<service>.onrender.com` in `backend/.env`.
3. Set `BASE_URL` on Render to the same URL, then redeploy so QR/webhook links are absolute.

The API key is server-side only; the browser never sees it (the CRM proxies `/openwa/*`).

## What Render still limits

- **Free:** 512 MB / 0.1 CPU, spins down after 15 min, 750 instance-hours/month, restarts at any time,
  and may suspend a service that makes a lot of outbound calls. Sessions reconnect from Postgres on
  wake — no QR re-scan — but messages that arrived while asleep are only picked up by history sync.
- **Egress IP changes** with every restart; WhatsApp treats that as a new login. Expect occasional
  re-links on the free plan.
- **Audit log and any non-master API keys are ephemeral** on the free plan (SQLite is wiped). If you
  need the audit trail, attach a 1 GB disk at `/var/data` and set `MAIN_DATABASE_NAME=/var/data/main.sqlite`
  and `PLUGIN_STATE_DIR=/var/data`.
- **Cost:** free for testing; the realistic production plan (Standard, 2 GB) is ~$25/mo + bandwidth —
  several times a Hetzner CX22 (~€4) or the Oracle free tier.

## Verify after deploy

```bash
curl -s https://<service>.onrender.com/api/health
# → {"status":"ok", ...}

curl -s -H "X-API-Key: $API_MASTER_KEY" https://<service>.onrender.com/api/sessions
```

Then pair a number from the UCS CRM Accounts panel (it calls `/openwa/connect` and reads the QR), and
confirm the row landed in Postgres:

```sql
SELECT "sessionId", category, count(*) FROM openwa.baileys_auth_state GROUP BY 1, 2;
```
