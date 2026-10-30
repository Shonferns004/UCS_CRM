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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaConversionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const logger_service_1 = require("../../common/services/logger.service");
const engine_registry_service_1 = require("../../engine/engine-registry.service");
const session_entity_1 = require("../session/entities/session.entity");
const load_remote_media_1 = require("../../common/media/load-remote-media");
const ssrf_guard_1 = require("../../common/security/ssrf-guard");
const concurrency_limiter_1 = require("../../common/utils/concurrency-limiter");
const media_cap_util_1 = require("../message/media-cap.util");
const ffmpeg_1 = require("./ffmpeg");
/** Youngest leftover conversion directory the start-up sweep removes. */
const STALE_CONVERSION_DIR_MIN_AGE_MS = 60 * 60 * 1000;
let MediaConversionService = class MediaConversionService {
    configService;
    engines;
    sessionRepository;
    logger = (0, logger_service_1.createLogger)('MediaConversionService');
    /**
     * Result of the binary probe. Only a successful probe is kept: a failure can be a timeout or a
     * transient spawn error on a loaded host, so the next request probes again.
     */
    binaryAvailable;
    /**
     * Bounds concurrent conversions, input load included (the rate limiter caps admission per second,
     * not how many long-running processes stack up while each runs toward its timeout). Queue depth is
     * a small multiple of the cap, so anything beyond it answers 503 instead of accumulating; a parked
     * request holds only its own body, and at most the cap's worth of inputs sit in heap at once.
     */
    ffmpegGate;
    shutdown = new AbortController();
    constructor(configService, engines, sessionRepository) {
        this.configService = configService;
        this.engines = engines;
        this.sessionRepository = sessionRepository;
        const concurrency = this.configService.get('mediaConversion.concurrency', 2);
        this.ffmpegGate = new concurrency_limiter_1.ConcurrencyLimiter(concurrency, concurrency * 4);
    }
    /**
     * Clear what a previous process killed mid-conversion left in the temp dir. Not awaited, so a slow or
     * failing temp dir never holds up the boot. Twice the conversion timeout, and never under an hour, is older
     * than any conversion still running under the same settings in a process that shares the temp dir.
     */
    onModuleInit() {
        const timeoutMs = this.configService.get('mediaConversion.timeoutMs', 60_000);
        void (0, ffmpeg_1.removeStaleConversionDirs)(Math.max(STALE_CONVERSION_DIR_MIN_AGE_MS, 2 * timeoutMs), (message, error) => this.logger.warn(message, { error: String(error) }));
    }
    /**
     * Kill the detached ffmpeg groups still running. Nest's own signal handler re-raises the signal
     * once its hooks finish, so the process dies from it without ever emitting `exit`; this hook runs
     * on that path and on `app.close()`.
     */
    onApplicationShutdown() {
        this.shutdown.abort();
        this.ffmpegGate.close();
        (0, ffmpeg_1.killRunningConversions)();
    }
    /**
     * Convert to a WhatsApp voice note: Ogg/Opus, which is what produces a playable mic bubble.
     *
     * This exists because nothing else in the pipeline transcodes. A caller who posts MP3 bytes with
     * `ptt: true` gets them sent as-is, labelled `audio/ogg; codecs=opus` because that is the default
     * applied when no mimetype is given — the declared type and the actual bytes disagree, and the
     * recipient sees a voice note that will not play.
     */
    async convertToVoice(sessionId, dto) {
        return this.convert(sessionId, dto, 'ogg', (0, ffmpeg_1.voiceEncodeArgs)(), 'audio/ogg; codecs=opus');
    }
    /** Convert to an MP4 WhatsApp will accept and preview on every client. */
    async convertToVideo(sessionId, dto) {
        return this.convert(sessionId, dto, 'mp4', (0, ffmpeg_1.videoEncodeArgs)(), 'video/mp4');
    }
    /** Whether conversion is both switched on and actually runnable on this host. */
    async isAvailable() {
        if (this.shutdown.signal.aborted || !this.configService.get('mediaConversion.enabled', false))
            return false;
        const available = await this.probeOnce();
        return available && !this.shutdown.signal.aborted;
    }
    async convert(sessionId, dto, outputExtension, encodeArgs, outputMimetype) {
        this.assertRunning();
        await this.assertAvailable();
        try {
            // The input is loaded inside the gate: a download of up to MEDIA_DOWNLOAD_MAX_BYTES, or a decoded
            // base64 body, held for each request that had not yet reached a slot, would stack 50 MiB a request
            // in heap while the gate answers 503 only after the downloads finished.
            const { input, output } = await this.ffmpegGate.run(async () => {
                this.assertRunning();
                const loaded = await this.resolveInput(sessionId, dto);
                this.assertRunning();
                const converted = await (0, ffmpeg_1.runFfmpeg)(loaded, 'bin', outputExtension, encodeArgs, {
                    signal: this.shutdown.signal,
                    ffmpegPath: this.configService.get('mediaConversion.ffmpegPath', 'ffmpeg'),
                    timeoutMs: this.configService.get('mediaConversion.timeoutMs', 60_000),
                    maxOutputBytes: this.configService.get('mediaConversion.maxOutputBytes', 50 * 1024 * 1024),
                });
                return { input: loaded, output: converted };
            });
            this.logger.log('Media converted', { inputBytes: input.length, outputBytes: output.length, outputMimetype });
            return { base64: output.toString('base64'), mimetype: outputMimetype, bytes: output.length };
        }
        catch (error) {
            this.assertRunning();
            if (error instanceof Error && error.message === 'ConcurrencyLimiter queue full') {
                throw new common_1.ServiceUnavailableException('Media conversion is busy — retry shortly');
            }
            if (error instanceof ffmpeg_1.FfmpegSpawnError) {
                // The host could not start ffmpeg (a binary removed since the probe, or a process, memory or
                // descriptor limit), which is no fault of the input. Probe again on the next call.
                this.binaryAvailable = undefined;
                this.logger.warn('Media conversion could not start ffmpeg', { reason: error.message });
                throw new common_1.ServiceUnavailableException('Media conversion could not start the ffmpeg binary. Retry shortly, or check FFMPEG_PATH.');
            }
            if (error instanceof ffmpeg_1.FfmpegConversionError) {
                // ffmpeg's stderr is about the caller's own bytes, so returning it is what makes a rejection
                // actionable. It never names a path the caller did not supply: the only paths in the command
                // are the temp files this process created, and runFfmpeg strips their directory.
                this.logger.warn('Media conversion failed', { reason: error.message, detail: error.detail });
                throw new common_1.BadRequestException(error.detail ? `${error.message}: ${error.detail}` : error.message);
            }
            throw error;
        }
    }
    /**
     * The egress proxy a URL fetch made for this session must leave through.
     *
     * A running engine's proxy wins, including when it is none: it is the address every other byte of
     * that session leaves from, and `PATCH /proxy` can have changed the row since without restarting
     * the engine. With no engine running there is no such egress, so the stored row is used instead,
     * which keeps the fetch off the gateway's own address for a session an operator has proxied.
     */
    async sessionProxy(sessionId) {
        if (this.engines.has(sessionId)) {
            return this.engines.proxyUrl(sessionId);
        }
        // Ids are varchar, and a restored session can keep a safe non-uuid id. A NUL cannot be bound by
        // PostgreSQL, so it answers "no session" instead of raising.
        if (sessionId.includes('\0'))
            return undefined;
        const session = await this.sessionRepository.findOne({ where: { id: sessionId }, select: { proxyUrl: true } });
        return session?.proxyUrl ?? undefined;
    }
    /** Read the caller's media into memory, honouring the same caps and SSRF guard as a send. */
    async resolveInput(sessionId, dto) {
        // Stripped first: a bare `data:...;base64,` prefix holds no bytes, so a url beside it is used.
        const base64 = (0, media_cap_util_1.stripBase64DataUri)(dto.base64);
        if (base64) {
            // Checked before decoding, so an oversized payload is refused without allocating it.
            (0, media_cap_util_1.assertBase64WithinMediaCap)(base64);
            const data = Buffer.from(base64, 'base64');
            if (data.length === 0)
                throw new common_1.BadRequestException('base64 did not decode to any bytes');
            return data;
        }
        if (dto.url) {
            // Through the SSRF guard, exactly as a send does: it validates the host and pins the
            // connection to the vetted address. ffmpeg itself never sees a URL — it is restricted to the
            // file protocol and handed bytes this process already fetched and checked. It also leaves
            // through the named session's proxy, exactly as a send by URL does (#1626).
            // Resolved BEFORE the try, which exists to map a bad URL to a 400: a session-row read that
            // fails is a server fault, and reporting it as a bad URL (with the driver's own message
            // attached) would tell a client not to retry something transient.
            const proxyUrl = await this.sessionProxy(sessionId);
            try {
                const { data } = await (0, load_remote_media_1.loadRemoteMediaBuffer)(dto.url, proxyUrl);
                return data;
            }
            catch (error) {
                // The fetch layer already answers 400/413 for a bad status, a timeout, a failed connection
                // or a body over the cap (503 when the session proxy fails before any response), exactly
                // as on the send path. An SSRF block is reported
                // generically: its raw message names the resolved internal address. Anything else (a
                // malformed session proxy, say) is a server fault and stays a 500, as it does on a send,
                // rather than a 400 carrying a message that can name the proxy.
                if (error instanceof ssrf_guard_1.SsrfBlockedError) {
                    throw new common_1.BadRequestException(ssrf_guard_1.SSRF_BLOCKED_CLIENT_MESSAGE);
                }
                throw error;
            }
        }
        throw new common_1.BadRequestException('Either url or base64 must be provided');
    }
    assertRunning() {
        if (this.shutdown.signal.aborted) {
            throw new common_1.ServiceUnavailableException('Media conversion is shutting down');
        }
    }
    async assertAvailable() {
        if (!this.configService.get('mediaConversion.enabled', false)) {
            throw new common_1.ServiceUnavailableException('Media conversion is disabled. Set MEDIA_CONVERSION_ENABLED=true to enable it.');
        }
        if (!(await this.probeOnce())) {
            throw new common_1.ServiceUnavailableException('Media conversion is enabled but the ffmpeg binary could not be run. Install ffmpeg, or set FFMPEG_PATH.');
        }
    }
    /**
     * Probe until a probe succeeds. The promise itself is memoised rather than its result, so concurrent
     * first requests share one probe instead of each spawning their own.
     */
    probeOnce() {
        this.binaryAvailable ??= (0, ffmpeg_1.probeFfmpeg)(this.configService.get('mediaConversion.ffmpegPath', 'ffmpeg')).then(available => {
            if (!available) {
                this.binaryAvailable = undefined;
                this.logger.warn('Media conversion is enabled but ffmpeg could not be run');
            }
            return available;
        });
        return this.binaryAvailable;
    }
};
exports.MediaConversionService = MediaConversionService;
exports.MediaConversionService = MediaConversionService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(session_entity_1.Session, 'data')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        engine_registry_service_1.EngineRegistry,
        typeorm_2.Repository])
], MediaConversionService);
