/**
 * UCS capture content script.
 *
 * Runs on every http(s) page but does NOTHING until the side panel sends
 * UCS_START for this tab. It has no network access of its own: rows are handed
 * to the background worker, which is the only place that talks to the API.
 *
 * Extraction is deliberately heuristic and the UI says so. We never invent a
 * value: a row without a real name or a real phone is skipped.
 */

import { getSiteExtractor } from './site-extractors';
import type { SiteRow } from './site-extractors';

interface CapturedRow {
  name: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  categoryLabel: string | null;
}

const captureWindow = window as Window & { __ucsCaptureLoaded?: boolean };

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,18}\d)/g;
const PHONE_TEST = /(?:\+?\d[\d\s().-]{7,18}\d)/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
const ADDRESS_HINT =
  /\b(road|rd\.?|street|st\.?|nagar|colony|sector|floor|building|bldg|complex|market|chowk|cross|layout|puram|layout|opp\.?|near)\b/i;
const MAX_PHONE_ANCHORS = 800;
const MAX_TEXT_NODES = 12_000;
const MAX_ROWS_PER_SCAN = 300;

const SCROLL_SELECTORS = ['div[role="feed"]', '#QA0Szd', '#search', 'ol#b_results', 'main'];

let active = false;
/** Auto-run tabs are background tabs; they must still scan while hidden. */
let allowHidden = false;
let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let lastScanAt = 0;
const seen = new Set<string>();

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function looksLikePhone(candidate: string): boolean {
  const digits = digitsOf(candidate);
  if (digits.length < 10 || digits.length > 13) return false;
  // Reject years and ranges such as "2019 - 2024".
  if (/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)) return false;
  const trimmed = candidate.trim();
  const hasSeparator = /[\s().-]/.test(trimmed);
  const hasPrefix = trimmed.startsWith('+') || trimmed.startsWith('0');
  // Indian mobiles start 6-9 and are written without separators.
  const indianMobile = /^[6-9]\d{9}$/.test(digits);
  return hasPrefix || hasSeparator || indianMobile;
}

function phoneCandidates(text: string): string[] {
  const found: string[] = [];
  PHONE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PHONE_PATTERN.exec(text)) !== null) {
    const candidate = match[0].trim();
    if (looksLikePhone(candidate)) found.push(candidate);
    if (found.length >= 3) break;
  }
  return found;
}

/** Climb from a phone occurrence to the smallest block that looks like a card. */
function containerFor(node: Element): HTMLElement | null {
  let current: Element | null = node;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const text = (current.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 12 && text.length <= 900) {
      const hasHeading = current.querySelector('h1,h2,h3,h4,h5,[role="heading"]');
      const anchors = current.querySelectorAll('a').length;
      if (hasHeading || anchors >= 1) {
        return current instanceof HTMLElement ? current : null;
      }
    }
    current = current.parentElement;
  }
  const fallback = node.closest('li, article, [role="listitem"], tr');
  return fallback instanceof HTMLElement ? fallback : null;
}

function textOf(element: Element | null): string | null {
  if (!element) return null;
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

function extractName(container: HTMLElement, phone: string): string | null {
  const heading = textOf(container.querySelector('h1,h2,h3,h4,h5,[role="heading"]'));
  if (heading && heading.length <= 140) return heading;

  const labelled =
    container.getAttribute('aria-label') ??
    container.getAttribute('title') ??
    container.querySelector('[itemprop="name"]')?.getAttribute('content') ??
    null;
  if (labelled && labelled.trim().length >= 2) return labelled.trim().slice(0, 140);

  const phoneDigits = digitsOf(phone);
  const lines = (container.innerText ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2 && line.length <= 120);

  for (const line of lines) {
    if (digitsOf(line) === phoneDigits) continue;
    if (PHONE_TEST.test(line)) continue;
    if (/^[\d\s.,:/-]+$/.test(line)) continue;
    if (ADDRESS_HINT.test(line) && line.length > 40) continue;
    if (/[a-zA-Z]{2,}/.test(line)) return line;
  }
  return null;
}

function extractPhone(container: HTMLElement): string | null {
  const telAnchor = container.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
  if (telAnchor) {
    const href = telAnchor.getAttribute('href') ?? '';
    const fromHref = decodeURIComponent(href.replace(/^tel:/i, '')).trim();
    if (digitsOf(fromHref).length >= 8) return fromHref;
  }
  const text = (container.innerText ?? '').slice(0, 1200);
  return phoneCandidates(text)[0] ?? null;
}

function extractWebsite(container: HTMLElement): string | null {
  const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) continue;
    try {
      const url = new URL(href);
      if (url.hostname === window.location.hostname) continue;
      if (/(facebook|instagram|twitter|x\.com|linkedin|youtube|google)\.[a-z.]+$/i.test(url.hostname)) {
        continue;
      }
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function extractAddress(container: HTMLElement): string | null {
  const explicit =
    textOf(container.querySelector('[itemprop="address"], address, [class*="address" i]')) ?? null;
  if (explicit && explicit.length >= 10) return explicit.slice(0, 300);

  const lines = (container.innerText ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12 && line.length <= 300);

  for (const line of lines) {
    if (ADDRESS_HINT.test(line)) return line;
    if (/\b\d{6}\b/.test(line)) return line; // Indian PIN code
  }
  return null;
}

function extractCategory(container: HTMLElement): string | null {
  const node = container.querySelector(
    '[class*="category" i], [class*="industry" i], [data-category], [itemprop="additionalType"]'
  );
  const text = textOf(node);
  if (!text || text.length > 60) return null;
  // Never store a rating or opening-hours fragment as a category.
  if (!/[A-Za-z]{3,}/.test(text)) return null;
  if (/^[\d.,()\s%+-]+$/.test(text)) return null;
  if (/\bstars?\b/i.test(text)) return null;
  if (/^(open|closed|closes|opens|hours)\b/i.test(text)) return null;
  return text;
}

function extractEmail(container: HTMLElement): string | null {
  const mailto = container.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  if (mailto) {
    const address = decodeURIComponent(
      (mailto.getAttribute('href') ?? '').replace(/^mailto:/i, '').split('?')[0] ?? ''
    ).trim();
    if (EMAIL_PATTERN.test(address)) return address;
  }
  const text = (container.textContent ?? '').slice(0, 4000);
  const match = EMAIL_PATTERN.exec(text);
  return match ? match[0] : null;
}

function buildRow(container: HTMLElement): CapturedRow | null {
  const phone = extractPhone(container);
  if (!phone) return null;

  const name = extractName(container, phone);
  if (!name) return null;

  return {
    name: name.slice(0, 300),
    phone,
    website: extractWebsite(container),
    email: extractEmail(container),
    address: extractAddress(container),
    categoryLabel: extractCategory(container)
  };
}

function collectContainers(): Set<HTMLElement> {
  const containers = new Set<HTMLElement>();
  const body = document.body;
  // A scan can land between documents (the body is briefly null).
  if (!body) return containers;

  const telAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')
  ).slice(0, MAX_PHONE_ANCHORS);

  for (const anchor of telAnchors) {
    if (!isVisible(anchor)) continue;
    const container = containerFor(anchor);
    if (container) containers.add(container);
  }

  if (containers.size < 5) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue ?? '';
        if (value.length < 8 || value.length > 80) return NodeFilter.FILTER_REJECT;
        if (!/\d{3}/.test(value)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let visited = 0;
    let node: Node | null = walker.nextNode();
    while (node && visited < MAX_TEXT_NODES) {
      visited += 1;
      const value = node.nodeValue ?? '';
      if (phoneCandidates(value).length > 0 && node.parentElement) {
        const container = containerFor(node.parentElement);
        if (container) containers.add(container);
      }
      node = walker.nextNode();
    }
  }

  return containers;
}

function send(rows: CapturedRow[]): void {
  if (rows.length === 0) return;
  const withPhone = rows.filter((row) => Boolean(row.phone && row.phone.trim().length > 0)).length;
  void chrome.runtime
    .sendMessage({
      type: 'UCS_ROWS',
      rows,
      withPhone,
      sourceUrl: window.location.href,
      sourceName: window.location.hostname
    })
    .catch(() => {
      // The service worker may be restarting. The next scan will resend nothing:
      // rows are already in `seen`, so a restart means that batch is lost. The
      // side panel surfaces the reduced count rather than hiding it.
    });
}

function scan(): void {
  if (!active) return;
  if (!allowHidden && document.visibilityState === 'hidden') return;

  lastScanAt = Date.now();
  const fresh: CapturedRow[] = [];

  // Try a site-specific extractor first (higher accuracy).
  const siteExtractor = getSiteExtractor(window.location.hostname);
  let siteRows: SiteRow[] | null = null;
  if (siteExtractor) {
    try {
      siteRows = siteExtractor(document);
    } catch {
      siteRows = null; // fall back to generic
    }
  }

  const candidates: CapturedRow[] = siteRows
    ? siteRows.map((r) => ({
        name: r.name,
        phone: r.phone,
        website: r.website,
        email: r.email,
        address: r.address,
        categoryLabel: r.categoryLabel
      }))
    : [];

  // If site extractor returned nothing, fall back to generic.
  if (candidates.length === 0) {
    for (const container of collectContainers()) {
      if (fresh.length >= MAX_ROWS_PER_SCAN) break;
      const row = buildRow(container);
      if (!row) continue;
      candidates.push(row);
    }
  }

  for (const row of candidates) {
    if (fresh.length >= MAX_ROWS_PER_SCAN) break;
    // Only rows with a number are worth capturing. Phone-less rows are not
    // marked as seen, so a later scan can still pick them up once a number
    // renders (for example after opening a detail panel).
    const phone = row.phone?.trim() ?? '';
    if (!phone) continue;
    const key = `${row.name.toLowerCase()}|${digitsOf(phone)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(row);
  }

  if (fresh.length > 0) send(fresh);
}

function scheduleScan(): void {
  if (debounceTimer !== null) return;
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    // Do not rescan the whole document more than twice a second.
    const elapsed = Date.now() - lastScanAt;
    if (elapsed < 500) {
      scheduleScan();
      return;
    }
    scan();
  }, 900);
}

function start(options: { auto?: boolean } = {}): void {
  allowHidden = options.auto === true;
  if (active) {
    // A second start (auto-run resuming capture on the same page) should still
    // pick up anything that rendered since the last scan.
    scan();
    return;
  }
  active = true;
  scan();
  if (!observer) {
    // A start can land between documents, when <body> is briefly missing.
    // Observing <html> covers the body once it is parsed, so no restart is needed.
    const root = document.body ?? document.documentElement;
    if (root) {
      observer = new MutationObserver(() => scheduleScan());
      observer.observe(root, { childList: true, subtree: true });
    }
  }
}

function stop(): void {
  active = false;
  allowHidden = false;
  observer?.disconnect();
  observer = null;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ── Auto-run helpers ─────────────────────────────────────────────────────

function isScrollable(element: HTMLElement): boolean {
  if (element.clientHeight < 120) return false;
  if (element.scrollHeight <= element.clientHeight + 40) return false;
  if (element === document.body || element === document.documentElement) return true;
  const overflow = window.getComputedStyle(element).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

function findScrollTarget(): HTMLElement | null {
  for (const selector of SCROLL_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && isScrollable(element)) return element;
  }

  // Fallback: the tallest genuinely scrollable container on the page.
  let best: HTMLElement | null = null;
  let bestSize = 0;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('div, main, section, ol, ul')
  ).slice(0, 1200);

  for (const element of nodes) {
    if (!isScrollable(element)) continue;
    if (element.scrollHeight > bestSize) {
      bestSize = element.scrollHeight;
      best = element;
    }
  }
  return best;
}

function scrollResults(): { ok: boolean; scrolled: boolean; target: string } {
  const target = findScrollTarget();

  if (!target) {
    const doc = document.scrollingElement ?? document.documentElement;
    const atBottom = doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 8;
    if (atBottom) {
      scheduleScan();
      return { ok: true, scrolled: false, target: 'window' };
    }
    const before = doc.scrollTop;
    window.scrollBy({ top: Math.max(240, Math.round(window.innerHeight * 0.85)), behavior: 'auto' });
    scheduleScan();
    return { ok: true, scrolled: doc.scrollTop > before + 4, target: 'window' };
  }

  const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
  if (atBottom) {
    scheduleScan();
    return { ok: true, scrolled: false, target: target.tagName.toLowerCase() };
  }

  const before = target.scrollTop;
  target.scrollBy({
    top: Math.max(240, Math.round(target.clientHeight * 0.85)),
    behavior: 'auto'
  });
  scheduleScan();
  return { ok: true, scrolled: target.scrollTop > before + 4, target: target.tagName.toLowerCase() };
}

function labelValue(element: Element | null, prefix: string): string | null {
  const label = element?.getAttribute('aria-label')?.trim() ?? '';
  if (label.length === 0) return null;
  const value = label.replace(new RegExp(`^${prefix}\\s*:?\\s*`, 'i'), '').trim();
  return value.length > 0 ? value : null;
}

/**
 * Google Maps list cards almost never show a phone number: it lives on the
 * place page. Clicking a card is unreliable from a script (Maps reads it as a
 * map gesture), so the queue instead reads the place URLs off the results list
 * and navigates to them directly, one at a time.
 *
 * The place markup has changed several times (data-item-id, aria-label, or a
 * plain tel: link), so check all of them before giving up on a place.
 */
function findPhone(scope: ParentNode): string | null {
  const tel = scope.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
  if (tel) {
    const fromHref = (tel.getAttribute('href') ?? '').replace(/^tel:\s*/i, '').trim();
    if (fromHref.length > 0) return fromHref;
  }

  for (const element of Array.from(
    scope.querySelectorAll<HTMLElement>('[data-item-id^="phone" i], [aria-label^="Phone" i]')
  )) {
    const id = element.getAttribute('data-item-id') ?? '';
    if (/^phone\s*:/i.test(id)) {
      const value = id.replace(/^phone\s*:\s*/i, '').replace(/^tel\s*:\s*/i, '').trim();
      if (value.length > 0) return value;
    }
    const label = element.getAttribute('aria-label') ?? '';
    if (/^phone\b/i.test(label)) {
      const value = label.replace(/^phone\s*:?\s*/i, '').trim();
      if (value.length > 0) return value;
    }
  }

  const text = (scope.textContent ?? '').slice(0, 4000);
  return phoneCandidates(text)[0] ?? null;
}

/** Place id from a Maps URL, used to prove the open page is the requested one. */
function currentPlaceId(): string {
  return /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(window.location.href)?.[1] ?? '';
}

function readMapsDetail(name: string): { row: CapturedRow | null; opened: boolean } {
  const panel = document.querySelector<HTMLElement>('div[role="main"]') ?? document.body;
  // Nothing to read while the document is mid-replacement.
  if (!panel) return { row: null, opened: false };
  const heading = panel.querySelector<HTMLElement>('h1.DUwDvf, h1');
  const headingText = (heading?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const phone = findPhone(panel);

  // A place page always has a heading; a consent wall or an error page does not.
  const opened = headingText.length > 0 || phone !== null;
  if (!opened) return { row: null, opened: false };

  const websiteElement = panel.querySelector<HTMLAnchorElement>(
    'a[data-item-id="authority"], a[aria-label^="Website:" i]'
  );
  const address =
    labelValue(panel.querySelector('[data-item-id="address"]'), 'Address') ??
    labelValue(panel.querySelector('button[aria-label^="Address:" i]'), 'Address');
  const categoryElement = panel.querySelector<HTMLElement>(
    'button[jsaction*="category"], [data-item-id="category"]'
  );
  const categoryText = (categoryElement?.textContent ?? '').replace(/\s+/g, ' ').trim();

  return {
    opened: true,
    row: {
      name: (headingText || name).slice(0, 300),
      phone,
      website: websiteElement?.getAttribute('href') ?? null,
      email: null,
      address: address ? address.slice(0, 300) : null,
      categoryLabel:
        categoryText.length > 0 &&
        categoryText.length <= 80 &&
        /[A-Za-z]{3,}/.test(categoryText)
          ? categoryText
          : null
    }
  };
}

/** Place URLs on the results list, deduped by place id (or path). */
function collectMapsPlaces(maxPlaces: number): Array<{ href: string; name: string }> {
  const places: Array<{ href: string; name: string }> = [];
  const keys = new Set<string>();

  for (const link of Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')
  )) {
    if (places.length >= maxPlaces) break;

    const href = link.getAttribute('href') ?? '';
    const name = (link.getAttribute('aria-label') ?? '').trim();
    if (href.length === 0 || name.length < 2) continue;

    const placeId = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(href)?.[1] ?? '';
    const key = placeId.length > 0 ? `place:${placeId}` : `path:${href.split('?')[0] ?? ''}`;
    if (keys.has(key)) continue;
    keys.add(key);

    places.push({ href, name: name.slice(0, 300) });
  }

  return places;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) return false;
  const typed = message as { type?: string; auto?: boolean; max?: number };
  const type = typed.type;

  if (type === 'UCS_START') {
    start({ auto: typed.auto === true });
    sendResponse({ ok: true, active, url: window.location.href });
    return false;
  }

  if (type === 'UCS_STOP') {
    stop();
    sendResponse({ ok: true, active });
    return false;
  }

  if (type === 'UCS_STATUS') {
    sendResponse({ ok: true, active, url: window.location.href, seen: seen.size });
    return false;
  }

  if (type === 'UCS_SCROLL') {
    if (!active) {
      sendResponse({ ok: false, scrolled: false, target: 'none' });
      return false;
    }
    sendResponse(scrollResults());
    return false;
  }

  if (type === 'UCS_MAPS_PLACES') {
    if (!active) {
      sendResponse({ ok: false, error: 'Capture is not running on this page.' });
      return false;
    }
    const max = Math.min(400, Math.max(1, Math.trunc(Number(typed.max) || 60)));
    sendResponse({ ok: true, places: collectMapsPlaces(max) });
    return false;
  }

  if (type === 'UCS_READ_PLACE') {
    // Runs on a place page after the queue navigated here. No capture session is
    // needed: it is a single read of the document, not a scan loop. The place id
    // proves the new document actually committed before any phone is read.
    const typedPlace = typed as { name?: string; placeId?: string };
    const expectedId = String(typedPlace.placeId ?? '');
    const actualId = currentPlaceId();
    if (expectedId.length > 0 && expectedId !== actualId) {
      sendResponse({ ok: true, ready: false, opened: false, row: null });
      return false;
    }
    sendResponse({
      ok: true,
      ready: true,
      ...readMapsDetail(String(typedPlace.name ?? ''))
    });
    return false;
  }

  return false;
});

if (!captureWindow.__ucsCaptureLoaded) {
  captureWindow.__ucsCaptureLoaded = true;
}
