"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const convert_media_dto_1 = require("./convert-media.dto");
const app_validation_1 = require("../../../config/app-validation");
// The production pipe's own options, so these cases cannot assert a contract the running app does not apply.
const validateDto = (obj) => (0, class_validator_1.validate)((0, class_transformer_1.plainToInstance)(convert_media_dto_1.ConvertMediaDto, obj, app_validation_1.GLOBAL_VALIDATION_OPTIONS.transformOptions), app_validation_1.GLOBAL_VALIDATION_OPTIONS);
describe('ConvertMediaDto url', () => {
    it('refuses a url that is not an absolute http(s) URL, naming the field instead of the SSRF guard', async () => {
        for (const url of ['example.com/a.mp3', 'ftp://example.com/a.mp3', 'file:///etc/passwd']) {
            const errors = await validateDto({ url });
            expect(errors.map(e => e.property)).toEqual(['url']);
            expect(Object.values(errors[0].constraints ?? {})).toContain('url must be an absolute http(s) URL');
        }
    });
    it('accepts an absolute http(s) url', async () => {
        for (const url of ['https://example.com/a.mp3', 'HTTP://example.com/a.mp3', 'http://media_server:8080/a.mp3']) {
            expect(await validateDto({ url })).toHaveLength(0);
        }
    });
    it('ignores a stale url next to base64, which wins', async () => {
        expect(await validateDto({ base64: 'AAAA', url: 'junk' })).toHaveLength(0);
    });
    it('ignores an empty url next to base64, which wins', async () => {
        expect(await validateDto({ base64: 'AAAA', url: '' })).toHaveLength(0);
    });
    it('refuses an empty url without base64', async () => {
        expect((await validateDto({ url: '' })).map(e => e.property)).toContain('url');
    });
    it('checks the url when base64 is only a data-URI prefix', async () => {
        const errors = await validateDto({ base64: 'data:audio/mpeg;base64,', url: 'cdn/a.mp3' });
        expect(errors.map(e => e.property)).toContain('url');
    });
    it('still requires one of the two fields', async () => {
        expect((await validateDto({})).map(e => e.property).sort()).toEqual(['base64', 'url']);
    });
});
