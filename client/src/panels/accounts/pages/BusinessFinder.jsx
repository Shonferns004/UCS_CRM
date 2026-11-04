import { useState, useEffect, useCallback } from "react";
import { api } from "../api/auth";
import { getToken } from "../../../api/auth";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

export default function BusinessFinder() {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("auto");
  const [results, setResults] = useState([]);
  const [collected, setCollected] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [filterPhone, setFilterPhone] = useState(false);
  const [filterWebsite, setFilterWebsite] = useState(false);
  const [filterEmail, setFilterEmail] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [gmKeyword, setGmKeyword] = useState("");
  const [gmLocation, setGmLocation] = useState("");
  const [statusInfo, setStatusInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [summary, setSummary] = useState({ total: 0, with_phone: 0, with_website: 0, with_email: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const mapQuery = (tab === "search" ? (query || (results[0]?.name || "")) : (collected[0]?.name || gmKeyword || "Mumbai"));

  const parseQuery = (q) => {
    const parts = q.split(/\bin\b/i);
    if (parts.length >= 2) {
      const loc = parts.slice(1).join(" ").trim();
      const locParts = loc.split(",").map((s) => s.trim());
      return { keyword: parts[0].trim(), city: locParts[0] || "", state: locParts[1] || "" };
    }
    return { keyword: q.trim(), city: "", state: "" };
  };

  const search = async () => {
    const parsed = parseQuery(query);
    if (!parsed.keyword) { setError("Enter a keyword"); return; }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("keyword", parsed.keyword);
      if (parsed.city) params.set("city", parsed.city);
      if (parsed.state) params.set("state", parsed.state);
      params.set("provider", provider);
      const data = await api(`/accounts/business-finder/search?${params.toString()}`);
      setResults(data?.results || []);
      if (data?.provider) setProvider(data.provider === "auto" ? provider : data.provider);
    } catch (e) {
      setError(e?.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCollected = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchText) params.set("q", searchText);
      if (selectedBatch) params.set("batchId", selectedBatch);
      if (filterPhone) params.set("hasPhone", "true");
      if (filterWebsite) params.set("hasWebsite", "true");
      if (filterEmail) params.set("hasEmail", "true");
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const data = await api(`/accounts/business-finder/list?${params.toString()}`);
      setCollected(data?.results || []);
      setSummary(data?.summary || { total: 0, with_phone: 0, with_website: 0, with_email: 0 });
    } catch (e) {
      setError(e?.message || "Failed to load collected");
    } finally {
      setLoading(false);
    }
  }, [searchText, selectedBatch, filterPhone, filterWebsite, filterEmail, page, pageSize]);

  const loadBatches = useCallback(async () => {
    try {
      const data = await api("/accounts/business-finder/batches");
      setBatches(data?.batches || []);
    } catch (e) {
      setError(e?.message || "Failed to load batches");
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api("/accounts/business-finder/status");
      setStatusInfo(data);
    } catch (e) {
      setStatusInfo({ ok: false, message: e?.message });
    }
  }, []);

  useEffect(() => {
    if (tab === "collected") loadCollected();
    if (tab === "batches") loadBatches();
    if (tab === "extension") loadStatus();
  }, [tab, loadCollected, loadBatches, loadStatus]);

  useEffect(() => {
    if (tab === "collected") setPage(1);
  }, [searchText, selectedBatch, filterPhone, filterWebsite, filterEmail, tab]);
  useEffect(() => {
    if (tab === "collected") loadCollected();
  }, [tab, loadCollected]);

  const displayed = tab === "search" ? results : collected;
  const filtered = displayed.filter((b) => {
    if (tab === "search") {
      if (filterPhone && !b.phone) return false;
      if (filterWebsite && !b.website) return false;
      if (filterEmail && !b.email) return false;
      return true;
    }
    return true;
  });

  const exportCsv = () => {
    const header = ["Name", "Phone", "Email", "Address", "Website", "Status", "Rating", "Reviews", "Source", "Keyword", "Location", "Place URL"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      lines.push([
        r.name, r.phone, r.email, r.address, r.website, r.status, r.rating, r.reviews,
        r.source, r.keyword, r.location, r.place_url,
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "business-finder.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Delete this business?")) return;
    try {
      await api(`/accounts/business-finder/${id}`, { method: "DELETE" });
      setCollected((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e?.message || "Delete failed");
    }
  };

  const deleteBatchById = async (batchId) => {
    if (!window.confirm("Delete this batch and all its results?")) return;
    try {
      await api(`/accounts/business-finder/batch/${encodeURIComponent(batchId)}`, { method: "DELETE" });
      await loadBatches();
      if (selectedBatch === batchId) setSelectedBatch("");
      await loadCollected();
    } catch (e) {
      setError(e?.message || "Delete failed");
    }
  };

  const openGoogleMaps = () => {
    const kw = gmKeyword || (query ? parseQuery(query).keyword : "");
    const loc = gmLocation || (query ? parseQuery(query).city : "");
    const q = encodeURIComponent(`${kw} ${loc}`.trim() || "Mumbai");
    window.open(`https://www.google.com/maps/search/${q}`, "_blank", "noopener");
  };

  const downloadExtensionZip = async () => {
    setDownloading(true);
    setError("");
    try {
      const token = getToken("ucs");
      const crmOrigin = window.location.origin;
      const url = `${API_BASE}/accounts/business-finder/extension.zip?apiBase=${encodeURIComponent(API_BASE)}&crmOrigin=${encodeURIComponent(crmOrigin)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "1" } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "ucs-business-collector.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const testConnection = async () => {
    await loadStatus();
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>Business Finder</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: 4 }}>
        Real data from free providers + collected Google Maps results. Use the extension to capture a full Google Maps search.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { id: "collected", label: "Collected Results" },
          { id: "googlemaps", label: "Google Maps Search" },
          { id: "batches", label: "Batches" },
          { id: "extension", label: "Extension Setup" },
        ].map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
      {tab === "collected" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search name, phone, address, email..."
              style={{ padding: 8, minWidth: 260, flex: 1 }}
            />
            <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} style={{ padding: 8, minWidth: 220 }}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.keyword || "(no keyword)"} — {b.location || "any"} ({b.total})
                </option>
              ))}
            </select>
            <button className="btn btn-outline" onClick={loadCollected} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={filterPhone} onChange={(e) => setFilterPhone(e.target.checked)} /> Has phone</label>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={filterWebsite} onChange={(e) => setFilterWebsite(e.target.checked)} /> Has website</label>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={filterEmail} onChange={(e) => setFilterEmail(e.target.checked)} /> Has email</label>
            <button className="btn btn-outline" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</button>
            <span style={{ fontSize: 12, color: "var(--ink-soft)", alignSelf: "center" }}>
              Total {summary.total} · Phone {summary.with_phone} · Website {summary.with_website} · Email {summary.with_email}
            </span>
          </div>
        </>
      )}
      {tab === "googlemaps" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={gmKeyword}
              onChange={(e) => setGmKeyword(e.target.value)}
              placeholder="Keyword (e.g. Computer Classes)"
              style={{ padding: 8, minWidth: 240, flex: 1 }}
            />
            <input
              value={gmLocation}
              onChange={(e) => setGmLocation(e.target.value)}
              placeholder="Location (e.g. Kandivali, Mumbai)"
              style={{ padding: 8, minWidth: 240, flex: 1 }}
            />
            <button className="btn btn-primary" onClick={openGoogleMaps}>Search on Google Maps</button>
          </div>
          <p style={{ color: "var(--ink-soft)", fontSize: 12, marginTop: 8 }}>
            Opens Google Maps in a new tab. The extension collects the visible results and auto-saves them to CRM.
            Collected data appears in "Collected Results".
          </p>
          <div style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8, fontSize: 12 }}>
            <strong>Status:</strong> {statusInfo ? (statusInfo.ok ? "Backend ready" : `Backend issue: ${statusInfo.message || "unknown"}`) : "Not checked yet."}
            <button className="btn btn-outline" style={{ marginLeft: 12 }} onClick={testConnection}>Check Status</button>
          </div>
        </div>
      )}
      {tab === "batches" && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-outline" onClick={loadBatches} disabled={loading} style={{ marginBottom: 8 }}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          {batches.length === 0 && !loading && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)" }}>No batches yet. Run a Google Maps search.</div>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {batches.map((b) => (
              <div key={b.batch_id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.keyword || "(no keyword)"} — {b.location || "any location"}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Source: {b.source || "unknown"} · {b.total} results · Phone {b.with_phone} · Website {b.with_website} · {new Date(b.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-outline" onClick={() => { setSelectedBatch(b.batch_id); setTab("collected"); }}>View</button>
                  <button className="btn btn-outline" style={{ color: "#dc2626" }} onClick={() => deleteBatchById(b.batch_id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "extension" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, marginBottom: 12 }}>
            <strong>One-click setup:</strong> download the pre-configured extension, unzip, and load it in Chrome.
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={downloadExtensionZip} disabled={downloading}>
                {downloading ? "Preparing..." : "Download Extension (zip)"}
              </button>
              <button className="btn btn-outline" onClick={testConnection} style={{ marginLeft: 8 }}>Test CRM Connection</button>
            </div>
            {statusInfo && (
              <div style={{ marginTop: 8, fontSize: 12, color: statusInfo.ok ? "#065f46" : "#dc2626" }}>
                {statusInfo.ok ? "Backend reachable. Providers: " + Object.entries(statusInfo.providers || {}).filter(([, v]) => v).map(([k]) => k).join(", ") : (statusInfo.message || "Backend not reachable.")}
              </div>
            )}
          </div>
          <ol style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Download the zip above and unzip it to a folder.</li>
            <li>Open <code>chrome://extensions</code> in Chrome.</li>
            <li>Enable "Developer mode" (top right).</li>
            <li>Click "Load unpacked" and select the unzipped folder.</li>
            <li>Pin the extension. Open Google Maps, search, and results auto-save.</li>
          </ol>
          <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            The zip contains your CRM token. Do not share it. If the token expires, download a fresh package.
          </p>
        </div>
      )}
      {tab === "search" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            {filtered.map((b, i) => (
              <div
                key={b.id || i}
                onClick={() => setSelected(b)}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 8,
                  border: selected?.id === b.id && selected?.name === b.name ? "2px solid #2563eb" : "1px solid #f3f4f6",
                  cursor: "pointer",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                  {b.source && <span style={{ marginRight: 8 }}>Source: {b.source}</span>}
                  {b.rating != null && <span style={{ marginRight: 8 }}>★ {b.rating} ({b.reviews || 0})</span>}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>📞 {b.phone || "N/A"}</div>
                {b.email && <div style={{ fontSize: 12, marginTop: 2 }}>✉ {b.email}</div>}
                <div style={{ fontSize: 12, marginTop: 2 }}>📍 {b.address || "N/A"}</div>
                {b.website && (
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    🌐 <a href={b.website} target="_blank" rel="noreferrer">{b.website}</a>
                  </div>
                )}
                <div style={{ fontSize: 12, marginTop: 4, color: b.status && (b.status === "OPEN" || b.status === "OPERATIONAL") ? "#065f46" : "var(--ink-soft)" }}>
                  Status: {b.status || "UNKNOWN"}
                </div>
              </div>
            ))}
            {filtered.length === 0 && !loading && (
              <div style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)" }}>No results. Try a search.</div>
            )}
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", minHeight: 560 }}>
            <iframe
              title="map"
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
              style={{ width: "100%", height: "100%", border: 0 }}
              loading="lazy"
            />
          </div>
        </div>
      )}

      {tab === "collected" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f3f4f6" }}>
                <tr>
                  {["Name", "Phone", "Address", "Website", "Status", "Source", "Keyword", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collected.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => setSelected(b)}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{b.name || "N/A"}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{b.phone || "N/A"}</td>
                    {/* <td style={{ padding: "8px 10px" }}>{b.email || "—"}</td> */}
                    <td style={{ padding: "8px 10px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.address || ""}>{b.address || "N/A"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {b.website ? <a href={b.website} target="_blank" rel="noreferrer">{b.website}</a> : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: b.status && (b.status === "OPEN" || b.status === "OPERATIONAL") ? "#065f46" : "var(--ink-soft)" }}>
                      {b.status || "UNKNOWN"}
                    </td>
                    {/* <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {b.rating != null ? `★ ${b.rating} (${b.reviews || 0})` : "—"}
                    </td> */}
                    <td style={{ padding: "8px 10px" }}>{b.source || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{b.keyword || "—"}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: 11, padding: "2px 8px", color: "#dc2626", marginRight: 6 }}
                        onClick={() => deleteItem(b.id)}
                      >
                        Delete
                      </button>
                      {b.place_url && (
                        <a href={b.place_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, marginRight: 6 }}>
                          Maps
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {collected.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)" }}>
                      No collected results yet. Use the extension to collect.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button className="btn btn-outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <span style={{ fontSize: 12 }}>
              Page {page} of {Math.max(1, Math.ceil((summary.total || 0) / pageSize))}
            </span>
            <button
              className="btn btn-outline"
              disabled={loading || page >= Math.max(1, Math.ceil((summary.total || 0) / pageSize))}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: 6 }}>
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Total {summary.total} · Phone {summary.with_phone} · Website {summary.with_website} · Email {summary.with_email}
            </span>
          </div>
        </div>
      )}

      {selected && (tab === "search" || tab === "collected") && (
        <div style={{ marginTop: 16, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
          <strong>Selected:</strong> {selected.name} — {selected.phone || "N/A"} — {selected.address || ""}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.name + " " + (selected.address || ""))}`}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: 12 }}
          >
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
