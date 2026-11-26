import { DurableObject } from 'cloudflare:workers';

/**
 * Cloudflare Containers wrapper for the OpenWA gateway.
 *
 * Containers are not long-running services: a Durable Object starts one on demand and Cloudflare stops
 * it once the object has been inactive for the configured timeout. Baileys needs a process that stays
 * up, so this object keeps the container alive with a recurring alarm below the 6-hour maximum
 * inactivity timeout, and restarts it if it stopped (host maintenance, a deploy, a crash).
 *
 * The app itself is unchanged apart from `BAILEYS_AUTH_STORE=database`: the auth dir that would have
 * needed a volume is a Postgres table, so a restarted container reconnects without re-scanning a QR.
 */

interface Env {
  GATEWAY: DurableObjectNamespace<BaileysGateway>;

  /** Shared secret the UCS CRM backend sends as X-API-Key. Set with `wrangler secret put`. */
  OPENWA_API_KEY: string;

  DATABASE_HOST: string;
  DATABASE_PORT?: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;
  DATABASE_SSL?: string;
  POSTGRES_SCHEMA?: string;

  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_REGION?: string;
  S3_KEY_PREFIX?: string;
}

const CONTAINER_PORT = 3001;
const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 500;

/** Just under the platform maximum (6 hours), so the alarm always fires before the container stops. */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 60 * 1000;
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Only defined keys are passed: `start()` rejects a null/undefined env value. */
function containerEnv(env: Env): Record<string, string> {
  const candidates: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    PORT: String(CONTAINER_PORT),

    // One process, one node identity.
    NODE_ID: 'CF-CONTAINER-01',
    ENGINE_TYPE: 'baileys',
    AUTO_START_SESSIONS: 'true',

    // The whole point: no auth dir, no volume.
    BAILEYS_AUTH_STORE: 'database',

    DATABASE_TYPE: 'postgres',
    DATABASE_HOST: env.DATABASE_HOST,
    DATABASE_PORT: env.DATABASE_PORT ?? '5432',
    DATABASE_USERNAME: env.DATABASE_USERNAME,
    DATABASE_PASSWORD: env.DATABASE_PASSWORD,
    DATABASE_NAME: env.DATABASE_NAME,
    DATABASE_SSL: env.DATABASE_SSL ?? 'true',
    DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
    DATABASE_SYNCHRONIZE: 'false',
    POSTGRES_SCHEMA: env.POSTGRES_SCHEMA ?? 'public',

    // Media has nowhere else to go: container disk is ephemeral. R2 is S3-compatible.
    STORAGE_TYPE: 's3',
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION ?? 'auto',
    S3_KEY_PREFIX: env.S3_KEY_PREFIX,

    // Single-node: no shared Redis/queue/cache.
    REDIS_ENABLED: 'false',
    QUEUE_ENABLED: 'false',
    CACHE_ENABLED: 'false',

    // The API key stays server-side; the Worker never returns it to a browser.
    OPENWA_API_KEY: env.OPENWA_API_KEY,
  };

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

export class BaileysGateway extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A Durable Object restarted by a deploy keeps running containers but forgets their timeout, so
    // re-arm it before anything else touches the container.
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() => ctx.container!.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  /** Starts the container if needed, re-arms the inactivity timeout, and schedules the next keepalive. */
  async ensureRunning(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error('No container is bound to BaileysGateway');

    if (!container.running) {
      container.start({
        image: container.images.base,
        // Without this the container has no internet: no WhatsApp, no Postgres, no R2.
        enableInternet: true,
        env: containerEnv(this.env),
      });
      await this.waitForReady();
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_INTERVAL_MS);
  }

  /** Fires every 4 hours: keeps the container from hitting the inactivity stop, restarts it if it died. */
  async alarm(): Promise<void> {
    await this.ensureRunning();
  }

  /** Proves the port is listening. Any HTTP status counts, including the 401 an unauthenticated call gets. */
  private async waitForReady(): Promise<void> {
    const port = this.ctx.container!.getTcpPort(CONTAINER_PORT);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await port.fetch(`http://container/api/health`, { method: 'GET' });
        return;
      } catch (error) {
        lastError = error;
        await scheduler.wait(READY_POLL_MS);
      }
    }
    throw new Error(`OpenWA container did not become ready on port ${CONTAINER_PORT}: ${String(lastError)}`);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureRunning();

    const url = new URL(request.url);
    // The container serves plain HTTP on its private port; the Worker terminates TLS for the client.
    const forwarded = new Request(`http://container${url.pathname}${url.search}`, request);
    forwarded.headers.delete('host');
    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // A single named instance: every request must reach the one container that owns the sessions.
    return env.GATEWAY.getByName('whatsapp').fetch(request);
  },
};
