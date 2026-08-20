# Assigned Data UI - Station Performance View
## Implementation Plan

---

## 🎯 User Requirements

Add a new **Assigned Data** section showing station-wise performance:

| Column | Description |
|--------|-------------|
| **Station** | Station name |
| **Donors** | Total assigned donors |
| **Connected** | Calls with connected dispositions |
| **Non Connected** | Calls with non-connected dispositions |
| **Lead Done** | Donation collected / lead done |
| **NGOs** | NGO(s) associated with station |
| **FRO** | Assigned FRO worker name |

**Date Filters:**
- **Today** - Current day only
- **Monthly** - Current month
- **Custom** - From (dd-yyyy) to (dd-yyyy) date pickers

**Summary:** Show "X total" at top

---

## 📊 Current State Analysis

### ✅ Backend Already Exists
- **Endpoint:** `GET /ngo-admin/dashboard/station-stats`
- **Query Params:** `ngo_id`, `from` (ISO), `to` (ISO)
- **Returns:**
```json
{
  "stations": {
    "Area A-1": {
      "contacted": 45,
      "donation_collected": 12,
      "lead_done": 8,
      "not_interested": 15,
      "busy": 20,
      "ringing": 10,
      ...
    }
  },
  "summary": {
    "contacted": 200,
    "donation_collected": 50,
    ...
  }
}
```

### ✅ Station Assignment Data
- **Endpoint:** `GET /ngo-admin/stations`
- **Returns:** Station list with `fro_worker_id`, `ngos[]`, `donor_count`

### ❌ Frontend Missing
- No dedicated "Assigned Data" view/page
- No date filter UI (Today/Monthly/Custom)
- No station performance table with the specified columns
- No summary totals

---

## 🏗️ Implementation Plan

### Phase 1: Backend Enhancement (Optional - Minor)

**Option A: Use Existing API** (Recommended)
- `GET /ngo-admin/dashboard/station-stats?from=...&to=...&ngo_id=...` already supports date filtering
- Combine with `GET /ngo-admin/stations` for FRO/NGO info

**Option B: New Optimized Endpoint** (If performance needed)
```
GET /ngo-admin/assigned-data/station-performance
Query: period=today|month|custom, from=..., to=..., ngo_id=...
Response:
{
  "summary": { "total_stations": 10, "total_donors": 460, "total_connected": 320, "total_non_connected": 80, "total_lead_done": 60 },
  "stations": [
    {
      "station": "Area A-1",
      "donors": 50,
      "connected": 35,
      "non_connected": 10,
      "lead_done": 5,
      "ngos": ["BSCT"],
      "fro_name": "Rahul Sharma",
      "fro_id": 12
    }
  ]
}
```

**Decision:** Start with **Option A** (existing APIs), optimize later if needed.

---

### Phase 2: Frontend - New Component

#### 2.1 New Component: `AssignedDataView.jsx`

```jsx
// Location: ucs crm/src/panels/ngo-admin/components/AssignedDataView.jsx

<AssignedDataView
  selectedNgoId={selectedNgoId}
  accessibleNgos={accessibleNgos}
  onNgoChange={setSelectedNgoId}
/>
```

#### 2.2 UI Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ASSIGNED DATA - STATION PERFORMANCE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🏢 NGO: BSCT ▼]    [📅 Today] [📅 Monthly] [📅 Custom]                    │
│  ┌──────────────┐ ┌──────────────┐                                          │
│  │ From: dd-yyyy │ │ To: dd-yyyy   │  (visible when Custom selected)       │
│  └──────────────┘ └──────────────┘                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  SUMMARY: 12 Stations │ 460 Total Donors │ 320 Connected │ 80 Non-Conn     │
│                      │ 60 Lead Done     │ 69.6% Connect Rate               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────┬────────────┬────────┬───────────┬─────────────┬────────┬───────────┐│
│  │ #  │ Station    │ Donors │ Connected │ Non-Connect │ Lead   │ NGOs      │
│  │    │            │        │           │             │ Done   │ FRO       │
│  ├────┼────────────┼────────┼───────────┼─────────────┼────────┼───────────┤│
│  │ 1  │ Area A-1   │   50   │    35     │     10      │   5    │ BSCT      │
│  │    │            │        │           │             │        │ Rahul S.  │
│  │ 2  │ Area B-2   │   45   │    28     │     12      │   5    │ AFLF      │
│  │    │            │        │           │             │        │ Neha K.   │
│  │ 3  │ Area C-1   │   60   │    42     │     15      │   3    │ MANN      │
│  │    │            │        │           │             │        │ Amit P.   │
│  │... │ ...        │  ...   │   ...     │    ...      │  ...   │ ...       │
│  └────┴────────────┴────────┴───────────┴─────────────┴────────┴───────────┘│
│  TOTALS:          460      320          80            60                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  [📥 Export CSV]  [🔄 Refresh]                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Integration Options

#### Option 1: New Tab in Dashboard (Recommended)
Add as a collapsible section in `Dashboard.jsx` after "Donor Health" section

#### Option 2: New Page/Route
- Route: `/ngo-admin/assigned-data`
- Add to `NgoAdminPanel.jsx` sidebar

#### Option 3: Modal in StationManagement
- Add "View Performance" button in StationManagement table

**Decision:** **Option 1** (Dashboard section) - keeps TL dashboard unified. Can extract to separate page later.

---

### Phase 4: Data Processing Logic

```javascript
// Connected dispositions (from existing DISPOSITION_GROUPS)
const CONNECTED = [
  'contacted', 'lead_done', 'done', 'donation_collected', 'follow_up', 
  'scheduled', 'visit_donate', 'will_donate_online', 'promise_to_pay', 
  'payment_pending', 'already_donated', 'email_sent', 'whatsapp_sent', 
  'csr_inquiry', 'wants_80g_details', 'wants_trust_documents', 
  'language_barrier', 'transferred_senior', 'query_complaint', 
  'receipt_request', 'not_interested_now', 'not_interested', 'dnd', 
  'wrong_person', 'call_disconnected', 'callback'
];

// Non-connected dispositions
const NON_CONNECTED = [
  'busy', 'ringing', 'call_waiting', 'unreachable', 'switched_off', 
  'out_of_coverage', 'wrong_number', 'invalid', 'invalid_number', 
  'rejected', 'temporary_network_issue', 'voicemail'
];

// Lead Done = donation_collected + lead_done + done
const LEAD_DONE = ['donation_collected', 'lead_done', 'done'];

// Computation per station:
const connected = CONNECTED.reduce((sum, s) => sum + (stationMap[station]?.[s] || 0), 0);
const nonConnected = NON_CONNECTED.reduce((sum, s) => sum + (stationMap[station]?.[s] || 0), 0);
const leadDone = LEAD_DONE.reduce((sum, s) => sum + (stationMap[station]?.[s] || 0), 0);
const totalDonors = stationInfo?.donor_count || Object.values(stationMap[station] || {}).reduce((a,b) => a+b, 0);
```

---

### Phase 5: API Integration

```javascript
// In useTLDashboard.js or new useAssignedData.js
const fetchAssignedData = async (period, customFrom, customTo) => {
  const { from, to } = getDateRange(period, customFrom, customTo);
  const ngoParam = selectedNgoId !== 'all' ? `&ngo_id=${selectedNgoId}` : '';
  
  const [stationStats, stationsData] = await Promise.all([
    apiGet(`/ngo-admin/dashboard/station-stats?from=${from}&to=${to}${ngoParam}`),
    apiGet(`/ngo-admin/stations${ngoParam ? '?ngo_id=' + selectedNgoId : ''}`)
  ]);
  
  return mergeStationData(stationStats, stationsData);
};

// Date range helpers
const getDateRange = (period, customFrom, customTo) => {
  const now = new Date();
  switch(period) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'month':
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    case 'custom':
      return { from: customFrom, to: customTo };
  }
};
```

---

### Phase 6: Lucide Icons & Styling

```jsx
import {
  Calendar, CalendarDays, CalendarRange,
  Building2, Users, Phone, CheckCircle, XCircle,
  TrendingUp, Download, RefreshCw, Filter,
  ChevronDown, MoreHorizontal
} from 'lucide-react';
```

**Color Coding:**
- Connected: Green (`#16a34a`)
- Non-Connected: Red (`#ef4444`)
- Lead Done: Blue (`#3b82f6`)
- Total Donors: Neutral (`#6b7280`)

---

## 📁 File Changes

```
ucs crm/src/panels/ngo-admin/
├── components/
│   └── AssignedDataView.jsx          # NEW - Main component
├── hooks/
│   └── useAssignedData.js            # NEW - Data fetching logic
├── pages/
│   └── Dashboard.jsx                 # MODIFY - Add AssignedDataView section
└── store.jsx                         # MODIFY - Add assigned data state (if needed)
```

---

## 🎨 Design Specs (Consistent with Dashboard)

| Element | Spec |
|---------|------|
| Card | White bg, 1px border `#e5e7eb`, radius 8px, padding 16px |
| Table Header | Grey bg `#f9fafb`, uppercase, 11px, font-weight 600 |
| Table Row | Hover: `#f9fafb`, border-bottom 1px `#f3f4f6` |
| Numbers | Tabular-nums, 700 weight |
| Status Pills | Green/Red/Blue bg with white text, radius 20px |
| Date Pickers | Native `<input type="date">` styled |
| Buttons | Consistent with existing btn-primary/btn-outline |

---

## ⚡ Performance Considerations

1. **Memoize** merged station data with `useMemo`
2. **Debounce** date filter changes (300ms)
3. **Cache** station stats for 30 seconds
4. **Virtualize** table if >100 stations (react-window)
5. **Lazy load** component with `React.lazy`

---

## 🧪 Testing Checklist

- [ ] Today filter shows correct day's data
- [ ] Monthly filter shows current month
- [ ] Custom date range works with date pickers
- [ ] NGO filter updates data correctly
- [ ] Connected/Non-Connected/Lead Done calculations match backend
- [ ] Summary totals match table sums
- [ ] Export CSV works
- [ ] Responsive on mobile (horizontal scroll)
- [ ] Loading states during fetch
- [ ] Empty state when no stations

---

## 📋 Implementation Priority

| Priority | Task | Effort |
|----------|------|--------|
| **P0** | Create `AssignedDataView.jsx` component | 2h |
| **P0** | Create `useAssignedData.js` hook | 1h |
| **P0** | Integrate into `Dashboard.jsx` | 1h |
| **P1** | Add Export CSV functionality | 30m |
| **P1** | Add loading/error/empty states | 30m |
| **P1** | Polish styling, animations | 1h |
| **P2** | Add unit tests | 1h |
| **P2** | Consider separate page route if needed | 1h |

**Total Estimate: ~7-8 hours**

---

## ❓ Clarifying Questions

1. **Location**: Add as Dashboard section (Option 1) or separate page (Option 2)?
2. **Date Default**: Default to "Monthly" or "Today"?
3. **Lead Done Definition**: Include `promise_to_pay`/`payment_pending` or only `donation_collected`/`lead_done`/`done`?
4. **Non-Connected**: Include `not_interested`/`dnd`/`wrong_person` or only technical failures (busy/ringing/unreachable)?
5. **Export**: CSV only or also Excel/PDF?

---

## 🔄 Future Enhancements

- Drill-down: Click station → show donor list with dispositions
- Compare: Period-over-period comparison (WoW, MoM)
- Alerts: Highlight stations with <50% connect rate
- FRO-wise breakdown within station