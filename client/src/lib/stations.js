export const FRESH_STATION_RE = /^(?:[BAM]?)FD-/i;

export const isFreshStation = (code) => FRESH_STATION_RE.test(String(code ?? '').trim());
