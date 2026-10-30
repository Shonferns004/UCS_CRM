"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsMediaUrl = exports.isMediaUrl = exports.MEDIA_URL_MESSAGE = void 0;
const class_validator_1 = require("class-validator");
const HTTP_URL_PREFIX = /^https?:\/\//i;
exports.MEDIA_URL_MESSAGE = 'url must be an absolute http(s) URL';
/**
 * The rule for a caller-supplied media URL. Both engines fetch only a string that starts with
 * `http://` or `https://` and decode anything else as base64, so that literal prefix is required. The
 * rest must parse as a WHATWG URL with a host, which is what the fetch accepts: a space in the path is
 * percent-encoded there, not refused. The host itself is left to the SSRF-guarded fetch, so a
 * single-label host named in SSRF_ALLOWED_HOSTS and a long presigned URL are fine.
 */
const isMediaUrl = (value) => {
    if (typeof value !== 'string' || !HTTP_URL_PREFIX.test(value))
        return false;
    try {
        return new URL(value).hostname !== '';
    }
    catch {
        return false;
    }
};
exports.isMediaUrl = isMediaUrl;
/** {@link isMediaUrl} as a class-validator decorator; `ignoreWhen` skips the check for that object. */
const IsMediaUrl = (options = {}) => (0, class_validator_1.ValidateBy)({
    name: 'isMediaUrl',
    validator: {
        validate: (value, args) => (args !== undefined && options.ignoreWhen?.(args.object) === true) || (0, exports.isMediaUrl)(value),
        defaultMessage: () => exports.MEDIA_URL_MESSAGE,
    },
});
exports.IsMediaUrl = IsMediaUrl;
