# Database Tunnel

A one-command SSH tunnel from a developer machine to the production RDS
instance, for networks that cannot reach the database directly.

## Why it exists

The database is an RDS Postgres instance in `ap-south-1`. Some networks
(office VPN egress, hosting providers, guest wifi) block its IP outright, and
the AWS security group is deliberately narrow. Both SSH to the production EC2
box and the AWS APIs still work from those networks, so the tunnel forwards a
local TCP port over SSH to the jump host, and the jump host dials RDS:

```
laptop 127.0.0.1:15432  --ssh-->  EC2 jump host  --tcp-->  RDS:5432
```

Nothing in AWS is changed by the tunnel. It only opens a local SSH connection.

> This is the supported alternative to `LOCAL_DB_ACCESS=true`, which
> temporarily adds the machine's public IP to the security group. The tunnel is
> preferred because it leaves no inbound rule behind. See
> [DATABASE-SECURITY.md](DATABASE-SECURITY.md) DB-005.

## One-time setup

1. **SSH key.** Either place the key at `key/ucs-backend.pem` in the repository
   (gitignored) or at `~/.ssh/ucs-backend.pem`. Override with `DB_TUNNEL_KEY`.

2. **Credentials.** Add these to `backend/.env` (gitignored — never to
   `.env.example` or any tracked file):

   ```dotenv
   DB_TUNNEL_PGUSER=...
   DB_TUNNEL_PGPASSWORD=...
   DB_TUNNEL_PGDATABASE=postgres
   ```

   These are deliberately **separate from `DATABASE_URL`**. `DATABASE_URL`
   normally points at a local Postgres on the LAN, and those credentials are
   rejected by RDS with `28P01 password authentication failed`. The tunnel
   resolves `DB_TUNNEL_*` first and only falls back to `DATABASE_URL` when they
   are absent (see `backend/scripts/lib/tunnel-creds.mjs`).

## Daily use

```bash
cd backend

# Tunnel + watchdog in the background, then print what to do next
npm run tunnel -- start

# In the shell you start the backend from:
node scripts/tunnel-db.mjs env     # prints $env:PG* lines, host rewritten to 127.0.0.1
# paste the output, then start the backend as usual

npm run tunnel:status              # is it up? is the watchdog alive?
npm run tunnel:stop                # close both
```

Or let it do everything in one step, with no secrets printed:

```bash
npm run tunnel -- backend   # start the tunnel if needed, then run the backend
npm run tunnel:ui           # browser panel with a "Start Local" button
```

Do **not** edit `DATABASE_URL` in `backend/.env` to point at the tunnel.
`db.js` prefers `DATABASE_URL` over the `PG*` variables, so a stale URL would
win and dial the blocked host. The `env` command handles this by clearing
`DATABASE_URL` for the session.

## What the watchdog does

`start` launches a detached watchdog process. If the SSH session dies — a Wi-Fi
roam, a VPN reconnect, the laptop waking from sleep — the watchdog restarts the
tunnel and logs it. This machine's network drops SSH several times an hour, and
without the watchdog the backend stays up while every query fails, which looks
like "the backend broke".

An explicit `stop` removes the "tunnel wanted" marker before killing anything,
so the watchdog can never resurrect a tunnel you closed on purpose.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `password authentication failed for user "postgres"` | credentials came from the LAN `DATABASE_URL` | set `DB_TUNNEL_PGUSER` / `DB_TUNNEL_PGPASSWORD` in `backend/.env` |
| `Connection reset` repeatedly | network dropping SSH, or port 22 blocked | `npm run tunnel:status`; the watchdog should recover. If it persists, the network blocks SSH — use a VPN |
| `Port 15432 on 127.0.0.1 is already in use` | a stale tunnel holds the port | `npm run tunnel:stop`, or set `DB_TUNNEL_LOCAL_PORT` |
| `SSH key not found` | key not at either expected path | set `DB_TUNNEL_KEY` to the `.pem` path |
| Tunnel up but queries time out | pool too small for the tunnel's latency | use `npm run tunnel -- backend`, which raises the pool for dev |

## Security

- The tunnel and the `ui` panel bind locally. The **panel** defaults to
  `0.0.0.0` so a phone on the same wifi can reach it; it is unauthenticated and
  the backend behind it speaks to the real database. Keep it to trusted
  networks, or set `DB_TUNNEL_UI_HOST=127.0.0.1`.
- `scripts/run-backend-tunnel.mjs` and `scripts/diag-notice-toggle.mjs`
  previously carried the RDS password inline. They now read `DB_TUNNEL_*` from
  `backend/.env`.
- That password is still in git history and **must be rotated** — rotation
  order is in [SECURITY.md](SECURITY.md) §7.
- `npm run security:check` fails on any credential in a tracked file. Rule
  `SN-12` exists specifically to catch `PGPASSWORD=`-style assignments, which
  the earlier rule could not match.
