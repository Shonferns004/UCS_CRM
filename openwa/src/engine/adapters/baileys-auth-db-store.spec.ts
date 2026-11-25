import { BufferJSON } from '@whiskeysockets/baileys';
import type { BaileysAuthRow, BaileysAuthStore } from '../types/baileys.types';
import { type BaileysAuthLib } from './baileys-auth-store';
import { useDatabaseAuthState } from './baileys-auth-db-store';

const SESSION = 'session-1';
const rowKey = (category: string, keyId: string): string => `${category}\u0000${keyId}`;

/** In-memory stand-in for BaileysAuthStateStoreService. */
class FakeStore implements BaileysAuthStore {
  readonly rows = new Map<string, BaileysAuthRow>();
  readonly batches: BaileysAuthRow[][] = [];
  quarantined = 0;
  load = jest.fn(async (_sessionId: string): Promise<BaileysAuthRow[]> => [...this.rows.values()]);
  write = jest.fn(async (_sessionId: string, rows: BaileysAuthRow[]): Promise<void> => {
    this.batches.push(rows);
    for (const row of rows) {
      if (row.value === null) this.rows.delete(rowKey(row.category, row.keyId));
      else this.rows.set(rowKey(row.category, row.keyId), { ...row });
    }
  });
  clear = jest.fn(async (): Promise<void> => {
    this.rows.clear();
  });
  hasQuarantined = jest.fn(async (): Promise<boolean> => this.quarantined > 0);
  quarantine = jest.fn(async (): Promise<void> => {
    this.quarantined += 1;
  });

  seed(category: string, keyId: string, value: string): void {
    this.rows.set(rowKey(category, keyId), { category, keyId, value });
  }

  stored(category: string, keyId: string): BaileysAuthRow | undefined {
    return this.rows.get(rowKey(category, keyId));
  }
}

describe('useDatabaseAuthState', () => {
  let store: FakeStore;
  let lib: BaileysAuthLib;
  let initAuthCreds: jest.Mock;
  let fromObject: jest.Mock;
  let logger: { warn: jest.Mock; error: jest.Mock };

  const load = () => useDatabaseAuthState(SESSION, lib, store, logger);

  beforeEach(() => {
    store = new FakeStore();
    initAuthCreds = jest.fn(() => ({ fresh: true }));
    fromObject = jest.fn((o: object) => ({ revived: o }));
    lib = { initAuthCreds, BufferJSON, proto: { Message: { AppStateSyncKeyData: { fromObject } } } } as never;
    logger = { warn: jest.fn(), error: jest.fn() };
  });

  it('mints new creds on a first link and persists nothing until saveCreds', async () => {
    const { state } = await load();

    expect(state.creds).toEqual({ fresh: true });
    expect(store.load).toHaveBeenCalledWith(SESSION);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('saves creds and loads them back with their Buffers', async () => {
    const first = await load();
    Object.assign(first.state.creds, { noiseKey: { private: Buffer.from([1, 2, 3]) } });
    await first.saveCreds();

    const second = await load();
    expect(initAuthCreds).toHaveBeenCalledTimes(1);
    expect(second.state.creds).toEqual({ fresh: true, noiseKey: { private: Buffer.from([1, 2, 3]) } });
  });

  it.each(['{"noiseKey":', '', 'null'])(
    'quarantines unusable creds (%j) and starts a new link',
    async raw => {
      store.seed('creds', 'default', raw);
      store.seed('pre-key', '1', '{"k":1}');

      const { state } = await load();

      expect(state.creds).toEqual({ fresh: true });
      expect(store.quarantine).toHaveBeenCalledWith(SESSION);
      expect(store.quarantined).toBe(1);
      // The existing rows stay; they belong to a device that may still be linked.
      expect(store.stored('pre-key', '1')).toEqual({ category: 'pre-key', keyId: '1', value: '{"k":1}' });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(SESSION));
    },
  );

  it('reads keys back in the Baileys shapes and writes them through', async () => {
    store.seed('session', '123:4@s.whatsapp.net', JSON.stringify(Buffer.from('abc'), BufferJSON.replacer));
    store.seed('app-state-sync-key', 'AAA/B', JSON.stringify({ keyData: 'k' }, BufferJSON.replacer));
    const { state } = await load();

    expect(await state.keys.get('session', ['123:4@s.whatsapp.net', 'missing'])).toEqual({
      '123:4@s.whatsapp.net': Buffer.from('abc'),
      missing: null,
    });
    expect((await state.keys.get('app-state-sync-key', ['AAA/B']))['AAA/B']).toEqual({ revived: { keyData: 'k' } });
    expect(fromObject).toHaveBeenCalledWith({ keyData: 'k' });

    await state.keys.set({ 'pre-key': { '7': { public: Buffer.from([7]), private: Buffer.from([8]) } } });
    expect(store.stored('pre-key', '7')?.value).toBe(
      JSON.stringify({ public: Buffer.from([7]), private: Buffer.from([8]) }, BufferJSON.replacer),
    );
    expect(await state.keys.get('pre-key', ['7'])).toEqual({
      '7': { public: Buffer.from([7]), private: Buffer.from([8]) },
    });

    await state.keys.set({ session: { '123:4@s.whatsapp.net': null } });
    expect(store.stored('session', '123:4@s.whatsapp.net')).toBeUndefined();
  });

  it('reads an unparseable key row as absent', async () => {
    store.seed('pre-key', '1', '{');
    const { state } = await load();

    expect(await state.keys.get('pre-key', ['1'])).toEqual({ '1': null });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('serializes overlapping writes so the last batch wins', async () => {
    const { state, saveCreds } = await load();
    const saves: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      Object.assign(state.creds, { counter: i });
      saves.push(saveCreds());
    }
    await Promise.all(saves);

    expect(JSON.parse(store.stored('creds', 'default')!.value!)).toEqual({ fresh: true, counter: 19 });
  });
});
