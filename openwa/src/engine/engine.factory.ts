import * as fs from 'fs';
import * as path from 'path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppEngine } from './interfaces/whatsapp-engine.interface';
import { PluginLoaderService, PluginType, IEnginePlugin, PluginManifest } from '../core/plugins';
import { BaileysPlugin } from './builtin/baileys';
import { createLogger } from '../common/services/logger.service';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { LidMappingStoreService } from './identity/lid-mapping-store.service';
import { ChatStateStoreService } from './adapters/baileys-chat-state-store.service';
import { isSafeSessionName } from '../common/utils/path-safety';
import { ensurePrivateDir } from '../common/utils/private-dir.util';
import { baileysAuthDir, readAuthDirEntries } from './auth-dir-paths';

export interface EngineCreateOptions {
  /**
   * Session UUID (Session.id): the on-disk auth-directory key (matches the dirs purgeSessionData
   * removes), and what the adapters stamp on their per-session rows and logs. Carries the same value
   * as `dbSessionId`; both stay in the per-call config because an out-of-tree engine plugin reads
   * them by name.
   */
  sessionId: string;
  /** Session UUID (Session.id) — the DB-row key for FK-bound stores (e.g. baileys_stored_messages). */
  dbSessionId: string;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}

@Injectable()
export class EngineFactory implements OnModuleInit {
  private readonly logger = createLogger('EngineFactory');
  private readonly engineType: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pluginLoader: PluginLoaderService,
    private readonly baileysMessageStore: BaileysMessageStoreService,
    private readonly lidMappingStore: LidMappingStoreService,
    private readonly chatStateStore: ChatStateStoreService,
  ) {
    // Baileys is the only engine. ENGINE_TYPE is still read so a stale deploy that pins another value
    // fails loudly here rather than silently running an engine this build no longer ships.
    const configured = this.configService.get<string>('engine.type');
    if (configured !== undefined && configured !== 'baileys') {
      this.logger.warn(`Ignoring ENGINE_TYPE=${configured}; this build only ships the Baileys engine`, {
        action: 'engine_type_unsupported',
        configured,
      });
    }
    this.engineType = 'baileys';
  }

  async onModuleInit(): Promise<void> {
    // Register built-in engine plugins
    await this.registerBuiltInEngines();
  }

  private async registerBuiltInEngines(): Promise<void> {
    // The engine config sub-tree (engine.* from configuration.ts) as an opaque blob. Supplied BOTH
    // to registerBuiltInPlugin (becomes context.config when onLoad runs) AND to each plugin's
    // constructor (A fallback so createEngine still has operator config if enablePlugin fails
    // before onLoad — otherwise authDir would silently drop to defaults).
    const engineConfig = this.configService.get<Record<string, unknown>>('engine') ?? {};

    // Register Baileys as a built-in engine plugin. The plugin reads only its own namespace
    // (baileys.authDir) from context.config.
    const baileysManifest: PluginManifest = {
      id: 'baileys',
      name: 'Baileys Engine',
      version: '1.0.0',
      type: PluginType.ENGINE,
      description: 'Baileys (WebSocket, no-browser) engine adapter',
      main: 'index.ts',
      provides: ['whatsapp-engine'],
    };
    this.pluginLoader.registerBuiltInPlugin(
      baileysManifest,
      new BaileysPlugin(this.baileysMessageStore, engineConfig, this.lidMappingStore, this.chatStateStore),
      engineConfig,
    );

    // Auto-enable the configured engine
    try {
      await this.pluginLoader.enablePlugin(this.engineType);
      this.logger.log(`Engine plugin enabled: ${this.engineType}`, {
        action: 'engine_enabled',
        engineType: this.engineType,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enable engine plugin: ${this.engineType}`,
        error instanceof Error ? error.message : String(error),
        { action: 'engine_enable_failed' },
      );
    }
  }

  create(options: EngineCreateOptions): IWhatsAppEngine {
    // The sessionId becomes the engine's on-disk auth-directory key (`authDir/<sessionId>`), so a
    // value containing '.', '/' or '\\' could traverse outside it. It is a Session.id (a UUID) on every
    // in-tree path, but a restored/imported row carries whatever its archive held — assert here so the
    // traversal can never materialize regardless of source.
    if (!isSafeSessionName(options.sessionId)) {
      throw new Error(`Refusing to create an engine for an unsafe session key: ${JSON.stringify(options.sessionId)}`);
    }

    // A baileys creds.json holds everything needed to take over the linked account, so read access to
    // the data volume must not be enough. Mirrors purgeSessionData.
    ensurePrivateDir(this.baileysAuthDir(options.sessionId));

    // Try to get engine from plugin system
    const enginePlugin = this.pluginLoader.getPlugin(this.engineType);

    if (enginePlugin?.instance && this.isEnginePlugin(enginePlugin.instance)) {
      // Engine-neutral per-call config, plus the auth-dir base. Engine-specific config is supplied to
      // the plugin as an opaque blob via context.config at registration, so the factory never
      // assembles adapter-shaped fields. The base is the exception: this factory hardens and purges
      // the credential dirs under it, and the boot migration renames into it, so the engine must write
      // there too. context.config can carry a persisted plugin-config override that none of those
      // would follow.
      return enginePlugin.instance.createEngine({
        sessionId: options.sessionId,
        dbSessionId: options.dbSessionId,
        proxyUrl: options.proxyUrl,
        proxyType: options.proxyType,
        authDir: this.baileysAuthBase(),
      }) as IWhatsAppEngine;
    }

    // The built-in is registered with an instance in onModuleInit, so this is reached only by a broken
    // host. Never build some other engine in its place.
    throw new Error(`Engine '${this.engineType}' is not registered; cannot start the session.`);
  }

  /**
   * Remove a session's persistent on-disk auth/store directories so deleting a session fully purges
   * its footprint. The dir is keyed by session ID — the same key {@link create} uses
   * (`authDir/<id>`) — and survives independently of any engine instance. On delete the engine is
   * frequently not even loaded (a stopped session has none), so the path is derived from config
   * here rather than from a live adapter; otherwise the residue would sit on the volume forever.
   *
   * `legacyName` is the row's name, passed by delete. SessionAuthDirMigration leaves the legacy
   * name-keyed directory in place whenever it could not rename it (an open profile on Windows, or an
   * id-keyed directory already there), so purging only the id-keyed dir would strand a complete
   * WhatsApp login on the volume and in every backup taken after the delete. It is removed only when
   * the base directory really holds an entry with that exact name; see readAuthDirEntries.
   *
   * The session's lid mappings are kept (the table is shared) but handed to no session, so a phone
   * this session stored can still be cleared by the session that replaces it (see LidMappingStoreService).
   */
  async purgeSessionData(sessionId: string, legacyName?: string): Promise<void> {
    if (!isSafeSessionName(sessionId)) {
      // Same guard as create(): never let a key with '.', '/' or '\\' reach an rm -rf sink.
      this.logger.warn('Refusing to purge session data for an unsafe session key', {
        action: 'engine_purge_unsafe',
        key: JSON.stringify(sessionId),
      });
      return;
    }
    await this.lidMappingStore.releaseSession(sessionId);
    const dirs: Array<{ engine: string; dir: string }> = [
      { engine: 'baileys', dir: this.baileysAuthDir(sessionId) },
    ];
    // The caller withholds a name that is another session's id: the dirs it points at are then that
    // session's live id-keyed credentials, and only the caller can see the table.
    if (legacyName !== undefined && isSafeSessionName(legacyName)) {
      const legacyDirs = [{ engine: 'baileys', dir: this.baileysAuthDir(legacyName) }];
      dirs.push(...legacyDirs.filter(({ dir }) => this.authDirExists(dir)));
    }
    for (const { engine, dir } of dirs) {
      try {
        await fs.promises.rm(dir, { recursive: true, force: true });
        this.logger.log('Purged session auth directory', { action: 'engine_purge', engine, sessionId, dir });
      } catch (error) {
        this.logger.warn('Failed to purge session auth directory', {
          action: 'engine_purge_failed',
          engine,
          sessionId,
          dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** The baileys authDir from config. */
  private baileysAuthBase(): string {
    return this.configService.get<string>('engine.baileys.authDir') ?? './data/baileys';
  }

  /** The baileys multi-file auth dir for `sessionId`, with authDir from config. */
  private baileysAuthDir(sessionId: string): string {
    return baileysAuthDir(this.baileysAuthBase(), sessionId);
  }

  /** True when `dir`'s base directory holds an entry with exactly that name (see readAuthDirEntries). */
  private authDirExists(dir: string): boolean {
    try {
      return readAuthDirEntries(path.dirname(dir)).has(path.basename(dir));
    } catch {
      return false; // base directory missing or unreadable: nothing of this shape to purge
    }
  }

  private isEnginePlugin(instance: unknown): instance is IEnginePlugin {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'type' in instance &&
      instance.type === PluginType.ENGINE &&
      'createEngine' in instance &&
      typeof (instance as { createEngine: unknown }).createEngine === 'function'
    );
  }

  // ============================================================================
  // Query Methods for API/Dashboard
  // ============================================================================

  getAvailableEngines(): Array<{
    id: string;
    name: string;
    enabled: boolean;
    features: string[];
    library?: { name: string; version: string };
  }> {
    const enginePlugins = this.pluginLoader.getPluginsByType(PluginType.ENGINE);

    return enginePlugins.map(plugin => {
      const inst = plugin.instance;
      const features = inst && this.isEnginePlugin(inst) ? inst.getFeatures() : [];
      // The real underlying library version (e.g. whatsapp-web.js 1.34.7), distinct from the
      // plugin's manifest version — so the dashboard can show which engine is actually running.
      const library = inst && this.isEnginePlugin(inst) ? inst.getEngineLibrary?.() : undefined;

      return {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        enabled: this.pluginLoader.isPluginEnabled(plugin.manifest.id),
        features,
        library,
      };
    });
  }

  getCurrentEngine(): string {
    return this.engineType;
  }
}
