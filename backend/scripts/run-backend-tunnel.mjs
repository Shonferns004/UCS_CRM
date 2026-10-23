// Runs the backend against the database through the SSH tunnel.
//
// This file used to hardcode the RDS credentials, which put a production
// password in a git-tracked file. The credentials now live in backend/.env
// (gitignored) as DB_TUNNEL_PGUSER / DB_TUNNEL_PGPASSWORD / DB_TUNNEL_PGDATABASE,
// read here through the same helper the tunnel script uses.
//
// The tunnel itself must already be up:
//   node scripts/tunnel-db.mjs start
//
// Note: the password previously committed here is still in the repository's
// history and must be rotated -- see docs/security/SECURITY.md §7.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';
import { resolveTunnelCredentials, describeCredentialProblem } from './lib/tunnel-creds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.join(__dirname, '..', '.env') });

const creds = resolveTunnelCredentials(process.env);
const problem = describeCredentialProblem(creds);
if (problem) {
  console.error(`[tunnel] ${problem}`);
  process.exit(1);
}

process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = process.env.DB_TUNNEL_LOCAL_PORT || '15432';
process.env.PGUSER = creds.user;
process.env.PGPASSWORD = creds.password;
process.env.PGDATABASE = creds.database;
process.env.PGSSLMODE = 'require';
process.env.DATABASE_URL = '';
process.env.DATABASE_SSL = 'false';
process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '15';
process.env.PG_IDLE_TIMEOUT_MS = process.env.PG_IDLE_TIMEOUT_MS || '300000';

await import('../src/index.js');
