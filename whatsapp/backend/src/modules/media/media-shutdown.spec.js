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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = __importDefault(require("node:child_process"));
const promises_1 = __importDefault(require("node:fs/promises"));
const media_conversion_service_1 = require("./media-conversion.service");
const ffmpeg = __importStar(require("./ffmpeg"));
const remoteMedia = __importStar(require("../../common/media/load-remote-media"));
const engine_registry_service_1 = require("../../engine/engine-registry.service");
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return { promise, resolve };
};
const tick = () => new Promise(done => setImmediate(done));
describe('media conversion shutdown', () => {
    const input = Buffer.from('tiny');
    let service;
    let run;
    let probe;
    beforeEach(() => {
        probe = jest.spyOn(ffmpeg, 'probeFfmpeg').mockResolvedValue(true);
        run = jest.spyOn(ffmpeg, 'runFfmpeg').mockResolvedValue(input);
        jest.spyOn(ffmpeg, 'killRunningConversions').mockImplementation(() => undefined);
        const config = {
            get: (key, fallback) => key === 'mediaConversion.enabled' ? true : key === 'mediaConversion.concurrency' ? 1 : fallback,
        };
        service = new media_conversion_service_1.MediaConversionService(config, new engine_registry_service_1.EngineRegistry(), {
            findOne: jest.fn().mockResolvedValue(null),
        });
    });
    afterEach(() => jest.restoreAllMocks());
    for (const method of ['convertToVoice', 'convertToVideo']) {
        it(`${method} rejects parked work without invoking another runner`, async () => {
            const active = deferred();
            run.mockImplementationOnce(() => active.promise);
            const first = service[method]('session', { base64: input.toString('base64') });
            const second = service[method]('session', { base64: input.toString('base64') });
            const rejected = second.catch(error => error);
            await tick();
            expect(run).toHaveBeenCalledTimes(1);
            service.onApplicationShutdown();
            expect(await rejected).toMatchObject({ status: 503 });
            active.resolve(input);
            await first;
            expect(run).toHaveBeenCalledTimes(1);
            await expect(service[method]('session', { base64: input.toString('base64') })).rejects.toMatchObject({
                status: 503,
            });
        });
        it(`${method} refuses an input that finishes loading after shutdown`, async () => {
            const loaded = deferred();
            const load = jest.spyOn(remoteMedia, 'loadRemoteMediaBuffer').mockReturnValue(loaded.promise);
            const pending = service[method]('session', { url: 'https://media.invalid/tiny.wav' });
            const rejected = pending.catch(error => error);
            await tick();
            expect(load).toHaveBeenCalledTimes(1);
            service.onApplicationShutdown();
            loaded.resolve({ data: input, mimetype: 'audio/wav' });
            expect(await rejected).toMatchObject({ status: 503 });
            expect(run).not.toHaveBeenCalled();
        });
        it(`${method} refuses a successful availability probe that settles after shutdown`, async () => {
            const ready = deferred();
            probe.mockReturnValue(ready.promise);
            const pending = service[method]('session', { base64: input.toString('base64') });
            const rejected = pending.catch(error => error);
            service.onApplicationShutdown();
            ready.resolve(true);
            expect(await rejected).toMatchObject({ status: 503 });
            expect(run).not.toHaveBeenCalled();
        });
    }
    it('reports unavailable when the probe succeeds after shutdown', async () => {
        const ready = deferred();
        probe.mockReturnValue(ready.promise);
        const pending = service.isAvailable();
        service.onApplicationShutdown();
        ready.resolve(true);
        expect(await pending).toBe(false);
        expect(await service.isAvailable()).toBe(false);
        expect(probe).toHaveBeenCalledTimes(1);
    });
});
describe('conversion process cancellation', () => {
    afterEach(() => jest.restoreAllMocks());
    it('checks cancellation after input preparation and before spawning', async () => {
        const cancellation = new AbortController();
        const write = promises_1.default.writeFile;
        jest.spyOn(promises_1.default, 'writeFile').mockImplementation(async (...args) => {
            await write(...args);
            cancellation.abort();
        });
        const spawn = jest.spyOn(node_child_process_1.default, 'spawn').mockImplementation(() => {
            throw new Error('A cancelled conversion must not spawn');
        });
        await expect(ffmpeg.runFfmpeg(Buffer.from('tiny'), 'bin', 'raw', [], {
            signal: cancellation.signal,
            ffmpegPath: 'unused',
            timeoutMs: 1000,
            maxOutputBytes: 1024,
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(spawn).not.toHaveBeenCalled();
    });
});
