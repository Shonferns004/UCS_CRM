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
Object.defineProperty(exports, "__esModule", { value: true });
// Spread the real fs so every method passes through, but as configurable props the test can spy on
// (the bare `import * as fs` namespace is non-configurable, so jest.spyOn can't redefine its methods).
jest.mock('fs', () => ({ __esModule: true, ...jest.requireActual('fs') }));
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const auth_service_1 = require("./auth.service");
const api_key_usage_tracker_service_1 = require("./api-key-usage-tracker.service");
const request_context_1 = require("../../common/services/request-context");
const active_key_index_1 = require("./active-key-index");
const api_key_entity_1 = require("./entities/api-key.entity");
// Helpers
const hashKey = (key) => (0, crypto_1.createHash)('sha256').update(key).digest('hex');
function createMockApiKey(overrides = {}) {
    return {
        id: 'uuid-1',
        name: 'Test Key',
        keyHash: hashKey('test-key'),
        keyPrefix: 'test-key-pre',
        role: api_key_entity_1.ApiKeyRole.OPERATOR,
        allowedIps: null,
        allowedSessions: null,
        allowedChats: null,
        isActive: true,
        expiresAt: null,
        lastUsedAt: null,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
describe('resolveSeedApiKey (first-boot default admin key)', () => {
    const ORIGINAL_ENV = process.env;
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        delete process.env.API_MASTER_KEY;
        delete process.env.ALLOW_DEV_API_KEY;
    });
    afterEach(() => {
        process.env = ORIGINAL_ENV;
    });
    it('uses API_MASTER_KEY verbatim when set', () => {
        process.env.API_MASTER_KEY = 'my-explicit-master-key';
        expect((0, auth_service_1.resolveSeedApiKey)()).toBe('my-explicit-master-key');
    });
    // validateApiKey hashes the trimmed key, so a seed hashed with a trailing newline (a Kubernetes secret
    // made --from-file) could never authenticate, and the non-empty table meant it was never reseeded.
    it('trims surrounding whitespace from API_MASTER_KEY so the seeded key can authenticate', () => {
        process.env.API_MASTER_KEY = '  my-explicit-master-key\n';
        expect((0, auth_service_1.resolveSeedApiKey)()).toBe('my-explicit-master-key');
    });
    it('treats a whitespace-only API_MASTER_KEY as unset and generates a key', () => {
        process.env.API_MASTER_KEY = '   ';
        expect((0, auth_service_1.resolveSeedApiKey)()).toMatch(/^owa_k1_[a-f0-9]{64}$/);
    });
    it('generates a random owa_k1_ key by default (no opt-in)', () => {
        expect((0, auth_service_1.resolveSeedApiKey)()).toMatch(/^owa_k1_[a-f0-9]{64}$/);
    });
    it('returns the fixed dev-admin-key only when ALLOW_DEV_API_KEY=true', () => {
        process.env.ALLOW_DEV_API_KEY = 'true';
        expect((0, auth_service_1.resolveSeedApiKey)()).toBe('dev-admin-key');
    });
    it('prefers API_MASTER_KEY over the dev opt-in', () => {
        process.env.API_MASTER_KEY = 'master-wins';
        process.env.ALLOW_DEV_API_KEY = 'true';
        expect((0, auth_service_1.resolveSeedApiKey)()).toBe('master-wins');
    });
});
describe('bannerKeyLine (startup banner key masking)', () => {
    const FULL = 'owa_k1_0123456789abcdef0123456789abcdef';
    it('prints the full key only when it was just created', () => {
        expect((0, auth_service_1.bannerKeyLine)(FULL, true)).toBe(FULL);
    });
    it('masks the key on subsequent boots — the full secret is never re-logged', () => {
        const line = (0, auth_service_1.bannerKeyLine)(FULL, false);
        expect(line).not.toContain('0123456789abcdef'); // the secret tail must not appear
        expect(line.startsWith('owa_k1_0')).toBe(true); // a short fingerprint is fine
        expect(line).toMatch(/data\/\.api-key/); // points the operator to the real source
        expect(line).not.toContain('dashboard'); // the dashboard only ever shows a key's prefix
    });
    it('names the bootstrap key file BOOTSTRAP_KEY_FILE points at', () => {
        const original = process.env.BOOTSTRAP_KEY_FILE;
        process.env.BOOTSTRAP_KEY_FILE = '/run/secrets/openwa-key';
        try {
            expect((0, auth_service_1.bannerKeyLine)(FULL, false)).toContain('(full key in /run/secrets/openwa-key)');
        }
        finally {
            if (original === undefined)
                delete process.env.BOOTSTRAP_KEY_FILE;
            else
                process.env.BOOTSTRAP_KEY_FILE = original;
        }
    });
    it('passes a placeholder through unchanged', () => {
        expect((0, auth_service_1.bannerKeyLine)('(check dashboard for keys)', false)).toBe('(check dashboard for keys)');
    });
});
describe('AuthService', () => {
    let service;
    let repository;
    /** In-memory stand-in for the api_keys table, shared by the findOne/remove mocks and the
     * statement double below. */
    let keys;
    /** Statements whose write committed (affected = 1), newest last, with whether the last-admin
     * guard clause was bound — for assertions on what actually landed, and how. */
    let committedWrites;
    /** The raw AND-fragment the last-admin guard binds, so the SQL predicate itself is asserted. */
    let lastAdminFragments;
    let keyIndex;
    beforeEach(async () => {
        keyIndex = { refreshSoon: jest.fn() };
        repository = {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            increment: jest.fn(),
            createQueryBuilder: jest.fn(),
        };
        setupKeys([]);
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                api_key_usage_tracker_service_1.ApiKeyUsageTracker,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(api_key_entity_1.ApiKey, 'main'),
                    useValue: repository,
                },
                { provide: active_key_index_1.ActiveKeyIndex, useValue: keyIndex },
            ],
        }).compile();
        service = module.get(auth_service_1.AuthService);
    });
    // ── last-admin guard test double ──────────────────────────────────
    /**
     * In-memory stand-in for the api_keys table: findOne()/save()/remove() and the query-builder
     * double below are all backed by the same Map. The last-admin guard lives inside the guarded
     * SQL statement itself, so the double's execute() evaluates the guard and performs the write as
     * ONE synchronous step — mirroring the single atomic statement, so concurrency scenarios stay
     * deterministic (statements interleave only before or after that step, never inside it). Only
     * statements built through withLastAdminGuard carry the guard (the double mirrors the clause
     * onto the andWhere call); an unguarded statement always touches an existing row.
     */
    function setupKeys(seed) {
        keys = new Map(seed.map(k => [k.id, k]));
        committedWrites = [];
        lastAdminFragments = [];
        repository.findOne.mockImplementation((options) => Promise.resolve(keys.get(options.where.id) ?? null));
        repository.remove.mockImplementation((key) => {
            keys.delete(key.id);
            return Promise.resolve(key);
        });
        repository.save.mockImplementation((key) => {
            keys.set(key.id, key);
            return Promise.resolve(key);
        });
        repository.createQueryBuilder.mockImplementation(() => {
            const qb = {
                mode: 'update',
                patch: undefined,
                targetId: undefined,
                guarded: false,
                update() {
                    this.mode = 'update';
                    return this;
                },
                delete() {
                    this.mode = 'delete';
                    return this;
                },
                from() {
                    return this;
                },
                set(patch) {
                    this.patch = patch;
                    return this;
                },
                where(_fragment, params) {
                    this.targetId = params.id;
                    return this;
                },
                andWhere(fragment) {
                    this.guarded = true;
                    lastAdminFragments.push(fragment);
                    return this;
                },
                setParameters() {
                    return this;
                },
                execute() {
                    const target = keys.get(this.targetId);
                    if (!target)
                        return Promise.resolve({ affected: 0 });
                    const guardPasses = !this.guarded ||
                        !isUsableAdminRow(target) ||
                        [...keys.values()].some(k => k.id !== target.id &&
                            isUsableAdminRow(k) &&
                            (!k.expiresAt || (!!target.expiresAt && k.expiresAt >= target.expiresAt)));
                    if (!guardPasses)
                        return Promise.resolve({ affected: 0 });
                    if (this.mode === 'delete')
                        keys.delete(this.targetId);
                    else
                        Object.assign(target, this.patch ?? {});
                    committedWrites.push({ mode: this.mode, patch: this.patch, guarded: this.guarded });
                    return Promise.resolve({ affected: 1 });
                },
            };
            return qb;
        });
    }
    /** JS mirror of the guard's "usable admin" row predicate (the SQL definition lives in the
     * service): an active, unexpired ADMIN key with no session OR chat scope. */
    function isUsableAdminRow(key) {
        return (key.role === api_key_entity_1.ApiKeyRole.ADMIN &&
            key.isActive &&
            (!key.expiresAt || key.expiresAt.getTime() > Date.now()) &&
            (!key.allowedSessions || key.allowedSessions.length === 0) &&
            (!key.allowedChats || key.allowedChats.length === 0));
    }
    function setupLiveAdmins(...ids) {
        setupKeys(ids.map(id => createMockApiKey({ id, role: api_key_entity_1.ApiKeyRole.ADMIN })));
    }
    // ── createApiKey ──────────────────────────────────────────────────
    describe('createApiKey', () => {
        it('should generate a key with owa_k1_ prefix and save to DB', async () => {
            const mockSaved = createMockApiKey({ name: 'My Key' });
            repository.create.mockReturnValue(mockSaved);
            repository.save.mockResolvedValue(mockSaved);
            const result = await service.createApiKey({ name: 'My Key' });
            expect(result.rawKey).toMatch(/^owa_k1_[a-f0-9]{64}$/);
            expect(result.apiKey).toBe(mockSaved);
            expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
                name: 'My Key',
                role: api_key_entity_1.ApiKeyRole.OPERATOR, // default
            }));
        });
        it('should use the provided role instead of default', async () => {
            const mockSaved = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.ADMIN });
            repository.create.mockReturnValue(mockSaved);
            repository.save.mockResolvedValue(mockSaved);
            await service.createApiKey({ name: 'Admin Key', role: api_key_entity_1.ApiKeyRole.ADMIN });
            expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ role: api_key_entity_1.ApiKeyRole.ADMIN }));
        });
        it('should store the SHA-256 hash, not the raw key', async () => {
            const mockSaved = createMockApiKey();
            repository.create.mockReturnValue(mockSaved);
            repository.save.mockResolvedValue(mockSaved);
            const result = await service.createApiKey({ name: 'Test' });
            const expectedHash = hashKey(result.rawKey);
            expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ keyHash: expectedHash }));
        });
        // ISO 8601 week, ordinal and basic forms pass @IsDateString but are an Invalid Date to `new Date`,
        // which was stored as NaN and read back as an expiry that never arrives.
        it.each(['2020-W01-1', '2026-274', '20261001T101010Z'])('refuses an unparseable expiresAt %s', async (expiresAt) => {
            repository.create.mockImplementation((dto) => ({ ...dto, id: 'uuid-new' }));
            await expect(service.createApiKey({ name: 'tmp', expiresAt })).rejects.toThrow(common_1.BadRequestException);
            expect(repository.save).not.toHaveBeenCalled();
        });
    });
    // ── findAll / findOne ─────────────────────────────────────────────
    describe('findAll', () => {
        it('should return all API keys ordered by createdAt DESC', async () => {
            const keys = [createMockApiKey(), createMockApiKey({ id: 'uuid-2' })];
            repository.find.mockResolvedValue(keys);
            const result = await service.findAll();
            expect(result).toHaveLength(2);
            expect(repository.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
        });
    });
    describe('findOne', () => {
        it('should return the API key if found', async () => {
            const key = createMockApiKey();
            repository.findOne.mockResolvedValue(key);
            const result = await service.findOne('uuid-1');
            expect(result).toBe(key);
        });
        it('should throw NotFoundException if key not found', async () => {
            repository.findOne.mockResolvedValue(null);
            await expect(service.findOne('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    // ── update ────────────────────────────────────────────────────────
    describe('update', () => {
        it('should update only the provided fields', async () => {
            setupKeys([createMockApiKey({ id: 'uuid-1' })]);
            const result = await service.update('uuid-1', { name: 'Updated' });
            expect(result.name).toBe('Updated');
            expect(result.role).toBe(api_key_entity_1.ApiKeyRole.OPERATOR); // unchanged
        });
        it('evicts active WebSocket sockets when allowedSessions narrows', async () => {
            const evictApiKey = jest.fn();
            jest
                .spyOn(service.moduleRef, 'get')
                .mockReturnValue({ evictApiKey });
            setupKeys([createMockApiKey({ id: 'uuid-1', allowedSessions: ['sess-A', 'sess-B'] })]);
            await service.update('uuid-1', { allowedSessions: ['sess-A'] });
            expect(evictApiKey).toHaveBeenCalledWith('uuid-1', 'authorization_changed');
        });
        it('evicts active WebSocket sockets when the role changes', async () => {
            const evictApiKey = jest.fn();
            jest
                .spyOn(service.moduleRef, 'get')
                .mockReturnValue({ evictApiKey });
            setupKeys([createMockApiKey({ id: 'uuid-1', role: api_key_entity_1.ApiKeyRole.OPERATOR })]);
            await service.update('uuid-1', { role: api_key_entity_1.ApiKeyRole.ADMIN });
            expect(evictApiKey).toHaveBeenCalledWith('uuid-1', 'authorization_changed');
        });
        it('does not evict on a benign (name-only) update', async () => {
            const evictApiKey = jest.fn();
            jest
                .spyOn(service.moduleRef, 'get')
                .mockReturnValue({ evictApiKey });
            setupKeys([createMockApiKey({ id: 'uuid-1', name: 'original' })]);
            await service.update('uuid-1', { name: 'renamed' });
            expect(evictApiKey).not.toHaveBeenCalled();
        });
        it('rejects demoting or expiring the last usable admin', async () => {
            setupKeys([createMockApiKey({ id: 'uuid-1', role: api_key_entity_1.ApiKeyRole.ADMIN })]);
            await expect(service.update('uuid-1', { role: api_key_entity_1.ApiKeyRole.OPERATOR })).rejects.toThrow(/last active admin/i);
            await expect(service.update('uuid-1', { expiresAt: new Date(Date.now() + 60_000).toISOString() })).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // neither write landed
        });
        it.each([api_key_entity_1.ApiKeyRole.OPERATOR, api_key_entity_1.ApiKeyRole.ADMIN])('refuses an unparseable expiresAt on a %s key without writing it', async (role) => {
            setupKeys([
                createMockApiKey({ id: 'uuid-1', role }),
                createMockApiKey({ id: 'uuid-2', role: api_key_entity_1.ApiKeyRole.ADMIN }),
            ]);
            await expect(service.update('uuid-1', { expiresAt: '2026-W40-1' })).rejects.toThrow(common_1.BadRequestException);
            expect(committedWrites).toHaveLength(0);
            expect((await service.findOne('uuid-1')).expiresAt).toBeNull();
        });
    });
    // ── delete / revoke ───────────────────────────────────────────────
    describe('delete', () => {
        it('should remove the API key from DB', async () => {
            setupKeys([createMockApiKey()]);
            await service.delete('uuid-1');
            await expect(service.findOne('uuid-1')).rejects.toThrow(common_1.NotFoundException);
        });
        it('should throw NotFoundException for non-existent key', async () => {
            repository.findOne.mockResolvedValue(null);
            await expect(service.delete('nonexistent')).rejects.toThrow(common_1.NotFoundException);
        });
        it('evicts active WebSocket sockets authenticated with the deleted key', async () => {
            const evictApiKey = jest.fn();
            jest
                .spyOn(service.moduleRef, 'get')
                .mockReturnValue({ evictApiKey });
            setupKeys([createMockApiKey()]);
            await service.delete('uuid-1');
            await expect(service.findOne('uuid-1')).rejects.toThrow(common_1.NotFoundException);
            expect(evictApiKey).toHaveBeenCalledWith('uuid-1', 'deleted');
        });
        it('rejects deleting the last usable admin but allows it when another usable admin exists', async () => {
            setupKeys([createMockApiKey({ id: 'uuid-1', role: api_key_entity_1.ApiKeyRole.ADMIN })]);
            await expect(service.delete('uuid-1')).rejects.toThrow(/last active admin/i);
            setupKeys([
                createMockApiKey({ id: 'uuid-1', role: api_key_entity_1.ApiKeyRole.ADMIN }),
                createMockApiKey({ id: 'uuid-2', role: api_key_entity_1.ApiKeyRole.ADMIN }),
            ]);
            await expect(service.delete('uuid-1')).resolves.toBeUndefined();
            await expect(service.findOne('uuid-1')).rejects.toThrow(common_1.NotFoundException); // one delete committed
            await expect(service.findOne('uuid-2')).resolves.toBeDefined(); // the survivor is intact
        });
    });
    describe('active key index', () => {
        it('is refreshed after every key write', async () => {
            repository.create.mockImplementation((dto) => ({ ...dto, id: 'uuid-new' }));
            await service.createApiKey({ name: 'new' });
            expect(keyIndex.refreshSoon).toHaveBeenCalledTimes(1);
            setupKeys([createMockApiKey({ id: 'uuid-1' }), createMockApiKey({ id: 'uuid-2' })]);
            await service.update('uuid-1', { name: 'renamed' });
            expect(keyIndex.refreshSoon).toHaveBeenCalledTimes(2);
            await service.revoke('uuid-1');
            expect(keyIndex.refreshSoon).toHaveBeenCalledTimes(3);
            await service.delete('uuid-2');
            expect(keyIndex.refreshSoon).toHaveBeenCalledTimes(4);
        });
    });
    describe('revoke', () => {
        it('should set isActive to false', async () => {
            setupKeys([createMockApiKey({ id: 'uuid-1', isActive: true })]);
            const result = await service.revoke('uuid-1');
            expect(result.isActive).toBe(false);
        });
        it('evicts active WebSocket sockets authenticated with the revoked key', async () => {
            const evictApiKey = jest.fn();
            jest
                .spyOn(service.moduleRef, 'get')
                .mockReturnValue({ evictApiKey });
            setupKeys([createMockApiKey({ id: 'uuid-1', isActive: true })]);
            await service.revoke('uuid-1');
            expect((await service.findOne('uuid-1')).isActive).toBe(false);
            expect(evictApiKey).toHaveBeenCalledWith('uuid-1', 'revoked');
        });
        it('does not roll back the revoke if WebSocket eviction throws (best-effort)', async () => {
            jest
                .spyOn(service.moduleRef, 'get')
                .mockImplementation(() => {
                throw new Error('gateway unavailable');
            });
            setupKeys([createMockApiKey({ id: 'uuid-1', isActive: true })]);
            const result = await service.revoke('uuid-1');
            expect(result.isActive).toBe(false); // revoke still succeeded
        });
        it('rejects revoking the last usable admin', async () => {
            setupKeys([createMockApiKey({ id: 'uuid-1', role: api_key_entity_1.ApiKeyRole.ADMIN, isActive: true })]);
            await expect(service.revoke('uuid-1')).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the write never landed
            expect((await service.findOne('uuid-1')).isActive).toBe(true);
        });
    });
    // ── last-admin guard under concurrency ─────────────────────────────
    describe('last-admin guard under concurrency', () => {
        const outcomes = (results) => ({
            succeeded: results.filter(r => r.status === 'fulfilled'),
            conflicts: results.filter(r => r.status === 'rejected' && r.reason instanceof common_1.ConflictException),
        });
        it('rejects exactly one of two concurrent deletes against the last two admins', async () => {
            setupLiveAdmins('admin-a', 'admin-b');
            // Without statement-level guard+write, both checks run before either delete commits and both
            // pass.
            const results = await Promise.allSettled([service.delete('admin-a'), service.delete('admin-b')]);
            const { succeeded, conflicts } = outcomes(results);
            expect(succeeded).toHaveLength(1);
            expect(conflicts).toHaveLength(1);
            const survivors = await Promise.allSettled([service.findOne('admin-a'), service.findOne('admin-b')]);
            expect(survivors.filter(r => r.status === 'fulfilled')).toHaveLength(1); // one admin survives — no lockout
        });
        it('rejects exactly one of a concurrent demote and revoke against the last two admins', async () => {
            setupLiveAdmins('admin-a', 'admin-b');
            const results = await Promise.allSettled([
                service.update('admin-a', { role: api_key_entity_1.ApiKeyRole.OPERATOR }),
                service.revoke('admin-b'),
            ]);
            const { succeeded, conflicts } = outcomes(results);
            expect(succeeded).toHaveLength(1);
            expect(conflicts).toHaveLength(1);
            // The loser's write never happened: exactly one capability-stripping write in total.
            const strippingWrites = committedWrites.filter(w => w.mode === 'delete' ||
                (w.patch?.role !== undefined && w.patch.role !== api_key_entity_1.ApiKeyRole.ADMIN) ||
                w.patch?.isActive === false);
            expect(strippingWrites).toHaveLength(1);
        });
        it('lets concurrent deletes proceed when another usable admin remains', async () => {
            setupLiveAdmins('admin-a', 'admin-b', 'admin-c');
            const results = await Promise.allSettled([service.delete('admin-a'), service.delete('admin-b')]);
            const { succeeded, conflicts } = outcomes(results);
            expect(succeeded).toHaveLength(2);
            expect(conflicts).toHaveLength(0);
            await expect(service.findOne('admin-a')).rejects.toThrow(common_1.NotFoundException);
            await expect(service.findOne('admin-b')).rejects.toThrow(common_1.NotFoundException);
        });
        it('lets the guard pass non-admin mutations and runs a benign admin update unguarded', async () => {
            setupKeys([
                createMockApiKey({ id: 'op-del', role: api_key_entity_1.ApiKeyRole.OPERATOR }),
                createMockApiKey({ id: 'op-rev', role: api_key_entity_1.ApiKeyRole.OPERATOR }),
                createMockApiKey({ id: 'op-demote', role: api_key_entity_1.ApiKeyRole.OPERATOR }),
                createMockApiKey({ id: 'adm-1', role: api_key_entity_1.ApiKeyRole.ADMIN }),
            ]);
            await service.delete('op-del'); // non-admin delete
            await service.revoke('op-rev'); // non-admin revoke
            await service.update('op-demote', { role: api_key_entity_1.ApiKeyRole.VIEWER }); // demote of a non-admin
            await service.update('adm-1', { name: 'renamed' }); // benign update of an admin
            // Delete, revoke and demote carry the guard whatever role the pre-read saw, and it passes on
            // a row that is not a usable admin. The benign admin rename runs unguarded even though the
            // target IS a usable admin, because a non-stripping patch cannot strand the system.
            expect(committedWrites.map(w => [w.mode, w.guarded])).toEqual([
                ['delete', true],
                ['update', true],
                ['update', true],
                ['update', false],
            ]);
            await expect(service.findOne('op-del')).rejects.toThrow(common_1.NotFoundException);
            expect((await service.findOne('op-rev')).isActive).toBe(false);
        });
    });
    // ── racing mutations on the unguarded paths ───────────────────────
    describe('racing mutations on unguarded targets', () => {
        // Both scenarios model the same interleaving: the pre-read (findOne #1) returns a STALE
        // snapshot, a concurrent mutation has already committed into the table by the time the
        // write runs. The write must carry only its own patch — a full-entity save from the stale
        // snapshot would resurrect the concurrent commit.
        it('a rename does not resurrect a concurrent revoke: the write carries only name', async () => {
            setupKeys([createMockApiKey({ id: 'op-1', role: api_key_entity_1.ApiKeyRole.OPERATOR, isActive: false, name: 'original' })]);
            repository.findOne.mockResolvedValueOnce(createMockApiKey({ id: 'op-1', role: api_key_entity_1.ApiKeyRole.OPERATOR, isActive: true, name: 'original' }));
            const result = await service.update('op-1', { name: 'renamed' });
            expect(result.name).toBe('renamed');
            expect(result.isActive).toBe(false); // the revoke survives the rename
            expect((await service.findOne('op-1')).isActive).toBe(false); // in the table, not just the reply
        });
        it('a revoke does not clobber a concurrent rename: isActive is the only column written', async () => {
            setupKeys([createMockApiKey({ id: 'op-1', role: api_key_entity_1.ApiKeyRole.OPERATOR, isActive: true, name: 'renamed-by-peer' })]);
            repository.findOne.mockResolvedValueOnce(createMockApiKey({ id: 'op-1', role: api_key_entity_1.ApiKeyRole.OPERATOR, isActive: true, name: 'original' }));
            const result = await service.revoke('op-1');
            expect(result.isActive).toBe(false);
            expect(result.name).toBe('renamed-by-peer'); // the concurrent rename survives the revoke
            expect((await service.findOne('op-1')).name).toBe('renamed-by-peer');
        });
        // The pre-read saw an operator, but a concurrent promotion (and the delete of the old admin) has
        // committed by the time the write runs: the target is now the last usable admin, and the guard
        // must judge that live row rather than the stale role.
        describe('a target promoted to the last usable admin after the pre-read', () => {
            beforeEach(() => {
                setupKeys([createMockApiKey({ id: 'key-b', role: api_key_entity_1.ApiKeyRole.ADMIN })]);
                repository.findOne.mockResolvedValueOnce(createMockApiKey({ id: 'key-b', role: api_key_entity_1.ApiKeyRole.OPERATOR }));
            });
            it('refuses to scope it', async () => {
                await expect(service.update('key-b', { allowedSessions: ['s1'] })).rejects.toThrow(common_1.ConflictException);
                expect(committedWrites).toHaveLength(0);
            });
            it('refuses to revoke it', async () => {
                await expect(service.revoke('key-b')).rejects.toThrow(common_1.ConflictException);
                expect(committedWrites).toHaveLength(0);
            });
            it('refuses to delete it', async () => {
                await expect(service.delete('key-b')).rejects.toThrow(common_1.ConflictException);
                await expect(service.findOne('key-b')).resolves.toBeDefined();
            });
        });
    });
    // ── last-admin invariant vs session-scoped admins ─────────────────
    describe('last-admin invariant vs session-scoped admins', () => {
        // Key-lifecycle routes are fenced behind @RequireUnscopedKey, so a session-scoped admin can
        // never manage keys: it must NOT count as a surviving admin, and scoping the last unscoped
        // admin must be rejected like a demotion — otherwise the system locks itself out for good.
        const unscopedAdmin = (id) => createMockApiKey({ id, role: api_key_entity_1.ApiKeyRole.ADMIN });
        const scopedAdmin = (id) => createMockApiKey({ id, role: api_key_entity_1.ApiKeyRole.ADMIN, allowedSessions: ['sess-1'] });
        // A chat-scoped admin is likewise fenced out of key management (its routes are not
        // @ChatScoped, so the guard refuses it), so it must not count as a usable admin either.
        const chatScopedAdmin = (id) => createMockApiKey({ id, role: api_key_entity_1.ApiKeyRole.ADMIN, allowedChats: ['123@g.us'] });
        it('rejects deleting the last unscoped admin even while a session-scoped admin survives', async () => {
            setupKeys([unscopedAdmin('admin-a'), scopedAdmin('admin-scoped')]);
            await expect(service.delete('admin-a')).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the refused delete never landed
            await expect(service.findOne('admin-a')).resolves.toBeDefined();
        });
        it('rejects revoking the last unscoped admin even while a session-scoped admin survives', async () => {
            setupKeys([unscopedAdmin('admin-a'), scopedAdmin('admin-scoped')]);
            await expect(service.revoke('admin-a')).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the refused write never landed
        });
        it('rejects demoting the last unscoped admin even while a session-scoped admin survives', async () => {
            setupKeys([unscopedAdmin('admin-a'), scopedAdmin('admin-scoped')]);
            await expect(service.update('admin-a', { role: api_key_entity_1.ApiKeyRole.OPERATOR })).rejects.toThrow(/last active admin/i);
        });
        it('rejects scoping the last unscoped admin — the same capability-stripping as a demotion', async () => {
            setupKeys([unscopedAdmin('admin-a'), scopedAdmin('admin-scoped')]);
            await expect(service.update('admin-a', { allowedSessions: ['sess-9'] })).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the refused write never landed
        });
        it('treats an empty allowedSessions write as unscoped — not capability-stripping', async () => {
            setupKeys([unscopedAdmin('admin-a')]);
            await expect(service.update('admin-a', { allowedSessions: [] })).resolves.toBeDefined();
        });
        it('lets a session-scoped admin be deleted — it never counted toward the invariant', async () => {
            setupKeys([unscopedAdmin('admin-a'), scopedAdmin('admin-scoped')]);
            await expect(service.delete('admin-scoped')).resolves.toBeUndefined();
            await expect(service.findOne('admin-scoped')).rejects.toThrow(common_1.NotFoundException);
            await expect(service.findOne('admin-a')).resolves.toBeDefined();
        });
        it('the guard SQL excludes a chat-scoped key (the predicate the database actually runs)', async () => {
            // The isUsableAdminRow mirror above cannot prove the SQL: the string is never executed by the
            // mock. Assert the AND-fragment the guard binds names allowedChats, so dropping the clause
            // fails here rather than in production.
            setupKeys([unscopedAdmin('admin-a'), chatScopedAdmin('admin-chat')]);
            await expect(service.update('admin-a', { role: api_key_entity_1.ApiKeyRole.OPERATOR })).rejects.toThrow(/last active admin/i);
            expect(lastAdminFragments.join(' ')).toContain('allowedChats');
        });
        it('rejects deleting the last unscoped admin even while a chat-scoped admin survives', async () => {
            setupKeys([unscopedAdmin('admin-a'), chatScopedAdmin('admin-chat')]);
            await expect(service.delete('admin-a')).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the refused delete never landed
            await expect(service.findOne('admin-a')).resolves.toBeDefined();
        });
        it('rejects scoping the last unscoped admin to chats — the same capability-stripping', async () => {
            setupKeys([unscopedAdmin('admin-a'), chatScopedAdmin('admin-chat')]);
            await expect(service.update('admin-a', { allowedChats: ['123@g.us'] })).rejects.toThrow(/last active admin/i);
            expect(committedWrites).toHaveLength(0); // the refused write never landed
        });
        it('lets a chat-scoped admin be deleted — it never counted toward the invariant', async () => {
            setupKeys([unscopedAdmin('admin-a'), chatScopedAdmin('admin-chat')]);
            await expect(service.delete('admin-chat')).resolves.toBeUndefined();
            await expect(service.findOne('admin-a')).resolves.toBeDefined();
        });
        it('allows stripping an unscoped admin when another unscoped admin remains', async () => {
            setupKeys([unscopedAdmin('admin-a'), unscopedAdmin('admin-b'), scopedAdmin('admin-scoped')]);
            await expect(service.update('admin-a', { allowedSessions: ['sess-9'] })).resolves.toBeDefined();
        });
        it('evaluates the guard against the row’s live state, not the pre-read snapshot', async () => {
            // The pre-read sees a usable admin; by the time the guarded statement runs, a concurrent
            // mutation has already demoted it. The guard reads the row's CURRENT state inside the
            // statement (the table double below), so there is no spurious conflict — the delete goes
            // through and the demoted key is gone.
            setupKeys([createMockApiKey({ id: 'admin-a', role: api_key_entity_1.ApiKeyRole.OPERATOR })]);
            repository.findOne.mockResolvedValueOnce(createMockApiKey({ id: 'admin-a', role: api_key_entity_1.ApiKeyRole.ADMIN }));
            await expect(service.delete('admin-a')).resolves.toBeUndefined();
            await expect(service.findOne('admin-a')).rejects.toThrow(common_1.NotFoundException);
        });
    });
    // ── validateApiKey ────────────────────────────────────────────────
    describe('validateApiKey', () => {
        it('should return the API key for a valid raw key', async () => {
            const rawKey = 'test-key';
            const key = createMockApiKey({ keyHash: hashKey(rawKey) });
            repository.findOne.mockResolvedValue(key);
            repository.save.mockImplementation(k => Promise.resolve(k));
            const result = await service.validateApiKey(rawKey);
            expect(result.id).toBe(key.id);
            expect(result.usageCount).toBe(1);
            expect(result.lastUsedAt).toBeInstanceOf(Date);
        });
        it('accepts a key padded with whitespace, as HTTP header parsing already does', async () => {
            // A key pasted with a stray space authenticates over REST (header values are trimmed in
            // transit) and must authenticate over the WebSocket handshake too, which carries the
            // literal string from the CONNECT payload.
            const rawKey = 'padded-key';
            const key = createMockApiKey({ keyHash: hashKey(rawKey) });
            repository.findOne.mockResolvedValue(key);
            repository.save.mockImplementation(k => Promise.resolve(k));
            await expect(service.validateApiKey(` ${rawKey}\n`)).resolves.toMatchObject({ id: key.id });
        });
        it('leaves the usage stats alone when the caller opts out of recording', async () => {
            const rawKey = 'gate-key';
            const key = createMockApiKey({ keyHash: hashKey(rawKey), lastUsedAt: new Date(Date.now() - 5 * 60_000) });
            repository.findOne.mockResolvedValue(key);
            const result = await service.validateApiKey(rawKey, undefined, undefined, { recordUsage: false });
            expect(result.id).toBe(key.id);
            expect(result.usageCount).toBe(0);
            expect(repository.update).not.toHaveBeenCalled();
            expect(repository.increment).not.toHaveBeenCalled();
        });
        it('coalesces the usage-stat write within the throttle window', async () => {
            const rawKey = 'recent-key';
            const seen = new Date(Date.now() - 1000); // inside the throttle window
            const key = createMockApiKey({ keyHash: hashKey(rawKey), lastUsedAt: seen, usageCount: 5 });
            repository.findOne.mockResolvedValue(key);
            const result = await service.validateApiKey(rawKey);
            expect(repository.update).not.toHaveBeenCalled(); // throttled — no DB write this request
            expect(result.usageCount).toBe(6); // but the count is still reflected in-memory
            expect(result.lastUsedAt.getTime()).toBeGreaterThan(seen.getTime()); // and so is the stamp
        });
        it('flushes the usage-stat write once the throttle window has elapsed', async () => {
            const rawKey = 'stale-key';
            const key = createMockApiKey({
                keyHash: hashKey(rawKey),
                lastUsedAt: new Date(Date.now() - 5 * 60_000),
                usageCount: 5,
            });
            repository.findOne.mockResolvedValue(key);
            repository.update.mockResolvedValue({ affected: 1 });
            await service.validateApiKey(rawKey);
            // Scoped to the usage columns: persisting the whole entity here would write back the
            // authorisation state this request loaded, reverting any concurrent administrator change.
            const [criteria, patch] = repository.update.mock.calls[0];
            expect(criteria).toEqual({ id: key.id });
            expect(Object.keys(patch).sort()).toEqual(['lastUsedAt', 'usageCount']);
            // An increment by this request's delta, not the loaded value plus it.
            expect(patch.usageCount()).toBe('"usageCount" + 1');
            expect(repository.save).not.toHaveBeenCalled();
        });
        it('should throw UnauthorizedException for invalid key', async () => {
            repository.findOne.mockResolvedValue(null);
            await expect(service.validateApiKey('wrong-key')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('should throw UnauthorizedException for revoked key', async () => {
            const key = createMockApiKey({ isActive: false, keyHash: hashKey('revoked') });
            repository.findOne.mockResolvedValue(key);
            await expect(service.validateApiKey('revoked')).rejects.toThrow('API key is revoked');
        });
        // Only a key that matches no row is marked unresolved, so its audit row may be sampled per IP; a
        // rejection of a stored key must stay a plain 401 so every attempt is audited.
        it('marks only an unknown key as unresolved, keeping the UnauthorizedException name', async () => {
            repository.findOne.mockResolvedValue(null);
            const unknown = await service.validateApiKey('wrong-key').catch((err) => err);
            expect(unknown).toBeInstanceOf(auth_service_1.UnresolvedApiKeyException);
            expect(unknown.name).toBe('UnauthorizedException');
            repository.findOne.mockResolvedValue(createMockApiKey({ isActive: false }));
            const revoked = await service.validateApiKey('revoked').catch((err) => err);
            expect(revoked).toBeInstanceOf(common_1.UnauthorizedException);
            expect(revoked).not.toBeInstanceOf(auth_service_1.UnresolvedApiKeyException);
        });
        it.each([
            ['revoked', { isActive: false }, undefined, undefined],
            ['expired', { expiresAt: new Date(Date.now() - 60_000) }, undefined, undefined],
            ['IP-refused', { allowedIps: ['10.0.0.1'] }, '192.168.1.1', undefined],
            ['session-refused', { allowedSessions: ['session-A'] }, undefined, 'session-B'],
        ])('stamps the request actor with a %s key before refusing it', async (_label, overrides, ip, session) => {
            repository.findOne.mockResolvedValue(createMockApiKey({ id: 'key-9', name: 'Leaked', ...overrides }));
            const actor = await (0, request_context_1.runWithRequestId)('req-1', async () => {
                await expect(service.validateApiKey('raw', ip, session)).rejects.toThrow();
                return (0, request_context_1.getRequestActor)();
            });
            expect(actor).toMatchObject({ apiKeyId: 'key-9', apiKeyName: 'Leaked' });
        });
        it('should throw UnauthorizedException for expired key', async () => {
            const expired = new Date();
            expired.setDate(expired.getDate() - 1);
            const key = createMockApiKey({ expiresAt: expired, keyHash: hashKey('expired') });
            repository.findOne.mockResolvedValue(key);
            await expect(service.validateApiKey('expired')).rejects.toThrow('API key has expired');
        });
        it('refuses a key whose stored expiry does not parse as a date', async () => {
            // Older releases stored an unparseable expiry as an Invalid Date; it must not mean "never expires".
            const key = createMockApiKey({ expiresAt: new Date('2020-W01-1'), keyHash: hashKey('bad-expiry') });
            repository.findOne.mockResolvedValue(key);
            await expect(service.validateApiKey('bad-expiry')).rejects.toThrow('API key has expired');
        });
        it('answers 403, not 401, when the IP is not allowed', async () => {
            const key = createMockApiKey({
                allowedIps: ['10.0.0.1'],
                keyHash: hashKey('ip-restricted'),
            });
            repository.findOne.mockResolvedValue(key);
            const err = await service.validateApiKey('ip-restricted', '192.168.1.1').catch((e) => e);
            expect(err).toBeInstanceOf(common_1.ForbiddenException);
            expect(err.message).toBe('IP address not allowed');
        });
        it('should pass when client IP matches allowed IPs', async () => {
            const key = createMockApiKey({
                allowedIps: ['10.0.0.1'],
                keyHash: hashKey('ip-ok'),
            });
            repository.findOne.mockResolvedValue(key);
            repository.save.mockImplementation(k => Promise.resolve(k));
            const result = await service.validateApiKey('ip-ok', '10.0.0.1');
            expect(result.id).toBe(key.id);
        });
        it('should fail closed when an IP whitelist is set but the client IP is unknown', async () => {
            const key = createMockApiKey({
                allowedIps: ['10.0.0.1'],
                keyHash: hashKey('ip-no-client'),
            });
            repository.findOne.mockResolvedValue(key);
            const err = await service.validateApiKey('ip-no-client').catch((e) => e);
            expect(err).toBeInstanceOf(common_1.ForbiddenException);
            expect(err.message).toBe('Client IP could not be determined');
        });
        it('rejects a malformed client IP instead of coercing it into an allowed range', async () => {
            const key = createMockApiKey({
                allowedIps: ['10.0.0.1/32'],
                keyHash: hashKey('ip-malformed'),
            });
            repository.findOne.mockResolvedValue(key);
            // The previous lenient parser read '10.0.0.1abc' as 10.0.0.1 and let it through; the shared
            // hardened matcher rejects a non-numeric octet, so the per-key whitelist holds.
            await expect(service.validateApiKey('ip-malformed', '10.0.0.1abc')).rejects.toThrow('IP address not allowed');
        });
        it('answers 403, not 401, when the session is not in allowedSessions', async () => {
            const key = createMockApiKey({
                allowedSessions: ['session-A'],
                keyHash: hashKey('sess-restricted'),
            });
            repository.findOne.mockResolvedValue(key);
            const err = await service.validateApiKey('sess-restricted', undefined, 'session-B').catch((e) => e);
            expect(err).toBeInstanceOf(common_1.ForbiddenException);
            expect(err.message).toBe('API key not authorized for this session');
        });
        it('keeps 401 for a revoked or expired key', async () => {
            for (const overrides of [{ isActive: false }, { expiresAt: new Date(Date.now() - 60_000) }]) {
                repository.findOne.mockResolvedValue(createMockApiKey(overrides));
                const err = await service.validateApiKey('raw').catch((e) => e);
                expect(err).toBeInstanceOf(common_1.UnauthorizedException);
            }
        });
    });
    // ── usage-stat lost-update safety + shutdown flush ────────────────
    describe('usage-stat lost-update safety', () => {
        it('keeps the accumulated delta when the windowed write fails, and the next flush carries it', async () => {
            const rawKey = 'flaky-key';
            // Fresh row per findOne, as TypeORM returns it (no identity map): the DB state never
            // reflects the failed write, so the delta must survive in the pending map.
            const freshRow = () => createMockApiKey({ keyHash: hashKey(rawKey), lastUsedAt: new Date(Date.now() - 5 * 60_000), usageCount: 5 });
            repository.findOne.mockImplementation(() => Promise.resolve(freshRow()));
            repository.update
                .mockRejectedValueOnce(new Error('db write failed'))
                .mockResolvedValue({ affected: 1 });
            // The windowed write fails: the request still succeeds (the key is valid) and the delta is kept.
            const first = await service.validateApiKey(rawKey);
            expect(first.usageCount).toBe(6);
            // Still due on the next request (DB lastUsedAt was never written) → the retry persists the
            // failed delta plus this request's increment — nothing is lost.
            await service.validateApiKey(rawKey);
            const writes = repository.update.mock.calls;
            expect(writes[1][1].usageCount()).toBe('"usageCount" + 2'); // failed delta 1 + this request 1
            // The successful retry drained the accumulator — nothing left for the shutdown flush.
            await service.onModuleDestroy();
            expect(repository.increment).not.toHaveBeenCalled();
        });
    });
    describe('usage-stat shutdown flush', () => {
        it('flushes pending deltas on module destroy with an atomic increment, only once', async () => {
            const rawKey = 'recent-key';
            repository.findOne.mockResolvedValue(createMockApiKey({ keyHash: hashKey(rawKey), lastUsedAt: new Date(), usageCount: 5 }));
            repository.increment.mockResolvedValue({ affected: 1 });
            await service.validateApiKey(rawKey); // inside the throttle window → coalesced, no DB write
            expect(repository.update).not.toHaveBeenCalled();
            await service.onModuleDestroy();
            expect(repository.increment).toHaveBeenCalledWith({ id: 'uuid-1' }, 'usageCount', 1);
            await service.onModuleDestroy(); // idempotent — nothing left pending
            expect(repository.increment).toHaveBeenCalledTimes(1);
        });
        it('does nothing on destroy when there is nothing pending', async () => {
            await service.onModuleDestroy();
            expect(repository.increment).not.toHaveBeenCalled();
        });
        it('tolerates a failing flush (destroy still resolves — stats are best-effort)', async () => {
            const rawKey = 'recent-key';
            repository.findOne.mockResolvedValue(createMockApiKey({ keyHash: hashKey(rawKey), lastUsedAt: new Date(), usageCount: 5 }));
            repository.increment.mockRejectedValue(new Error('db gone'));
            await service.validateApiKey(rawKey);
            await expect(service.onModuleDestroy()).resolves.toBeUndefined();
        });
    });
    // ── bootstrap API key file (data/.api-key) staleness ─────────────
    describe('bootstrap API key file (data/.api-key)', () => {
        let existsSpy;
        let readSpy;
        let unlinkSpy;
        let logSpy;
        const bannerText = () => logSpy.mock.calls.map(call => String(call[0])).join('\n');
        beforeEach(() => {
            existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            readSpy = jest.spyOn(fs, 'readFileSync');
            readSpy.mockReturnValue('');
            unlinkSpy = jest.spyOn(fs, 'unlinkSync');
            unlinkSpy.mockImplementation(() => undefined);
            logSpy = jest
                .spyOn(service.logger, 'log')
                .mockImplementation(() => undefined);
        });
        afterEach(() => {
            jest.restoreAllMocks();
        });
        it('revoke removes the bootstrap key file when it still holds the revoked key', async () => {
            setupKeys([createMockApiKey({ isActive: true })]); // keyHash matches hashKey('test-key')
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('test-key\n');
            await service.revoke('uuid-1');
            expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('.api-key'));
        });
        it('revoke leaves the file alone when it holds a different (still live) key', async () => {
            setupKeys([createMockApiKey({ isActive: true })]);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('another-key');
            await service.revoke('uuid-1');
            expect(unlinkSpy).not.toHaveBeenCalled();
        });
        it('delete removes the bootstrap key file when it still holds the deleted key', async () => {
            setupKeys([createMockApiKey()]);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('test-key');
            await service.delete('uuid-1');
            expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('.api-key'));
        });
        it('tolerates a missing file on revoke (nothing to clean up)', async () => {
            setupKeys([createMockApiKey({ isActive: true })]);
            existsSpy.mockReturnValue(false);
            await service.revoke('uuid-1');
            expect(unlinkSpy).not.toHaveBeenCalled();
        });
        it('boot removes a stale bootstrap file and the banner no longer advertises the dead key', async () => {
            repository.count.mockResolvedValue(1); // not first boot → the file path is consulted
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('owa_k1_deaddeaddead');
            repository.findOne.mockResolvedValue(null); // hash no longer resolves to any key
            await service.onModuleInit();
            expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('.api-key'));
            expect(bannerText()).toContain('(check dashboard for keys)');
            expect(bannerText()).not.toContain('owa_k1_d'); // no fingerprint of the dead key
        });
        it('boot keeps the bootstrap file when only the pepper changed (prefix matches, hash does not)', async () => {
            const warnSpy = jest
                .spyOn(service.logger, 'warn')
                .mockImplementation(() => undefined);
            repository.count.mockResolvedValue(1);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('owa_k1_pepperchanged');
            // The hash lookup misses (the current pepper hashes the same key differently), but the
            // unhashed prefix still resolves to the live row → wrong pepper, not a stale file.
            repository.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValue(createMockApiKey({ keyPrefix: 'owa_k1_peppe', keyHash: 'hash-under-old-pepper' }));
            await service.onModuleInit();
            expect(repository.findOne).toHaveBeenCalledWith({ where: { keyPrefix: 'owa_k1_peppe' } });
            expect(unlinkSpy).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('API_KEY_PEPPER'), expect.anything());
            expect(bannerText()).toContain('(check dashboard for keys)'); // still not advertised as live
        });
        it('boot still deletes the file when no row carries the file key prefix (genuine staleness)', async () => {
            repository.count.mockResolvedValue(1);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('owa_k1_deaddeaddead');
            repository.findOne.mockResolvedValue(null); // neither the hash nor the prefix resolves
            await service.onModuleInit();
            expect(repository.findOne).toHaveBeenCalledWith({ where: { keyPrefix: 'owa_k1_deadd' } });
            expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('.api-key'));
        });
        it('boot treats a revoked bootstrap key as stale too', async () => {
            repository.count.mockResolvedValue(1);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('test-key');
            repository.findOne.mockResolvedValue(createMockApiKey({ isActive: false }));
            await service.onModuleInit();
            expect(unlinkSpy).toHaveBeenCalled();
            expect(bannerText()).toContain('(check dashboard for keys)');
        });
        // /api/docs answers 404 whenever Swagger is off, which is the default under NODE_ENV=production.
        it.each([
            ['off by default in production', { NODE_ENV: 'production' }, false],
            ['on in production when enabled', { NODE_ENV: 'production', ENABLE_SWAGGER: 'true' }, true],
            ['on by default outside production', { NODE_ENV: 'development' }, true],
            ['off outside production when disabled', { NODE_ENV: 'development', ENABLE_SWAGGER: 'false' }, false],
        ])('boot prints the API docs URL only when it is served: %s', async (_label, env, served) => {
            const saved = { NODE_ENV: process.env.NODE_ENV, ENABLE_SWAGGER: process.env.ENABLE_SWAGGER };
            delete process.env.ENABLE_SWAGGER;
            Object.assign(process.env, env);
            try {
                repository.count.mockResolvedValue(1);
                await service.onModuleInit();
                expect(bannerText()).toContain('Dashboard:');
                expect(bannerText().includes('/api/docs')).toBe(served);
            }
            finally {
                for (const [name, value] of Object.entries(saved)) {
                    if (value === undefined)
                        delete process.env[name];
                    else
                        process.env[name] = value;
                }
            }
        });
        it('boot keeps a live bootstrap key: file untouched, banner shows the masked fingerprint', async () => {
            repository.count.mockResolvedValue(1);
            existsSpy.mockReturnValue(true);
            readSpy.mockReturnValue('test-key');
            repository.findOne.mockResolvedValue(createMockApiKey({ isActive: true }));
            await service.onModuleInit();
            expect(unlinkSpy).not.toHaveBeenCalled();
            expect(bannerText()).toMatch(/\(full key in \S*data\/\.api-key\)/);
        });
    });
    // ── hasPermission ─────────────────────────────────────────────────
    describe('hasPermission', () => {
        it('should allow ADMIN to access ADMIN routes', () => {
            const key = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.ADMIN });
            expect(service.hasPermission(key, api_key_entity_1.ApiKeyRole.ADMIN)).toBe(true);
        });
        it('should allow ADMIN to access OPERATOR routes', () => {
            const key = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.ADMIN });
            expect(service.hasPermission(key, api_key_entity_1.ApiKeyRole.OPERATOR)).toBe(true);
        });
        it('should allow ADMIN to access VIEWER routes', () => {
            const key = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.ADMIN });
            expect(service.hasPermission(key, api_key_entity_1.ApiKeyRole.VIEWER)).toBe(true);
        });
        it('should deny VIEWER access to OPERATOR routes', () => {
            const key = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.VIEWER });
            expect(service.hasPermission(key, api_key_entity_1.ApiKeyRole.OPERATOR)).toBe(false);
        });
        it('should deny OPERATOR access to ADMIN routes', () => {
            const key = createMockApiKey({ role: api_key_entity_1.ApiKeyRole.OPERATOR });
            expect(service.hasPermission(key, api_key_entity_1.ApiKeyRole.ADMIN)).toBe(false);
        });
    });
    // ── isIpAllowed / ipInCidr (via validateApiKey) ───────────────────
    describe('IP CIDR validation (via validateApiKey)', () => {
        it('should allow IP within CIDR range', async () => {
            const key = createMockApiKey({
                allowedIps: ['192.168.1.0/24'],
                keyHash: hashKey('cidr-ok'),
            });
            repository.findOne.mockResolvedValue(key);
            repository.save.mockImplementation(k => Promise.resolve(k));
            const result = await service.validateApiKey('cidr-ok', '192.168.1.100');
            expect(result.id).toBe(key.id);
        });
        it('should reject IP outside CIDR range', async () => {
            const key = createMockApiKey({
                allowedIps: ['192.168.1.0/24'],
                keyHash: hashKey('cidr-fail'),
            });
            repository.findOne.mockResolvedValue(key);
            await expect(service.validateApiKey('cidr-fail', '10.0.0.1')).rejects.toThrow('IP address not allowed');
        });
        it('should handle mixed exact IP and CIDR entries', async () => {
            const key = createMockApiKey({
                allowedIps: ['10.0.0.5', '192.168.0.0/16'],
                keyHash: hashKey('mixed'),
            });
            repository.findOne.mockResolvedValue(key);
            repository.save.mockImplementation(k => Promise.resolve(k));
            // Exact match
            const r1 = await service.validateApiKey('mixed', '10.0.0.5');
            expect(r1.id).toBe(key.id);
            // Reset usage for second call
            key.usageCount = 0;
            // CIDR match
            const r2 = await service.validateApiKey('mixed', '192.168.50.1');
            expect(r2.id).toBe(key.id);
        });
    });
    // ── API_KEY_PEPPER wiring ─────────────────────────────────────────
    // Proves the service's hashing path actually reads the env var (not just the pure helper). We
    // assert on the keyHash the service QUERIES findOne with, since the mock returns regardless.
    describe('hashKey reads API_KEY_PEPPER', () => {
        const ORIGINAL_ENV = process.env;
        afterEach(() => {
            process.env = ORIGINAL_ENV;
        });
        const queriedHash = async (rawKey) => {
            repository.findOne.mockResolvedValue(null);
            await expect(service.validateApiKey(rawKey)).rejects.toThrow(common_1.UnauthorizedException);
            const calls = repository.findOne.mock.calls;
            return calls[0][0].where.keyHash;
        };
        it('hashes with HMAC-SHA256 when the pepper is set', async () => {
            process.env = { ...ORIGINAL_ENV, API_KEY_PEPPER: 'server-pepper' };
            const queried = await queriedHash('owa_raw_key');
            expect(queried).toBe((0, crypto_1.createHmac)('sha256', 'server-pepper').update('owa_raw_key').digest('hex'));
            expect(queried).not.toBe((0, crypto_1.createHash)('sha256').update('owa_raw_key').digest('hex'));
        });
        it('hashes with plain SHA-256 when the pepper is unset (existing keys keep validating)', async () => {
            process.env = { ...ORIGINAL_ENV };
            delete process.env.API_KEY_PEPPER;
            const queried = await queriedHash('owa_raw_key');
            expect(queried).toBe((0, crypto_1.createHash)('sha256').update('owa_raw_key').digest('hex'));
        });
    });
});
