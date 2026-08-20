# FRO Dashboard UI - Current State + Planned Enhancement

---

## 📱 Current FRO Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRO DASHBOARD                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ROW 1: LIVE STATUS CARDS (4 cards)                                          │
│  ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────┐ │
│  │ 🟢 LIVE STATUS           │ │ 🎯 MONTHLY TARGET        │ │ 💚 COLLECTED │ │
│  │ Status: Punched In       │ │ Target: ₹50,000          │ │ Amount: ₹35,000│ │
│  │ Data: 45/120             │ │ 70% achieved             │ │ ████████░░ 70%│ │
│  │ Today: ₹2,500            │ │                          │ │ View →       │ │
│  └──────────────────────────┘ └──────────────────────────┘ └──────────────┘ │
│  ┌──────────────────────────┐                                               │
│  │ 🔴 REMAINING             │                                               │
│  │ ₹15,000 more to hit target│                                               │
│  └──────────────────────────┘                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ROW 2: METRICS GRID (12 cards)                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │ Monthly  │ │ Daily    │ │ Monthly  │ │ Daily    │ │ Verified │ │Unverif│ │
│  │ Connected│ │ Connected│ │ Donations│ │ Donations│ │          │ │ied    │ │
│  │   120    │ │   15     │ │  ₹35,000  │ │  ₹2,500  │ │ ₹30,000  │ │ ₹5,000│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │ Data     │ │ Data     │ │ Active   │ │ Inactive │ │ Total    │ │New    │ │
│  │ Used     │ │ Unused   │ │ Donors   │ │ Donors   │ │ Donations│ │Today  │ │
│  │   85     │ │   35     │ │   200    │ │   50     │ │  ₹1.2L   │ │   3   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│  ┌──────────┐ ┌──────────┐                                               │
│  │ New      │ │ React.   │                                               │
│  │ Monthly  │ │ Donors   │                                               │
│  │   12     │ │ Today: 2 │                                               │
│  └──────────┘ └──────────┘                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ROW 3: ASSIGNED DATA (Tabbed)                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Assigned Data  [Total] [By NGO] [By Station] [By Type]              │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  By NGO View:                                                        │  │
│  │  BSCT              45                                                │  │
│  │  MANN              30                                                │  │
│  │  AFLF              25                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ROW 4: LEAD STATS + FOLLOW-UPS (Side by side)                            │
│  ┌─────────────────────────────┐ ┌───────────────────────────────────────┐ │
│  │ Lead Stats — 2026-08        │ │ Follow-ups Today                      │ │
│  │ ┌─────────────┐ ┌─────────┐ │ │ 10:30 AM  John Doe      98765... BSCT│ │
│  │ │ New Donors  │ │Existing │ │ │ 11:00 AM  Mary Smith    87654... MANN│ │
│  │ │     8       │ │   12    │ │ │ 02:00 PM  Raj Kumar    76543... ⚠️   │ │
│  │ │ ₹15,000     │ │ ₹20,000 │ │ └───────────────────────────────────────┘ │
│  │ └─────────────┘ └─────────┘ │                                           │
│  └─────────────────────────────┘                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ROW 5: REQUEST MORE DATA + CHARTS                                         │
│  ┌──────────────────────────────────┐ ┌──────────────────────────────────┐ │
│  │ Need more donor data?            │ │ TARGET vs COLLECTION              │ │
│  │ [Request More Data]  ← button    │ │ ████████████ Target: ₹50,000      │ │
│  └──────────────────────────────────┘ │ ████████░░░  Collected: ₹35,000   │ │
│  ┌──────────────────────────────────┐ │ ████░░░░░░░  Remaining: ₹15,000   │ │
│  │ DONOR STATUS                     │ └──────────────────────────────────┘ │
│  │ ● Contacted (45) ● Collected (12)│                                       │
│  │ ● Not Interested (8) ● Pending (5)│                                      │
│  └──────────────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💚 Collected Card - Current Modal (Click to Open)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MY COLLECTIONS                                    [×]                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  August 2026 · 18 collections                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 J  John Doe              9876543210  ₹5,000  10:30 AM  Today       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟡 M  Mary Smith            8765432109  ₹3,000  11:15 AM  Today       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 R  Raj Kumar             7654321098  ₹7,500  02:30 PM  Yesterday   │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 P  Priya Sharma          9988776655  ₹2,500  09:00 AM  Aug 18      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟡 A  Amit Patel            8877665544  ₹4,000  03:45 PM  Aug 18      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ ... (13 more)                                                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Planned Enhancement: NGO-wise Tabs in Collections Modal

### **New Modal Design**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MY COLLECTIONS                                    [All] [BSCT] [MANN] [AFLF] [×]│
├─────────────────────────────────────────────────────────────────────────────┤
│  August 2026 · 18 collections  (BSCT: 8)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 J  John Doe              9876543210  ₹5,000  10:30 AM  Today       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 P  Priya Sharma          9988776655  ₹2,500  09:00 AM  Aug 18      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟡 A  Amit Patel            8877665544  ₹4,000  03:45 PM  Aug 18      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 S  Sunita Devi           7766554433  ₹3,500  11:20 AM  Aug 17      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 R  Rahul Singh           6655443322  ₹6,000  04:10 PM  Aug 17      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟡 M  Mohan Lal             5544332211  ₹2,000  01:30 PM  Aug 16      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 K  Kavita Joshi          4433221100  ₹5,500  10:00 AM  Aug 16      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 V  Vinod Kumar           3322110099  ₹3,000  02:45 PM  Aug 15      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Tab Behavior**

| Tab | Source | Count Badge |
|-----|--------|-------------|
| **All** | All collections across NGOs | Total count |
| **BSCT** | Collections where `fro_assignments.ngo_id = BSCT` | 8 |
| **MANN** | Collections where `fro_assignments.ngo_id = MANN` | 6 |
| **AFLF** | Collections where `fro_assignments.ngo_id = AFLF` | 4 |

**Work-as Collections** (from another FRO's donor):
- Show in the **donor's NGO tab** (based on `fro_assignments.ngo_id`)
- Marked with `from another FRO's donor` badge

---

## 🔧 Technical Implementation

### **Backend Changes** (`froController.js` → `getMyCollections`)

```javascript
// 1. Add ngo_id to select query
.select(`
  id, donor_id, amount_collected, action, disposition_detail, accounts_status,
  created_at, transaction_datetime, verified_at,
  donor_profiles!inner(id, name, mobile_number),
  fro_assignments!inner(fro_worker_id, ngo_id, workers!left(id, name))
`)

// 2. Group by NGO after processing collections
const byNgo = {};
for (const c of collections) {
  const ngoId = c.fro_assignments?.ngo_id;
  if (!byNgo[ngoId]) byNgo[ngoId] = [];
  byNgo[ngoId].push(c);
}

// 3. Return grouped structure
return res.json({ 
  month: monthStart.slice(0, 7), 
  collections: { all: collections, ...byNgo },
  ngoMap: { 'ngo-id-1': 'BSCT', 'ngo-id-2': 'MANN', 'ngo-id-3': 'AFLF' }
});
```

### **Frontend Changes** (`Dashboard.jsx`)

```javascript
// New state
const [selectedCollectionNgo, setSelectedCollectionNgo] = useState('all');
const [collectionsByNgo, setCollectionsByNgo] = useState({});
const [ngoMap, setNgoMap] = useState({});

// Updated openCollections
const openCollections = async () => {
  setShowCollections(true);
  setCollectionsLoading(true);
  try {
    const res = await getMyCollections();
    setCollectionsByNgo(res?.collections || { all: [] });
    setNgoMap(res?.ngoMap || {});
    setSelectedCollectionNgo('all');
  } catch (err) { /* error */ }
  finally { setCollectionsLoading(false); }
};

// Modal header with tabs
<div className="modal-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
  <div>
    <div style={{ fontSize: 14, fontWeight: 700 }}>My Collections</div>
    <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
      {collectionsLoading ? 'Loading…' : `${collectionsByNgo[selectedCollectionNgo]?.length || 0} collections`}
    </div>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 6, padding: 2 }}>
      {['all', ...Object.keys(ngoMap)].map(ngoId => (
        <button
          key={ngoId}
          onClick={() => setSelectedCollectionNgo(ngoId)}
          style={{
            padding: '4px 10px', borderRadius: 4, border: 'none',
            fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: selectedCollectionNgo === ngoId ? 'var(--sage)' : 'transparent',
            color: selectedCollectionNgo === ngoId ? '#fff' : 'var(--ink-soft)',
          }}
        >
          {ngoId === 'all' ? 'All' : ngoMap[ngoId]}
          <span style={{ marginLeft: 4, opacity: 0.7 }}>
            ({collectionsByNgo[ngoId]?.length || 0})
          </span>
        </button>
      ))}
    </div>
    <button onClick={() => setShowCollections(false)} style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
  </div>
</div>

// Filtered list
{collectionsByNgo[selectedCollectionNgo]?.map(c => (
  // existing collection item
))}
```

---

## 🎨 Visual Design Specs

### **Tab Styling**
```css
/* Active tab */
background: var(--sage)  /* #16a34a */
color: #fff
border-radius: 4px
padding: 4px 10px
font-size: 10px
font-weight: 600

/* Inactive tab */
background: transparent
color: var(--ink-soft)  /* #6b7280 */
hover: background: var(--bg)

/* Container */
display: flex
gap: 2px
background: var(--bg)  /* #f3f4f6 */
border-radius: 6px
padding: 2px
```

### **Collection Item** (unchanged)
```jsx
<div style={{ 
  display: 'flex', alignItems: 'center', gap: 10, 
  padding: '8px 12px', marginBottom: 4, borderRadius: 8,
  background: 'var(--bg)', border: '1px solid var(--line)'
}}>
  <div style={{ width: 32, height: 32, borderRadius: '50%', 
    background: c.is_work_as ? '#f59e0b' : 'var(--sage)', 
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
    {c.donor_name?.charAt(0) || '?'}
  </div>
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 600 }}>{c.donor_name}</div>
    <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{c.donor_mobile || '—'}</div>
    {c.is_work_as && (
      <span style={{ fontSize: 8, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 999 }}>
        from another FRO's donor
      </span>
    )}
  </div>
  <div style={{ textAlign: 'right' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>{currency(c.amount_collected)}</div>
    <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{fmtStamp(c.collected_at)}</div>
  </div>
</div>
```

---

## 📊 Data Flow Summary

```
1. FRO Dashboard loads
   └── GET /fro/dashboard → returns assignedData.byNgo [{ngo_id, ngo_name, count}]

2. User clicks "Collected" card
   └── openCollections() calls GET /fro/dashboard/collections

3. Backend returns
   └── { 
       month: "2026-08",
       collections: { 
         all: [...],           // all 18 collections
         ngo-id-1: [...],      // 8 collections (BSCT)
         ngo-id-2: [...],      // 6 collections (MANN)
         ngo-id-3: [...]       // 4 collections (AFLF)
       },
       ngoMap: { "ngo-id-1": "BSCT", "ngo-id-2": "MANN", "ngo-id-3": "AFLF" }
     }

4. Modal renders tabs from ngoMap + 'all'
5. Tab click → filters collectionsByNgo[selectedNgo]
```

---

## ✅ Acceptance Criteria

- [ ] Collected card clickable (cursor: pointer, hover effect)
- [ ] Modal opens with "All" tab selected by default
- [ ] Tabs show: All + each assigned NGO (from `assignedData.byNgo`)
- [ ] Each tab shows count badge: `(8)`, `(6)`, `(4)`
- [ ] Clicking tab filters list instantly (no API call)
- [ ] Work-as collections appear in donor's NGO tab
- [ ] Close button works, click outside closes modal
- [ ] Loading state shows "Loading…" in tab area
- [ ] Responsive: tabs scroll horizontally on mobile

---

## 📋 Clarifying Questions (Pre-Implementation)

| Question | Options | Recommended |
|----------|---------|-------------|
| **Tab source** | Use `assignedData.byNgo` from dashboard, or query separately? | **Dashboard data** (already loaded) |
| **Empty tabs** | Hide NGOs with 0 collections, or show all? | **Show all assigned NGOs** |
| **Work-as NGO** | Original donor's NGO or current assignment's NGO? | **Original donor's NGO** (`fro_assignments.ngo_id`) |
| **Default tab** | "All" or first NGO? | **"All"** |
| **Count badge** | Show count on tab? | **Yes** `BSCT (8)` |

---

**Ready to implement once you confirm the 5 decisions above.**