export const FRESH_STATION_RE = /^(?:[BAM]-(?:WhatsApp|Meta|Email)-Leads|SS-|[BAM]?FD-)/i;

export const isFreshStation = (code) => FRESH_STATION_RE.test(String(code ?? '').trim());
