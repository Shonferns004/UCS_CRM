/**
 * Site-specific extractors for the sites users actually capture from.
 *
 * Each extractor receives the document and returns SiteRow[].
 * If a site has no dedicated extractor, the generic heuristic in content.ts runs.
 *
 * These are BEST-EFFORT and may break when the site changes its DOM.
 * They always fall back to the generic extractor on failure.
 */

export interface SiteRow {
  name: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  categoryLabel: string | null;
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function extractPhoneFromText(text: string): string | null {
  const pattern = /(?:\+?\d[\d\s().-]{7,18}\d)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const candidate = match[0].trim();
    const digits = digitsOf(candidate);
    if (digits.length >= 10 && digits.length <= 13) return candidate;
  }
  return null;
}

function extractEmailFromText(text: string): string | null {
  const match = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.exec(text);
  return match ? match[0] : null;
}

function extractWebsiteFromContainer(container: Element, host: string): string | null {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) continue;
    try {
      const url = new URL(href);
      if (url.hostname === host) continue;
      if (/(facebook|instagram|twitter|x\.com|linkedin|youtube|google|bing)\.[a-z.]+$/i.test(url.hostname)) continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Bing wraps every result in `bing.com/ck/a?...&u=a1<base64url>`.
 * Without decoding it, every captured website would be a Bing redirect.
 */
function decodeBingRedirect(href: string): string | null {
  try {
    const url = new URL(href, 'https://www.bing.com');
    if (!/(^|\.)bing\.com$/i.test(url.hostname)) {
      return /^https?:\/\//i.test(href) ? href : null;
    }
    const encoded = url.searchParams.get('u');
    if (!encoded || !encoded.startsWith('a1')) return null;

    const base64 = encoded
      .slice(2)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function sanitizeCategory(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 60) return null;
  // Ratings, prices, "Open · Closes 9 pm" and bare numbers are not categories.
  if (!/[A-Za-z]{3,}/.test(text)) return null;
  if (/^[\d.,()\s%+-]+$/.test(text)) return null;
  if (/\bstars?\b/i.test(text)) return null;
  if (/^(open|closed|closes|opens|hours|temporarily closed)\b/i.test(text)) return null;
  if (/\b\d(?:\.\d)?\s*\(\s*[\d,]+\s*\)/.test(text)) return null; // "4.9 (1,204)"
  return text;
}

// ── Google Maps ──────────────────────────────────────────────────────────
export function extractGoogleMaps(doc: Document): SiteRow[] {
  const rows: SiteRow[] = [];
  const seen = new Set<string>();

  // Result cards in the side panel. The place link only wraps the name, so the
  // card itself is the closest list article.
  const links = doc.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]');
  links.forEach((link) => {
    const card = link.closest('div.Nv2PK, div[role="article"]');
    const container = card ?? link.parentElement;
    if (!container) return;

    // A bare place link (detail pane, "related places") is not a result card.
    // Reading its parent would attribute the whole pane's text to one business.
    if (!card) {
      const headline = container.querySelector('.qBF1Pd, .fontHeadlineSmall, h3');
      if (!headline) return;
    }

    const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 10) return;

    // Name: the headline div, then the place link, then any heading.
    const name =
      (container.querySelector('.qBF1Pd, .fontHeadlineSmall')?.textContent ?? '').replace(/\s+/g, ' ').trim() ||
      link.getAttribute('aria-label')?.trim() ||
      (container.querySelector('h3, [role="heading"]')?.textContent ?? '').trim() ||
      '';
    if (name.length < 2) return;

    const phone = extractPhoneFromText(text);

    // The name is the only stable identity here; the place URL is better, so
    // prefer it when present to stop the same place appearing twice. A card can
    // hold several links to the same place (name, photo), each with different
    // tracking params, so compare the path only.
    const placeHref = link.getAttribute('href') ?? '';
    const placeId = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(placeHref)?.[1] ?? '';
    const placePath = placeHref.split('?')[0] ?? '';
    const key =
      placeId.length > 0
        ? `place:${placeId}`
        : placePath.length > 0
          ? `path:${placePath}`
          : `${name.toLowerCase()}|${digitsOf(phone ?? '')}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Category and address share one block: category first, then the address.
    const detailSpans = Array.from(
      container.querySelectorAll<HTMLElement>('.UaQhfb .W4Efsd .W4Efsd span > span')
    );
    const categoryLabel = sanitizeCategory(detailSpans[0]?.textContent ?? null);
    const address =
      detailSpans
        .slice(1)
        .map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim())
        .find((value) => value.length >= 10) ?? null;

    rows.push({
      name: name.slice(0, 300),
      phone,
      website: extractWebsiteFromContainer(container, 'google.com'),
      email: extractEmailFromText(text),
      address: address ? address.slice(0, 300) : null,
      categoryLabel
    });
  });

  return rows;
}

// ── Bing search / Bing Maps ──────────────────────────────────────────────
export function extractBingMaps(doc: Document): SiteRow[] {
  const rows: SiteRow[] = [];
  const seen = new Set<string>();

  const cards = doc.querySelectorAll('div.ypResultItem, div.b_algo, li.b_algo');
  cards.forEach((card) => {
    const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 10) return;

    // The first `a` in document order is the site-icon link `.tilk`, whose text
    // is the host plus the URL breadcrumb ("wikipedia.org https://..."). The
    // real title always lives in the heading, so read that first.
    const titleAnchor = card.querySelector<HTMLAnchorElement>('h2 a[href]');
    const heading = card.querySelector('h2, .b_title, .b_algo h2');
    const name =
      (titleAnchor?.textContent ?? heading?.textContent ?? '').replace(/\s+/g, ' ').trim() ||
      card.querySelector('.tptt')?.textContent?.trim() ||
      null;
    if (!name || name.length < 2) return;

    const phone = extractPhoneFromText(text);
    const key = `${name.toLowerCase()}|${digitsOf(phone ?? '')}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Bing serves result links as bing.com/ck/a redirects; decode to the target.
    const linkAnchor =
      titleAnchor ?? card.querySelector<HTMLAnchorElement>('a.tilk[href], h2 a[href]');
    const href = linkAnchor?.getAttribute('href') ?? '';
    let website = href ? decodeBingRedirect(href) : null;

    if (!website) {
      // Last resort: the visible citation, minus the "›" path suffix.
      const cite = card.querySelector('cite')?.textContent?.trim() ?? '';
      const host = cite.split(/\s*›\s*/)[0]?.trim() ?? '';
      if (/^https?:\/\//i.test(host)) {
        try {
          website = new URL(host).origin;
        } catch {
          website = null;
        }
      }
    }

    const addressEl = card.querySelector('.b_address, .address, [class*="address"]');
    const address = addressEl?.textContent?.trim() ?? null;

    rows.push({
      name: name.slice(0, 300),
      phone,
      website,
      email: extractEmailFromText(text),
      address: address ? address.slice(0, 300) : null,
      categoryLabel: null
    });
  });

  return rows;
}

// ── Justdial ─────────────────────────────────────────────────────────────
export function extractJustdial(doc: Document): SiteRow[] {
  const rows: SiteRow[] = [];
  const seen = new Set<string>();

  const cards = doc.querySelectorAll('li.cntanr, div.resultbox, div.store-details, .jsx-');
  cards.forEach((card) => {
    const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 10) return;

    // Name
    const nameEl = card.querySelector('.lng_cont_name, span.jcn, .store-name, h2, .resultbox_title_anchor');
    const name = nameEl?.textContent?.trim() ?? null;
    if (!name || name.length < 2) return;

    // Phone: Justdial hides phone behind "Show Number" — capture visible ones
    const phoneEl = card.querySelector('.telnowpr, a.tel, .mobilesv, [class*="phone"]');
    const phone = phoneEl?.textContent?.trim() ?? extractPhoneFromText(text);
    if (!phone) return; // Justdial without visible phone is useless for us

    const key = `${name.toLowerCase()}|${digitsOf(phone)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const addressEl = card.querySelector('.cont_fl_addr, .address, [class*="address"]');
    const address = addressEl?.textContent?.trim() ?? null;

    const categoryEl = card.querySelector('.catgname, .category, [class*="category"]');
    const categoryLabel = categoryEl?.textContent?.trim() ?? null;

    rows.push({
      name: name.slice(0, 300),
      phone,
      website: extractWebsiteFromContainer(card, 'justdial.com'),
      email: extractEmailFromText(text),
      address: address ? address.slice(0, 300) : null,
      categoryLabel
    });
  });

  return rows;
}

// ── Facebook ─────────────────────────────────────────────────────────────
export function extractFacebook(doc: Document): SiteRow[] {
  const rows: SiteRow[] = [];
  const seen = new Set<string>();

  // Facebook business pages / search results
  const cards = doc.querySelectorAll('div[role="article"], div.x1yztbdb, a[role="link"]');
  cards.forEach((card) => {
    const text = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 15) return;

    // Name: h1 on a business page, or span with bold text
    let name: string | null = null;
    const h1 = doc.querySelector('h1');
    if (h1 && h1.textContent && h1.textContent.trim().length > 1 && h1.textContent.trim().length < 120) {
      name = h1.textContent.trim();
    }
    if (!name) {
      const nameEl = card.querySelector('span.x193iq5w, strong, h3');
      name = nameEl?.textContent?.trim() ?? null;
    }
    if (!name || name.length < 2) return;

    const phone = extractPhoneFromText(text);
    // Facebook rarely shows phone in search results; capture if present
    if (!phone) return;

    const key = `${name.toLowerCase()}|${digitsOf(phone)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const addressEl = card.querySelector('[class*="address"], [aria-label*="Address"]');
    const address = addressEl?.textContent?.trim() ?? null;

    rows.push({
      name: name.slice(0, 300),
      phone,
      website: extractWebsiteFromContainer(card, 'facebook.com'),
      email: extractEmailFromText(text),
      address: address ? address.slice(0, 300) : null,
      categoryLabel: null
    });
  });

  return rows;
}

// ── Instagram ───────────────────────────────────────────────────────────
export function extractInstagram(doc: Document): SiteRow[] {
  const rows: SiteRow[] = [];
  const seen = new Set<string>();

  // Instagram business profiles — phone is rarely shown directly
  const header = doc.querySelector('header, section');
  if (!header) return rows;

  const text = (header.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 5) return rows;

  // Name from header
  const nameEl = header.querySelector('h2, span.x1lliihq, a[href*="/"]');
  const name = nameEl?.textContent?.trim() ?? null;
  if (!name || name.length < 2) return rows;

  const phone = extractPhoneFromText(text);
  const email = extractEmailFromText(text);

  // Only capture if there's a phone or email (otherwise useless)
  if (!phone && !email) return rows;

  const key = `${name.toLowerCase()}|${digitsOf(phone ?? '')}|${email ?? ''}`;
  if (seen.has(key)) return rows;
  seen.add(key);

  // Website from bio link
  const bioLink = header.querySelector('a[href*="l.instagram.com"], a[rel="me nofollow"]');
  const website = bioLink?.getAttribute('href') ?? null;

  // Category from the subtitle under name
  const subtitleEl = header.querySelector('div.x7a106z span, span._aacl');
  const categoryLabel = subtitleEl?.textContent?.trim() ?? null;

  rows.push({
    name: name.slice(0, 300),
    phone,
    website,
    email,
    address: null, // Instagram rarely shows full address
    categoryLabel
  });

  return rows;
}

// ── Dispatcher ──────────────────────────────────────────────────────────
export function getSiteExtractor(hostname: string): ((doc: Document) => SiteRow[]) | null {
  const host = hostname.toLowerCase();
  if (host.includes('google.com') && (host.includes('maps') || host.includes('google.'))) {
    // Only trigger on maps pages
    if (host.includes('maps') || document.URL.includes('/maps/')) return extractGoogleMaps;
  }
  if (host.includes('bing.com')) return extractBingMaps;
  if (host.includes('justdial.com')) return extractJustdial;
  if (host.includes('facebook.com')) return extractFacebook;
  if (host.includes('instagram.com')) return extractInstagram;
  return null;
}
