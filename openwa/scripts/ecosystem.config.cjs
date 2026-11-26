/**
 * PM2 layout for the OpenWA gateway on one Windows box.
 *
 *   npm run build
 *   pm2 start scripts/ecosystem.config.cjs
 *   pm2 save                       # remember this app list across reboots
 *   pm2 logs                       # tail every van
 *   pm2 monit                      # per-van RAM live
 *
 * Optional boot start on Windows: install `pm2-windows-service` (needs an elevated shell) and run
 * `pm2-service-install`. Without a service, a reboot leaves the gateway down until someone logs in.
 *
 * Sizing: one van = one Node process = one heap = one CPU core. Keep
 *   vans x max-old-space-size  below the machine's real free RAM,
 * and keep MAX_CONCURRENT_SESSIONS small enough that ~100 MB per session fits the heap.
 * 4 vans x 18 sessions = 72 sessions on ~7 GB. For 100 sessions use 5 vans (or perNode 20).
 *
 * Existing .env still supplies the shared config (database, API key, BAILEYS_AUTH_DIR). Only the
 * per-process values below differ, and process env outranks .env (dotenv override:false).
 */

const PORT_BASE = 3001;
const VAN_COUNT = 4;
const SESSIONS_PER_VAN = 18;
const HEAP_MB = 2560;
const DB_POOL_PER_VAN = 5;

const vans = Array.from({ length: VAN_COUNT }, (_, i) => ({
  name: `openwa-wa-${String(i + 1).padStart(2, '0')}`,
  script: 'dist/main.js',
  cwd: __dirname.replace(/[\\/]scripts$/, ''),
  node_args: `--max-old-space-size=${HEAP_MB}`,
  exec_mode: 'fork',
  instances: 1,
  env: {
    NODE_ENV: 'production',
    PORT: String(PORT_BASE + i),
    NODE_ID: `WA-NODE-${String(i + 1).padStart(2, '0')}`,
    MAX_CONCURRENT_SESSIONS: String(SESSIONS_PER_VAN),
    DATABASE_POOL_SIZE: String(DB_POOL_PER_VAN),
  },
  // Restart on its own heap ceiling too, so a leak is a single-van restart rather than an OOM kill.
  max_memory_restart: `${Math.round(HEAP_MB * 1.15)}M`,
  autorestart: true,
  restart_delay: 5000,
  // Give sessions time to close cleanly instead of dropping every socket at once.
  kill_timeout: 15000,
  merge_logs: true,
  time: true,
}));

module.exports = { apps: vans };
