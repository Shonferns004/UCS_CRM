import { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { apiGet, apiGetBlob, apiPatch, apiPost, apiDelete } from "../api/auth";
import { getToken } from "../../../api/auth";
import { EXPORT_FORMATS } from "../data/extractorExport";

const PAGE_SIZES = [25, 50, 100];

const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "not_contacted", label: "Not contacted" },
  { id: "contacted", label: "Contacted" },
  { id: "interested", label: "Interested" },
  { id: "follow_up", label: "Follow up" },
  { id: "converted", label: "Converted" },
  { id: "not_interested", label: "Not interested" },
  { id: "invalid", label: "Invalid" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** dd/mm/yyyy, with optional HH:mm. */
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** dd/mm/yyyy only. */
function fmtDay(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Convert the dd/mm/yyyy the user types into the YYYY-MM-DD the API accepts. */
function ddmmyyyyToIso(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function StatCard({ label, value, hint }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 14,
        background: "#fff",
        minWidth: 150,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-soft)" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, accent }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        background: accent ? "#eef2ff" : "#fff",
        minWidth: 130,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-soft)" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: accent ? "#3730a3" : "inherit" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/** Convert the dd/mm/yyyy value used in filters into a Date for the picker. */
function ddmmyyyyToDate(value) {
  const iso = ddmmyyyyToIso(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Date -> dd/mm/yyyy (the string the filter query understands). */
function dateToDdmmyyyy(date) {
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

const FILTER_LABELS = {
  q: "Search",
  category: "Category",
  status: "Status",
  batchId: "Batch",
  hasPhone: "Has phone",
  capturedFrom: "From",
  capturedTo: "To",
  aiTag: "AI tag",
  minScore: "Min score",
  aiStatus: "AI status",
};

function StatusChip({ status }) {
  const map = {
    new: ["#eef2ff", "#3730a3"],
    not_contacted: ["#f3f4f6", "#374151"],
    contacted: ["#e0f2fe", "#075985"],
    interested: ["#ecfdf5", "#065f46"],
    follow_up: ["#fef3c7", "#92400e"],
    converted: ["#dcfce7", "#166534"],
    not_interested: ["#f3f4f6", "#6b7280"],
    invalid: ["#fee2e2", "#991b1b"],
  };
  const [bg, fg] = map[status] || ["#f3f4f6", "#374151"];
  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {(LEAD_STATUSES.find((s) => s.id === status) || { label: status }).label}
    </span>
  );
}

const EMPTY_FILTERS = {
  q: "",
  category: "",
  status: "",
  batchId: "",
  hasPhone: "",
  capturedFrom: "",
  capturedTo: "",
  aiTag: "",
  minScore: "",
  aiStatus: "",
};

export default function Extractor() {
  const [tab, setTab] = useState("overview");

  const [stats, setStats] = useState(null);
  const [batches, setBatches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusInfo, setStatusInfo] = useState(null);
  const [aiSettings, setAiSettings] = useState(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [aiBusy, setAiBusy] = useState("");
  const [exporting, setExporting] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [busyLead, setBusyLead] = useState("");

  const queryString = useCallback(
    (extra = {}, source = appliedFilters) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...source, ...extra })) {
        if (value === "" || value === null || value === undefined) continue;
        if (key === "capturedFrom" || key === "capturedTo") {
          const iso = ddmmyyyyToIso(value);
          if (iso) params.set(key, iso);
          continue;
        }
        params.set(key, value);
      }
      return params.toString();
    },
    [appliedFilters],
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await apiGet("/accounts/extractor/leads/stats");
      setStats(data);
    } catch (e) {
      setError(e?.message || "Failed to load stats");
    }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      const data = await apiGet("/accounts/extractor/batches?limit=200");
      setBatches(data?.batches || []);
    } catch (e) {
      setError(e?.message || "Failed to load batches");
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiGet("/accounts/extractor/leads/categories");
      setCategories(data?.categories || []);
    } catch {
      // The filter is a convenience; a failure here must not block the list.
      setCategories([]);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = queryString({ page, pageSize });
      const data = await apiGet(`/accounts/extractor/leads?${qs}`);
      setLeads(data?.results || []);
      setTotal(data?.total || 0);
    } catch (e) {
      setError(e?.message || "Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, queryString]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet("/accounts/extractor/status");
      setStatusInfo(data);
    } catch (e) {
      setStatusInfo({ ok: false, message: e?.message || "Backend not reachable" });
    }
  }, []);

  const loadAiSettings = useCallback(async () => {
    try {
      const data = await apiGet("/accounts/extractor/ai/settings");
      setAiSettings(data);
    } catch (e) {
      setError(e?.message || "Failed to load AI settings");
    }
  }, []);

  useEffect(() => {
    if (tab === "overview") {
      loadStats();
      loadBatches();
    }
    if (tab === "leads") {
      loadBatches();
      loadCategories();
      loadAiSettings();
      loadStats();
    }
    if (tab === "batches") loadBatches();
    if (tab === "extension") loadStatus();
    if (tab === "settings") loadAiSettings();
  }, [tab, loadAiSettings, loadBatches, loadCategories, loadStats, loadStatus]);

  useEffect(() => {
    if (tab === "leads") loadLeads();
  }, [tab, loadLeads]);

  const applyFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setAppliedFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  // Typing should feel instant but must not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedFilters((f) => (f.q === filters.q ? f : { ...f, q: filters.q }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // Same for the DD/MM/YYYY boxes: a half-typed date is not a filter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedFilters((f) =>
        f.capturedFrom === filters.capturedFrom && f.capturedTo === filters.capturedTo
          ? f
          : { ...f, capturedFrom: filters.capturedFrom, capturedTo: filters.capturedTo },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.capturedFrom, filters.capturedTo]);

  const clearFilter = (key) => {
    setFilters((f) => ({ ...f, [key]: "" }));
    setAppliedFilters((f) => ({ ...f, [key]: "" }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const exportCsv = async (format, overrideFilters) => {
    const source = overrideFilters ?? appliedFilters;
    const scopeLabel = overrideFilters ? "all" : "filtered";
    setExporting(format);
    setError("");
    try {
      const qs = queryString({ format }, source);
      const blob = await apiGetBlob(`/accounts/extractor/leads/export?${qs}`);
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
      saveBlob(blob, `ucs-extractor-leads-${format}-${scopeLabel}-${stamp}.csv`);
      setNotice(
        `Exported ${scopeLabel} ${format === "full" ? "full details" : "WhatsApp-ready"} CSV.`,
      );
    } catch (e) {
      setError(e?.message || "Export failed");
    } finally {
      setExporting("");
    }
  };

  const downloadExtension = async () => {
    setDownloading(true);
    setError("");
    try {
      const token = getToken("ucs");
      const base = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");
      const res = await fetch(`${base}/accounts/extractor/extension.zip`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Download failed (${res.status})`);
      }
      saveBlob(await res.blob(), "ucs-extractor-capture.zip");
      setNotice("Extension package downloaded. Unzip it and load it in Chrome.");
    } catch (e) {
      setError(e?.message || "Could not download the extension package");
    } finally {
      setDownloading(false);
    }
  };

  const addKeyword = async () => {
    const keyword = keywordInput.trim();
    if (!keyword) return;
    setAiBusy("keyword");
    setError("");
    try {
      const data = await apiPost("/accounts/extractor/ai/keywords", { keyword });
      setAiSettings((prev) => (prev ? { ...prev, keywords: data.keywords } : prev));
      setKeywordInput("");
      setNotice(`Keyword "${keyword}" added.`);
    } catch (e) {
      setError(e?.message || "Could not add the keyword");
    } finally {
      setAiBusy("");
    }
  };

  const addBulkKeywords = async () => {
    const keywords = bulkKeywords
      .split(/[\n,]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;
    setAiBusy("bulk");
    setError("");
    try {
      const data = await apiPost("/accounts/extractor/ai/keywords/bulk", { keywords });
      setAiSettings((prev) => (prev ? { ...prev, keywords: data.keywords } : prev));
      setBulkKeywords("");
      setNotice(`Added ${data.added} keyword(s), skipped ${data.skipped}.`);
    } catch (e) {
      setError(e?.message || "Could not add the keywords");
    } finally {
      setAiBusy("");
    }
  };

  const removeKeyword = async (keyword) => {
    setAiBusy(`del-${keyword.id}`);
    setError("");
    try {
      const data = await apiDelete(`/accounts/extractor/ai/keywords/${keyword.id}`);
      setAiSettings((prev) => (prev ? { ...prev, keywords: data.keywords } : prev));
    } catch (e) {
      setError(e?.message || "Could not remove the keyword");
    } finally {
      setAiBusy("");
    }
  };

  const runAi = async (scope) => {
    if (scope === "all" && !window.confirm("Re-tag every lead? Existing tags and scores are cleared first.")) return;
    setAiBusy(`run-${scope}`);
    setError("");
    try {
      const data = await apiPost("/accounts/extractor/ai/run", { scope });
      setAiSettings((prev) => (prev ? { ...prev, counts: data.counts } : prev));
      setNotice(
        data.configured
          ? `Queued ${data.queued} lead(s). Tagging runs in the background.`
          : "Queued, but GEMINI_API_KEY is not set — nothing will be tagged until it is.",
      );
    } catch (e) {
      setError(e?.message || "Could not start tagging");
    } finally {
      setAiBusy("");
    }
  };

  const changeLeadStatus = async (lead, leadStatus) => {
    setBusyLead(lead.id);
    setError("");
    try {
      const data = await apiPatch(`/accounts/extractor/leads/${lead.id}`, { leadStatus });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.lead : l)));
      setNotice(`Marked "${lead.displayName}" as ${leadStatus.replace(/_/g, " ")}.`);
    } catch (e) {
      setError(e?.message || "Could not update the lead");
    } finally {
      setBusyLead("");
    }
  };

  const removeLead = async (lead) => {
    if (!window.confirm(`Delete "${lead.displayName}" from Extractor leads?`)) return;
    setBusyLead(lead.id);
    try {
      await apiDelete(`/accounts/extractor/leads/${lead.id}`);
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setTotal((t) => Math.max(0, t - 1));
      setNotice("Lead deleted.");
    } catch (e) {
      setError(e?.message || "Could not delete the lead");
    } finally {
      setBusyLead("");
    }
  };

  const removeBatch = async (batch) => {
    if (!window.confirm(`Delete batch "${batch.batchId}"? Captured leads stay in the lead list.`)) return;
    try {
      await apiDelete(`/accounts/extractor/batches/${encodeURIComponent(batch.batchId)}`);
      setBatches((prev) => prev.filter((b) => b.batchId !== batch.batchId));
      setNotice("Batch deleted.");
    } catch (e) {
      setError(e?.message || "Could not delete the batch");
    }
  };

  const copyPhone = async (phone) => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setNotice(`Copied ${phone}`);
    } catch {
      setError("Clipboard unavailable in this browser");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== "").length,
    [appliedFilters],
  );

  // Filter options: the configured vocabulary plus tags already on imported
  // rows (the standalone extractor used a different list).
  const aiTagOptions = useMemo(() => {
    const usedByTag = new Map(
      (aiSettings?.usedTags || []).map((item) => [
        String(item.tag || "").toLowerCase(),
        Number(item.count) || 0,
      ]),
    );
    const seen = new Map();
    for (const keyword of aiSettings?.keywords || []) {
      const key = keyword.keyword.toLowerCase();
      const count = usedByTag.get(key) || 0;
      seen.set(key, {
        value: keyword.keyword,
        label: count > 0 ? `${keyword.keyword} (${count})` : keyword.keyword,
      });
    }
    for (const used of aiSettings?.usedTags || []) {
      const key = String(used.tag || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, { value: used.tag, label: `${used.tag} (${used.count})` });
    }
    return [...seen.values()];
  }, [aiSettings]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "leads", label: "Leads" },
    { id: "batches", label: "Batches" },
    { id: "settings", label: "AI & Settings" },
    { id: "extension", label: "Extension Setup" },
  ];

  return (
    <div className="card" style={{ padding: 24 }}>
      <style>{`
        .extractor-date-wrapper { width: 100%; }
        .extractor-date-wrapper .react-datepicker__input-container { width: 100%; }
        .extractor-date-input {
          width: 100%;
          padding: 8px;
          font-size: 13px;
          font-family: inherit;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          color: inherit;
        }
        .extractor-date-input:focus {
          outline: 2px solid #c7d2fe;
          border-color: #6366f1;
        }
        .extractor-date-input::placeholder { color: #9ca3af; }
      `}</style>
      <h2>Extractor</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: 4 }}>
        Business leads captured by the UCS Extractor extension, normalised and stored in this CRM.
        Only mobile numbers are stored; a landline is reported back as a rejection, never as a lead.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            color: "#991b1b",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          style={{
            color: "#065f46",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          {notice}
        </div>
      )}

      {tab === "overview" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard label="Total leads" value={stats?.total ?? "—"} hint="All captured businesses" />
            <StatCard label="With phone" value={stats?.withPhone ?? "—"} hint="Mobile numbers on file" />
            <StatCard label="Captured today" value={stats?.capturedToday ?? "—"} />
            <StatCard label="Last 7 days" value={stats?.captured7d ?? "—"} />
            <StatCard label="Batches" value={stats?.batchCount ?? "—"} hint={`Last ${fmtDay(stats?.lastBatchAt)}`} />
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-outline" onClick={() => { loadStats(); loadBatches(); }}>
              Refresh
            </button>
            <button className="btn btn-outline" onClick={() => exportCsv("whatsapp", {})} disabled={exporting !== ""}>
              {exporting === "whatsapp" ? "Exporting…" : "Export all — WhatsApp CSV"}
            </button>
            <button className="btn btn-outline" onClick={() => exportCsv("full", {})} disabled={exporting !== ""}>
              {exporting === "full" ? "Exporting…" : "Export all — full CSV"}
            </button>
          </div>

          <h3 style={{ marginTop: 20, fontSize: 15 }}>Recent batches</h3>
          {batches.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
              No captures yet. Open Extension Setup to install the capture extension.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {batches.slice(0, 6).map((b) => (
                <div
                  key={b.batchId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.sourceName || "Capture"}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {fmtDate(b.capturedAt)} · {b.leadCount ?? 0} leads · {b.accepted} new · {b.updated} updated · {b.rejected} rejected
                    </div>
                  </div>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setFilters({ ...EMPTY_FILTERS, batchId: b.batchId });
                      setAppliedFilters({ ...EMPTY_FILTERS, batchId: b.batchId });
                      setPage(1);
                      setTab("leads");
                    }}
                  >
                    View leads
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "leads" && (
        <div style={{ marginTop: 8 }}>
          {/* Counts first: the previous layout buried them in the filter row. */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <MiniStat label="Total leads" value={(stats?.total ?? 0).toLocaleString()} />
            <MiniStat label="With phone" value={(stats?.withPhone ?? 0).toLocaleString()} />
            <MiniStat
              label="Matching filters"
              value={loading ? "…" : total.toLocaleString()}
              accent
            />
            <MiniStat label="Batches" value={(stats?.batchCount ?? 0).toLocaleString()} />
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 14,
              background: "#fafafa",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(260px, 2fr) repeat(3, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Search
                <input
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Name, phone, address, website, email…"
                  style={{ padding: 8, fontSize: 13 }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Category
                <select
                  value={filters.category}
                  onChange={(e) => applyFilter("category", e.target.value)}
                  style={{ padding: 8, fontSize: 13 }}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} ({c.count})</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Lead status
                <select
                  value={filters.status}
                  onChange={(e) => applyFilter("status", e.target.value)}
                  style={{ padding: 8, fontSize: 13 }}
                >
                  <option value="">All statuses</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({stats?.byStatus?.[s.id] ?? 0})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Batch
                <select
                  value={filters.batchId}
                  onChange={(e) => applyFilter("batchId", e.target.value)}
                  style={{ padding: 8, fontSize: 13 }}
                >
                  <option value="">All batches</option>
                  {batches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.sourceName || "Capture"} — {fmtDay(b.capturedAt)} ({b.leadCount ?? 0})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(150px, 1fr))",
                gap: 10,
                marginTop: 10,
                alignItems: "end",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                AI tag
                <select
                  value={filters.aiTag}
                  onChange={(e) => applyFilter("aiTag", e.target.value)}
                  style={{ padding: 8, fontSize: 13 }}
                >
                  <option value="">All AI tags</option>
                  {aiTagOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                AI status
                <select
                  value={filters.aiStatus}
                  onChange={(e) => applyFilter("aiStatus", e.target.value)}
                  style={{ padding: 8, fontSize: 13 }}
                >
                  <option value="">Any AI status</option>
                  <option value="done">Tagged ({aiSettings?.counts?.done ?? 0})</option>
                  <option value="pending">Pending ({aiSettings?.counts?.pending ?? 0})</option>
                  <option value="error">Failed ({aiSettings?.counts?.error ?? 0})</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Min AI score
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={filters.minScore}
                  onChange={(e) => applyFilter("minScore", e.target.value)}
                  placeholder="0–100"
                  style={{ padding: 8, fontSize: 13 }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Has phone
                <span style={{ padding: "8px 0", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={filters.hasPhone === "true"}
                    onChange={(e) => applyFilter("hasPhone", e.target.checked ? "true" : "")}
                    style={{ marginRight: 6 }}
                  />
                  Only rows with a number
                </span>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Captured from
                <DatePicker
                  selected={ddmmyyyyToDate(filters.capturedFrom)}
                  onChange={(date) =>
                    setFilters((f) => ({ ...f, capturedFrom: dateToDdmmyyyy(date) }))
                  }
                  dateFormat="dd/MM/yyyy"
                  placeholderText="DD/MM/YYYY"
                  isClearable
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  maxDate={new Date()}
                  calendarStartDay={1}
                  className="extractor-date-input"
                  wrapperClassName="extractor-date-wrapper"
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                Captured to
                <DatePicker
                  selected={ddmmyyyyToDate(filters.capturedTo)}
                  onChange={(date) =>
                    setFilters((f) => ({ ...f, capturedTo: dateToDdmmyyyy(date) }))
                  }
                  dateFormat="dd/MM/yyyy"
                  placeholderText="DD/MM/YYYY"
                  isClearable
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  maxDate={new Date()}
                  calendarStartDay={1}
                  className="extractor-date-input"
                  wrapperClassName="extractor-date-wrapper"
                />
              </label>

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <button
                  className="btn btn-outline"
                  onClick={resetFilters}
                  disabled={activeFilterCount === 0}
                  style={{ flex: 1 }}
                >
                  Clear filters
                </button>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                {Object.entries(appliedFilters)
                  .filter(([, value]) => value !== "")
                  .map(([key, value]) => (
                    <span
                      key={key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#eef2ff",
                        color: "#3730a3",
                        borderRadius: 999,
                        padding: "3px 9px",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      {FILTER_LABELS[key] || key}: {key === "hasPhone" ? "yes" : value}
                      <button
                        onClick={() => clearFilter(key)}
                        title="Remove this filter"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#4338ca",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 12,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {total === 0
                ? "No leads"
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
            </span>
            {activeFilterCount > 0 && (
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                · {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className="btn btn-outline"
                onClick={() => exportCsv("whatsapp")}
                disabled={exporting !== "" || total === 0}
                title="WhatsApp-ready CSV for the current filters"
              >
                {exporting === "whatsapp" ? "Exporting…" : `WhatsApp CSV (${total.toLocaleString()})`}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => exportCsv("full")}
                disabled={exporting !== "" || total === 0}
                title="Full-detail CSV for the current filters"
              >
                {exporting === "full" ? "Exporting…" : `Full CSV (${total.toLocaleString()})`}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => { loadLeads(); loadStats(); loadBatches(); loadCategories(); }}
                disabled={loading}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1040 }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  {["Business", "Phone", "Line", "Data", "AI", "Category", "Region", "Website", "Source", "Captured", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} style={{ borderTop: "1px solid #f3f4f6", verticalAlign: "top" }}>
                    <td style={{ padding: "10px 10px", minWidth: 180 }}>
                      <div style={{ fontWeight: 600 }}>{lead.displayName}</div>
                      {lead.address && (
                        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2, maxWidth: 280 }}>
                          {lead.address}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      <div>{lead.phoneRaw || "—"}</div>
                      {lead.phoneE164 && (
                        <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{lead.phoneE164}</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>{lead.phoneLineType || "—"}</td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      {lead.verificationStatus === "format_valid" ? "Format valid" : lead.verificationStatus}
                    </td>
                    <td style={{ padding: "10px 10px", minWidth: 150, maxWidth: 230 }}>
                      {lead.aiStatus === "done" ? (
                        <>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(lead.aiTags || []).length === 0 ? (
                              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>—</span>
                            ) : (
                              lead.aiTags.map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    background: "#eef2ff",
                                    color: "#3730a3",
                                    borderRadius: 999,
                                    padding: "1px 7px",
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                  }}
                                >
                                  {tag}
                                </span>
                              ))
                            )}
                          </div>
                          {lead.aiScore != null && (
                            <div style={{ fontSize: 11.5, marginTop: 2, color: "var(--ink-soft)" }}>
                              Score <b style={{ color: lead.aiScore >= 60 ? "#065f46" : "var(--ink)" }}>{lead.aiScore}</b>
                            </div>
                          )}
                          {lead.aiReason && (
                            <div
                              title={lead.aiReason}
                              style={{ fontSize: 10.5, color: "var(--ink-soft)", marginTop: 2, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {lead.aiReason}
                            </div>
                          )}
                        </>
                      ) : (
                        <span
                          style={{
                            fontSize: 11.5,
                            color: lead.aiStatus === "error" ? "#b91c1c" : "var(--ink-soft)",
                          }}
                          title={lead.aiReason || ""}
                        >
                          {lead.aiStatus || "pending"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px" }}>{lead.categoryLabel || lead.category || "—"}</td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      {[lead.phoneRegionCity, lead.phoneRegionState].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "10px 10px", maxWidth: 180 }}>
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noreferrer"
                          title={lead.website}
                          style={{ wordBreak: "break-all" }}
                        >
                          {lead.website.replace(/^https?:\/\//, "").slice(0, 40)}
                        </a>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      {(lead.sourceNames || []).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>{fmtDate(lead.capturedAt)}</td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <StatusChip status={lead.leadStatus} />
                        <select
                          value={lead.leadStatus}
                          disabled={busyLead === lead.id}
                          onChange={(e) => changeLeadStatus(lead, e.target.value)}
                          style={{ padding: 3, fontSize: 11 }}
                          title="Change lead status"
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-outline"
                          style={{ padding: "2px 6px", fontSize: 11 }}
                          onClick={() => copyPhone(lead.phoneE164 || lead.phoneRaw)}
                          title="Copy phone"
                        >
                          Copy
                        </button>
                        {lead.sourceUrl && (
                          <a
                            className="btn btn-outline"
                            style={{ padding: "2px 6px", fontSize: 11 }}
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open the page this row came from"
                          >
                            Source
                          </a>
                        )}
                        <button
                          className="btn btn-outline"
                          style={{ padding: "2px 6px", fontSize: 11, color: "#dc2626" }}
                          onClick={() => removeLead(lead)}
                          disabled={busyLead === lead.id}
                          title="Delete lead"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {leads.length === 0 && !loading && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--ink-soft)", fontSize: 13 }}>
              No leads match these filters.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Page {page} of {pageCount}
            </span>
            <button className="btn btn-outline" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: 6 }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button className="btn btn-outline" onClick={loadBatches}>Refresh</button>
          </div>
          {batches.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No batches yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {batches.map((b) => (
                <div
                  key={b.batchId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.sourceName || "Capture"}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                      {fmtDate(b.capturedAt)} · {b.leadCount ?? 0} leads · {b.accepted} new · {b.updated} updated ·{" "}
                      {b.duplicates} duplicate · {b.rejected} rejected
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                      Session {b.sessionId} · Batch {b.batchId}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setFilters({ ...EMPTY_FILTERS, batchId: b.batchId });
                        setAppliedFilters({ ...EMPTY_FILTERS, batchId: b.batchId });
                        setPage(1);
                        setTab("leads");
                      }}
                    >
                      View
                    </button>
                    {b.sourceUrl && (
                      <a className="btn btn-outline" href={b.sourceUrl} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    )}
                    <button className="btn btn-outline" style={{ color: "#dc2626" }} onClick={() => removeBatch(b)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 14,
              background: aiSettings?.configured ? "#ecfdf5" : "#fef3c7",
              border: `1px solid ${aiSettings?.configured ? "#a7f3d0" : "#fde68a"}`,
              fontSize: 13,
            }}
          >
            {aiSettings?.configured ? (
              <>
                <b>AI tagging is configured.</b> Model: <code>{aiSettings.model}</code>. New captures are
                tagged automatically; the queue below shows progress.
              </>
            ) : (
              <>
                <b>GEMINI_API_KEY is not set.</b> Captures still save and stay queued. Add the key to
                <code> backend/.env</code> as <code>GEMINI_API_KEY=...</code> (and optionally
                <code> GEMINI_MODEL</code>), then restart the backend. Nothing here will call the model
                until then — no fake tags.
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard label="Pending" value={aiSettings?.counts?.pending ?? "—"} hint="Waiting for tagging" />
            <StatCard label="Tagged" value={aiSettings?.counts?.done ?? "—"} hint="Verdict stored" />
            <StatCard label="Failed" value={aiSettings?.counts?.error ?? "—"} hint="Retry after fixing the key/quota" />
            <StatCard label="Total leads" value={aiSettings?.counts?.total ?? "—"} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => runAi("pending")}
              disabled={aiBusy !== "" || !aiSettings?.configured || (aiSettings?.keywords?.length ?? 0) === 0}
              title="Tag everything still pending"
            >
              {aiBusy === "run-pending" ? "Starting…" : "Tag pending"}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => runAi("failed")}
              disabled={aiBusy !== "" || !aiSettings?.configured || (aiSettings?.counts?.error ?? 0) === 0}
            >
              {aiBusy === "run-failed" ? "Starting…" : "Retry failed"}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => runAi("all")}
              disabled={aiBusy !== "" || !aiSettings?.configured}
              style={{ color: "#b45309" }}
            >
              {aiBusy === "run-all" ? "Starting…" : "Re-tag all"}
            </button>
            <button className="btn btn-outline" onClick={loadAiSettings} disabled={aiBusy !== ""}>
              Refresh status
            </button>
            {aiSettings?.lastProcessedAt && (
              <span style={{ fontSize: 12, color: "var(--ink-soft)", alignSelf: "center" }}>
                Last tagged: {fmtDate(aiSettings.lastProcessedAt)}
              </span>
            )}
          </div>

          <h3 style={{ marginTop: 20, fontSize: 15 }}>
            AI keywords{" "}
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--ink-soft)" }}>
              ({aiSettings?.keywords?.length ?? 0} of {aiSettings?.maxKeywords ?? 15})
            </span>
          </h3>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
            The model may only use these exact strings as tags. Keep 10–15 terms — for example
            <code> food donation</code>, <code>child education</code>, <code>women empowerment</code>,
            <code> animal welfare</code>. Add or remove terms any time; existing tags are not rewritten
            until you re-tag.
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {(aiSettings?.keywords || []).length === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                No keywords yet. Tagging stays idle until at least one exists.
              </span>
            )}
            {(aiSettings?.keywords || []).map((k) => (
              <span
                key={k.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#eef2ff",
                  color: "#3730a3",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {k.keyword}
                <button
                  onClick={() => removeKeyword(k)}
                  disabled={aiBusy !== ""}
                  title="Remove keyword"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#4338ca",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }}
              placeholder="Add a keyword (e.g. child education)"
              style={{ padding: 8, minWidth: 260, flex: 1 }}
              maxLength={80}
            />
            <button
              className="btn btn-primary"
              onClick={addKeyword}
              disabled={aiBusy !== "" || !keywordInput.trim() || (aiSettings?.keywords?.length ?? 0) >= (aiSettings?.maxKeywords ?? 15)}
            >
              {aiBusy === "keyword" ? "Adding…" : "Add keyword"}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Or paste several, one per line or comma separated:
            </label>
            <textarea
              value={bulkKeywords}
              onChange={(e) => setBulkKeywords(e.target.value)}
              rows={4}
              placeholder={"food donation\nchild education\nwomen empowerment\nanimal welfare"}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 8, fontFamily: "inherit", fontSize: 13 }}
            />
            <button
              className="btn btn-outline"
              style={{ marginTop: 8 }}
              onClick={addBulkKeywords}
              disabled={aiBusy !== "" || !bulkKeywords.trim()}
            >
              {aiBusy === "bulk" ? "Adding…" : "Add all"}
            </button>
          </div>

          <div style={{ marginTop: 20, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, lineHeight: 1.7 }}>
            <strong>How scoring works</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>Each lead gets 0–3 tags from the list above, a 0–100 donor-likelihood score, and a short reason.</li>
              <li>The model reads name, category, address, website and email — nothing else.</li>
              <li>A charity that needs donations is not a donor; a foundation, trust, CSR arm or sponsor is.</li>
              <li>Failures keep the row and the error text; fix the key/quota, then press Retry failed.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === "extension" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, marginBottom: 12 }}>
            <strong>One-click setup:</strong> download the pre-configured extension, unzip it, and load it in Chrome.
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={downloadExtension} disabled={downloading}>
                {downloading ? "Preparing…" : "Download Extension (zip)"}
              </button>
              <button className="btn btn-outline" onClick={loadStatus}>Test CRM Connection</button>
            </div>
            {statusInfo && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: statusInfo.ok ? "#065f46" : "#b91c1c",
                }}
              >
                {statusInfo.ok
                  ? `Backend ready. ${statusInfo.leads ?? 0} leads in ${statusInfo.batches ?? 0} batches.`
                  : statusInfo.message || "Backend not reachable."}
              </div>
            )}
          </div>

          <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18 }}>
            <li>Download the zip above and unzip it to a folder.</li>
            <li>Open <code>chrome://extensions</code> in Chrome.</li>
            <li>Enable "Developer mode" (top right).</li>
            <li>Click "Load unpacked" and select the unzipped folder.</li>
            <li>Pin the extension, open its side panel, and start a capture.</li>
          </ol>

          <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, lineHeight: 1.7 }}>
            <strong>What the extension does</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>Queues searches (Google Maps / Bing / a custom URL), one per line, up to 30 jobs.</li>
              <li>For Google Maps, opens each result to read the phone, website and address — result cards never show a phone.</li>
              <li>Only rows with a mobile number are saved. Landlines, toll-free and unreadable numbers are reported as rejections.</li>
              <li>Rows are held locally and retried if the backend cannot be reached.</li>
            </ul>
          </div>

          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
            The zip contains your CRM token in <code>config.js</code>. Do not share it. If the token expires,
            download a fresh package.
          </p>

          <div style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
            <strong>Export shapes</strong>
            <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
              {EXPORT_FORMATS.map((f) => (
                <div key={f.id}>
                  <b>{f.label}</b> — {f.description} ({f.columns} columns)
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
