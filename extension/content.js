(function () {
  const SCROLL_DELAY = 1800;
  const MAX_ITEMS = 500;
  const MAX_TIMEOUT = 120000;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function extractPhone(text) {
    const m = text.match(/(\+?\d[\d\s\-()]{7,}\d)/);
    return m ? m[0].trim() : "";
  }

  function extractRating(container, text) {
    let rating = "";
    let reviews = "";
    const m = text.match(/(\d+(?:\.\d+)?)\s*\(([\d,]+)\)/);
    if (m) { rating = m[1]; reviews = m[2].replace(/,/g, ""); }
    if (!rating) {
      const star = container.querySelector("[role='img'][aria-label*='star'], [aria-label*='rating']");
      const aria = star?.getAttribute("aria-label") || "";
      const mr = aria.match(/(\d+(?:\.\d+)?)\s*star/i);
      if (mr) rating = mr[1];
    }
    return { rating, reviews };
  }

  function extractStatus(text) {
    if (/open now/i.test(text)) return "OPEN";
    if (/closed now/i.test(text) || /\bclosed\b/i.test(text)) return "CLOSED";
    if (/opens /i.test(text)) return "OPENS_LATER";
    if (/temporarily closed/i.test(text)) return "TEMPORARILY_CLOSED";
    return "UNKNOWN";
  }

  function extractFromContainer(container) {
    const link = container.querySelector("a[href*='/maps/place/']");
    let name = "";
    if (link) name = link.getAttribute("aria-label") || link.textContent?.trim() || "";
    if (!name) {
      const heading = container.querySelector("div.fontHeadlineSmall, [class*='fontHeadline'], h1, h2, h3");
      name = heading?.textContent?.trim() || "";
    }
    name = clean(name);

    const text = clean(container.innerText || "");
    const phone = extractPhone(text);

    let address = "";
    const body = container.querySelector("div.fontBodyMedium, [class*='fontBody']");
    if (body) address = clean(body.textContent || "");
    if (!address) {
      const parts = text.split("·");
      if (parts.length > 1) address = clean(parts.slice(1).join(" "));
    }

    let website = "";
    const anchors = container.querySelectorAll("a[href^='http']");
    for (const a of anchors) {
      if (!a.href.includes("google.com")) { website = a.href; break; }
    }

    const status = extractStatus(text);
    const { rating, reviews } = extractRating(container, text);

    let coords = "";
    if (link?.href) {
      const m = link.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) coords = `${m[1]},${m[2]}`;
    }

    let placeUrl = "";
    if (link?.href) placeUrl = link.href.split("&")[0];

    let hours = "";
    const hm = text.match(/(?:Open|Closed)[^·]*?(?:\d{1,2}:\d{2}\s*(?:AM|PM))?/i);
    if (hm) hours = clean(hm[0]).slice(0, 120);

    return {
      name,
      phone,
      address,
      website,
      status,
      rating: rating ? Number(rating) : null,
      reviews: reviews ? Number(reviews) : null,
      coords,
      lat: coords ? coords.split(",")[0] : null,
      lng: coords ? coords.split(",")[1] : null,
      placeUrl,
      hours,
      source: "google_maps_extension",
    };
  }

  let lastCollectedUrl = "";
  let running = false;

  function endReached() {
    const text = (document.body && document.body.innerText) || "";
    return /reached the end|no more results|you've reached/i.test(text);
  }

  async function collect() {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    try {
      const stored = await new Promise((resolve) => {
        try { chrome.storage.local.get("targetCount", (d) => resolve(d || {})); }
        catch { resolve({}); }
      });
      const target = Math.max(0, parseInt(stored?.targetCount, 10) || 100);
      const maxScrolls = target > 0 ? Math.max(10, Math.ceil(target / 6) + 6) : 40;

      await sleep(3500);
      const results = new Map();
      let scrolls = 0;
      let noNew = 0;
      const feed = document.querySelector("div[role='feed']") || document.querySelector("div.m6QErb");

      while (
        scrolls < maxScrolls &&
        (target === 0 || results.size < target) &&
        noNew < 3 &&
        !endReached() &&
        Date.now() - startedAt < MAX_TIMEOUT
      ) {
        const before = results.size;
        const containers = document.querySelectorAll("div[role='article'], a[href*='/maps/place/']");
        containers.forEach((c) => {
          const container = c.closest("div[role='article']") || c.parentElement?.parentElement || c;
          const item = extractFromContainer(container);
          if (item.name && !results.has(item.name)) results.set(item.name, item);
        });
        if (results.size === before) noNew++; else noNew = 0;
        if (feed) {
          feed.scrollBy(0, 2000);
          try { feed.scrollTop = feed.scrollHeight; } catch { /* ignore */ }
        } else {
          window.scrollBy(0, 1200);
        }
        scrolls++;
        await sleep(SCROLL_DELAY);
      }

      let arr = Array.from(results.values());
      if (target > 0) arr = arr.slice(0, target);
      const params = new URLSearchParams(location.search);
      const keyword = params.get("q") || document.title.replace(" - Google Maps", "").trim();
      const batchId = params.get("batch") || params.get("run") || "";
      chrome.runtime.sendMessage({
        type: "COLLECTED_RESULTS",
        results: arr,
        keyword,
        location: "",
        batchId,
      });
      lastCollectedUrl = location.href;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("UCS collector error:", e);
    } finally {
      running = false;
    }
  }

  function maybeCollect() {
    if (running) return;
    if (!location.href.includes("/maps/search/") && !location.href.includes("/maps/place/")) return;
    if (location.href === lastCollectedUrl) return;
    collect();
  }

  // Initial run.
  maybeCollect();
  // SPA navigation on Google Maps does not reload the content script, so poll.
  setInterval(maybeCollect, 4000);
})();
