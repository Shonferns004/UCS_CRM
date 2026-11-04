export const searchOsmPlaces = async (req, res) => {
  try {
    const keyword = (req.query.keyword || req.query.query || "").trim();
    const city = (req.query.city || "").trim();
    const state = (req.query.state || "").trim();

    if (!keyword) {
      return res.status(400).json({ message: "keyword is required" });
    }

    const q = city || state
      ? `${keyword} in ${[city, state].filter(Boolean).join(" ")}`
      : keyword;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=20&addressdetails=1&extratags=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "UCS-CRM/1.0 (admin@beingsevak.org)",
        "Accept-Language": "en",
      },
    });

    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {
      return res.status(502).json({ message: "OSM Nominatim returned non-JSON response", raw: text.slice(0, 200) });
    }
    if (!resp.ok) {
      return res.status(resp.status).json({ message: "OSM Nominatim error", raw: data || text.slice(0, 200) });
    }

    const results = (Array.isArray(data) ? data : []).map((p) => {
      const extra = p.extratags || {};
      const phone = extra.phone || extra["contact:phone"] || extra["contact:mobile"] || "";
      const address = p.display_name || "";
      const status = extra.opening_hours ? `Hours: ${extra.opening_hours}` : "UNKNOWN";
      return {
        id: String(p.place_id || ""),
        name: p.name || p.display_name?.split(",")[0] || "",
        address,
        phone,
        status,
      };
    });

    return res.json({ results, nextPageToken: null });
  } catch (err) {
    console.error("searchOsmPlaces error:", err);
    return res.status(500).json({ message: err.message || "Internal error" });
  }
};

