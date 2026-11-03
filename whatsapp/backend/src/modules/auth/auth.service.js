"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.UnresolvedApiKeyException = void 0;
exports.resolveSeedApiKey = resolveSeedApiKey;
exports.bannerKeyLine = bannerKeyLine;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const ip_1 = require("../../common/utils/ip");
const api_key_hash_1 = require("./api-key-hash");
const api_key_entity_1 = require("./entities/api-key.entity");
const logger_service_1 = require("../../common/services/logger.service");
const request_context_1 = require("../../common/services/request-context");
const bootstrap_key_file_1 = require("./bootstrap-key-file");
const api_key_usage_tracker_service_1 = require("./api-key-usage-tracker.service");
const active_key_index_1 = require("./active-key-index");
const api_key_authorization_1 = require("./api-key-authorization");
const chat_scope_1 = require("../../common/security/chat-scope");
const events_gateway_1 = require("../events/events.gateway");
const bootstrap_security_1 = require("../../config/bootstrap-security");
/**
 * A 401 that names no stored key: the credential was missing or matched no row. Producing one costs
 * the caller nothing, so its audit row is bounded per client IP. Every other rejection (a revoked or
 * expired key's 401, an IP or session refusal's 403) required a real key and is audited on every
 * attempt. The name stays `UnauthorizedException` because MCP tool errors carry it on the wire.
 */
class UnresolvedApiKeyException extends common_1.UnauthorizedException {
    constructor(message) {
        super(message);
        this.name = common_1.UnauthorizedException.name;
    }
}
exports.UnresolvedApiKeyException = UnresolvedApiKeyException;
/**
 * Resolves the API key to seed on first boot (when no keys exist yet).
 * Precedence: an explicit `API_MASTER_KEY` always wins; otherwise a
 * cryptographically random `owa_k1_` key is generated — the secure default,
 * including in non-production. The legacy fixed `dev-admin-key` is used only when
 * a developer explicitly opts in with `ALLOW_DEV_API_KEY=true`, never by default.
 */
function resolveSeedApiKey() {
    // Trimmed because validateApiKey hashes the trimmed key: a seed hashed with a trailing newline could
    // never authenticate. A whitespace-only value counts as unset.
    const masterKey = process.env.API_MASTER_KEY?.trim();
    if (masterKey) {
        return masterKey;
    }
    if (process.env.ALLOW_DEV_API_KEY === 'true') {
        return 'dev-admin-key';
    }
    return `owa_k1_${(0, crypto_1.randomBytes)(32).toString('hex')}`;
}
/**
 * The line to print for the API key in the startup banner. The full raw key is shown ONLY when it was
 * just created (first run, when the operator needs to capture it once). On every subsequent boot the
 * key is masked to a short non-secret fingerprint, so the live admin key is not re-written to the log
 * pipeline (Docker/Loki/CloudWatch) on each restart — it stays in `data/.api-key` (0600), or wherever
 * `BOOTSTRAP_KEY_FILE` points; the dashboard only ever shows a key's prefix. A placeholder
 * (e.g. "(check dashboard for keys)") is passed through unchanged.
 */
function bannerKeyLine(displayKey, isNewKey) {
    if (isNewKey)
        return displayKey;
    if (displayKey.startsWith('('))
        return displayKey;
    return `${displayKey.slice(0, 8)}… (full key in ${(0, bootstrap_key_file_1.bootstrapKeyFilePath)()})`;
}
let AuthService = class AuthService {
    static { AuthService_1 = this; }
    apiKeyRepository;
    usageTracker;
    moduleRef;
    keyIndex;
    logger = (0, logger_service_1.createLogger)('AuthService');
    constructor(apiKeyRepository, usageTracker, moduleRef, keyIndex) {
        this.apiKeyRepository = apiKeyRepository;
        this.usageTracker = usageTracker;
        this.moduleRef = moduleRef;
        this.keyIndex = keyIndex;
    }
    async onModuleInit() {
        // Seed a default API key if none exist
        const count = await this.apiKeyRepository.count();
        let displayKey;
        let isNewKey = false;
        if (count === 0) {
            displayKey = resolveSeedApiKey();
            await this.seedApiKey(displayKey, 'Default Admin Key', api_key_entity_1.ApiKeyRole.ADMIN);
            isNewKey = true;
            // Save raw key to file for startup script to read (owner-only — it's the raw admin key).
            try {
                (0, bootstrap_key_file_1.writeBootstrapKey)(displayKey);
            }
            catch (err) {
                this.logger.warn('Could not save API key file', { error: String(err) });
            }
        }
        else {
            // Read the saved bootstrap key from the file — but only while it still resolves to a LIVE
            // key; a revoked/rotated/deleted key must not be advertised in the banner.
            displayKey = (await this.readLiveBootstrapKey()) ?? '(check dashboard for keys)';
        }
        // Always show the welcome banner on startup
        const apiBaseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 2785}`;
        // The dashboard is served by NestJS at the same origin as the API now, so default to it.
        const dashboardUrl = process.env.DASHBOARD_URL || apiBaseUrl;
        this.logger.log('');
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.log('');
        this.logger.log('  🟢 Welcome to OpenWA - WhatsApp API Gateway');
        this.logger.log('');
        this.logger.log(`  📊 Dashboard: ${dashboardUrl}`);
        // Swagger is off by default under NODE_ENV=production, where the URL would answer 404.
        if ((0, bootstrap_security_1.isSwaggerEnabled)(process.env.ENABLE_SWAGGER, process.env.NODE_ENV)) {
            this.logger.log(`  📚 API Docs:  ${apiBaseUrl}/api/docs`);
        }
        this.logger.log('');
        if (isNewKey) {
            this.logger.log('  🔑 API Key (newly created):');
        }
        else {
            this.logger.log('  🔑 API Key:');
        }
        this.logger.log(`     ${bannerKeyLine(displayKey, isNewKey)}`);
        this.logger.log('');
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.log('');
    }
    /** Flush the coalesced usage counters before the DB connection closes. See ApiKeyUsageTracker. */
    async onModuleDestroy() {
        await this.usageTracker.flushOnShutdown();
    }
    /**
     * Read the bootstrap key file for the startup banner — only while it still points at a LIVE key.
     * The file is written once at first boot; when that key is later revoked, rotated, or deleted, the
     * file (and the banner quoting it) would otherwise keep advertising a dead credential. A stale file
     * is removed here too, so a backup restore that lost the key self-heals on the next boot.
     * Returns null when the file is absent, unreadable, empty, or stale.
     */
    async readLiveBootstrapKey() {
        const rawKey = (0, bootstrap_key_file_1.readBootstrapKey)(this.logger);
        if (!rawKey)
            return null;
        const stored = await this.apiKeyRepository.findOne({ where: { keyHash: this.hashKey(rawKey) } });
        const live = Boolean(stored && stored.isActive && (!stored.expiresAt || stored.expiresAt > new Date()));
        if (live)
            return rawKey;
        if (!stored) {
            // A hash miss alone does not prove the key is gone: the same raw key hashes differently under
            // a changed API_KEY_PEPPER. The prefix is seeded unhashed alongside the key, so it still finds
            // the row — when it resolves, the file holds the only copy of a still-live key and must
            // survive. Delete only when nothing carries the prefix either (e.g. a backup restore that
            // lost the key row), preserving the documented self-heal.
            const byPrefix = await this.apiKeyRepository.findOne({ where: { keyPrefix: rawKey.substring(0, 12) } });
            if (byPrefix) {
                this.logger.warn('Bootstrap API key file does not match any stored key hash — API_KEY_PEPPER changed since the key was seeded? The key itself is still live, so the file is kept; restore the original pepper, or clear the api_keys table and restart to seed a new admin key.', { keyPrefix: byPrefix.keyPrefix, action: 'bootstrap_key_pepper_mismatch' });
                return null;
            }
        }
        (0, bootstrap_key_file_1.removeBootstrapKey)('it no longer resolves to an active key', this.logger);
        return null;
    }
    /**
     * Remove the bootstrap key file when it still holds the key being revoked or deleted, so the next
     * boot's banner cannot point the operator at a dead credential. The file is an operator
     * convenience (banner + backup scripts); it is never read for seeding or authentication, so
     * removing it cannot break first-boot seeding — seeding writes it only when no keys exist.
     */
    removeBootstrapKeyFileIfMatching(apiKey) {
        const fileKey = (0, bootstrap_key_file_1.readBootstrapKey)(this.logger);
        if (!fileKey || this.hashKey(fileKey) !== apiKey.keyHash)
            return;
        (0, bootstrap_key_file_1.removeBootstrapKey)('its key was revoked or deleted', this.logger);
    }
    async seedApiKey(rawKey, name, role) {
        const keyHash = this.hashKey(rawKey);
        const keyPrefix = rawKey.substring(0, 12);
        const apiKey = this.apiKeyRepository.create({
            name,
            keyHash,
            keyPrefix,
            role,
        });
        return this.apiKeyRepository.save(apiKey);
    }
    async createApiKey(dto) {
        // Generate secure random key: owa_k1_<32 bytes hex>
        const rawKey = `owa_k1_${(0, crypto_1.randomBytes)(32).toString('hex')}`;
        const keyHash = this.hashKey(rawKey);
        const keyPrefix = rawKey.substring(0, 12);
        const apiKey = this.apiKeyRepository.create({
            name: dto.name,
            keyHash,
            keyPrefix,
            role: dto.role || api_key_entity_1.ApiKeyRole.OPERATOR,
            allowedIps: dto.allowedIps || null,
            allowedSessions: (0, api_key_authorization_1.normalizeScopeList)(dto.allowedSessions),
            allowedChats: (0, chat_scope_1.normalizeChatAllowList)(dto.allowedChats),
            expiresAt: dto.expiresAt ? AuthService_1.parseExpiry(dto.expiresAt) : null,
        });
        const saved = await this.apiKeyRepository.save(apiKey);
        this.keyIndex?.refreshSoon();
        this.logger.log(`API key created: ${saved.name}`, {
            keyId: saved.id,
            role: saved.role,
            action: 'api_key_created',
        });
        return { apiKey: saved, rawKey };
    }
    async findAll() {
        return this.apiKeyRepository.find({
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id) {
        const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
        if (!apiKey) {
            throw new common_1.NotFoundException(`API key with id '${id}' not found`);
        }
        return apiKey;
    }
    async update(id, dto) {
        const apiKey = await this.findOne(id);
        // Scoping the last unscoped admin (non-empty allowedSessions) strips key-management just as
        // surely as demoting or expiring it: @RequireUnscopedKey would then 403 every lifecycle route.
        const stripsAdmin = (dto.role !== undefined && dto.role !== api_key_entity_1.ApiKeyRole.ADMIN) ||
            ((0, api_key_authorization_1.normalizeScopeList)(dto.allowedSessions)?.length ?? 0) > 0 ||
            ((0, chat_scope_1.normalizeChatAllowList)(dto.allowedChats)?.length ?? 0) > 0;
        const expiry = dto.expiresAt ? AuthService_1.parseExpiry(dto.expiresAt) : null;
        const setsExpiry = expiry !== null;
        const removesOrSchedulesLastAdmin = stripsAdmin || setsExpiry;
        // Capture the authorization-relevant fields BEFORE applying the change. Only a change to role,
        // allowedIps, allowedSessions, allowedChats, or expiry can widen or restrict what an already-connected WebSocket
        // socket may see, so only those trigger eviction of live /events sockets — a benign rename must
        // NOT disconnect clients. REST enforces the new state immediately; without eviction a live socket
        // keeps streaming events for sessions/IPs the key just lost until it resubscribes or drops.
        const before = {
            role: apiKey.role,
            allowedIps: apiKey.allowedIps,
            allowedSessions: apiKey.allowedSessions,
            allowedChats: apiKey.allowedChats,
            expiresAt: apiKey.expiresAt,
        };
        const patch = {};
        if (dto.name)
            patch.name = dto.name;
        if (dto.role)
            patch.role = dto.role;
        if (dto.allowedIps !== undefined)
            patch.allowedIps = dto.allowedIps;
        if (dto.allowedSessions !== undefined)
            patch.allowedSessions = (0, api_key_authorization_1.normalizeScopeList)(dto.allowedSessions);
        if (dto.allowedChats !== undefined)
            patch.allowedChats = (0, chat_scope_1.normalizeChatAllowList)(dto.allowedChats);
        if (dto.expiresAt !== undefined)
            patch.expiresAt = expiry;
        let saved;
        if (removesOrSchedulesLastAdmin) {
            // Guarded whatever role the pre-read saw: a concurrent promotion can make the target the last
            // usable admin before this write lands, and only the statement itself sees the live row. On a
            // row that is not a usable admin the guard passes, so non-admin keys are unaffected.
            // An expiry pushed later on a key that already expires cannot bring a lockout closer, so the
            // guard lets it through on its own; alongside a demotion or scoping it is guarded as usual.
            const result = await this.withLastAdminGuard(this.apiKeyRepository.createQueryBuilder().update(api_key_entity_1.ApiKey).set(patch), id, stripsAdmin ? undefined : (expiry ?? undefined)).execute();
            await this.assertMutationApplied(id, result.affected);
            // The row's post-write state, for the eviction comparison below.
            saved = await this.findOne(id);
        }
        else {
            await this.applyUnguardedUpdate(patch, id);
            // The row's post-write state, for the eviction comparison below.
            saved = await this.findOne(id);
        }
        this.keyIndex?.refreshSoon();
        // One fingerprint definition, two callers: this immediate eviction and the gateway's periodic
        // re-validation sweep. Sharing it keeps the two from disagreeing about what an authorization
        // change is (membership over order, '' and NULL alike, usage statistics ignored).
        if ((0, api_key_authorization_1.apiKeyAuthorizationFingerprint)(saved) !== (0, api_key_authorization_1.apiKeyAuthorizationFingerprint)(before)) {
            this.evictActiveSockets(id, 'authorization_changed');
        }
        return saved;
    }
    async delete(id) {
        const apiKey = await this.findOne(id);
        // Guarded whatever role the pre-read saw, so the statement judges the live row (see update).
        const result = await this.withLastAdminGuard(this.apiKeyRepository.createQueryBuilder().delete().from(api_key_entity_1.ApiKey), id).execute();
        await this.assertMutationApplied(id, result.affected);
        // Drop any un-flushed usage accumulator so a deleted key leaves nothing behind in the Map.
        this.usageTracker.forget(id);
        this.removeBootstrapKeyFileIfMatching(apiKey);
        this.evictActiveSockets(id, 'deleted');
        this.keyIndex?.refreshSoon();
        this.logger.log(`API key deleted: ${apiKey.name}`, {
            keyId: id,
            action: 'api_key_deleted',
        });
    }
    async revoke(id) {
        const apiKey = await this.findOne(id);
        // Guarded whatever role the pre-read saw, so the statement judges the live row (see update).
        const result = await this.withLastAdminGuard(this.apiKeyRepository.createQueryBuilder().update(api_key_entity_1.ApiKey).set({ isActive: false }), id).execute();
        await this.assertMutationApplied(id, result.affected);
        const saved = await this.findOne(id);
        // A revoked key fails validation before its next flush, so its accumulator would orphan —
        // drop it here.
        this.usageTracker.forget(id);
        this.removeBootstrapKeyFileIfMatching(apiKey);
        // Kick any WebSocket connections already authenticated with this key: without this, a revoked
        // key keeps receiving events on already-subscribed sockets until they happen to disconnect.
        this.evictActiveSockets(id, 'revoked');
        this.keyIndex?.refreshSoon();
        return saved;
    }
    /**
     * @IsDateString accepts every ISO 8601 form, but `new Date` parses only some of them: a week
     * ('2026-W40-1'), ordinal ('2026-274') or basic ('20261001T101010Z') date is an Invalid Date, which
     * would be stored as NaN and never compare as expired. Refuse it instead.
     */
    static parseExpiry(value) {
        const at = new Date(value);
        if (Number.isNaN(at.getTime()))
            throw new common_1.BadRequestException('expiresAt is not a parseable date');
        return at;
    }
    /**
     * "Usable admin" — the SQL-level subject of the last-admin invariant: an active, unexpired ADMIN
     * key with NO session scope. The key-lifecycle routes are fenced behind @RequireUnscopedKey
     * (AuthController), so a session-scoped admin can authenticate but can never manage keys —
     * counting it as a surviving admin would bless the removal of the last key that actually can, a
     * permanent management lockout with no in-band recovery (the boot seed only fires on an EMPTY
     * table, not on zero unscoped admins). The simple-array column stores an empty array as '' (rows
     * updated with allowedSessions: [] hold exactly that), so "no session scope" is NULL or ''.
     * Dates are stored as UTC "YYYY-MM-DD HH:mm:ss.SSS" strings, so :guardNow is bound in that exact
     * format (see guardNowParam) and the string comparison is chronological. Parameterized by column
     * prefix so one definition serves both the row being mutated (bare) and the EXISTS subquery's
     * `other` row.
     */
    static usableAdminCondition(prefix) {
        const col = (name) => (prefix ? `"${prefix}"."${name}"` : `"${name}"`);
        return (`${col('role')} = :adminRole AND ${col('isActive')} = 1 AND ` +
            `(${col('expiresAt')} IS NULL OR ${col('expiresAt')} > :guardNow) AND ` +
            `(${col('allowedSessions')} = '' OR ${col('allowedSessions')} IS NULL) AND ` +
            `(${col('allowedChats')} = '' OR ${col('allowedChats')} IS NULL)`);
    }
    /**
     * The instant bound as :guardNow (and :extendsTo), formatted exactly as the SQLite driver persists datetime
     * columns (UTC "YYYY-MM-DD HH:mm:ss.SSS" — what AbstractSqliteDriver writes for a Date), so the
     * guard's comparison against stored expiresAt values is chronological.
     */
    static guardNowParam(at = new Date()) {
        return at.toISOString().slice(0, 23).replace('T', ' ');
    }
    /**
     * The surviving admin must last at least as long as the target: never expiring, or expiring no
     * earlier than a target that expires itself. A survivor due to expire first only postpones the
     * lockout, so removing (or scheduling the expiry of) a non-expiring admin next to an expiring one
     * is refused, while rotating to a key that outlives the old one still goes through. The target is
     * the statement's own row, referenced by table name because the subquery aliases its row `other`.
     */
    static OUTLASTS_TARGET = `("other"."expiresAt" IS NULL OR ` +
        `("api_keys"."expiresAt" IS NOT NULL AND "other"."expiresAt" >= "api_keys"."expiresAt"))`;
    /**
     * Bind the last-admin guard onto a single-row UPDATE/DELETE: the statement touches its target row
     * ONLY when that row is not a usable admin, or another usable admin that outlasts it survives it
     * (see OUTLASTS_TARGET), or, given `extendsTo`, that row already expires no later than it. The
     * guard runs inside the same statement as the write, so the database serializes concurrent last-admin
     * mutations — including across processes sharing this database. The disjunct is parenthesized
     * explicitly: without the outer parens, `id = :id AND NOT (…) OR EXISTS (…)` would parse as
     * `(id = :id AND NOT …) OR EXISTS (…)` and the EXISTS branch would escape the row scope.
     */
    withLastAdminGuard(qb, id, extendsTo) {
        const extension = extendsTo ? `("expiresAt" IS NOT NULL AND "expiresAt" <= :extendsTo) OR ` : '';
        // Cast: the chained this-types collapse to the union across a generic receiver.
        return qb
            .where('"id" = :id', { id })
            .andWhere(`(NOT (${AuthService_1.usableAdminCondition('')}) OR ${extension}EXISTS (` +
            `SELECT 1 FROM "api_keys" "other" WHERE "other"."id" <> :id AND ${AuthService_1.usableAdminCondition('other')} AND ` +
            `${AuthService_1.OUTLASTS_TARGET}))`)
            .setParameters({
            adminRole: api_key_entity_1.ApiKeyRole.ADMIN,
            guardNow: AuthService_1.guardNowParam(),
            ...(extendsTo && { extendsTo: AuthService_1.guardNowParam(extendsTo) }),
        });
    }
    /**
     * A guarded statement that affected zero rows either hit the guard (the target was the last
     * usable admin) or lost a race with a concurrent delete (the row is gone). Distinguish by
     * re-reading: findOne raises the same NotFoundException it does anywhere else, and a row that
     * still exists was refused by the guard.
     */
    async assertMutationApplied(id, affected) {
        if (affected)
            return;
        await this.findOne(id);
        throw new common_1.ConflictException('Cannot remove the last active admin key: no other admin key lasts as long');
    }
    /**
     * Apply a single-row UPDATE with no last-admin guard — the caller has established the target
     * cannot strand the system (a patch that neither strips nor expires a key). The SET list is only
     * the patch itself: saving the pre-read ENTITY instead would write every column from that
     * snapshot, resurrecting a revoke or demote that committed between the read and the write (a
     * rename writing isActive: true back over a concurrent false, for instance). There is no guard
     * clause that can refuse, so zero affected rows can only mean a concurrent delete won the race;
     * the re-read then raises the same NotFoundException the pre-read would have.
     */
    async applyUnguardedUpdate(patch, id) {
        const result = await this.apiKeyRepository
            .createQueryBuilder()
            .update(api_key_entity_1.ApiKey)
            .set(patch)
            .where('"id" = :id', { id })
            .execute();
        if (!result.affected) {
            await this.findOne(id);
        }
    }
    /**
     * Disconnect every WebSocket socket authenticated with the given key id. Resolved lazily via
     * ModuleRef (not constructor injection) to avoid a static DI cycle between AuthModule and
     * EventsModule. Best-effort: if the WS gateway isn't loaded (or has no sockets for the key),
     * this is a silent no-op.
     */
    evictActiveSockets(keyId, reason = 'revoked') {
        try {
            const gateway = this.moduleRef.get(events_gateway_1.EventsGateway, { strict: false });
            if (gateway) {
                gateway.evictApiKey(keyId, reason);
            }
        }
        catch (error) {
            // Eviction is best-effort: the key's DB state is already authoritative (validateApiKey
            // rejects it), so a failure here must never roll back the revoke/delete.
            this.logger.warn(`Failed to evict WebSocket sockets for key ${keyId}`, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * The current rows for a set of key ids, in one statement. Feeds the WebSocket gateway's periodic
     * re-validation of the keys behind its live sockets: an id whose row is gone simply comes back
     * absent, which the gateway reads as deleted. Usage statistics are deliberately not recorded here,
     * so a passive socket does not look like traffic.
     */
    async findAuthorizationStates(ids) {
        if (ids.length === 0)
            return [];
        return this.apiKeyRepository.findBy({ id: (0, typeorm_2.In)(ids) });
    }
    async validateApiKey(rawKey, clientIp, sessionId, { recordUsage = true } = {}) {
        // Trim before hashing so every surface agrees on what the credential is. HTTP already strips
        // surrounding whitespace from header values, so a pasted key with a stray space/newline
        // authenticates over REST but fails on the WebSocket handshake (the CONNECT payload carries the
        // literal string) — the dashboard then runs commands fine while never receiving events, and the
        // session looks permanently disconnected. Whitespace is never part of a key.
        const keyHash = this.hashKey(rawKey?.trim());
        const apiKey = await this.apiKeyRepository.findOne({ where: { keyHash } });
        if (!apiKey) {
            throw new UnresolvedApiKeyException('Invalid API key');
        }
        // Name the key before any check below can refuse it, so the audit row every caller writes for a
        // revoked, expired, IP- or session-refused key says which key to revoke or re-scope. No-op
        // outside a request scope (WebSocket frames, workers).
        (0, request_context_1.setRequestActor)({ apiKeyId: apiKey.id, apiKeyName: apiKey.name });
        if (!apiKey.isActive) {
            throw new common_1.UnauthorizedException('API key is revoked');
        }
        // Negated so a stored expiry that hydrates to an Invalid Date (every comparison false) counts as
        // expired rather than never expiring.
        if (apiKey.expiresAt && !(apiKey.expiresAt >= new Date())) {
            throw new common_1.UnauthorizedException('API key has expired');
        }
        // A live key refused by its own IP or session restriction answers 403, like every other scope
        // refusal (role, chats): the key is valid, so a client must not read it as one to discard.
        // Check IP whitelist (fail closed: if a whitelist is configured but the client
        // IP could not be determined, reject rather than silently skipping the check)
        if (apiKey.allowedIps && apiKey.allowedIps.length > 0) {
            if (!clientIp) {
                throw new common_1.ForbiddenException('Client IP could not be determined');
            }
            if (!this.isIpAllowed(clientIp, apiKey.allowedIps)) {
                this.logger.warn(`IP not allowed: ${clientIp}`, {
                    keyId: apiKey.id,
                    action: 'ip_rejected',
                });
                throw new common_1.ForbiddenException('IP address not allowed');
            }
        }
        // Check session restriction
        if (apiKey.allowedSessions && apiKey.allowedSessions.length > 0 && sessionId) {
            if (!apiKey.allowedSessions.includes(sessionId)) {
                throw new common_1.ForbiddenException('API key not authorized for this session');
            }
        }
        // Advisory stats only; the tracker coalesces the write and never throws. A caller that validates
        // the same key again later in the request (the MCP mount gate) opts out, so a request counts once.
        if (recordUsage)
            await this.usageTracker.record(apiKey);
        return apiKey;
    }
    hashKey(rawKey) {
        return (0, api_key_hash_1.hashApiKey)(rawKey, process.env.API_KEY_PEPPER);
    }
    isIpAllowed(clientIp, allowedIps) {
        // Delegate to the shared, hardened matcher (also used by the throttler and the API-key guard's IP
        // resolution): it handles both an exact IP entry and CIDR notation, and — unlike the previous local
        // parser — rejects a malformed octet instead of coercing it into range.
        return allowedIps.some(entry => (0, ip_1.ipMatches)(clientIp, entry));
    }
    hasPermission(apiKey, requiredRole) {
        const roleHierarchy = {
            [api_key_entity_1.ApiKeyRole.VIEWER]: 1,
            [api_key_entity_1.ApiKeyRole.OPERATOR]: 2,
            [api_key_entity_1.ApiKeyRole.ADMIN]: 3,
        };
        return roleHierarchy[apiKey.role] >= roleHierarchy[requiredRole];
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(api_key_entity_1.ApiKey, 'main')),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        api_key_usage_tracker_service_1.ApiKeyUsageTracker,
        core_1.ModuleRef,
        active_key_index_1.ActiveKeyIndex])
], AuthService);
