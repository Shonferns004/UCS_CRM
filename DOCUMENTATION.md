# UCS CRM — Local Deployment & Operations Guide

This document explains the complete local (office/LAN) deployment of the UCS CRM,
how to operate it day-to-day, and — most importantly — **how to set it up on a
new/different PC in the future** (migration).

The system is designed to run **fully offline on the office LAN**, with the local
machine as the "master" data store, and to push backups + receive code updates
from the cloud automatically.

---

## 1. System Overview

- **Backend** : Node.js / Express — serves the API **and** the built frontend UI.
- **Frontend (UI)** : `ucs crm` (React + Vite) — pre-built into `ucs crm/dist/`,
  served by the backend, so **no separate frontend server is needed**.
- **Database** : PostgreSQL (local, on the same machine).
- **Media / files** : stored on a separate drive/folder, served by the backend.
- **Code source** : this Git repo, hosted on GitHub
  (`https://github.com/websevak50/UCS_CRM.git`).
- **Backup** : automated `pg_dump` + media sync to AWS S3 bucket `ucs-crm-backups`.

### Current machine (as documented)
- Hostname / LAN IP: `WIN-NBR90IUUKFA` / `192.168.1.60`
- OS: Windows Server 2022
- App URL on the LAN: **`http://192.168.1.60:5000`**

> **IP/hostname are machine-specific.** On a new PC these will change — update
> them everywhere they appear (see Migration, section 8).

---

## 2. Components & Where Things Live

| Component | Location | Notes |
|---|---|---|
| Backend source | `backend/` | Node/Express app |
| Backend main file | `backend/src/index.js` | The server; serves API + UI + media |
| Backend config | `backend/src/config/db.js` | DB pool, S3/storage, helpers |
| Frontend source | `ucs crm/` | React + Vite |
| Frontend build | `ucs crm/dist/` | **This is what gets served** (no dev server in prod) |
| Secondary panels | `database/`, `recruit-quizz/`, `whatsapp-crm/` | Auxiliary UIs (served if their `dist/` exists) |
| Local DB data | `C:\PostgreSQLData\` | The live PostgreSQL data directory |
| Media / uploads | `D:\UcsCrmMedia\` | All user-uploaded + mirrored media files |
| DB dump/backup repo | `database/dumps/` | Local SQL dumps |
| Logs | `database/logs/` | `ui-update.log`, `local-backup.log` |

---

## 3. The Only Command You Need to Run (start the app)

```powershell
cd "C:\Users\Administrator\Desktop\UCS-CRM\UCS_CRM\backend"
node src/index.js
```

Then open `http://192.168.1.60:5000` in any browser on the LAN.

**You do NOT need to run Postgres** (it is a Windows service that auto-starts) and
**you do NOT need to run Vite/npm dev** (the backend serves the built UI).

---

## 4. Prerequisites / What Must Be Installed (per machine)

| Software | Where | Required for |
|---|---|---|
| **Node.js** | `C:\Program Files\nodejs\` | Backend & frontend build |
| **PostgreSQL 17** | `C:\Program Files\PostgreSQL\17\` | Database server |
| **AWS CLI** | `C:\Program Files\Amazon\AWSCLIV2\` | Backups (media sync) |
| **pgAdmin 4** (optional) | bundled with PostgreSQL | GUI DB browsing |
| **Git** | `git` on PATH | Code updates |
| **GitHub credentials** | Windows Credential Manager | Silent auto-update pulls |

---

## 5. Configuration (`.env` files) — DO NOT commit secrets

`.env` files are **gitignored** and hold machine-specific + secret settings:

**`backend/.env` (key non-secret variables):**
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Local DB connection (`postgres://ucs_app:...@localhost:5432/postgres`) |
| `ADMIN_DATABASE_URL` | Local admin connection (`postgres://ucs_admin:...@localhost:5432/postgres`) |
| `DATABASE_SSL` | `false` for local |
| `MEDIA_PUBLIC_BASE` | Public base for media URLs (`http://192.168.1.60:5000`) |
| `LOCAL_MEDIA_DIR` | Media folder (`D:\UcsCrmMedia`) |
| `S3_BUCKET` | AWS bucket for original uploads (`ucs-crm-uploads-mumbai`) |
| `LOCAL_BACKUP_DATABASE_URL` | Superuser connection used for `pg_dump` backup |
| `LOCAL_BACKUP_MEDIA` | `true` = back up media too |
| `BACKUP_S3_BUCKET` | Backups bucket (`ucs-crm-backups`) |
| `LOCAL_BACKUP_S3_PREFIX` | S3 prefix under the bucket (`local-server`) |
| AWS keys, RDS, Firebase, WhatsApp, etc. | Secrets — present but for cloud features |

**`ucs crm/.env`:**
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base used by the frontend build (`http://192.168.1.60:5000/api`) |
| `VITE_SOCKET_URL` | Socket URL (`http://192.168.1.60:5000`) |

> **Important:** changing `ucs crm/.env` requires **rebuilding** the frontend
> (`npm run build` in `ucs crm/`) because the build bakes in these values.

---

## 6. How the App Reads/Writes Data (offline model)

- The backend at `192.168.1.60:5000` talks **only to the local PostgreSQL**.
- All worker/office activity through that URL is written **immediately to the
  local DB** — this is the **master** copy. Works with **no internet**.
- **Media uploads** are stored locally on disk first (`D:\UcsCrmMedia`), then
  mirrored to S3 when online. Uploads work even fully offline.
- **Cloud features that require internet degrade gracefully offline**: WhatsApp
  (Meta), Firebase push, Razorpay, Groq AI, IMAP, AWS, some legacy Supabase
  media URLs. Core CRM (DB + local media + receipts + attendance + workers)
  works offline.

> **Caveat:** this only covers users on the office LAN. Remote/mobile workers on
> mobile data use a separate cloud backend and are not covered here.

---

## 7. Automated Jobs (Windows Scheduled Tasks)

### 7a. Auto code update — task `UCS CRM Update`
- Polls GitHub every **1 minute** (the minimum repeat interval Windows Task
  Scheduler allows — up to ~1 min delay after a push).
- `git fetch origin` → if new commits on the branch: safe **fast-forward** pull →
  rebuild `ucs crm` → restart backend → health-check → log.
- Log: `database/logs/ui-update.log`
- Script: `backend/scripts/update/update.ps1` (+ `run-update.bat`)
- **Safety:** only ever fast-forwards. If incoming code conflicts with local edits
  to `backend/src/config/db.js` / `index.js`, it **skips and logs** "manual merge
  needed" rather than overwriting. `.env` files are gitignored → never touched.
- Runs as **"Interactive only"** (runs while a user is logged into the server).

### 7b. Daily backup to S3 — task `UCS CRM Local Backup`
- Runs **daily at 02:00**.
- `pg_dump` (custom format, as `postgres` superuser) → gzip → upload to
  `s3://ucs-crm-backups/local-server/<date>/...dump.gz`
- `aws s3 sync D:\UcsCrmMedia` → `s3://ucs-crm-backups/local-server/media/<date>/`
- Log: `database/logs/local-backup.log`
- Script: `backend/scripts/local-backup/local-backup.mjs` (+ `run-local-backup.bat`)
- Uses AWS CLI default profile (`ucs-crm-backup-admin` IAM user).

### 7c. Sync from AWS down to local — task `UCS CRM Sync-Down` (+ a button)
- **Two automatic runs daily (06:00 and 18:00)**, plus a **double-click button**:
  `backend/scripts/sync-down/run-sync-down.bat`.
- Pulls the **latest AWS production data** down to this local server:
  - **DB:** `pg_dump` from **AWS RDS** (`SYNC_DOWN_DATABASE_URL`) → takes a local
    pre-backup → stops backend → restores into local `postgres` → restarts backend.
  - **Media:** `aws s3 sync s3://ucs-crm-uploads-mumbai/` → `D:\UcsCrmMedia`
    (**incremental** — only new/changed files, never deletes local).
- Log: `database/logs/sync-down.log`
- Script: `backend/scripts/sync-down/sync-down.mjs` (+ `run-sync-down.bat`)

> **Whitelist warning:** the DB pull requires your **current office public IP** to be
> in the RDS security group (`sg-0947f3d87e6807617`, port 5432). The IP is **dynamic**
> and changes periodically; when it changes the DB step fails (media still works). The
> script logs the current public IP to make re-whitelisting easy. Only an AWS admin can
> update the security group. Line to add:
> `aws ec2 authorize-security-group-ingress --region ap-south-1 --group-id sg-0947f3d87e6807617 --ip-permissions 'IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=<YOUR_IP>/32,Description=office-offline-sync}]'`
> Related `.env` vars: `SYNC_DOWN_DATABASE_URL`, `SYNC_DOWN_LOCAL_DATABASE_URL`,
> `SYNC_DOWN_DB`, `SYNC_DOWN_MEDIA`.

### To view/manage tasks:
```powershell
schtasks /query /tn "UCS CRM Update"
schtasks /query /tn "UCS CRM Local Backup"
schtasks /query /tn "UCS CRM Sync-Down"
```

---

## 8. MIGRATION — Setting This Up on a Different PC in the Future

This is the critical section. Two scenarios:

### 8a. New PC (fresh setup, get latest code + empty/history DB)

1. **Install prerequisites** (section 4): Node.js, PostgreSQL 17, AWS CLI, Git.
2. **Clone the repo:**
   ```powershell
   cd C:\Users\Administrator\Desktop
   git clone https://github.com/websevak50/UCS_CRM.git
   cd UCS_CRM
   ```
3. **Restore/seed the database** (if you want production data from AWS RDS):
   - Add your machine's public IP to the RDS security group (if RDS still used),
     or restore from an existing backup dump in `database/dumps/`.
   - Create roles `ucs_app` and `ucs_admin` and restore the dump into the local
     `postgres` DB as the `postgres` superuser.
4. **Create config files** — copy `.env` templates (do NOT commit real secrets).
   - `backend/.env` and `ucs crm/.env` with the **new machine's** IP/URLs.
5. **Install dependencies:**
   ```powershell
   cd backend; npm install
   cd ..\ucs crm; npm install
   ```
6. **Create media folder** and populate `D:\UcsCrmMedia` (download from S3
   `ucs-crm-backups/local-server/media/` or the original `ucs-crm-uploads-mumbai`).
7. **Build the frontend:**
   ```powershell
   cd "ucs crm"; npm run build
   ```
8. **Start the app** (section 3) and verify at the new machine's IP.
9. **Set up the scheduled tasks** (section 7) — use the scripts provided and
   re-register the tasks with `schtasks`.
10. **Set `LOCAL_MEDIA_DIR`** and media firewall as in section 9.

### 8b. Replace this machine with another PC (move the existing setup)

Best practice: **back up first**, then restore on the new machine.

1. **On the OLD machine**, ensure the latest backup exists (run the backup task /
   script once): DB dump + media are in `s3://ucs-crm-backups/`.
2. **On the NEW machine**, install prerequisites, clone the repo (section 8a
   steps 1–2).
3. **DB:** create local Postgres, restore the latest dump from
   `s3://ucs-crm-backups/local-server/<latest>/...dump.gz`.
4. **Media:** download `s3://ucs-crm-backups/local-server/media/<latest>/` into
   `D:\UcsCrmMedia`.
5. **Config:** set `.env` values for the new machine's IP.
6. **Install deps + build + start** (sections 8a steps 5–8).
7. **Re-register scheduled tasks** on the new machine.
8. Optionally remove/replace the old machine.

### Key things that MUST change on a new PC
- `MEDIA_PUBLIC_BASE` in `backend/.env` → new machine's URL
- `VITE_API_URL` / `VITE_SOCKET_URL` in `ucs crm/.env` → new machine's URL
  (then **rebuild** the frontend)
- Windows Firewall rule for port `5000`
- Scheduled tasks (`UCS CRM Update`, `UCS CRM Local Backup`)
- AWS CLI default profile for backups (IAM creds)
- GitHub credential in Windows Credential Manager (for silent updates)

---

## 9. Networking / Firewall

- The app listens on `0.0.0.0:5000` (all interfaces) so LAN clients can reach it
  at the machine's IP.
- Windows Firewall must allow inbound **TCP 5000** (rule "UCS CRM Backend 5000").
- If remote clients need **direct DB** access, open **TCP 5432** as well
  (normally not needed — clients use the app, not the DB directly).

To verify the rule:
```powershell
Get-NetFirewallRule -DisplayName "*UCS CRM*" | Select-Object DisplayName,Enabled,Action
```

---

## 10. Browsing Data (pgAdmin)

1. Launch pgAdmin 4.
2. Register a server: Host `localhost`, Port `5432`, User `postgres`,
   Maintenance DB `postgres`.
3. Expand → Databases → `postgres` → Schemas → `public` → Tables.
4. Right-click a table → View/Edit Data → All Rows.

> Windows Server Manager is **not** a database tool; use pgAdmin for the DB and
> `services.msc` for the `postgresql-x64-17` service.

---

## 11. Common Operations & Troubleshooting

**Start server manually:**
```powershell
cd "C:\Users\Administrator\Desktop\UCS-CRM\UCS_CRM\backend"
node src/index.js
```

**Check server health:**
```powershell
Invoke-RestMethod http://192.168.1.60:5000/api/health
```
Returns `{"status":"ok","db":"ok","commit":"<hash>",...}`.

**Rebuild the UI manually (after pulling new code without the task):**
```powershell
cd "C:\Users\Administrator\Desktop\UCS-CRM\UCS_CRM\ucs crm"
npm run build
```
Then restart the backend.

**Port 5000 already in use (EADDRINUSE):** another backend is running — stop it:
```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen
# then Stop-Process -Id <OwningProcess> -Force
```

**Postgres not running:** start the service:
```powershell
Start-Service postgresql-x64-17
```

**UI shows old code after `git pull`:** you must **rebuild** the frontend and
**restart** the backend (a `git pull` alone does not change the served build).
The `UCS CRM Update` task does this automatically.

**Auto-update not deploying:** the task is "Interactive only" — it only runs
while someone is logged into the server. Keep a session open, or re-register the
task to run "whether user is logged on or not" (requires the admin password).
The poll interval is 1 minute; if you need truly instant deploys you'd have to
expose a port and use a GitHub webhook instead (see section 7a note).

**Security warning `ENV_ADMIN_KEY is not set`:** set `ENV_ADMIN_KEY` in
`backend/.env` to secure the env admin endpoint before going to production.

---

## 12. Cloud Account / AWS reference

- GitHub remote: `https://github.com/websevak50/UCS_CRM.git`
- AWS region: `ap-south-1`
- Original media bucket: `ucs-crm-uploads-mumbai`
- Backups bucket: `ucs-crm-backups` (versioning enabled)
- Backup S3 layout:
  - `local-server/<YYYY-MM-DD>/ucs-crm-db-<stamp>.dump.gz` (DB dumps)
  - `local-server/media/<YYYY-MM-DD>/...` (media mirror)
- Backup IAM user: `ucs-crm-backup-admin` (S3 + RDS read)

---

*Generated 2026-08-31. Keep this file updated when machine IPs, folders, or
credentials change.*
