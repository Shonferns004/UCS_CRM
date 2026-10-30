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
const common_1 = require("@nestjs/common");
const media_conversion_service_1 = require("./media-conversion.service");
const engine_registry_service_1 = require("../../engine/engine-registry.service");
const ffmpeg = __importStar(require("./ffmpeg"));
const loadRemoteMedia = __importStar(require("../../common/media/load-remote-media"));
/**
 * The behaviours worth pinning here are the ones a caller can reach: that a host without ffmpeg says
 * so instead of failing at spawn time, that the caller's bytes are size-checked on the way in, and —
 * most of all — that a remote URL is fetched through the SSRF guard and never handed to ffmpeg,
 * which would resolve it itself.
 */
describe('MediaConversionService', () => {
    const config = (overrides = {}) => {
        const values = {
            'mediaConversion.enabled': true,
            'mediaConversion.ffmpegPath': 'ffmpeg',
            'mediaConversion.timeoutMs': 60_000,
            'mediaConversion.maxOutputBytes': 50 * 1024 * 1024,
            ...overrides,
        };
        return { get: (key, fallback) => values[key] ?? fallback };
    };
    /** Route param of every call below: conversion is session-scoped even though it needs no engine. */
    const SESSION = '11111111-1111-4111-8111-111111111111';
    /** The session-row read, so a case can assert whether the row was consulted at all. */
    const findOne = jest.fn();
    /**
     * The service with a real (empty) engine registry and no session row, which is what every case
     * except the egress-proxy ones needs.
     */
    const makeService = (configService = config(), opts = {}) => {
        findOne.mockResolvedValue(opts.row ?? null);
        return new media_conversion_service_1.MediaConversionService(configService, opts.registry ?? new engine_registry_service_1.EngineRegistry(), {
            findOne,
        });
    };
    /** A registry holding a live engine for SESSION, started with the given proxy. */
    const registryWith = (proxyUrl) => {
        const registry = new engine_registry_service_1.EngineRegistry();
        registry.set(SESSION, {}, proxyUrl);
        return registry;
    };
    /** runFfmpeg(input, inputExtension, outputExtension, ...) — the third argument fixes the format. */
    const outputExtensionOf = (spy) => spy.mock.calls[0][2];
    let runFfmpeg;
    let probeFfmpeg;
    beforeEach(() => {
        findOne.mockReset();
        runFfmpeg = jest.spyOn(ffmpeg, 'runFfmpeg').mockResolvedValue(Buffer.from('converted-bytes'));
        probeFfmpeg = jest.spyOn(ffmpeg, 'probeFfmpeg').mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());
    describe('input load', () => {
        // A download resolved before the gate was a 50 MiB buffer for every request that had not reached a
        // slot, held until the gate answered 503: peak memory was the number of requests, not the cap.
        it('downloads at most as many inputs at once as it converts', async () => {
            let downloading = 0;
            let peak = 0;
            jest.spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer').mockImplementation(async () => {
                downloading++;
                peak = Math.max(peak, downloading);
                await new Promise(resolve => setTimeout(resolve, 15));
                downloading--;
                return { data: Buffer.from('input'), mimetype: 'audio/mpeg' };
            });
            runFfmpeg.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 15));
                return Buffer.from('converted-bytes');
            });
            const service = makeService(config({ 'mediaConversion.concurrency': 2 }));
            const outcomes = await Promise.allSettled(Array.from({ length: 30 }, () => service.convertToVoice(SESSION, { url: 'https://media.example/a.mp3' })));
            expect(peak).toBeLessThanOrEqual(2);
            expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(10);
            const refused = outcomes.filter((o) => o.status === 'rejected');
            expect(refused).toHaveLength(20);
            expect(refused.every(o => o.reason instanceof common_1.ServiceUnavailableException)).toBe(true);
        });
    });
    describe('availability', () => {
        it('refuses with 503 when conversion is switched off, without probing for the binary', async () => {
            const service = makeService(config({ 'mediaConversion.enabled': false }));
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toBeInstanceOf(common_1.ServiceUnavailableException);
            expect(probeFfmpeg).not.toHaveBeenCalled();
            expect(runFfmpeg).not.toHaveBeenCalled();
        });
        // Enabling the flag on a host with no ffmpeg must be a clear answer, not a spawn error.
        it('refuses with 503 when the binary cannot be run', async () => {
            probeFfmpeg.mockResolvedValue(false);
            const service = makeService(config());
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toThrow(/ffmpeg binary could not be run/);
            expect(runFfmpeg).not.toHaveBeenCalled();
        });
        it('reports availability without converting anything', async () => {
            await expect(makeService(config()).isAvailable()).resolves.toBe(true);
            await expect(makeService(config({ 'mediaConversion.enabled': false })).isAvailable()).resolves.toBe(false);
        });
        // Concurrent first requests must not each spawn their own probe.
        it('probes the binary once per process, even under concurrent first calls', async () => {
            const service = makeService(config());
            await Promise.all([
                service.isAvailable(),
                service.isAvailable(),
                service.convertToVoice(SESSION, { base64: 'AAAA' }),
            ]);
            expect(probeFfmpeg).toHaveBeenCalledTimes(1);
        });
        // A probe that timed out on a loaded host, or hit EAGAIN, says nothing lasting about the binary.
        it('probes again after a failed probe instead of reporting unavailable until restart', async () => {
            probeFfmpeg.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
            const service = makeService(config());
            await expect(service.isAvailable()).resolves.toBe(false);
            await expect(service.isAvailable()).resolves.toBe(true);
            await expect(service.isAvailable()).resolves.toBe(true);
            expect(probeFfmpeg).toHaveBeenCalledTimes(2);
        });
    });
    describe('resolving the caller’s media', () => {
        // The point of the whole endpoint shape: ffmpeg is handed BYTES, never a URL. Given a URL it
        // would fetch the address itself, outside the guard that vets and pins the destination.
        it('fetches a URL through the SSRF guard and gives ffmpeg the bytes, not the URL', async () => {
            const load = jest
                .spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer')
                .mockResolvedValue({ data: Buffer.from('remote-audio'), mimetype: 'audio/mpeg' });
            const service = makeService(config());
            await service.convertToVoice(SESSION, { url: 'https://example.com/note.m4a' });
            expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', undefined);
            const [input] = runFfmpeg.mock.calls[0];
            expect(input).toEqual(Buffer.from('remote-audio'));
            // Nothing resembling the URL may appear anywhere in the ffmpeg call.
            expect(JSON.stringify(runFfmpeg.mock.calls[0])).not.toContain('example.com');
        });
        /**
         * A conversion is a fetch the gateway makes on a session's behalf, so it has to leave from that
         * session's address rather than the gateway's own (#1626). The live engine's proxy is the
         * authority: PATCH /proxy does not restart the engine, so the row can already say something the
         * running session does not use.
         */
        describe('the egress proxy of the named session', () => {
            const loadSpy = () => jest
                .spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer')
                .mockResolvedValue({ data: Buffer.from('remote-audio'), mimetype: 'audio/mpeg' });
            it('uses the proxy the running engine was started with, not the stored row', async () => {
                const load = loadSpy();
                const service = makeService(config(), {
                    registry: registryWith('socks5://live.invalid:1080'),
                    row: { proxyUrl: 'http://edited-since.invalid:8080' },
                });
                await service.convertToVoice(SESSION, { url: 'https://example.com/note.m4a' });
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', 'socks5://live.invalid:1080');
            });
            it('fetches direct for a running session that has no proxy, whatever the row says', async () => {
                const load = loadSpy();
                const service = makeService(config(), {
                    registry: registryWith(undefined),
                    row: { proxyUrl: 'http://not-in-use.invalid:8080' },
                });
                await service.convertToVoice(SESSION, { url: 'https://example.com/note.m4a' });
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', undefined);
            });
            it('falls back to the stored proxy when the session has no live engine', async () => {
                const load = loadSpy();
                const service = makeService(config(), { row: { proxyUrl: 'socks4://stored.invalid:1080' } });
                await service.convertToVoice(SESSION, { url: 'https://example.com/note.m4a' });
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', 'socks4://stored.invalid:1080');
            });
            it('uses the saved proxy for an imported safe-string session id', async () => {
                const load = loadSpy();
                const service = makeService(config(), { row: { proxyUrl: 'socks5://stored.invalid:1080' } });
                await service.convertToVoice('legacy-session', { url: 'https://example.com/note.m4a' });
                expect(findOne).toHaveBeenCalledWith({ where: { id: 'legacy-session' }, select: { proxyUrl: true } });
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', 'socks5://stored.invalid:1080');
            });
            it('keeps direct fetch behavior for an unknown safe-string id', async () => {
                const load = loadSpy();
                const service = makeService();
                await service.convertToVoice('missing-session', { url: 'https://example.com/note.m4a' });
                expect(findOne).toHaveBeenCalledTimes(1);
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', undefined);
            });
            it('does not query a NUL-bearing session id', async () => {
                const load = loadSpy();
                const service = makeService();
                await service.convertToVoice('session\0name', { url: 'https://example.com/note.m4a' });
                expect(findOne).not.toHaveBeenCalled();
                expect(load).toHaveBeenCalledWith('https://example.com/note.m4a', undefined);
            });
            // The row read is server-side I/O, not part of the caller's input. Mapped as a bad URL it
            // would answer 400 with the driver's own message, telling a client to stop retrying a
            // failover or a locked SQLite file.
            it('does not report a failed row read as a bad URL', async () => {
                const load = loadSpy();
                const service = makeService();
                findOne.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));
                const failure = await service
                    .convertToVoice(SESSION, { url: 'https://example.com/note.m4a' })
                    .catch((error) => error);
                expect(failure).not.toBeInstanceOf(common_1.HttpException);
                expect(failure).toMatchObject({ message: 'SQLITE_BUSY: database is locked' });
                expect(load).not.toHaveBeenCalled();
            });
        });
        // A fault in the fetch that is not about the caller's URL is the server's, and its message can
        // name the session proxy; it must not come back to the client as a 400.
        it('does not report a server-side fetch fault as a bad URL', async () => {
            const fault = new Error('Unsupported proxy protocol: gopher://user:pw@proxy.invalid');
            jest.spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer').mockRejectedValue(fault);
            const service = makeService(config());
            const failure = await service
                .convertToVoice(SESSION, { url: 'https://example.com/note.m4a' })
                .catch((error) => error);
            expect(failure).toBe(fault);
        });
        it('decodes base64, stripping a data: prefix', async () => {
            const service = makeService(config());
            await service.convertToVoice(SESSION, {
                base64: `data:audio/mpeg;base64,${Buffer.from('inline').toString('base64')}`,
            });
            expect(runFfmpeg.mock.calls[0][0]).toEqual(Buffer.from('inline'));
        });
        it.each(['convertToVoice', 'convertToVideo'])('%s uses the URL when a data URI carries no base64 bytes', async (method) => {
            const load = jest
                .spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer')
                .mockResolvedValue({ data: Buffer.from('remote-media'), mimetype: 'audio/mpeg' });
            const service = makeService(config(), { registry: registryWith('socks5://live.invalid:1080') });
            await service[method](SESSION, {
                base64: 'data:audio/mpeg;base64,',
                url: 'https://example.com/media',
            });
            expect(runFfmpeg.mock.calls[0][0]).toEqual(Buffer.from('remote-media'));
            expect(load).toHaveBeenCalledWith('https://example.com/media', 'socks5://live.invalid:1080');
        });
        it('keeps nonempty base64 ahead of a stale URL', async () => {
            const load = jest.spyOn(loadRemoteMedia, 'loadRemoteMediaBuffer');
            await makeService().convertToVoice(SESSION, {
                base64: 'data:audio/mpeg;base64,aW5saW5l',
                url: 'https://example.com/ignored',
            });
            expect(runFfmpeg.mock.calls[0][0]).toEqual(Buffer.from('inline'));
            expect(load).not.toHaveBeenCalled();
        });
        it('rejects base64 above the media cap with 413, before any conversion', async () => {
            const service = makeService(config());
            const oversized = Buffer.alloc(51 * 1024 * 1024).toString('base64');
            await expect(service.convertToVoice(SESSION, { base64: oversized })).rejects.toBeInstanceOf(common_1.PayloadTooLargeException);
            expect(runFfmpeg).not.toHaveBeenCalled();
        });
        it('rejects a request carrying neither url nor base64', async () => {
            await expect(makeService(config()).convertToVoice(SESSION, {})).rejects.toThrow(/Either url or base64 must be provided/);
        });
        it('rejects base64 that decodes to nothing', async () => {
            await expect(makeService(config()).convertToVoice(SESSION, { base64: '!!!' })).rejects.toThrow(/did not decode/);
        });
    });
    describe('conversion', () => {
        it('returns Ogg/Opus for voice, which is what makes a playable mic bubble', async () => {
            const service = makeService(config());
            const result = await service.convertToVoice(SESSION, { base64: 'AAAA' });
            expect(result).toEqual({
                base64: Buffer.from('converted-bytes').toString('base64'),
                mimetype: 'audio/ogg; codecs=opus',
                bytes: 15,
            });
            expect(outputExtensionOf(runFfmpeg)).toBe('ogg');
        });
        it('returns MP4 for video', async () => {
            const service = makeService(config());
            const result = await service.convertToVideo(SESSION, { base64: 'AAAA' });
            expect(result.mimetype).toBe('video/mp4');
            expect(outputExtensionOf(runFfmpeg)).toBe('mp4');
        });
        // ffmpeg's complaint is about the caller's own bytes, so surfacing it is what makes a 400 useful.
        it('turns an ffmpeg refusal into a 400 carrying its reason', async () => {
            runFfmpeg.mockRejectedValue(new ffmpeg.FfmpegConversionError('ffmpeg exited with code 1', 'Invalid data found'));
            const service = makeService(config());
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toBeInstanceOf(common_1.BadRequestException);
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toThrow(/Invalid data found/);
        });
        // A spawn that fails (EAGAIN, EMFILE, a binary removed by an upgrade) is the host's fault, not the
        // caller's, so it answers the documented 503 and the binary is probed again on the next call.
        it('answers 503, not 400, when ffmpeg cannot be started, and probes again', async () => {
            runFfmpeg.mockRejectedValue(new ffmpeg.FfmpegSpawnError('Could not run ffmpeg: spawn ffmpeg EAGAIN'));
            const service = makeService(config());
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toBeInstanceOf(common_1.ServiceUnavailableException);
            await service.isAvailable();
            expect(probeFfmpeg).toHaveBeenCalledTimes(2);
        });
        // A programming error must not be relabelled as the caller's fault.
        it('lets an unexpected error through rather than reporting it as a bad request', async () => {
            runFfmpeg.mockRejectedValue(new TypeError('boom'));
            const service = makeService(config());
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toBeInstanceOf(TypeError);
        });
    });
    describe('concurrency gate', () => {
        // The rate limiter caps admission per second, not how many long-running ffmpeg processes stack
        // up while each runs toward its timeout — that bound lives here.
        it('bounds concurrent ffmpeg runs and answers 503 past the queue instead of stacking processes', async () => {
            // concurrency 1 → queue depth 4: five simultaneous requests fill the gate, the sixth is refused.
            const service = makeService(config({ 'mediaConversion.concurrency': 1 }));
            let release;
            runFfmpeg.mockImplementation(() => new Promise(resolve => {
                release = () => resolve(Buffer.from('x'));
            }));
            const inflight = Array.from({ length: 5 }, () => service.convertToVoice(SESSION, { base64: 'AAAA' }));
            await new Promise(resolve => setImmediate(resolve));
            expect(runFfmpeg).toHaveBeenCalledTimes(1);
            await expect(service.convertToVoice(SESSION, { base64: 'AAAA' })).rejects.toBeInstanceOf(common_1.ServiceUnavailableException);
            // Drain: release each run in turn so every parked task completes and nothing leaks.
            for (let i = 0; i < 5; i++) {
                release();
                await new Promise(resolve => setImmediate(resolve));
            }
            await Promise.all(inflight);
            expect(runFfmpeg).toHaveBeenCalledTimes(5);
        });
    });
    describe('shutdown', () => {
        // Nest's own signal handler re-raises the signal after its hooks run, so the process dies from it
        // and never emits `exit`. The shutdown hook is what still reaches the detached ffmpeg groups then.
        it('kills the running ffmpeg groups when the application shuts down', () => {
            const kill = jest.spyOn(ffmpeg, 'killRunningConversions').mockImplementation(() => undefined);
            makeService().onApplicationShutdown();
            expect(kill).toHaveBeenCalledTimes(1);
        });
    });
});
