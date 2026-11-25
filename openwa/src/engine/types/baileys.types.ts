import type { WAMessage } from '@whiskeysockets/baileys';
import type { LidMappingStore } from '../identity/lid-mapping-store.service';
import type { ChatStateStore } from '../adapters/baileys-chat-state-store.service';

/**
 * Persistence boundary for the Baileys engine's message store. The adapter depends on this narrow
 * interface (not the concrete Nest service) so it stays unit-testable with a fake.
 */
export interface BaileysMessageStore {
  /**
   * Persist a message (idempotent on the same id) so it can be referenced by reply/forward/react/delete.
   * A read of the id issued any time after this is called waits for the write, so the message is
   * readable from the moment its write starts.
   */
  put(sessionId: string, msg: WAMessage): Promise<void>;
  /** Look up a previously-seen message by its id, or null. */
  getMessage(sessionId: string, messageId: string): Promise<WAMessage | null>;
  /**
   * Look up many messages in one query. Ids the store has never seen are simply absent from the
   * result, so the caller cannot assume the order or the length matches its input.
   */
  getMessages(sessionId: string, messageIds: string[]): Promise<WAMessage[]>;
  /**
   * Rewrite a stored message in place, for an edit or a delete for everyone. `change` returns the
   * replacement, or null to leave it untouched; an id the store does not hold stays absent.
   */
  update(sessionId: string, messageId: string, change: (stored: WAMessage) => WAMessage | null): Promise<void>;
  /**
   * Delete a stored message, but only while `shouldRemove` accepts the copy held when the delete runs.
   * An id the store does not hold stays absent. Queued behind any put() or update() of the same id.
   */
  remove(sessionId: string, messageId: string, shouldRemove: (stored: WAMessage) => boolean): Promise<void>;
  /** Remove all stored messages for a session (called on logout). */
  clearSession(sessionId: string): Promise<void>;
}

/**
 * One Baileys auth-state entry: the device credentials (`category: 'creds'`) or a Signal key.
 * `value` is the BufferJSON JSON text the file store would have written; null deletes the entry.
 */
export interface BaileysAuthRow {
  category: string;
  keyId: string;
  value: string | null;
}

/**
 * Persistence port for the Baileys auth state. Implemented over the `data` connection
 * ({@link BaileysAuthStateStoreService}) so a session can live without a persistent volume: the
 * creds and Signal keys, which are all a linked device needs, are rows instead of files. The adapter
 * depends on this narrow interface (not the Nest service) so it stays unit-testable with a fake.
 */
export interface BaileysAuthStore {
  /** Every live row for a session (quarantined rows excluded), in one read. */
  load(sessionId: string): Promise<BaileysAuthRow[]>;
  /** Apply a batch: a value upserts the entry, null deletes it. One transaction per batch. */
  write(sessionId: string, rows: BaileysAuthRow[]): Promise<void>;
  /** Delete the session's auth state (terminal logout, or deleting the session). */
  clear(sessionId: string): Promise<void>;
  /** Whether the session keeps rows moved aside after unparseable creds (the `corrupt-*` equivalent). */
  hasQuarantined(sessionId: string): Promise<boolean>;
  /** Move the session's rows aside: kept, but not loaded by the next connect. */
  quarantine(sessionId: string): Promise<void>;
}

/**
 * Per-call construction config for {@link BaileysAdapter}. Engine-neutral fields come from the
 * factory; `authDir` is the base multi-file auth directory from the opaque `engine.baileys.*` blob
 * (the adapter appends the session id to isolate each session).
 */
export interface BaileysAdapterConfig {
  /** Session UUID (Session.id) — keys the on-disk auth directory, chat state and LID provenance. */
  sessionId: string;
  /** Session UUID (Session.id) — keys the FK-bound baileys_stored_messages rows via messageStore. */
  dbSessionId: string;
  authDir: string;
  proxyUrl?: string;
  /** Persisted store for reply/forward/react/delete. Provided by the plugin; the four ops require it. */
  messageStore?: BaileysMessageStore;
  /** Persisted, cross-session lid->phone resolution table. Backs lid resolution beyond the in-memory map. */
  lidMappingStore?: LidMappingStore;
  /** Persisted per-session mute/archive/pin, so those chat fields survive a reconnect Baileys cannot resync. */
  chatStateStore?: ChatStateStore;
  /**
   * Persisted auth state. Set (only when `BAILEYS_AUTH_STORE=database`) instead of `authDir`, which is
   * then left unused: creds and Signal keys are read from and written to the `data` connection.
   */
  authStore?: BaileysAuthStore;
}

/**
 * The minimal pino-compatible logger Baileys' `makeWASocket` expects. Declared locally so we can
 * pass a fully silent logger without taking a direct `pino` dependency.
 *
 * Matches the Baileys `ILogger` contract: each log method receives `(obj: unknown, msg?: string)`.
 */
export interface BaileysLogger {
  level: string;
  child: (bindings: Record<string, unknown>) => BaileysLogger;
  trace: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}
