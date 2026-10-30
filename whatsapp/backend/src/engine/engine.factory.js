"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineFactory = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const plugins_1 = require("../core/plugins");
const whatsapp_web_js_1 = require("./builtin/whatsapp-web-js");
const baileys_1 = require("./builtin/baileys");
const logger_service_1 = require("../common/services/logger.service");
const baileys_message_store_service_1 = require("./adapters/baileys-message-store.service");
const lid_mapping_store_service_1 = require("./identity/lid-mapping-store.service");
const baileys_chat_state_store_service_1 = require("./adapters/baileys-chat-state-store.service");
const path_safety_1 = require("../common/utils/path-safety");
const private_dir_util_1 = require("../common/utils/private-dir.util");
const auth_dir_paths_1 = require("./auth-dir-paths");
let EngineFactory = class EngineFactory {
    configService;
    pluginLoader;
    baileysMessageStore;
    lidMappingStore;
    chatStateStore;
    logger = (0, logger_service_1.createLogger)('EngineFactory');
    engineType;
    constructor(configService, pluginLoader, baileysMessageStore, lidMappingStore, chatStateStore) {
        this.configService = configService;
        this.pluginLoader = pluginLoader;
        this.baileysMessageStore = baileysMessageStore;
        this.lidMappingStore = lidMappingStore;
        this.chatStateStore = chatStateStore;
        this.engineType = this.configService.get('engine.type') ?? 'whatsapp-web.js';
    }
    async onModuleInit() {
        // Register built-in engine plugins
        await this.registerBuiltInEngines();
    }
    async registerBuiltInEngines() {
        // The engine config sub-tree (engine.* from configuration.ts) as an opaque blob. Supplied BOTH
        // to registerBuiltInPlugin (becomes context.config when onLoad runs) AND to each plugin's
        // constructor (A fallback so createEngine still has operator config if enablePlugin fails
        // before onLoad — otherwise sessionDataPath/executablePath/authDir would silently drop to defaults).
        const engineConfig = this.configService.get('engine') ?? {};
        // Register WhatsApp-web.js as built-in plugin
        const wwjsManifest = {
            id: 'whatsapp-web.js',
            name: 'WhatsApp Web.js Engine',
            version: '1.0.0',
            type: plugins_1.PluginType.ENGINE,
            description: 'Official WhatsApp-web.js engine adapter',
            main: 'index.ts',
            provides: ['whatsapp-engine'],
        };
        const wwjsPlugin = new whatsapp_web_js_1.WhatsAppWebJsPlugin(engineConfig, this.lidMappingStore);
        this.pluginLoader.registerBuiltInPlugin(wwjsManifest, wwjsPlugin, engineConfig);
        // Register Baileys as a second built-in engine plugin. Same opaque engine blob; the plugin
        // reads only its own namespace (baileys.authDir) from context.config.
        const baileysManifest = {
            id: 'baileys',
            name: 'Baileys Engine',
            version: '1.0.0',
            type: plugins_1.PluginType.ENGINE,
            description: 'Baileys (WebSocket, no-browser) engine adapter',
            main: 'index.ts',
            provides: ['whatsapp-engine'],
        };
        this.pluginLoader.registerBuiltInPlugin(baileysManifest, new baileys_1.BaileysPlugin(this.baileysMessageStore, engineConfig, this.lidMappingStore, this.chatStateStore), engineConfig);
        // Auto-enable the configured engine
        try {
            await this.pluginLoader.enablePlugin(this.engineType);
            this.logger.log(`Engine plugin enabled: ${this.engineType}`, {
                action: 'engine_enabled',
                engineType: this.engineType,
            });
        }
        catch (error) {
            this.logger.error(`Failed to enable engine plugin: ${this.engineType}`, error instanceof Error ? error.message : String(error), { action: 'engine_enable_failed' });
        }
    }
    create(options) {
        // The sessionId becomes the engine's on-disk auth-directory key (path.join(authDir, sessionId) /
        // session-${sessionId}), so a value containing '.', '/' or '\\' could traverse outside it. It is a
        // Session.id (a UUID) on every in-tree path, but a restored/imported row carries whatever its
        // archive held — assert here so the traversal can never materialize regardless of source.
        if (!(0, path_safety_1.isSafeSessionName)(options.sessionId)) {
            throw new Error(`Refusing to create an engine for an unsafe session key: ${JSON.stringify(options.sessionId)}`);
        }
        // Both engine shapes' credential dirs are made owner-only up front, whichever engine this
        // session runs: a whatsapp-web.js profile and a baileys creds.json each hold everything needed
        // to take over the linked account, so read access to the data volume must not be enough.
        // Mirrors purgeSessionData, which removes BOTH shapes for the same engine-switch-residue reason.
        (0, private_dir_util_1.ensurePrivateDir)(this.wwjsAuthDir(options.sessionId));
        (0, private_dir_util_1.ensurePrivateDir)(this.baileysAuthDir(options.sessionId));
        // Try to get engine from plugin system
        const enginePlugin = this.pluginLoader.getPlugin(this.engineType);
        if (enginePlugin?.instance && this.isEnginePlugin(enginePlugin.instance)) {
            // Engine-neutral per-call config, plus the two auth-dir bases. Engine-specific config (e.g.
            // Puppeteer for whatsapp-web.js) is supplied to the plugin as an opaque blob via context.config
            // at registration, so the factory never assembles browser-shaped fields. The bases are the
            // exception: this factory hardens and purges the credential dirs under them, and the boot
            // migration renames into them, so the engine must write there too. context.config can carry a
            // persisted plugin-config override that none of those would follow.
            return enginePlugin.instance.createEngine({
                sessionId: options.sessionId,
                dbSessionId: options.dbSessionId,
                proxyUrl: options.proxyUrl,
                proxyType: options.proxyType,
                sessionDataPath: this.sessionDataPath(),
                authDir: this.baileysAuthBase(),
            });
        }
        // Both built-ins are registered with an instance in onModuleInit and ENGINE_TYPE is whitelisted at
        // boot, so this is reached only by a broken host. Never build some other engine in its place.
        throw new Error(`Engine '${this.engineType}' is not registered; cannot start the session.`);
    }
    /**
     * Remove a session's persistent on-disk auth/store directories so deleting a session fully purges
     * its footprint. The dir is keyed by session ID — the same key {@link create} uses
     * (`path.join(authDir, id)` for baileys, `session-${id}` under sessionDataPath for
     * whatsapp-web.js) — and survives independently of any engine instance. On delete the engine is
     * frequently not even loaded (a stopped session has none), so the paths are derived from config
     * here rather than from a live adapter; otherwise the residue would sit on the volume forever.
     *
     * BOTH engine shapes are purged, not just the active engine's: ENGINE_TYPE is a deploy-level
     * switch, so a session that ever ran under both engines leaves a live auth dir for each, and
     * removing only the active engine's would strand the other's WhatsApp credentials on disk after
     * "delete" — able to silently re-link if the engine is ever switched back (and carried into
     * backups). Each rm is isolated best-effort: an unsafe key is refused up front, and one engine's
     * rm failure is logged per-engine — it neither fails the delete nor skips the other engine's purge.
     *
     * Note: session START deliberately does NOT purge the inactive engine's residue. An operator
     * trialling the other engine keeps the previous engine's link so switching back doesn't force a
     * re-pair; the residue is removed only when the session itself is deleted.
     *
     * `legacyName` is the row's name, passed by delete. SessionAuthDirMigration leaves the legacy
     * name-keyed directory in place whenever it could not rename it (an open profile on Windows, or an
     * id-keyed directory already there), so purging only the id-keyed dirs would strand a complete
     * WhatsApp login on the volume and in every backup taken after the delete. It is removed only when
     * the base directory really holds an entry with that exact name; see readAuthDirEntries.
     *
     * The session's lid mappings are kept (the table is shared) but handed to no session, so a phone
     * this session stored can still be cleared by the session that replaces it (see LidMappingStoreService).
     */
    async purgeSessionData(sessionId, legacyName) {
        if (!(0, path_safety_1.isSafeSessionName)(sessionId)) {
            // Same guard as create(): never let a key with '.', '/' or '\\' reach an rm -rf sink.
            this.logger.warn('Refusing to purge session data for an unsafe session key', {
                action: 'engine_purge_unsafe',
                key: JSON.stringify(sessionId),
            });
            return;
        }
        await this.lidMappingStore.releaseSession(sessionId);
        const dirs = [
            { engine: 'whatsapp-web.js', dir: this.wwjsAuthDir(sessionId) },
            { engine: 'baileys', dir: this.baileysAuthDir(sessionId) },
        ];
        // The caller withholds a name that is another session's id: the dirs it points at are then that
        // session's live id-keyed credentials, and only the caller can see the table.
        if (legacyName !== undefined && (0, path_safety_1.isSafeSessionName)(legacyName)) {
            const legacyDirs = [
                { engine: 'whatsapp-web.js', dir: this.wwjsAuthDir(legacyName) },
                { engine: 'baileys', dir: this.baileysAuthDir(legacyName) },
            ];
            dirs.push(...legacyDirs.filter(({ dir }) => this.authDirExists(dir)));
        }
        for (const { engine, dir } of dirs) {
            try {
                await fs.promises.rm(dir, { recursive: true, force: true });
                this.logger.log('Purged session auth directory', { action: 'engine_purge', engine, sessionId, dir });
            }
            catch (error) {
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
    /** The whatsapp-web.js sessionDataPath from config. */
    sessionDataPath() {
        return this.configService.get('engine.sessionDataPath') ?? './data/sessions';
    }
    /** The baileys authDir from config. */
    baileysAuthBase() {
        return this.configService.get('engine.baileys.authDir') ?? './data/baileys';
    }
    /** The whatsapp-web.js LocalAuth profile dir for `sessionId`, with sessionDataPath from config. */
    wwjsAuthDir(sessionId) {
        return (0, auth_dir_paths_1.wwjsAuthDir)(this.sessionDataPath(), sessionId);
    }
    /** The baileys multi-file auth dir for `sessionId`, with authDir from config. */
    baileysAuthDir(sessionId) {
        return (0, auth_dir_paths_1.baileysAuthDir)(this.baileysAuthBase(), sessionId);
    }
    /** True when `dir`'s base directory holds an entry with exactly that name (see readAuthDirEntries). */
    authDirExists(dir) {
        try {
            return (0, auth_dir_paths_1.readAuthDirEntries)(path.dirname(dir)).has(path.basename(dir));
        }
        catch {
            return false; // base directory missing or unreadable: nothing of this shape to purge
        }
    }
    isEnginePlugin(instance) {
        return (typeof instance === 'object' &&
            instance !== null &&
            'type' in instance &&
            instance.type === plugins_1.PluginType.ENGINE &&
            'createEngine' in instance &&
            typeof instance.createEngine === 'function');
    }
    // ============================================================================
    // Query Methods for API/Dashboard
    // ============================================================================
    getAvailableEngines() {
        const enginePlugins = this.pluginLoader.getPluginsByType(plugins_1.PluginType.ENGINE);
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
    getCurrentEngine() {
        return this.engineType;
    }
};
exports.EngineFactory = EngineFactory;
exports.EngineFactory = EngineFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        plugins_1.PluginLoaderService,
        baileys_message_store_service_1.BaileysMessageStoreService,
        lid_mapping_store_service_1.LidMappingStoreService,
        baileys_chat_state_store_service_1.ChatStateStoreService])
], EngineFactory);
