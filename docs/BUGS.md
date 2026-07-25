# FRO & NGO-Admin Panel — Bug Tracker

Status legend: `[ ]` pending · `[~]` in-progress · `[x]` fixed

---

## FRO Panel

### pages/MyDonors.jsx
- [x] **#1 Functional** (line 163,179) — `r.findIndex` called on backend response object instead of unwrapped `donorList`. Cross-device position restore crashes with "r.findIndex is not a function". Fix: use `donorList.findIndex(...)`.
- [x] **#2 Logical** (line 707) — On-Call badge shows `todayStats.totalSeconds` (cumulative) instead of live `elapsed` from `useCall()`. Destructure `elapsed` and display it, matching `CallTimer.jsx`.
- [x] **#3 Functional** (line 386) — OCR amount uses `setLeadAmount(prev => prev || amount)` (correct here), but see #3a/#3b.
- [x] **#3a Functional** (`DonorDetail.jsx:127`, `DispositionModal.jsx:110`) — OCR `if (amount && !leadAmount) setLeadAmount(amount)` reads stale closure `leadAmount` during async OCR; second OCR result dropped if user typed. Use functional updater `setLeadAmount(prev => prev || amount)`.

### pages/TransferredLeads.jsx
- [x] **#4 Logical** (lines 17-24) — `CONNECTED` array missing `{ id:'callback', label:'Callback' }`. Transferred leads cannot be set to Callback; `isConnected('callback')` returns false. Add it to match MyDonors/DispositionModal.

### components/DispositionModal.jsx
- [x] **#5 Functional** (lines 84-86) — `useEffect([])` runs `startCall`/`endCall` with empty deps; doesn't re-run on `donorId` change. Reopening modal for a different donor doesn't reset the active call. Add `donorId` to deps or restructure.
- [x] **#6 Logical** — Never sends `logData.remark` (MyDonors does). Add `remark` field to `lead_done` payload for parity with Accounts expectations.

### CallContext.jsx
- [x] **#7 Logical** (line 71) — Status reports `online` when idle time is accumulating but no donor-view is open. A logged-in idle FRO shows online, not idle. Refine status derivation.
- [x] **#8 Functional** (line 142) — `startCall` calls `toggleBreak()` declared later (line 164); works only due to callback timing. Add `toggleBreak` to `startCall` useCallback deps and reorder.

### FROPanel.jsx
- [x] **#9 Functional** (line 130) — `_initSeenNotifs` parsed from localStorage on every render into ref initializer. Memoize / move outside render.
- [x] **#10 Logical** (lines 248-256) — Today's `scheduled` items re-categorized as `type:'callback'` in the reminder list. Confusing: a donor scheduled for today is not a callback. Revisit categorization.

### pages/Donors.jsx
- [x] **#11 Functional** (line 45) — `setDonors(data)` without `unwrapDonors()`. If endpoint returns `{donors,total}`, all `donors.filter/.map` break. Use `unwrapDonors(data)`.

### pages/WhatsAppChat.jsx
- [x] **#12 Security** (lines 23-24) — Hardcoded WhatsApp master credentials `admin@whatsapp.com` / `Admin123!` as fallback, compiled into client bundle. Remove fallbacks; require env vars; move auth server-side.

---

## NGO-Admin Panel

### NgoAdminPanel.jsx
- [x] **#13 Functional/Display** (line 423) — `iconMap = { donor:'??', fro:'??', station:'??' }` renders literal "?" characters. Replace with real SVG icon paths or remove.
- [x] **#14 Functional/Display** (line 288) — Search clear glyph renders `?` instead of `×`. Replace with close icon.
- [x] **#15 Logical** (line 256) — `handleDrawerItemClick` ignores `section.type` for the Notifications section; always routes to `/ngo-admin/rejected-leads`. Route notifications appropriately.
- [x] **#16 Functional** (line 175) — `useRealtime('rejected_lead_tickets', { event:'*' })` subscribes to all events → `loadRejectedCount(true)` fires on every UPDATE/DELETE → desktop notif spam. Use default INSERT-only or filter.

### pages/Dashboard.jsx
- [x] **#17 Functional/Dead code** (line 299) — `totalLeads` computed unconditionally but only rendered in verification branch. Either render in collection mode or remove.
- [x] **#18 Functional** (lines 485-487) — `dateParam` URL construction: verify separator (`?` vs `&`) when `ngoParam` is empty but dates are set. Currently OK but fragile — refactor.

### pages/StationManagement.jsx
- [x] **#19 Functional** (line 446) — `handleFroChange` sends `s.ngos[0]?.ngo_id` which may be `null` if station has no NGO. Require NGO before FRO assignment, or omit `ngo_id` when absent.
- [x] **#20 Functional** (line 696) — `t?.months_employed >= 3` compares possibly-undefined value; verify backend returns a number. Add `Number()` coercion.
- [x] **#21 Functional** (line 849) — Clear-incentive sends `incentive_amount: ''` (empty string). Backend may parse as NaN/0. Send `null` to clear.
- [x] **#22 Functional** (line 131) — FormData upload via `api()` may set `Content-Type: application/json`. Verify the shared helper preserves FormData headers; fix if it overwrites.

### pages/RejectedLeads.jsx
- [x] **#23 Functional** (line 15) — `apiGet('/ngo-admin/ngos').then(setAccessibleNgos)` assumes array. Defensive: `Array.isArray(data) ? data : []`.
- [x] **#24 Logical** (line 33) — `ack` optimistically updates status without refetch; loses server-returned fields (e.g. `updated_at`). Refetch or merge response.

---

## Cross-cutting

- [x] **#25 Functional/Dup** (`fro/api/auth.js:10` + callers) — `_prefix:'ucs'` defaulted in wrapper AND re-passed by every caller. Harmless but indicates confusion; remove redundant passes.
- [x] **#26 Logical** (`DonorDetail.jsx:170`) — Sends `disposition_category: category` (user-picked dropdown) which can mismatch `disposition_detail` (e.g. pick Connected + a Not-Connected reason). Auto-derive category from detail id like MyDonors does.
- [x] **#27 Functional** — `CallContext` never persists stats to the server on tab close reliably; the cleanup `api(... status:'offline')` fires during unload and may be cancelled. Consider `navigator.sendBeacon`.

---

## Priority

1. **#1** MyDonors restore crash · **#2** wrong call timer · **#4** missing callback · **#11** Donors.jsx no unwrap · **#12** hardcoded creds · **#13/#14** broken icons
2. **#5** DispositionModal call reset · **#6** missing remark · **#8** toggleBreak deps · **#16** realtime event spam · **#19** null ngo_id · **#22** FormData headers · **#26** category mismatch
3. Everything else (polish/idle-status/cleanup)