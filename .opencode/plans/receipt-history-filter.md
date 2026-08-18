# Receipt History Filter Simplification

## Goal
Remove month/year dropdowns and period buttons (All/Today/Yesterday/This Week/This Month/This Year/Custom). Replace with a simple always-visible From/To date range picker defaulting to today.

## File to edit
`ucs crm/src/panels/accounts/pages/ReceiptHistory.jsx`

---

## Change 1 — State declarations (lines 129-135)

**Remove:**
- `period` state (line 129)
- `filterMonth` state (line 134)
- `filterYear` state (line 135)

**Change:**
- `fromDate` and `toDate` default to today: `new Date().toISOString().slice(0, 10)`

**Before:**
```js
const [page, setPage] = useState(1);
const [period, setPeriod] = useState('all');
const [fromDate, setFromDate] = useState('');
const [toDate, setToDate] = useState('');
const [receiptNgo, setReceiptNgo] = useState('');
const [suspenseMode, setSuspenseMode] = useState(false);
const [filterMonth, setFilterMonth] = useState(0);
const [filterYear, setFilterYear] = useState(0);
```

**After:**
```js
const [page, setPage] = useState(1);
const todayStr = new Date().toISOString().slice(0, 10);
const [fromDate, setFromDate] = useState(todayStr);
const [toDate, setToDate] = useState(todayStr);
const [receiptNgo, setReceiptNgo] = useState('');
const [suspenseMode, setSuspenseMode] = useState(false);
```

---

## Change 2 — `load` function (lines 154-179)

**Remove:** `filterMonth`/`filterYear`/`period` logic. Always send `from_date`/`to_date`.

**Before:**
```js
if (filterMonth && filterYear) {
  params.set('filter_month', String(filterMonth));
  params.set('filter_year', String(filterYear));
} else if (period === 'custom') {
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', toDate);
} else if (period && period !== 'all') {
  params.set('period', period);
}
```

**After:**
```js
if (fromDate) params.set('from_date', fromDate);
if (toDate) params.set('to_date', toDate);
```

**Also update dependency array** (line 179): remove `period`, `filterMonth`, `filterYear`.

**Before:**
```js
}, [page, searchQuery, period, fromDate, toDate, receiptNgo, suspenseMode, filterMonth, filterYear]);
```

**After:**
```js
}, [page, searchQuery, fromDate, toDate, receiptNgo, suspenseMode]);
```

---

## Change 3 — `useEffect` for setPage (line 343)

**Before:**
```js
useEffect(() => { setPage(1); }, [searchQuery, period, fromDate, toDate, receiptNgo, suspenseMode, filterMonth, filterYear]);
```

**After:**
```js
useEffect(() => { setPage(1); }, [searchQuery, fromDate, toDate, receiptNgo, suspenseMode]);
```

---

## Change 4 — `buildFilterParams` (lines 438-454)

**Remove:** `filterMonth`/`filterYear`/`period` logic. Always send `from_date`/`to_date`.

**Before:**
```js
if (filterMonth && filterYear) {
  p.set('filter_month', String(filterMonth));
  p.set('filter_year', String(filterYear));
} else if (period === 'custom') {
  if (fromDate) p.set('from_date', fromDate);
  if (toDate) p.set('to_date', toDate);
} else if (period && period !== 'all') {
  p.set('period', period);
}
```

**After:**
```js
if (fromDate) p.set('from_date', fromDate);
if (toDate) p.set('to_date', toDate);
```

---

## Change 5 — UI filter bar (lines 629-679)

**Remove entirely:**
- Month dropdown (lines 635-642)
- Year dropdown (lines 643-649)
- Separator span after year (line 650)
- Period buttons (lines 651-656)
- Custom date inputs block (lines 657-663)

**Replace with** an always-visible From/To date range picker, placed right after the Suspense button + separator:

```jsx
<span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
<input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }}
  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
<span style={{ fontSize: 12, color: '#6b7280' }}>to</span>
<input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }}
  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }} />
```

**Final filter bar layout:**
```
[ Suspense ] | [From: 2026-08-18] to [To: 2026-08-18] | [NGO dropdown] | [Search...]
```

---

## Change 6 — Remove unused variable `period` from any remaining references

Search for any remaining references to `period`, `filterMonth`, or `filterYear` in the file and remove them. Known locations:
- Line 653 `onClick` handler references `setPeriod`, `setFilterMonth`, `setFilterYear` — this entire block is removed in Change 5.

---

## Verification
- Run `npm run build` in `ucs crm/` to verify no build errors
- Confirm the filter bar shows only: Suspense toggle | From/To date | NGO dropdown | Search
- Confirm default load shows today's receipts
