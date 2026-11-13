"use strict";
(() => {
  // src/site-extractors.ts
  function digitsOf(value) {
    return value.replace(/\D/g, "");
  }
  function extractPhoneFromText(text) {
    const pattern = /(?:\+?\d[\d\s().-]{7,18}\d)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[0].trim();
      const digits = digitsOf(candidate);
      if (digits.length >= 10 && digits.length <= 13) return candidate;
    }
    return null;
  }
  function extractEmailFromText(text) {
    const match = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.exec(text);
    return match ? match[0] : null;
  }
  function extractWebsiteFromContainer(container, host) {
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
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
  function decodeBingRedirect(href) {
    try {
      const url = new URL(href, "https://www.bing.com");
      if (!/(^|\.)bing\.com$/i.test(url.hostname)) {
        return /^https?:\/\//i.test(href) ? href : null;
      }
      const encoded = url.searchParams.get("u");
      if (!encoded || !encoded.startsWith("a1")) return null;
      const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
      const decoded = atob(padded);
      return /^https?:\/\//i.test(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }
  function sanitizeCategory(value) {
    const text = (value ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 3 || text.length > 60) return null;
    if (!/[A-Za-z]{3,}/.test(text)) return null;
    if (/^[\d.,()\s%+-]+$/.test(text)) return null;
    if (/\bstars?\b/i.test(text)) return null;
    if (/^(open|closed|closes|opens|hours|temporarily closed)\b/i.test(text)) return null;
    if (/\b\d(?:\.\d)?\s*\(\s*[\d,]+\s*\)/.test(text)) return null;
    return text;
  }
  function extractGoogleMaps(doc) {
    const rows = [];
    const seen2 = /* @__PURE__ */ new Set();
    const links = doc.querySelectorAll('a[href*="/maps/place/"]');
    links.forEach((link) => {
      const card = link.closest('div.Nv2PK, div[role="article"]');
      const container = card ?? link.parentElement;
      if (!container) return;
      if (!card) {
        const headline = container.querySelector(".qBF1Pd, .fontHeadlineSmall, h3");
        if (!headline) return;
      }
      const text = (container.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 10) return;
      const name = (container.querySelector(".qBF1Pd, .fontHeadlineSmall")?.textContent ?? "").replace(/\s+/g, " ").trim() || link.getAttribute("aria-label")?.trim() || (container.querySelector('h3, [role="heading"]')?.textContent ?? "").trim() || "";
      if (name.length < 2) return;
      const phone = extractPhoneFromText(text);
      const placeHref = link.getAttribute("href") ?? "";
      const placeId = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(placeHref)?.[1] ?? "";
      const placePath = placeHref.split("?")[0] ?? "";
      const key = placeId.length > 0 ? `place:${placeId}` : placePath.length > 0 ? `path:${placePath}` : `${name.toLowerCase()}|${digitsOf(phone ?? "")}`;
      if (seen2.has(key)) return;
      seen2.add(key);
      const detailSpans = Array.from(
        container.querySelectorAll(".UaQhfb .W4Efsd .W4Efsd span > span")
      );
      const categoryLabel = sanitizeCategory(detailSpans[0]?.textContent ?? null);
      const address = detailSpans.slice(1).map((span) => (span.textContent ?? "").replace(/\s+/g, " ").trim()).find((value) => value.length >= 10) ?? null;
      rows.push({
        name: name.slice(0, 300),
        phone,
        website: extractWebsiteFromContainer(container, "google.com"),
        email: extractEmailFromText(text),
        address: address ? address.slice(0, 300) : null,
        categoryLabel
      });
    });
    return rows;
  }
  function extractBingMaps(doc) {
    const rows = [];
    const seen2 = /* @__PURE__ */ new Set();
    const cards = doc.querySelectorAll("div.ypResultItem, div.b_algo, li.b_algo");
    cards.forEach((card) => {
      const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 10) return;
      const titleAnchor = card.querySelector("h2 a[href]");
      const heading = card.querySelector("h2, .b_title, .b_algo h2");
      const name = (titleAnchor?.textContent ?? heading?.textContent ?? "").replace(/\s+/g, " ").trim() || card.querySelector(".tptt")?.textContent?.trim() || null;
      if (!name || name.length < 2) return;
      const phone = extractPhoneFromText(text);
      const key = `${name.toLowerCase()}|${digitsOf(phone ?? "")}`;
      if (seen2.has(key)) return;
      seen2.add(key);
      const linkAnchor = titleAnchor ?? card.querySelector("a.tilk[href], h2 a[href]");
      const href = linkAnchor?.getAttribute("href") ?? "";
      let website = href ? decodeBingRedirect(href) : null;
      if (!website) {
        const cite = card.querySelector("cite")?.textContent?.trim() ?? "";
        const host = cite.split(/\s*›\s*/)[0]?.trim() ?? "";
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
  function extractJustdial(doc) {
    const rows = [];
    const seen2 = /* @__PURE__ */ new Set();
    const cards = doc.querySelectorAll("li.cntanr, div.resultbox, div.store-details, .jsx-");
    cards.forEach((card) => {
      const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 10) return;
      const nameEl = card.querySelector(".lng_cont_name, span.jcn, .store-name, h2, .resultbox_title_anchor");
      const name = nameEl?.textContent?.trim() ?? null;
      if (!name || name.length < 2) return;
      const phoneEl = card.querySelector('.telnowpr, a.tel, .mobilesv, [class*="phone"]');
      const phone = phoneEl?.textContent?.trim() ?? extractPhoneFromText(text);
      if (!phone) return;
      const key = `${name.toLowerCase()}|${digitsOf(phone)}`;
      if (seen2.has(key)) return;
      seen2.add(key);
      const addressEl = card.querySelector('.cont_fl_addr, .address, [class*="address"]');
      const address = addressEl?.textContent?.trim() ?? null;
      const categoryEl = card.querySelector('.catgname, .category, [class*="category"]');
      const categoryLabel = categoryEl?.textContent?.trim() ?? null;
      rows.push({
        name: name.slice(0, 300),
        phone,
        website: extractWebsiteFromContainer(card, "justdial.com"),
        email: extractEmailFromText(text),
        address: address ? address.slice(0, 300) : null,
        categoryLabel
      });
    });
    return rows;
  }
  function extractFacebook(doc) {
    const rows = [];
    const seen2 = /* @__PURE__ */ new Set();
    const cards = doc.querySelectorAll('div[role="article"], div.x1yztbdb, a[role="link"]');
    cards.forEach((card) => {
      const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 15) return;
      let name = null;
      const h1 = doc.querySelector("h1");
      if (h1 && h1.textContent && h1.textContent.trim().length > 1 && h1.textContent.trim().length < 120) {
        name = h1.textContent.trim();
      }
      if (!name) {
        const nameEl = card.querySelector("span.x193iq5w, strong, h3");
        name = nameEl?.textContent?.trim() ?? null;
      }
      if (!name || name.length < 2) return;
      const phone = extractPhoneFromText(text);
      if (!phone) return;
      const key = `${name.toLowerCase()}|${digitsOf(phone)}`;
      if (seen2.has(key)) return;
      seen2.add(key);
      const addressEl = card.querySelector('[class*="address"], [aria-label*="Address"]');
      const address = addressEl?.textContent?.trim() ?? null;
      rows.push({
        name: name.slice(0, 300),
        phone,
        website: extractWebsiteFromContainer(card, "facebook.com"),
        email: extractEmailFromText(text),
        address: address ? address.slice(0, 300) : null,
        categoryLabel: null
      });
    });
    return rows;
  }
  function extractInstagram(doc) {
    const rows = [];
    const seen2 = /* @__PURE__ */ new Set();
    const header = doc.querySelector("header, section");
    if (!header) return rows;
    const text = (header.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 5) return rows;
    const nameEl = header.querySelector('h2, span.x1lliihq, a[href*="/"]');
    const name = nameEl?.textContent?.trim() ?? null;
    if (!name || name.length < 2) return rows;
    const phone = extractPhoneFromText(text);
    const email = extractEmailFromText(text);
    if (!phone && !email) return rows;
    const key = `${name.toLowerCase()}|${digitsOf(phone ?? "")}|${email ?? ""}`;
    if (seen2.has(key)) return rows;
    seen2.add(key);
    const bioLink = header.querySelector('a[href*="l.instagram.com"], a[rel="me nofollow"]');
    const website = bioLink?.getAttribute("href") ?? null;
    const subtitleEl = header.querySelector("div.x7a106z span, span._aacl");
    const categoryLabel = subtitleEl?.textContent?.trim() ?? null;
    rows.push({
      name: name.slice(0, 300),
      phone,
      website,
      email,
      address: null,
      // Instagram rarely shows full address
      categoryLabel
    });
    return rows;
  }
  function getSiteExtractor(hostname) {
    const host = hostname.toLowerCase();
    if (host.includes("google.com") && (host.includes("maps") || host.includes("google."))) {
      if (host.includes("maps") || document.URL.includes("/maps/")) return extractGoogleMaps;
    }
    if (host.includes("bing.com")) return extractBingMaps;
    if (host.includes("justdial.com")) return extractJustdial;
    if (host.includes("facebook.com")) return extractFacebook;
    if (host.includes("instagram.com")) return extractInstagram;
    return null;
  }

  // src/content.ts
  var captureWindow = window;
  var PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,18}\d)/g;
  var PHONE_TEST = /(?:\+?\d[\d\s().-]{7,18}\d)/;
  var EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
  var ADDRESS_HINT = /\b(road|rd\.?|street|st\.?|nagar|colony|sector|floor|building|bldg|complex|market|chowk|cross|layout|puram|layout|opp\.?|near)\b/i;
  var MAX_PHONE_ANCHORS = 800;
  var MAX_TEXT_NODES = 12e3;
  var MAX_ROWS_PER_SCAN = 300;
  var SCROLL_SELECTORS = ['div[role="feed"]', "#QA0Szd", "#search", "ol#b_results", "main"];
  var active = false;
  var allowHidden = false;
  var observer = null;
  var debounceTimer = null;
  var lastScanAt = 0;
  var seen = /* @__PURE__ */ new Set();
  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function digitsOf2(value) {
    return value.replace(/\D/g, "");
  }
  function looksLikePhone(candidate) {
    const digits = digitsOf2(candidate);
    if (digits.length < 10 || digits.length > 13) return false;
    if (/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)) return false;
    const trimmed = candidate.trim();
    const hasSeparator = /[\s().-]/.test(trimmed);
    const hasPrefix = trimmed.startsWith("+") || trimmed.startsWith("0");
    const indianMobile = /^[6-9]\d{9}$/.test(digits);
    return hasPrefix || hasSeparator || indianMobile;
  }
  function phoneCandidates(text) {
    const found = [];
    PHONE_PATTERN.lastIndex = 0;
    let match;
    while ((match = PHONE_PATTERN.exec(text)) !== null) {
      const candidate = match[0].trim();
      if (looksLikePhone(candidate)) found.push(candidate);
      if (found.length >= 3) break;
    }
    return found;
  }
  function containerFor(node) {
    let current = node;
    for (let depth = 0; depth < 6 && current; depth += 1) {
      const text = (current.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length >= 12 && text.length <= 900) {
        const hasHeading = current.querySelector('h1,h2,h3,h4,h5,[role="heading"]');
        const anchors = current.querySelectorAll("a").length;
        if (hasHeading || anchors >= 1) {
          return current instanceof HTMLElement ? current : null;
        }
      }
      current = current.parentElement;
    }
    const fallback = node.closest('li, article, [role="listitem"], tr');
    return fallback instanceof HTMLElement ? fallback : null;
  }
  function textOf(element) {
    if (!element) return null;
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.length > 0 ? text : null;
  }
  function extractName(container, phone) {
    const heading = textOf(container.querySelector('h1,h2,h3,h4,h5,[role="heading"]'));
    if (heading && heading.length <= 140) return heading;
    const labelled = container.getAttribute("aria-label") ?? container.getAttribute("title") ?? container.querySelector('[itemprop="name"]')?.getAttribute("content") ?? null;
    if (labelled && labelled.trim().length >= 2) return labelled.trim().slice(0, 140);
    const phoneDigits = digitsOf2(phone);
    const lines = (container.innerText ?? "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length >= 2 && line.length <= 120);
    for (const line of lines) {
      if (digitsOf2(line) === phoneDigits) continue;
      if (PHONE_TEST.test(line)) continue;
      if (/^[\d\s.,:/-]+$/.test(line)) continue;
      if (ADDRESS_HINT.test(line) && line.length > 40) continue;
      if (/[a-zA-Z]{2,}/.test(line)) return line;
    }
    return null;
  }
  function extractPhone(container) {
    const telAnchor = container.querySelector('a[href^="tel:"]');
    if (telAnchor) {
      const href = telAnchor.getAttribute("href") ?? "";
      const fromHref = decodeURIComponent(href.replace(/^tel:/i, "")).trim();
      if (digitsOf2(fromHref).length >= 8) return fromHref;
    }
    const text = (container.innerText ?? "").slice(0, 1200);
    return phoneCandidates(text)[0] ?? null;
  }
  function extractWebsite(container) {
    const anchors = Array.from(container.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") ?? "";
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
  function extractAddress(container) {
    const explicit = textOf(container.querySelector('[itemprop="address"], address, [class*="address" i]')) ?? null;
    if (explicit && explicit.length >= 10) return explicit.slice(0, 300);
    const lines = (container.innerText ?? "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length >= 12 && line.length <= 300);
    for (const line of lines) {
      if (ADDRESS_HINT.test(line)) return line;
      if (/\b\d{6}\b/.test(line)) return line;
    }
    return null;
  }
  function extractCategory(container) {
    const node = container.querySelector(
      '[class*="category" i], [class*="industry" i], [data-category], [itemprop="additionalType"]'
    );
    const text = textOf(node);
    if (!text || text.length > 60) return null;
    if (!/[A-Za-z]{3,}/.test(text)) return null;
    if (/^[\d.,()\s%+-]+$/.test(text)) return null;
    if (/\bstars?\b/i.test(text)) return null;
    if (/^(open|closed|closes|opens|hours)\b/i.test(text)) return null;
    return text;
  }
  function extractEmail(container) {
    const mailto = container.querySelector('a[href^="mailto:"]');
    if (mailto) {
      const address = decodeURIComponent(
        (mailto.getAttribute("href") ?? "").replace(/^mailto:/i, "").split("?")[0] ?? ""
      ).trim();
      if (EMAIL_PATTERN.test(address)) return address;
    }
    const text = (container.textContent ?? "").slice(0, 4e3);
    const match = EMAIL_PATTERN.exec(text);
    return match ? match[0] : null;
  }
  function buildRow(container) {
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
  function collectContainers() {
    const containers = /* @__PURE__ */ new Set();
    const body = document.body;
    if (!body) return containers;
    const telAnchors = Array.from(
      document.querySelectorAll('a[href^="tel:"]')
    ).slice(0, MAX_PHONE_ANCHORS);
    for (const anchor of telAnchors) {
      if (!isVisible(anchor)) continue;
      const container = containerFor(anchor);
      if (container) containers.add(container);
    }
    if (containers.size < 5) {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode(node2) {
          const value = node2.nodeValue ?? "";
          if (value.length < 8 || value.length > 80) return NodeFilter.FILTER_REJECT;
          if (!/\d{3}/.test(value)) return NodeFilter.FILTER_REJECT;
          const parent = node2.parentElement;
          if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let visited = 0;
      let node = walker.nextNode();
      while (node && visited < MAX_TEXT_NODES) {
        visited += 1;
        const value = node.nodeValue ?? "";
        if (phoneCandidates(value).length > 0 && node.parentElement) {
          const container = containerFor(node.parentElement);
          if (container) containers.add(container);
        }
        node = walker.nextNode();
      }
    }
    return containers;
  }
  function send(rows) {
    if (rows.length === 0) return;
    const withPhone = rows.filter((row) => Boolean(row.phone && row.phone.trim().length > 0)).length;
    void chrome.runtime.sendMessage({
      type: "UCS_ROWS",
      rows,
      withPhone,
      sourceUrl: window.location.href,
      sourceName: window.location.hostname
    }).catch(() => {
    });
  }
  function scan() {
    if (!active) return;
    if (!allowHidden && document.visibilityState === "hidden") return;
    lastScanAt = Date.now();
    const fresh = [];
    const siteExtractor = getSiteExtractor(window.location.hostname);
    let siteRows = null;
    if (siteExtractor) {
      try {
        siteRows = siteExtractor(document);
      } catch {
        siteRows = null;
      }
    }
    const candidates = siteRows ? siteRows.map((r) => ({
      name: r.name,
      phone: r.phone,
      website: r.website,
      email: r.email,
      address: r.address,
      categoryLabel: r.categoryLabel
    })) : [];
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
      const phone = row.phone?.trim() ?? "";
      if (!phone) continue;
      const key = `${row.name.toLowerCase()}|${digitsOf2(phone)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(row);
    }
    if (fresh.length > 0) send(fresh);
  }
  function scheduleScan() {
    if (debounceTimer !== null) return;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      const elapsed = Date.now() - lastScanAt;
      if (elapsed < 500) {
        scheduleScan();
        return;
      }
      scan();
    }, 900);
  }
  function start(options = {}) {
    allowHidden = options.auto === true;
    if (active) {
      scan();
      return;
    }
    active = true;
    scan();
    if (!observer) {
      const root = document.body ?? document.documentElement;
      if (root) {
        observer = new MutationObserver(() => scheduleScan());
        observer.observe(root, { childList: true, subtree: true });
      }
    }
  }
  function stop() {
    active = false;
    allowHidden = false;
    observer?.disconnect();
    observer = null;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }
  function isScrollable(element) {
    if (element.clientHeight < 120) return false;
    if (element.scrollHeight <= element.clientHeight + 40) return false;
    if (element === document.body || element === document.documentElement) return true;
    const overflow = window.getComputedStyle(element).overflowY;
    return overflow === "auto" || overflow === "scroll";
  }
  function findScrollTarget() {
    for (const selector of SCROLL_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && isScrollable(element)) return element;
    }
    let best = null;
    let bestSize = 0;
    const nodes = Array.from(
      document.querySelectorAll("div, main, section, ol, ul")
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
  function scrollResults() {
    const target = findScrollTarget();
    if (!target) {
      const doc = document.scrollingElement ?? document.documentElement;
      const atBottom2 = doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 8;
      if (atBottom2) {
        scheduleScan();
        return { ok: true, scrolled: false, target: "window" };
      }
      const before2 = doc.scrollTop;
      window.scrollBy({ top: Math.max(240, Math.round(window.innerHeight * 0.85)), behavior: "auto" });
      scheduleScan();
      return { ok: true, scrolled: doc.scrollTop > before2 + 4, target: "window" };
    }
    const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 8;
    if (atBottom) {
      scheduleScan();
      return { ok: true, scrolled: false, target: target.tagName.toLowerCase() };
    }
    const before = target.scrollTop;
    target.scrollBy({
      top: Math.max(240, Math.round(target.clientHeight * 0.85)),
      behavior: "auto"
    });
    scheduleScan();
    return { ok: true, scrolled: target.scrollTop > before + 4, target: target.tagName.toLowerCase() };
  }
  function labelValue(element, prefix) {
    const label = element?.getAttribute("aria-label")?.trim() ?? "";
    if (label.length === 0) return null;
    const value = label.replace(new RegExp(`^${prefix}\\s*:?\\s*`, "i"), "").trim();
    return value.length > 0 ? value : null;
  }
  function findPhone(scope) {
    const tel = scope.querySelector('a[href^="tel:"]');
    if (tel) {
      const fromHref = (tel.getAttribute("href") ?? "").replace(/^tel:\s*/i, "").trim();
      if (fromHref.length > 0) return fromHref;
    }
    for (const element of Array.from(
      scope.querySelectorAll('[data-item-id^="phone" i], [aria-label^="Phone" i]')
    )) {
      const id = element.getAttribute("data-item-id") ?? "";
      if (/^phone\s*:/i.test(id)) {
        const value = id.replace(/^phone\s*:\s*/i, "").replace(/^tel\s*:\s*/i, "").trim();
        if (value.length > 0) return value;
      }
      const label = element.getAttribute("aria-label") ?? "";
      if (/^phone\b/i.test(label)) {
        const value = label.replace(/^phone\s*:?\s*/i, "").trim();
        if (value.length > 0) return value;
      }
    }
    const text = (scope.textContent ?? "").slice(0, 4e3);
    return phoneCandidates(text)[0] ?? null;
  }
  function currentPlaceId() {
    return /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(window.location.href)?.[1] ?? "";
  }
  function readMapsDetail(name) {
    const panel = document.querySelector('div[role="main"]') ?? document.body;
    if (!panel) return { row: null, opened: false };
    const heading = panel.querySelector("h1.DUwDvf, h1");
    const headingText = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
    const phone = findPhone(panel);
    const opened = headingText.length > 0 || phone !== null;
    if (!opened) return { row: null, opened: false };
    const websiteElement = panel.querySelector(
      'a[data-item-id="authority"], a[aria-label^="Website:" i]'
    );
    const address = labelValue(panel.querySelector('[data-item-id="address"]'), "Address") ?? labelValue(panel.querySelector('button[aria-label^="Address:" i]'), "Address");
    const categoryElement = panel.querySelector(
      'button[jsaction*="category"], [data-item-id="category"]'
    );
    const categoryText = (categoryElement?.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      opened: true,
      row: {
        name: (headingText || name).slice(0, 300),
        phone,
        website: websiteElement?.getAttribute("href") ?? null,
        email: null,
        address: address ? address.slice(0, 300) : null,
        categoryLabel: categoryText.length > 0 && categoryText.length <= 80 && /[A-Za-z]{3,}/.test(categoryText) ? categoryText : null
      }
    };
  }
  function collectMapsPlaces(maxPlaces) {
    const places = [];
    const keys = /* @__PURE__ */ new Set();
    for (const link of Array.from(
      document.querySelectorAll('a[href*="/maps/place/"]')
    )) {
      if (places.length >= maxPlaces) break;
      const href = link.getAttribute("href") ?? "";
      const name = (link.getAttribute("aria-label") ?? "").trim();
      if (href.length === 0 || name.length < 2) continue;
      const placeId = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(href)?.[1] ?? "";
      const key = placeId.length > 0 ? `place:${placeId}` : `path:${href.split("?")[0] ?? ""}`;
      if (keys.has(key)) continue;
      keys.add(key);
      places.push({ href, name: name.slice(0, 300) });
    }
    return places;
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message !== "object" || message === null) return false;
    const typed = message;
    const type = typed.type;
    if (type === "UCS_START") {
      start({ auto: typed.auto === true });
      sendResponse({ ok: true, active, url: window.location.href });
      return false;
    }
    if (type === "UCS_STOP") {
      stop();
      sendResponse({ ok: true, active });
      return false;
    }
    if (type === "UCS_STATUS") {
      sendResponse({ ok: true, active, url: window.location.href, seen: seen.size });
      return false;
    }
    if (type === "UCS_SCROLL") {
      if (!active) {
        sendResponse({ ok: false, scrolled: false, target: "none" });
        return false;
      }
      sendResponse(scrollResults());
      return false;
    }
    if (type === "UCS_MAPS_PLACES") {
      if (!active) {
        sendResponse({ ok: false, error: "Capture is not running on this page." });
        return false;
      }
      const max = Math.min(400, Math.max(1, Math.trunc(Number(typed.max) || 60)));
      sendResponse({ ok: true, places: collectMapsPlaces(max) });
      return false;
    }
    if (type === "UCS_READ_PLACE") {
      const typedPlace = typed;
      const expectedId = String(typedPlace.placeId ?? "");
      const actualId = currentPlaceId();
      if (expectedId.length > 0 && expectedId !== actualId) {
        sendResponse({ ok: true, ready: false, opened: false, row: null });
        return false;
      }
      sendResponse({
        ok: true,
        ready: true,
        ...readMapsDetail(String(typedPlace.name ?? ""))
      });
      return false;
    }
    return false;
  });
  if (!captureWindow.__ucsCaptureLoaded) {
    captureWindow.__ucsCaptureLoaded = true;
  }
})();
