// Move the OpenWA gateway to another machine without re-scanning 70+ WhatsApps.
//
// The gateway records which node owns each session (`openwa.sessions.nodeId`). If the old
// node was force-killed, those claims can look live for a while and the new node refuses
// to start the sessions ("Session is not started"). This script lists them and, with
// --confirm, clears them.
//
// SAFETY: never run this while the old gateway is still serving. It probes the configured
// gateway URL first and refuses to clear if the gateway answers, unless --force is given.
//
// Run from the backend folder (so .env and node_modules resolve):
//   node scripts/clear-openwa-claims.mjs --list
//   node scripts/clear-openwa-claims.mjs --node WIN-13ITDVN82HK --confirm
//   node scripts/clear-openwa-claims.mjs --node WIN-13ITDVN82HK --confirm --force
import 'dotenv/config';
import net from 'node:net';
import pg from 'pg';

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const nodeId = valueOf('--node');
const confirm = args.includes('--confirm');
const force = args.includes('--force');
const listOnly = args.includes('--list') || !confirm;

const gatewayUrl = String(process.env.OPENWA_GATEWAY_URL || process.env.OPENWA_URL || '');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

const probe = (url) =>
  new Promise((resolve) => {
    let host;
    let port = 3001;
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
    } catch {
      resolve(false);
      return;
    }
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: false, connectionTimeoutMillis: 15000 });

try {
  const { rows: claims } = await pool.query(`
    SELECT "nodeId", count(*)::int AS sessions,
           min("leaseExpiresAt") AS oldest_lease, max("leaseExpiresAt") AS newest_lease,
           max("updatedAt") AS last_seen
      FROM openwa.sessions
     WHERE "nodeId" IS NOT NULL
     GROUP BY "nodeId"
     ORDER BY sessions DESC
  `);

  if (claims.length === 0) {
    console.log('No session claims found — every session is free to start.');
    await pool.end();
    process.exit(0);
  }

  console.log('\nCurrent OpenWA session claims:');
  console.table(
    claims.map((row) => ({
      node: row.nodeId,
      sessions: row.sessions,
      oldest_lease: row.oldest_lease,
      newest_lease: row.newest_lease,
      last_seen: row.last_seen,
    })),
  );

  if (listOnly) {
    console.log('\nList only. To clear one node:');
    console.log('  node scripts/clear-openwa-claims.mjs --node <nodeId> --confirm');
    await pool.end();
    process.exit(0);
  }

  if (!nodeId) {
    console.error('\n--node is required with --confirm');
    await pool.end();
    process.exit(1);
  }

  const target = claims.find((row) => row.nodeId === nodeId);
  if (!target) {
    console.error(`\nNo claims found for node "${nodeId}"`);
    await pool.end();
    process.exit(1);
  }

  if (!force) {
    const live = gatewayUrl ? await probe(gatewayUrl) : false;
    if (live) {
      console.error(
        `\nREFUSING: ${gatewayUrl} is still answering on the network.\n` +
          'Stop the old gateway (gracefully) before clearing its claims.\n' +
          'If you are certain it is a different/firewalled process, re-run with --force.',
      );
      await pool.end();
      process.exit(1);
    }
  }

  const { rows: cleared } = await pool.query(
    `UPDATE openwa.sessions
        SET "nodeId" = NULL, "claimedAt" = NULL, "leaseExpiresAt" = NULL
      WHERE "nodeId" = $1
      RETURNING id, name, "androidName"`,
    [nodeId],
  );

  console.log(`\nCleared ${cleared.length} claim(s) for node "${nodeId}".`);
  console.table(cleared.map((row) => ({ name: row.name, android: row.androidName, id: row.id })));
  console.log('\nNow start the new gateway. It will reset active rows to disconnected and auto-start them.');
} catch (error) {
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
