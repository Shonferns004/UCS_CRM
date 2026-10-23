// Resolves the database credentials the SSH tunnel should use.
//
// Why this is separate from tunnel-db.mjs: the two jobs have different sources.
// The tunnel dials AWS RDS, but a developer's DATABASE_URL usually points at a
// *local* Postgres on the LAN (e.g. postgres://postgres:...@192.168.1.152/ucs_crm)
// because that is what the app runs against on the office network. Copying
// those credentials into the tunnel therefore authenticates as the wrong user
// and RDS rejects it with 28P01 "password authentication failed".
//
// So the tunnel reads its own credentials first:
//
//   DB_TUNNEL_PGUSER      e.g. ucs_admin
//   DB_TUNNEL_PGPASSWORD  the RDS password
//   DB_TUNNEL_PGDATABASE  e.g. postgres
//
// and only falls back to DATABASE_URL when they are absent, which keeps the
// script working for people whose DATABASE_URL does point at RDS. The
// explicit variables live in backend/.env, which is gitignored.
//
// No credential is ever written into a tracked file. Keep it that way: this
// repository's own security-check scans tracked files for secrets, and the
// point of the tunnel is to reach the production database, so a leaked
// password here is a production incident.
//
// Pure and side-effect free on purpose -- this module is imported by the test
// suite without starting a tunnel.

/**
 * @param {object} env  the environment to read from (defaults to process.env)
 * @returns {{user: string|null, password: string|null, database: string, source: string}}
 */
export function resolveTunnelCredentials(env = process.env) {
  const fromUrl = readUrlCredentials(env.DATABASE_URL);

  // An explicitly-set variable always wins. An empty string counts as unset:
  // an empty password never authenticates against RDS, and treating it as
  // "set" would silently produce a broken tunnel instead of a clear error.
  const user = env.DB_TUNNEL_PGUSER || fromUrl.user || null;
  const password = env.DB_TUNNEL_PGPASSWORD || fromUrl.password || null;
  const database = env.DB_TUNNEL_PGDATABASE || fromUrl.database || 'postgres';

  let source = 'none';
  if (env.DB_TUNNEL_PGUSER || env.DB_TUNNEL_PGPASSWORD) source = 'explicit';
  else if (fromUrl.user) source = 'database_url';

  return { user, password, database, source };
}

// Parses DATABASE_URL without throwing on a malformed value, and without
// decoding anything twice.
function readUrlCredentials(connectionString) {
  const empty = { user: null, password: null, database: null };
  if (!connectionString) return empty;
  try {
    const u = new URL(String(connectionString).replace(/^postgres:\/\//, 'postgres://'));
    return {
      user: decodeURIComponent(u.username || '') || null,
      password: decodeURIComponent(u.password || '') || null,
      database: u.pathname.replace(/^\//, '') || null,
    };
  } catch {
    return empty;
  }
}

// True when the credentials look usable. Used to fail loudly with a message
// that names the missing variable, instead of letting Postgres answer with a
// generic "password authentication failed" that looks like a network problem.
export function describeCredentialProblem(creds) {
  if (!creds.user) {
    return 'No database user for the tunnel. Set DB_TUNNEL_PGUSER in backend/.env '
      + '(or point DATABASE_URL at the RDS host).';
  }
  if (!creds.password) {
    return 'No database password for the tunnel. Set DB_TUNNEL_PGPASSWORD in backend/.env.';
  }
  return null;
}
