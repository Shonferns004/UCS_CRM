// Enforces a hard ceiling on the process's resident memory from inside the
// process itself. The 2 GB host has no swap and the backend's RSS used to
// grow unmeasured until the OS OOM-killer stepped in (850+ PM2 restarts).
// PM2's max_memory_restart (1100M) is the backstop; this watchdog trips
// earlier (default 900 MB) but only on *sustained* usage, so a single heavy
// job that briefly needs headroom is not restarted.
//
// On a sustained overrun it signals SIGTERM (which PM2's autorestart catches)
// so memory can never climb into OOM territory again — the app restarts in a
// couple of seconds instead.
//
// Env knobs:
//   MEM_WATCHDOG_MB        limit in MB (default 900, must be < max_memory_restart)
//   MEM_WATCHDOG_INTERVAL_MS  poll interval (default 5000)
//   MEM_WATCHDOG_GRACE_MS     how long RSS may stay over before restart (default 20000)

export function startMemoryWatchdog(options = {}) {
  const limitMb = Number(options.limitMb ?? process.env.MEM_WATCHDOG_MB ?? 900);
  const intervalMs = Number(options.intervalMs ?? process.env.MEM_WATCHDOG_INTERVAL_MS ?? 5000);
  const graceMs = Number(options.graceMs ?? process.env.MEM_WATCHDOG_GRACE_MS ?? 20000);
  const limitBytes = limitMb * 1024 * 1024;

  if (!limitBytes || limitBytes <= 0) return undefined;
  const MB = 1024 * 1024;

  let overSince = 0;
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    const rss = mem.rss;
    if (rss <= limitBytes) {
      if (overSince) {
        console.log(
          `[memoryWatchdog] RSS back under ${limitMb} MB (${Math.round(rss / MB)} MB) — trip cleared`
        );
      }
      overSince = 0;
      return;
    }

    const now = Date.now();
    if (!overSince) {
      overSince = now;
      console.error(
        `[memoryWatchdog] RSS ${Math.round(rss / MB)} MB exceeds ${limitMb} MB limit` +
          ` (heap ${Math.round((mem.heapUsed || 0) / MB)} MB, external ${Math.round((mem.external || 0) / MB)} MB,` +
          ` buffers ${Math.round((mem.arrayBuffers || 0) / MB)} MB).` +
          ` Will restart if it stays over for ${Math.round(graceMs / 1000)}s.`
      );
      return;
    }

    if (now - overSince < graceMs) return;
    clearInterval(timer);
    console.error(
      `[memoryWatchdog] RSS stayed above ${limitMb} MB for ${Math.round((now - overSince) / 1000)}s` +
        ` — signalling SIGTERM so PM2 restarts the backend.`
    );
    process.kill(process.pid, 'SIGTERM');
  }, intervalMs);
  timer.unref?.();
  console.log(`[memoryWatchdog] armed: restart if RSS > ${limitMb} MB sustained for ${Math.round(graceMs / 1000)}s`);
}