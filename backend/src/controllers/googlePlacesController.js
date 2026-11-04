import { authenticateRole } from "../middleware/authMiddleware.js";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export const searchPlaces = async (req, res) => {
  try {
    const keyword = (req.query.keyword || req.query.query || "").trim();
    const city = (req.query.city || "").trim();
    const state = (req.query.state || "").trim();
    const pageToken = (req.query.pageToken || "").trim();

    if (!keyword) {
      return res.status(400).json({ message: "keyword is required" });
    }
    if (!API_KEY) {
      return res.status(503).json({ message: "GOOGLE_PLACES_API_KEY not configured" });
    }

    const parts = [keyword];
    if (city) parts.push(city);
    if (state) parts.push(state);
    const textQuery = parts.join(", ");

    const body = { textQuery };
    if (pageToken) body.pageToken = pageToken;

    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.businessStatus,nextPageToken",
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {
      return res.status(502).json({ message: "Google Places API returned non-JSON response", raw: text.slice(0, 200) });
    }
    if (!resp.ok) {
      return res.status(resp.status).json({ message: data?.error?.message || "Google Places API error", raw: data });
    }

    const results = (data.places || []).map((p) => ({
      id: p.id || "",
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
      status: p.businessStatus || "UNKNOWN",
    }));

    return res.json({ results, nextPageToken: data.nextPageToken || null });
  } catch (err) {
    console.error("searchPlaces error:", err);
    return res.status(500).json({ message: err.message || "Internal error" });
  }
};

