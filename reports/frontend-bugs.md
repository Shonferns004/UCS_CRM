# Frontend Audit Report — UCS CRM

**Scope:** 44 React files across `ngo-admin/pages`, `accounts/pages`, and `accounts/components`
**Date:** 2026-07-23

---

## CRITICAL — Data Loss / Security

### 1. WhatsApp Access Token Stored and Displayed as Plain Text
**File:** `accounts/components/WhatsAppAccountsManager.jsx` (line 201)
**File:** `accounts/pages/WhatsAppAgents.jsx` (line 120 — search input)

The `access_token` field for WhatsApp accounts uses `type="text"` instead of `type="password"`:
```jsx
<input type="text" value={form.access_token} ... />
```
Anyone with screen access can see the Meta API token. This is a secret that grants full WhatsApp Business API access.

**Fix:** Change to `type="password"` in the form input. Show a "reveal" toggle if needed.

---

### 2. Razorpay Key Secret and Webhook Secret Also Use `type="password"` but Still Visible in State
**File:** `accounts/components/RazorpayAccountsManager.jsx` (lines 171-177)

These are correctly `type="password"`, but the `form.key_secret` value is held in plain React state. On edit, leaving it blank keeps the old value (server-side), which is correct. However, the `emptyForm` resets to `''`, and any state inspection (React DevTools) reveals typed secrets before submit. Low practical risk but worth noting.

---

### 3. Receipt Template `_dataMissing` Guard Does NOT Protect Against Null Donor Fields
**Files:**
- `accounts/components/ReceiptTemplateManncar.jsx` (lines 30, 46, 60)
- `accounts/components/ReceiptTemplate_MannCar.jsx` (lines 83, 127, 174)

All three call `.toUpperCase()` directly on `donor['Donor Name']` without optional chaining:
```jsx
{donor['Donor Name'].toUpperCase()}
```
If `_dataMissing` is `false` but `Donor Name` is still `null` or `undefined` (e.g. the server returns the record but the name field is empty), this will throw an unhandled TypeError and crash the receipt generation.

**Fix:** Use `donor['Donor Name']?.toUpperCase() || 'Unknown'` or ensure `_dataMissing` is set whenever Donor Name is falsy.

---

### 4. ReceiptTemplate_MannCar.jsx — No Null Guard on `Address 1`
**File:** `accounts/components/ReceiptTemplate_MannCar.jsx` (line 86)

Unlike `ReceiptTemplateManncar.jsx` (the non-underscore version) which uses `hasRealAddr`, this template renders:
```jsx
Address. - {donor['Address 1']}<br />
```
If `Address 1` is `undefined`, it renders "Address. - " with nothing. Minor but sloppy.

---

## HIGH — Logic Bugs / Race Conditions

### 5. BankAudit — Double API Call on Every Mount
**File:** `accounts/pages/BankAudit.jsx` (line 243)

```jsx
useEffect(()=>{load(sd,st)},[st]);
useEffect(()=>{load(sd,st)},[sd]);
```
On mount, both effects fire simultaneously, causing **two identical parallel API calls** (`entries`, `sources`, `summary`). This wastes bandwidth and can cause flicker if responses arrive in different order.

**Fix:** Merge into one effect: `useEffect(()=>{load(sd,st)},[sd, st]);`

---

### 6. BankAudit — `load` Function Captures Stale `sr`/`su` State
**File:** `accounts/pages/BankAudit.jsx` (lines 233-241)

The `load` function is defined inside the component body but NOT memoized with `useCallback`. It captures `sr` (sources) and `su` (summary) from closure, but the `useEffect` hooks that call `load` don't list `load` in their dependencies (only `st` and `sd`). This means if `sr` or `su` change between renders, the `load` closure still references old values. In practice, `load` overwrites `sr`/`su` via `setSr`/`setSu`, so the stale reference is overwritten immediately, making this a latent issue rather than active bug.

---

### 7. Stale Closures in Email Import / Gateway Tabs (Multiple Files)
**Files:**
- `accounts/pages/BankAudit.jsx` — EmailTab (line 22), GatewayTab (line 68)
- `accounts/pages/BankImports.jsx` — EmailImportTab (line 75), PaymentGatewaysTab (line 199)
- `accounts/pages/EmailImport.jsx` (line 46)
- `accounts/pages/PaymentGateways.jsx` (line 45)

Pattern:
```jsx
useEffect(() => { loadData(); }, [filterAccount]); // loadData not in deps
```
`loadData` / `load` is defined inside the component and re-created every render, but is NOT listed in the dependency array. React's exhaustive-deps lint rule would flag this. It works correctly in practice because `loadData` only uses the filter values that ARE in the deps, plus stable state setters — but it's fragile. If someone adds a new state variable used by `loadData` but forgets to add it to deps, it'll silently go stale.

---

### 8. WhatsAppAgents — Timer Cleanup Missing on Unmount
**File:** `accounts/pages/WhatsAppAgents.jsx` (line 13)
**File:** `accounts/components/WhatsAppAccountsManager.jsx` (line 30)

```jsx
const timers = useRef({});
// ...
timers.current[accountId] = setTimeout(async () => { ... }, 300);
```
If the component unmounts while a debounce timer is pending, the callback will fire and call `setResults` on an unmounted component. This causes a React warning (in React 17) or a silent no-op (React 18+), but in either case it's a memory leak.

**Fix:** Clean up all timers on unmount:
```jsx
useEffect(() => {
  return () => Object.values(timers.current).forEach(clearTimeout);
}, []);
```

---

### 9. TemplateSettings — Dynamic Import Creates Uncleaned Promise
**File:** `accounts/pages/TemplateSettings.jsx` (line 32)

```jsx
useEffect(() => {
  import('../api/auth').then(({ apiGet }) => {
    apiGet('/whatsapp/templates').then(list => setMetaTemplates(list || [])).catch(() => {})
  })
}, [])
```
The dynamic `import()` returns a promise that is never cleaned up on unmount. Also, `apiGet` is called inside a `.then()` which means the component might set state after unmounting. Additionally, this is an unusual pattern — `apiGet` should be imported statically at the top of the file.

---

### 10. ReceiptHistory — `load` Function Not Memoized, Called in Empty-Deps Effect
**File:** `accounts/pages/ReceiptHistory.jsx` (lines 102-110)

```jsx
const load = () => { setLoading(true); apiGet(...).then(setReceipts)... };
useEffect(load, []);
```
ESLint exhaustive-deps would warn. Works because `load` only uses stable setters, but if someone adds a filter dependency inside `load`, it won't re-run.

---

## MEDIUM — UX / Performance Issues

### 11. SuspensePage — Silent Error Swallowing
**File:** `accounts/pages/SuspensePage.jsx` (line 33)

```jsx
apiGet(url).then(setItems).catch(() => {}).finally(...)
```
If the API call fails (network error, 500, auth expired), the user sees "No suspense entries yet" instead of an error message. Same pattern in ReceiptHistory (line 106) and other files.

**Fix:** Show an error toast or error banner when the API fails.

---

### 12. BankAudit — Multiple Modals Can Stack
**File:** `accounts/pages/BankAudit.jsx` (lines 225-227, 302-356)

`showAdd` (sa), `editEntry` (se), `showSrc` (ss) are independent booleans. Nothing prevents opening the Add Entry modal while the Edit Entry modal is already open, causing two modals to render simultaneously with overlapping overlays.

**Fix:** Use a single state like `activeModal: null | 'add' | 'edit' | 'sources'` or close other modals when one opens.

---

### 13. AssetRegister — Offline Mode Silently Swallows Failures
**File:** `accounts/pages/AssetRegister.jsx` (lines 315-323, 380-382, 398)

```jsx
api('/assets').catch(() => setOffline(true))  // sets offline flag
api('/assets', { method: 'POST', ... }).catch(() => {})  // silently fails!
```
After showing the offline banner, all save/update operations silently fail with `.catch(() => {})`. The user thinks their changes were saved (local state IS updated) but the server never receives them. On next page load, all "saved" data is gone.

**Fix:** Show error toasts on API failure. At minimum, display a warning when operating in offline mode.

---

### 14. AssetRegister — `saveNew` Closes Modal Before API Response
**File:** `accounts/pages/AssetRegister.jsx` (lines 376-383)

```jsx
function saveNew(form) {
  const asset = { ... };
  api('/assets', { method: 'POST', ... })
    .then(saved => setAssets(p => [...p, saved?.id ? saved : asset]))
    .catch(() => setAssets(p => [...p, asset]))  // adds locally even on failure
  setShowAdd(false);  // closes modal immediately, before API responds
}
```
The modal closes before the API call completes. If the API fails, the asset is still added to local state (optimistic), and the user has no idea it didn't save server-side.

---

### 15. BankAudit — `ngokw` and `fe` Recreated Every Render
**File:** `accounts/pages/BankAudit.jsx` (lines 246-247)

```jsx
const ngoKw={bsct:['beingsevak','being sevak','sevak'], ...};
const fe=nf?e.filter(e=>{...}):e;
```
`ngoKw` is a constant object recreated on every render. Should be moved outside the component or memoized. `fe` (filtered entries) is recomputed every render even when `e` (entries) and `nf` (NGO filter) haven't changed. Should be wrapped in `useMemo`.

---

### 16. AssetRegister — Inline `<style>` Block Recreated Every Render
**File:** `accounts/pages/AssetRegister.jsx` (lines 408-546)

A ~140-line `<style>` tag is embedded inside the JSX return. React re-creates this DOM node on every render, causing the browser to re-parse the CSS. Should be extracted to a CSS file or at minimum memoized.

---

### 17. BankAudit — Massively Compressed Variable Names
**File:** `accounts/pages/BankAudit.jsx` (entire file)

Almost all variables use 1-3 letter names: `e`, `s`, `sr`, `su`, `ld`, `st`, `sd`, `sf`, `nf`, `sa`, `se`, `ss`, `fm`, `sv`, `snn`, `er`, `mt`, `is`. This makes the file extremely difficult to maintain. The same pattern exists in the sub-components `EmailTab`, `GatewayTab`, `StatementTab`.

---

### 18. `loadData` Functions Not Using `useCallback`
**Files:** Multiple — BankAudit, BankImports, EmailImport, PaymentGateways, etc.

Functions like `loadData` / `load` are defined with `async function loadData() {...}` inside components without `useCallback`. This means new function references on every render, causing child components to re-render unnecessarily and effects to potentially miss updates.

---

### 19. BulkProgressModal / ConfirmBulkModal — Overlay Click Does Nothing
**File:** `accounts/components/BulkProgressModal.jsx` (line 8)
**File:** `accounts/components/ConfirmBulkModal.jsx` (line 5)

```jsx
<div className="modal-overlay" onClick={() => {}}>
```
The overlay click handler is an empty function. This blocks click-through (good) but doesn't dismiss the modal (expected for critical operations). However, the empty function `() => {}` is recreated on every render. Minor perf issue.

---

## LOW — Code Quality / Dead Code

### 20. Duplicate Receipt Templates — Two Naming Conventions
**Files:**
- `ReceiptTemplateManncar.jsx` vs `ReceiptTemplate_MannCar.jsx` (Mann Care)
- `ReceiptTemplateBeingSevak.jsx` vs `ReceiptTemplate_BeingSevak.jsx` (Being Sevak)
- `ReceiptTemplateAshray.jsx` vs `ReceiptTemplate_Ashray.jsx` (Ashray)

Two complete sets of receipt templates exist. Key differences:

| Aspect | Non-underscore (Manncar, BeingSevak, Ashray) | Underscore (MannCar, BeingSevak, Ashray) |
|--------|----------------------------------------------|------------------------------------------|
| Used by | `Receipts.jsx` (WhatsApp bulk send) | `ReceiptHistory.jsx`, `LeadDetail.jsx` |
| Asset paths | ES module `import` | Public `/receipt-assets/` paths |
| `data-receipt-sheet` attr | Missing | Present (for PDF generation) |
| `data-pdf-width` attr | Missing | Present |
| `signature` prop | Not supported | Supported |

The non-underscore versions appear to be the original templates. The underscore versions are updated copies for PDF generation (with `data-receipt-sheet` and `crossOrigin` attributes). This duplication is confusing and error-prone.

**Fix:** Consolidate into one set of templates that support both use cases.

---

### 21. ReceiptTemplate_Ashray — Wrong Helpline Label (Copy-Paste Bug)
**File:** `accounts/components/ReceiptTemplate_Ashray.jsx` (line 408)

```jsx
Helpline Number SEVAK: {org.helpline}
```
This says "SEVAK" (Being Sevak's label) but this is the **Ashray** receipt template. Should be "ASHRAY" or just "Helpline Number:".

---

### 22. ReceiptTemplate_Ashray — Unused Variable
**File:** `accounts/components/ReceiptTemplate_Ashray.jsx` (line 32)

```jsx
const light = '#EDF2F9'
```
Declared but never used anywhere in the file.

---

### 23. ReceiptTemplate_BeingSevak — Empty Spans (Dead Code)
**File:** `accounts/components/ReceiptTemplate_BeingSevak.jsx` (lines 71, 154)

```jsx
<span style={{ fontWeight: 800, fontSize: '22px' }}></span>
<span style={{ fontWeight: 800, fontSize: '22px' }}></span>
Being Sevak Charitable Trust
```
Two empty spans with styling that render nothing. Appears to be leftover from a previous layout attempt.

---

### 24. ReceiptTemplate_MannCar — Empty `<s />` Tags as Spacers
**File:** `accounts/components/ReceiptTemplate_MannCar.jsx` (line 295)

```jsx
<b>Registered Office  :</b> <s /><s />
```
Uses empty `<s />` (strikethrough) elements as spacers. This is a hacky approach — should use margin/padding instead.

---

### 25. `amountInWords` Inconsistency Across Templates
**Files:**
- `ReceiptTemplateBeingSevak.jsx` (line 50): `amountInWords(Math.floor(amount))`
- `ReceiptTemplate_BeingSevak.jsx` (line 310): `amountInWords(amount)` (no floor)
- `ReceiptTemplateAshray.jsx` (line 79): `amountInWords(amount)` + " Rupees and No. Paise Only"
- `ReceiptTemplate_Ashray.jsx` (line 219): `amountInWords(amount)` (no suffix)
- `ReceiptTemplateManncar.jsx` (line 56): `amountInWords(amount)` + " Only"
- `ReceiptTemplate_MannCar.jsx` (line 169): `amountInWords(amount)` (no suffix)

Same NGO, same donation, two different receipt template versions produce different amount-in-words text. This is inconsistent and could confuse donors or auditors.

---

### 26. EmailAccountsManager and EmailAccountsView — Near-Duplicate Components
**Files:**
- `accounts/pages/EmailAccountsManager.jsx` (120 lines)
- `accounts/components/EmailAccountsView.jsx` (116 lines)

These are nearly identical (both manage email accounts CRUD). The only differences:
- `EmailAccountsManager` accepts `onAccountsChange` prop
- `EmailAccountsView` does not

Should be consolidated into one component with the callback as optional.

---

### 27. BankImports.jsx — Near-Duplicate of BankAudit Tab Components
**File:** `accounts/pages/BankImports.jsx` (405 lines)

`BankImports.jsx` contains `EmailImportTab`, `PaymentGatewaysTab`, and `BankStatementTab` — all of which are near-duplicates of the tab components inside `BankAudit.jsx` (`EmailTab`, `GatewayTab`, `StatementTab`). Two separate pages render the same functionality with minor styling differences.

---

### 28. ngo-admin Pages — Inconsistent Toast Systems
**Files:**
- `ngo-admin` pages use `import { showToast } from '../../../components/Toast'` (global function)
- `accounts` pages use `import Toast from '../components/Toast'` (React component)

Two completely different toast implementations. The ngo-admin version is a global function while the accounts version is a controlled component with state. This inconsistency makes it harder to maintain a unified UX.

---

### 29. Receipts.jsx — `useEffect(load, [load])` Pattern
**File:** `accounts/pages/Dashboard.jsx` (line 53)
**File:** `accounts/pages/SuspensePage.jsx` (line 37)

```jsx
useEffect(load, [load]);
```
While technically correct (if `load` is wrapped in `useCallback`), this pattern is unusual and confusing. Standard pattern is `useEffect(() => { load(); }, [load])`.

---

### 30. Multiple Files — `alert()` Used for Error Reporting
**Files:** SuspensePage.jsx (lines 59, 70, 80), BankAudit.jsx (multiple), EmailAccountsManager.jsx, RazorpayAccountsManager.jsx, WhatsAppAccountsManager.jsx, etc.

Native `alert()` dialogs block the UI thread and look unprofessional. Should use the Toast component instead.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| **CRITICAL** | 4 | Plain-text secrets, null crashes in receipt templates |
| **HIGH** | 6 | Double API calls, stale closures, timer leaks |
| **MEDIUM** | 9 | Silent error swallowing, offline data loss, perf issues |
| **LOW** | 11 | Dead code, duplicate components, inconsistencies |
| **TOTAL** | **30** | |

## Top 5 Priorities

1. **Fix access_token display** — Change `type="text"` to `type="password"` in WhatsAppAccountsManager.jsx line 201
2. **Add null-safety to receipt templates** — Use optional chaining on all `donor['...']` accesses
3. **Fix BankAudit double-mount fetch** — Merge two `useEffect` hooks into one
4. **Add error handling to AssetRegister offline mode** — Show toasts on API failure instead of silent catch
5. **Clean up WhatsApp search timers** — Add `useEffect` cleanup to clear pending timeouts
