"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mime_ext_1 = require("./mime-ext");
describe('extFromMimetype', () => {
    it.each([
        ['image/png', 'png'],
        ['audio/ogg; codecs=opus', 'ogg'],
        ['IMAGE/WEBP', 'webp'],
        ['application/pdf', 'pdf'],
        ['application/constructor', 'constructor'],
        ['IMAGE/CONSTRUCTOR', 'constructor'],
    ])('uses the subtype of %s as the extension', (mimetype, ext) => {
        expect((0, mime_ext_1.extFromMimetype)(mimetype)).toBe(ext);
    });
    it.each([
        ['image/jpeg', 'jpg'],
        ['video/quicktime', 'mov'],
    ])('maps %s to the conventional %s', (mimetype, ext) => {
        expect((0, mime_ext_1.extFromMimetype)(mimetype)).toBe(ext);
    });
    it.each(['', 'image', 'text/', 'image/svg+xml', 'application/vnd.ms-excel', 'image/../x'])('falls back to bin for %p', mimetype => {
        expect((0, mime_ext_1.extFromMimetype)(mimetype)).toBe('bin');
    });
});
