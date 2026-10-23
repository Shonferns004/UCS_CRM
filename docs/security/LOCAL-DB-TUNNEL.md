# Local Database Tunnel

Reach the **office** Postgres (`ucs_crm`) from any network, without opening a port
on the office router and without putting the database on the internet.

## The shape of it

```
office box                 EC2 jump host                  laptop / phone
127.0.0.1:5432  --ssh -R--> 127.0.0.1:15433  <--ssh -L--  127.0.0.1:15435
```

The office box dials **out** to EC2, so it keeps working behind NAT and across a
changing public IP. EC2 binds the forwarded port to `127.0.0.1` only, so the
database is never on a public interface — the EC2 host is the only thing that can
reach it, and only by SSH.

This is different from [DATABASE-TUNNEL.md](DATABASE-TUNNEL.md), which goes the
other way: from the laptop to the production RDS instance. Both can run at the
same time; they use different ports (`15432` vs `15435`).

## Why not just forward the port on the router

Because it would put Postgres on the internet. Even with a password, that is
scanned continuously and one weak credential or one `pg_hba` mistake is a full
data breach. The tunnel gives you the same convenience with no inbound rule and
no public listener.

## Setup

### 1. On the office box (192.168.1.152) — once

```bat
cd C:\Users\Administrator\Desktop\UCS_CRM\backend
npm run db:expose
```

Leave the window open. To have it come back automatically after a reboot, put a
shortcut to `backend\start-office-db-tunnel.bat` in
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.

It needs: Node, the SSH key at `~/.ssh/ucs-backend.pem` (or `key\ucs-backend.pem`,
gitignored), and outbound SSH to the jump host.

### 2. On your laptop — whenever you need it

```bash
cd backend
npm run db:connect      # opens 127.0.0.1:15435 and prints the connection details
```

Then point any client at it:

```bash
psql -h 127.0.0.1 -p 15435 -U postgres -d ucs_crm
```

```bash
npm run db:status       # is it up?
npm run db:disconnect   # close it
```

The password is the one already in `backend/.env`; the script reads the user and
database name from `DATABASE_URL` and never prints the password.

## Configuration

All optional, set in `backend/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOCAL_DB_HOST` | `127.0.0.1` | where Postgres listens **on the office box** |
| `LOCAL_DB_PORT` | `5432` | its port |
| `OFFICE_DB_REMOTE_PORT` | `15433` | port claimed on the EC2 loopback |
| `OFFICE_DB_LOCAL_PORT` | `15435` | port the laptop listens on |
| `DB_TUNNEL_JUMP_HOST` | `ec2-user@13.207.47.116` | the jump host |
| `DB_TUNNEL_KEY` | `~/.ssh/ucs-backend.pem` | SSH key |

## No Postgres changes needed

The connection reaches the office box from `127.0.0.1`, which every default
`pg_hba.conf` already allows:

```
host    all    all    127.0.0.1/32    scram-sha-256
```

Nothing has to be added to `pg_hba.conf`, and `listen_addresses` does not have to
change. This is the main reason this design is preferred over a mesh VPN: a
Tailscale address such as `100.x.y.z` is **not** in `pg_hba.conf` by default, so
that route needs an extra line plus a reload.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Could not open the tunnel` | the office box is not exposing, or is offline | on the office box run `npm run db:expose` |
| `remote port forwarding failed for listen port 15433` | a stale reverse tunnel still holds the port on EC2 | wait a few minutes, or set `OFFICE_DB_REMOTE_PORT` to another value on **both** sides |
| `Permission denied (publickey)` | wrong key, or the repo copy has world-readable ACLs | use `~/.ssh/ucs-backend.pem`; Windows rejects the repo copy |
| `password authentication failed` | the password in `backend/.env` belongs to a different instance | set `LOCAL_DB_HOST` / `LOCAL_DB_PORT` to the instance that holds `ucs_crm` |
| Tunnel drops every few minutes | flaky office uplink | `expose` reconnects on its own with backoff; check the window for the reason |

## Security

- The database stays bound to the office box. EC2 only ever holds a **loopback**
  forward, so `ss -ltn` on EC2 shows `127.0.0.1:15433`, never `0.0.0.0`.
- Access is gated by the SSH key. Use a dedicated key for this, not the shared
  `ucs-backend.pem`, if more than one person will hold it.
- Anyone with the key and EC2 login gets the database. Treat the key as a
  database credential and rotate it with the rest (see
  [SECURITY.md](SECURITY.md) §7).
- This is a developer access path, not an application integration. Do not point a
  deployed backend at it — deploy the backend next to the database instead.
