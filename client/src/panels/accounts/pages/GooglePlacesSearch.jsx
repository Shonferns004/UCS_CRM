import { useState } from "react";
import { api } from "../api/auth";

export default function GooglePlacesSearch() {
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [results, setResults] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (token = null) => {
    if (!keyword.trim()) {
      setError("Keyword is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("keyword", keyword.trim());
      if (city.trim()) params.set("city", city.trim());
      if (state.trim()) params.set("state", state.trim());
      if (token) params.set("pageToken", token);
      const data = await api(`/accounts/google-places/search?${params.toString()}`);
      const rows = data?.results || [];
      setResults(token ? [...results, ...rows] : rows);
      setNextPageToken(data?.nextPageToken || null);
    } catch (e) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const header = ["Name", "Phone", "Address", "Status"];
    const lines = [header.join(",")];
    results.forEach((r) => {
      lines.push([r.name, r.phone, r.address, r.status].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "google-places.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>Google Places Search</h2>
      <p style={{ color: "var(--ink-soft)" }}>Search by keyword, city and state to fetch name, phone, address and status.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword" style={{ padding: 8, minWidth: 200 }} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ padding: 8, minWidth: 160 }} />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" style={{ padding: 8, minWidth: 160 }} />
        <button className="btn btn-primary" onClick={() => search()} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
        {results.length > 0 && (
          <button className="btn btn-outline" onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>
      {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Name</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Phone</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Address</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.id || i}>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{r.name}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{r.phone}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{r.address}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{r.status}</td>
              </tr>
            ))}
            {results.length === 0 && !loading && (
              <tr>
                <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)" }}>
                  No results yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nextPageToken && (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-outline" onClick={() => search(nextPageToken)} disabled={loading}>
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
