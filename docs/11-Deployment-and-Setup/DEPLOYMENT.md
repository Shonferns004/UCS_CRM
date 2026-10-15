# UCS CRM — Deployment Runbook

> **Document ID:** 11-Deployment-and-Setup/DEPLOYMENT
> **Status:** Partially verified — derived from `infra/`, `.github/workflows/`, `scripts/`. Operations against live servers are the team's responsibility.
> **Generated:** 2026-10-13

## 1. Production (EC2 `13.207.47.116` · Caddy · PM2)

Deployment is automated by GitHub Actions but summarized here:

1. Backend: workflow `deploy.yml` connects via SSH to `ec2-user@13.207.47.116`, runs `git reset --hard origin/master`, `npm ci`, `pm2 startOrRestart ecosystem.config.cjs`, then polls `https://api.beingsevak.org/api/health`. Failure → automatic rollback.
2. Frontend: workflow `deploy-frontend.yml` builds `client/` and uploads `client/dist/*` to `/var/www/crm` served by the same host; build fails if the removed chat mock reappears.

PM2 ecosystem file: `backend/ecosystem.config.cjs`.

## 2. HEAD / Dev (EC2 `52.66.211.205` · nginx · PM2)

Manual sync via `scripts/sync-head.ps1` (PowerShell):

```powershell
.\scripts\sync-head.ps1 -Backend -Frontend   # uploads backend + rebuilt client dist
.\scripts\sync-head.ps1 -Backend -SkipBuild  # backend only, skip client build
```

- Backend extracted to `/opt/ucs-crm/backend`, `sudo npm install --omit=dev`, `pm2 restart ucs-backend`, health check with PM2 error log dump on failure.
- Frontend dist to `/var/www/ucs-crm`, `nginx -s reload`.
- Script never touches production or git remotes. (`infra/README.md` notes it matches HEAD's nginx, not prod Caddy.)

## 3. Static PWAs → Vercel

Workflow `deploy-vercel.yml` (manual, path-filtered): `others/client-web`, `others/hr form`, `others/submitted form`.

## 4. Sevak Library → Vercel + Supabase

`others/sevak-library/DEPLOY.md` covers the web app and Supabase functions/migrations.

## 5. Database Migrations & Backups

- Schema is enforced at boot by `backend/src/bootstrap/ensure*.js` (no single migration chain).
- SQL migrations: `backend/migrations/`, `backend/src/migrations/` — apply in filename order.
- Monthly AWS Backup restore test workflow: `backup-restore-test.yml`. Backup/recovery details: `others/imp files/docs/BACKUP_DISASTER_RECOVERY.md`.

## 6. Rollback

- Backend: redeploy previous commit (workflow auto-rollback on health-check failure; `git reset --hard` + `pm2 startOrRestart`).
- HEAD: rerun `sync-head.ps1` with the previous build; `sudo npm install` artifacts can be pinned via package-lock.

## 7. Operational Checklist

- [ ] Health endpoint returns 200: `/api/health`
- [ ] Cron endpoints 401 without `CRON_API_KEY`
- [ ] Caddy validate before reload (prod), `nginx -t` (HEAD)
- [ ] Backups running on schedule (`BACKUP_SCHEDULE`)
- [ ] Security headers present at edge (see `docs/security/HARDENING-CHECKLIST.md`)