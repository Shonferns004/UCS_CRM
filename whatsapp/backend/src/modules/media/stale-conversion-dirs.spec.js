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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// The temp dir the gateway works in (TMPDIR in production), pointed at a directory each test owns.
jest.mock('node:os', () => ({ ...jest.requireActual('node:os'), tmpdir: jest.fn() }));
const node_os_1 = require("node:os");
const ffmpeg = __importStar(require("./ffmpeg"));
const media_conversion_service_1 = require("./media-conversion.service");
const realTmp = jest.requireActual('node:os').tmpdir();
const gatewayTmp = node_os_1.tmpdir;
const HOUR_MS = 60 * 60 * 1000;
/**
 * A gateway killed mid-conversion (SIGKILL, the OOM killer) never reaches the `finally` that removes the
 * conversion's temp directory, and a disk-backed /tmp outlives the container. The next start clears them.
 */
describe('conversion directories left behind by a killed process', () => {
    let root;
    let outside;
    /** A directory under the temp root whose mtime is `ageMs` in the past. */
    const leftover = (name, ageMs) => {
        const dir = path.join(root, name);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'in.bin'), 'input');
        const at = new Date(Date.now() - ageMs);
        fs.utimesSync(dir, at, at);
        return dir;
    };
    const service = (timeoutMs) => new media_conversion_service_1.MediaConversionService({
        get: (key, fallback) => key === 'mediaConversion.timeoutMs' && timeoutMs !== undefined ? timeoutMs : fallback,
    }, {}, {});
    /** Start the service the way Nest does. */
    const start = (svc) => svc.onModuleInit?.();
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(realTmp, 'owa-tmp-root-'));
        outside = fs.mkdtempSync(path.join(realTmp, 'owa-tmp-outside-'));
        gatewayTmp.mockReturnValue(root);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        gatewayTmp.mockReset();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    });
    it('clears an old leftover when the conversion service starts', async () => {
        const old = leftover('openwa-convert-Ab12Cd', 3 * HOUR_MS);
        start(service());
        for (let i = 0; i < 100 && fs.existsSync(old); i++)
            await new Promise(resolve => setTimeout(resolve, 10));
        expect(fs.existsSync(old)).toBe(false);
    });
    it('spares anything younger than twice the conversion timeout, and never less than an hour', () => {
        const sweep = jest.spyOn(ffmpeg, 'removeStaleConversionDirs').mockResolvedValue(0);
        start(service());
        start(service(2 * HOUR_MS));
        expect(sweep.mock.calls.map(([minAgeMs]) => minAgeMs)).toEqual([HOUR_MS, 4 * HOUR_MS]);
    });
    it('removes only old conversion directories, never young ones, other entries or what a link points at', async () => {
        const old = leftover('openwa-convert-Ef34Gh', 3 * HOUR_MS);
        const young = leftover('openwa-convert-Ij56Kl', 10 * 60 * 1000);
        const unrelated = leftover('openwa-other-Mn78Op', 3 * HOUR_MS);
        const file = path.join(root, 'openwa-convert-Qr90St');
        fs.writeFileSync(file, 'not a directory');
        const target = path.join(outside, 'kept');
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'data'), 'kept');
        const link = path.join(root, 'openwa-convert-Uv12Wx');
        fs.symlinkSync(target, link);
        const at = new Date(Date.now() - 3 * HOUR_MS);
        fs.utimesSync(target, at, at);
        const warn = jest.fn();
        expect(await ffmpeg.removeStaleConversionDirs(HOUR_MS, warn)).toBe(1);
        expect(fs.existsSync(old)).toBe(false);
        expect([young, unrelated, file, link, path.join(target, 'data')].filter(p => !fs.existsSync(p))).toEqual([]);
        expect(warn).not.toHaveBeenCalled();
    });
    it('reports a temp dir it cannot list instead of throwing', async () => {
        gatewayTmp.mockReturnValue(path.join(root, 'missing'));
        const warn = jest.fn();
        await expect(ffmpeg.removeStaleConversionDirs(HOUR_MS, warn)).resolves.toBe(0);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not list the temp dir'), expect.anything());
    });
});
