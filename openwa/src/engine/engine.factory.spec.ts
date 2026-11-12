// A plain-object copy of fs, so a test can spy on existsSync (the real module's exports are not configurable).
jest.mock('fs', () => ({ __esModule: true, ...jest.requireActual<typeof import('fs')>('fs') }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EngineFactory } from './engine.factory';
import { ConfigService } from '@nestjs/config';
import { PluginLoaderService, PluginType } from '../core/plugins';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { LidMappingStoreService } from './identity/lid-mapping-store.service';
import { ChatStateStoreService } from './adapters/baileys-chat-state-store.service';
import { baileysAuthDir } from './auth-dir-paths';

describe('EngineFactory', () => {
  // The auth-dir key is Session.id (#1597), so the on-disk assertions below use a UUID and build the
  // expected paths with the same helper the adapter uses.
  const SESSION_ID = '8f5b1d9e-0c4a-4e21-9d6b-2a7c3f0e1b44';
  const engineBlob = {
    type: 'baileys',
    baileys: { authDir: '/var/data/baileys' },
  };
  const buildConfigService = (overrides: Record<string, unknown> = {}): ConfigService => {
    const values: Record<string, unknown> = {
      'engine.type': 'baileys',
      'engine.baileys.authDir': '/var/data/baileys',
      engine: engineBlob,
      ...overrides,
    };
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  };

  const buildMessageStore = (): BaileysMessageStoreService =>
    ({ put: jest.fn(), getMessage: jest.fn(), clearSession: jest.fn() }) as unknown as BaileysMessageStoreService;

  const buildLidStore = (): LidMappingStoreService =>
    ({
      getCached: jest.fn(),
      lidsForPhone: jest.fn().mockReturnValue([]),
      remember: jest.fn().mockResolvedValue(undefined),
      releaseSession: jest.fn().mockResolvedValue(undefined),
    }) as unknown as LidMappingStoreService;

  const buildChatStateStore = (): ChatStateStoreService =>
    ({
      get: jest.fn(),
      remember: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
    }) as unknown as ChatStateStoreService;

  it('refuses to create an engine for an unsafe session key (path-traversal into the auth dir)', () => {
    const createEngine = jest.fn().mockReturnValue({});
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue({ instance: { type: PluginType.ENGINE, createEngine } }),
    } as unknown as PluginLoaderService;
    const factory = new EngineFactory(
      buildConfigService(),
      pluginLoader,
      buildMessageStore(),
      buildLidStore(),
      buildChatStateStore(),
    );

    expect(() => factory.create({ sessionId: '../../etc', dbSessionId: 'db-1' })).toThrow(/unsafe session key/i);
    expect(() => factory.create({ sessionId: 'a/b', dbSessionId: 'db-1' })).toThrow(/unsafe session key/i);
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('passes ONLY engine-neutral fields to createEngine', () => {
    const createEngine = jest.fn().mockReturnValue({});
    const pluginInstance = { type: PluginType.ENGINE, createEngine };
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue({ instance: pluginInstance }),
    } as unknown as PluginLoaderService;
    // create() makes the auth dir, so the base lives under a temp root rather than the default
    // ./data/baileys of the checkout and a /var/data the suite may be able to write as root.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-factory-neutral-'));
    try {
      const factory = new EngineFactory(
        buildConfigService({ 'engine.baileys.authDir': path.join(tmp, 'baileys') }),
        pluginLoader,
        buildMessageStore(),
        buildLidStore(),
        buildChatStateStore(),
      );
      factory.create({ sessionId: 'sess-1', dbSessionId: 'db-1', proxyUrl: 'http://p', proxyType: 'http' });

      // Plain-object (not objectContaining) assertion: any adapter-specific key leaking into the
      // per-call config would fail this exact match. The auth-dir base is the deliberate exception,
      // pinned below.
      expect(createEngine).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        dbSessionId: 'db-1',
        proxyUrl: 'http://p',
        proxyType: 'http',
        authDir: path.join(tmp, 'baileys'),
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // The adapter used to read this base from the plugin config, which a PUT /api/plugins/:id/config
  // override can move, while this factory hardens and purges the dir under the env-derived base.
  // Credentials then landed in a directory never made owner-only and never removed on delete.
  it('hands the engine the same auth-dir base it hardens and purges', () => {
    const createEngine = jest.fn().mockReturnValue({});
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue({
        instance: { type: PluginType.ENGINE, createEngine },
        config: { baileys: { authDir: '/data/other' } },
      }),
    } as unknown as PluginLoaderService;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-factory-bases-'));
    try {
      const factory = new EngineFactory(
        buildConfigService({ 'engine.baileys.authDir': path.join(tmp, 'baileys') }),
        pluginLoader,
        buildMessageStore(),
        buildLidStore(),
        buildChatStateStore(),
      );

      factory.create({ sessionId: SESSION_ID, dbSessionId: SESSION_ID });

      const passed = (createEngine.mock.calls[0] as [{ authDir: string }])[0];
      expect(baileysAuthDir(passed.authDir, SESSION_ID)).toBe(baileysAuthDir(path.join(tmp, 'baileys'), SESSION_ID));
      expect(fs.existsSync(baileysAuthDir(passed.authDir, SESSION_ID))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('registers the built-in baileys engine with the opaque engine config blob (#219 guarantee moves to context.config)', async () => {
    const registerBuiltInPlugin = jest.fn();
    const pluginLoader = {
      registerBuiltInPlugin,
      enablePlugin: jest.fn().mockResolvedValue(undefined),
      getPlugin: jest.fn(),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(
      buildConfigService(),
      pluginLoader,
      buildMessageStore(),
      buildLidStore(),
      buildChatStateStore(),
    );
    await factory.onModuleInit();

    expect(registerBuiltInPlugin).toHaveBeenCalledTimes(1);
    expect(registerBuiltInPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'baileys', type: PluginType.ENGINE }),
      expect.anything(),
      engineBlob,
    );
  });

  it('ignores a stale ENGINE_TYPE and still runs baileys', async () => {
    const registerBuiltInPlugin = jest.fn();
    const pluginLoader = {
      registerBuiltInPlugin,
      enablePlugin: jest.fn().mockResolvedValue(undefined),
      getPlugin: jest.fn(),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(
      buildConfigService({ 'engine.type': 'whatsapp-web.js' }),
      pluginLoader,
      buildMessageStore(),
      buildLidStore(),
      buildChatStateStore(),
    );
    await factory.onModuleInit();

    expect(factory.getCurrentEngine()).toBe('baileys');
    expect(pluginLoader.enablePlugin).toHaveBeenCalledWith('baileys');
    expect(registerBuiltInPlugin.mock.calls.map(call => (call as [{ id: string }])[0].id)).toEqual(['baileys']);
  });

  describe('create() with no usable engine plugin', () => {
    let tmpRoot: string;
    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-missing-'));
    });
    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const missing: Array<[string, unknown]> = [
      ['no plugin', undefined],
      ['a plugin without an instance', { instance: undefined }],
      ['a non-engine plugin', { instance: { type: PluginType.EXTENSION } }],
    ];

    it.each(missing)('throws for %s instead of building another engine', (_label, entry) => {
      const pluginLoader = {
        getPlugin: jest.fn().mockReturnValue(entry),
      } as unknown as PluginLoaderService;
      const factory = new EngineFactory(
        buildConfigService({ 'engine.baileys.authDir': path.join(tmpRoot, 'baileys') }),
        pluginLoader,
        buildMessageStore(),
        buildLidStore(),
        buildChatStateStore(),
      );
      const create = () => factory.create({ sessionId: SESSION_ID, dbSessionId: SESSION_ID });
      expect(create).toThrow("Engine 'baileys' is not registered; cannot start the session.");
    });
  });

  describe('create() makes the session credential directory owner-only', () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-create-'));
    });
    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const buildTmpFactory = (preLoosen?: boolean) => {
      const authDir = path.join(tmpRoot, 'baileys');
      // An upgrade reuses the dir a previous install left world-readable (default umask); fresh
      // installs have no dir at all. Both must end at 0o700 after create().
      if (preLoosen) {
        fs.mkdirSync(baileysAuthDir(authDir, SESSION_ID), { recursive: true, mode: 0o755 });
      }
      const createEngine = jest.fn().mockReturnValue({});
      const pluginLoader = {
        getPlugin: jest.fn().mockReturnValue({ instance: { type: PluginType.ENGINE, createEngine } }),
      } as unknown as PluginLoaderService;
      const factory = new EngineFactory(
        buildConfigService({ 'engine.baileys.authDir': authDir }),
        pluginLoader,
        buildMessageStore(),
        buildLidStore(),
        buildChatStateStore(),
      );
      return { factory, baileysDir: baileysAuthDir(authDir, SESSION_ID) };
    };

    it.each([false, true])('hardens the credential dir on a %s install', preLoosen => {
      const { factory, baileysDir } = buildTmpFactory(preLoosen);

      factory.create({ sessionId: SESSION_ID, dbSessionId: SESSION_ID });

      expect(fs.statSync(baileysDir).mode & 0o777).toBe(0o700);
    });
  });

  describe('purgeSessionData (delete fully removes on-disk auth, keyed by session id)', () => {
    const noPluginLoader = () => ({ getPlugin: jest.fn() }) as unknown as PluginLoaderService;
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-purge-'));
    });
    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    const buildFactory = () => {
      const authDir = path.join(tmpRoot, 'baileys');
      const lidStore = buildLidStore();
      const factory = new EngineFactory(
        buildConfigService({ 'engine.baileys.authDir': authDir }),
        noPluginLoader(),
        buildMessageStore(),
        lidStore,
        buildChatStateStore(),
      );
      return { factory, lidStore, baileysDir: baileysAuthDir(authDir, SESSION_ID) };
    };

    it("removes the session's auth dir", async () => {
      const { factory, baileysDir } = buildFactory();
      fs.mkdirSync(baileysDir, { recursive: true });
      fs.writeFileSync(path.join(baileysDir, 'creds.json'), '{}');

      await factory.purgeSessionData(SESSION_ID);

      expect(fs.existsSync(baileysDir)).toBe(false);
    });

    it('resolves without throwing when the rm fails (logged, never propagated)', async () => {
      const { factory, baileysDir } = buildFactory();
      fs.mkdirSync(baileysDir, { recursive: true });

      const spy = jest
        .spyOn(fs.promises, 'rm')
        .mockImplementation(async () => {
          throw new Error('EIO: simulated disk failure');
        });
      try {
        await expect(factory.purgeSessionData(SESSION_ID)).resolves.toBeUndefined();
      } finally {
        spy.mockRestore();
      }

      expect(fs.existsSync(baileysDir)).toBe(true);
    });

    it("hands the deleted session's lid mappings to no session, and not for an unsafe key", async () => {
      const { factory, lidStore } = buildFactory();
      const { releaseSession } = lidStore as unknown as { releaseSession: jest.Mock };

      await factory.purgeSessionData(SESSION_ID);
      await factory.purgeSessionData('../baileys-evil');

      expect(releaseSession).toHaveBeenCalledTimes(1);
      expect(releaseSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('is a no-op (no throw) when the auth dir does not exist', async () => {
      const { factory } = buildFactory();
      await expect(factory.purgeSessionData('never-linked')).resolves.toBeUndefined();
    });

    // The boot migration keeps a legacy name-keyed directory it could not rename (an open profile, or
    // a conflict with an id-keyed one). Delete has to take it too, or a complete WhatsApp login stays
    // on the volume, and in every backup, after the session is gone.
    it('removes the legacy name-keyed directory of the deleted session as well', async () => {
      const { factory, baileysDir } = buildFactory();
      fs.mkdirSync(baileysDir, { recursive: true });
      const legacyBaileys = baileysAuthDir(path.join(tmpRoot, 'baileys'), 'alice');
      fs.mkdirSync(legacyBaileys, { recursive: true });

      await factory.purgeSessionData(SESSION_ID, 'alice');

      expect(fs.existsSync(legacyBaileys)).toBe(false);
    });

    // Why the legacy purge matches a directory listing instead of asking existsSync: there, deleting
    // `Alice` would remove the directory holding `alice`'s login, which is #1597 through the delete
    // path. The two only diverge on a case-insensitive filesystem, which is where the bug lives, so
    // existsSync is made to answer as one does: CI runs on a case-sensitive one, where it never would.
    it('leaves a legacy directory whose stored name differs only in case alone', async () => {
      const { factory } = buildFactory();
      const otherSession = baileysAuthDir(path.join(tmpRoot, 'baileys'), 'alice');
      fs.mkdirSync(otherSession, { recursive: true });

      const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const rm = jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
      try {
        await factory.purgeSessionData(SESSION_ID, 'Alice');
        expect(rm).not.toHaveBeenCalledWith(baileysAuthDir(path.join(tmpRoot, 'baileys'), 'Alice'), expect.anything());
      } finally {
        exists.mockRestore();
        rm.mockRestore();
      }

      await factory.purgeSessionData(SESSION_ID, 'Alice');
      expect(fs.existsSync(otherSession)).toBe(true);
    });

    // The shape of a name says nothing about whose login its directory holds: a session named after a
    // tenant UUID owns it. Whether the name is another session's live id is the caller's to decide
    // (SessionEngineControls.delete asks the table and withholds such a name).
    it('removes the legacy directory of a UUID-shaped name as well', async () => {
      const { factory } = buildFactory();
      const uuidName = '0b5c3a52-6d1e-4c1a-9f0e-2a7b8c9d0e1f';
      const legacyBaileys = baileysAuthDir(path.join(tmpRoot, 'baileys'), uuidName);
      fs.mkdirSync(legacyBaileys, { recursive: true });

      await factory.purgeSessionData(SESSION_ID, uuidName);

      expect(fs.existsSync(legacyBaileys)).toBe(false);
    });

    it('refuses to purge an unsafe session key (no rm on a traversal path)', async () => {
      // A sibling that a '../' name would resolve to — it must survive the refused purge.
      const sibling = path.join(tmpRoot, 'baileys-evil');
      fs.mkdirSync(sibling, { recursive: true });

      const { factory } = buildFactory();
      await factory.purgeSessionData('../baileys-evil');
      // Same guard on the legacy name, which an imported row can carry raw.
      await factory.purgeSessionData(SESSION_ID, '../baileys-evil');

      expect(fs.existsSync(sibling)).toBe(true);
    });
  });
});
