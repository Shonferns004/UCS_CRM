import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import type { BaileysAuthRow, BaileysAuthStore } from '../types/baileys.types';
import { type BaileysAuthLib } from './baileys-auth-store';
import { type createLogger } from '../../common/services/logger.service';

/** The category/keyId the file store calls `creds.json`. */
const CREDS_CATEGORY = 'creds';
const CREDS_KEY_ID = 'default';

/** Map key for one entry; `\0` cannot appear in a Baileys category or key id. */
const entryKey = (category: string, keyId: string): string => `${category}\u0000${keyId}`;

/**
 * Database-backed counterpart of {@link useAtomicMultiFileAuthState}: same contract, same payloads
 * (BufferJSON), same corrupt-creds behaviour (rows are quarantined instead of moved into a
 * `corrupt-<ms>/` dir) - only the medium changes. The whole state is read once per connect and then
 * kept in memory, because Baileys asks `keys.get` on every message; writes go through to the store so
 * a crash between messages keeps the newest ratchet keys.
 *
 * Writes are chained per session: `keys.set` batches can overlap (two inbound messages racing), and
 * an upsert of a key must not land after the delete that followed it.
 */
export async function useDatabaseAuthState(
  sessionId: string,
  lib: BaileysAuthLib,
  store: BaileysAuthStore,
  logger: Pick<ReturnType<typeof createLogger>, 'warn' | 'error'>,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const { BufferJSON, proto, initAuthCreds } = lib;

  const cache = new Map<string, unknown>();
  let storedCreds: string | undefined;
  for (const row of await store.load(sessionId)) {
    // A loaded entry always has a value (a null is a delete, never a row); guard keeps the type honest.
    if (row.value === null) continue;
    if (row.category === CREDS_CATEGORY && row.keyId === CREDS_KEY_ID) storedCreds = row.value;
    try {
      cache.set(entryKey(row.category, row.keyId), JSON.parse(row.value, BufferJSON.reviver));
    } catch {
      // A single unreadable key reads as absent, as in the file store: the Signal session renegotiates.
      logger.warn('Unreadable Baileys auth row ignored', { sessionId, category: row.category, keyId: row.keyId });
    }
  }

  let writeChain: Promise<unknown> = Promise.resolve();
  const writeRows = (rows: BaileysAuthRow[]): Promise<void> => {
    if (rows.length === 0) return Promise.resolve();
    const run = writeChain.then(() => store.write(sessionId, rows));
    writeChain = run.catch(() => undefined);
    return run;
  };

  // A creds row that is present but unusable (bad JSON, or a bare value) is the database counterpart of
  // a corrupt creds.json: Baileys dereferences creds unconditionally, so a fresh identity is started.
  // The rows are kept (quarantined) because the device they belong to may still be linked.
  let creds: AuthenticationCreds;
  let storedCredsParsed: unknown;
  if (storedCreds !== undefined) {
    try {
      storedCredsParsed = JSON.parse(storedCreds, BufferJSON.reviver);
    } catch {
      storedCredsParsed = undefined;
    }
  }
  if (storedCreds === undefined) {
    creds = initAuthCreds();
  } else if (storedCredsParsed && typeof storedCredsParsed === 'object') {
    creds = storedCredsParsed as AuthenticationCreds;
  } else {
    await store.quarantine(sessionId);
    cache.clear();
    logger.error(
      `Stored Baileys credentials for session ${sessionId} could not be parsed; quarantined them. The session needs a new QR link.`,
    );
    creds = initAuthCreds();
  }

  const serializedCreds = (): string => JSON.stringify(creds, BufferJSON.replacer);

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            let value: unknown = cache.get(entryKey(type, id)) ?? null;
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>);
            }
            data[id] = value as SignalDataTypeMap[T];
          }
          return data;
        },
        set: async data => {
          const writes: BaileysAuthRow[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in entries) {
              const value = entries[id];
              if (value) {
                cache.set(entryKey(category, id), value);
                writes.push({ category, keyId: id, value: JSON.stringify(value, BufferJSON.replacer) });
              } else {
                cache.delete(entryKey(category, id));
                writes.push({ category, keyId: id, value: null });
              }
            }
          }
          await writeRows(writes);
        },
      },
    },
    saveCreds: () => {
      cache.set(entryKey(CREDS_CATEGORY, CREDS_KEY_ID), creds);
      return writeRows([{ category: CREDS_CATEGORY, keyId: CREDS_KEY_ID, value: serializedCreds() }]);
    },
  };
}
