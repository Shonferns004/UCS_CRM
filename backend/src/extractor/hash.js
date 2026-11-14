/**
 * Deterministic, dependency-free 64-bit FNV-1a hash.
 *
 * Ported from UcsExtractor `packages/shared/src/hash.ts`. Used to build stable
 * row keys so continuous capture (which re-reads the same DOM many times)
 * updates rows instead of duplicating them. Works identically in Node and in
 * the browser - the extension uses the same algorithm at its end when it wants
 * to pre-key a row.
 */
export function stableHash(input) {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

/** Lowercase, collapse whitespace, strip punctuation that varies per source. */
export function canonicalizePart(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripUrl(value) {
  if (!value) return '';
  return String(value)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

/**
 * Identity of a captured row.
 *
 * Phone wins when present because it is the strongest real-world key; otherwise
 * we fall back to website, then name + address.
 *
 * Source URL is deliberately NOT part of the identity. The same business shows
 * up under many search URLs (coordinates, typos, tracking params), and mixing
 * the URL in made every new search insert a duplicate row.
 */
export function buildRowHash({ name, e164, website, address }) {
  const canonicalName = canonicalizePart(name);
  const phone = e164 ?? '';
  const canonicalWebsite = canonicalizePart(stripUrl(website));
  const canonicalAddress = canonicalizePart(address);

  const identity = phone
    ? `p:${phone}`
    : canonicalWebsite
      ? `w:${canonicalWebsite}`
      : `n:${canonicalName}|a:${canonicalAddress}`;

  return stableHash(identity);
}
