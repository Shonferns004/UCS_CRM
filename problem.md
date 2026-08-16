# UCS CRM — Work-as (Impersonation) Feature: How It Works & Its Problems

## 1. Roles and panels

- **FRO** — field officer. Panel: My Donors, Dispositions, Suspense receipts, Collections, Dashboard.
- **Accounts** — imports bank statements, verifies leads, issues receipts, day-end reports.
- **NGO admin / Super admin** — manage FROs, stations, impersonation codes, credit logs, salaries, incentives.

## 2. How money flows into the system

1. Accounts imports bank entries (`bankAuditController.js:529`). An **auto-match** pass (`autoMatchService.js:154`) tries to link each entry to a donor or an existing FRO call log (`confirmMatchCredit`, `creditService.js:17`).
2. Entries that match → a **receipt** is created, linked to the FRO's log via `receipts.log_id`. Credit flows from there: `receipts.log_id → fro_donor_logs.fro_worker_id →` salary, incentives, day-end report, dashboards. **`fro_worker_id` is the single source of credit.**
3. Entries that **don't** match (no donor, no log, blank agent/mobile) → **Suspense**. Any FRO in the project scope (`myProjectSet`) can claim them.

## 3. Suspense claims (current behavior)

- `claimSuspenseReceipt` (`froController.js:987`) attributes everything to `req.user.id` — the **logged-in** FRO.
- It resolves the donor: explicit `donor_id`, else `ilike` name match (latest created), else **creates a new donor profile**.
- Creates a pending `lead_done` log (`fro_worker_id = workerId`), links `receipts.log_id`, links the audit entry, dedupes against the FRO's existing pending lead.
- **Restrictions**: claims only for the *current month* (`froController.js:1013`); explicit donors must be within the FRO's station scope (`getMyStationScope`). Suspense itself is project-scoped, **not** owner-scoped.
- Accounts then verifies/rejects in Lead Verification (`getLeadList`, `accountsController.js:15` — only `lead_done` logs).

## 4. Work-as (impersonation) — current behavior

- Admin generates a **4-digit code** (`impersonation_codes`, single-use, 5-minute expiry).
- An FRO/admin calls `impersonateFRO` (`authController.js:287`) with the code. The new JWT carries: `id` and `name` = **impersonated FRO** (e.g. Priya), plus `impersonation: true`, `imposter_id`/`imposter_name` = **operator** (e.g. Ravi). The panel shows a "Working as Priya" banner. There is **no session table** — the session is just the token.
- **During work-as:**
  - **Calls/donations** (`createDonorLogHandler`, `froController.js:2062`): `creditWorkerId = imposter_id` (Ravi). Log `fro_worker_id = Ravi`, `created_by = Ravi`. Assignment/donor ownership stays with **Priya** (`findOrCreateAssignment(donorId, workerId=Priya)`).
  - **Suspense claims**: use `req.user.id` = **Priya** → claim logs get `fro_worker_id = Priya` → **Priya gets the credit, not Ravi.**
  - **Name masking**: `getDonorLogs` (`froController.js:2049`) shows collector names only to the collector themselves; `getMyCollections` (`froController.js:697-706`) masks `owner_name` for work-as rows. FRO-facing views hide the operator.
  - **Dashboard/team totals** are **station-scoped** (`froController.js:440-456`), so they include work-as money in the station total.

## 5. Problems (flaws in the current system)

1. **Credit inconsistency between calls and claims during work-as.** Calls credit the operator (Ravi), claims credit the impersonated FRO (Priya) — same money, different credit depending on the path (auto-match vs manual claim). Salary/incentive/report numbers for work-as days cannot be trusted.

2. **Suspense is first-come-first-served — no reservation.** Money an FRO worked for sits in a shared, project-scoped pool. Any FRO can grab it. The person who made the call has no way to hold it.

3. **Timing race.** Money becomes claimable only when Accounts imports the entry — frequently after office hours / next day. The earning FRO is usually offline then; whoever opens Suspense first wins. A donor paying at 10pm (imported ~10:30pm) can be claimed next morning by anyone.

4. **No notification and no call→money link.** If a donor's money arrives without matching (different payer name, no captured UPI txn id), nothing tells the earning FRO "your donor's money is in Suspense."

5. **Third-party payments are unhandled.** Payer name ≠ donor (e.g. donor Mian Khalifa, money from "Johny Sins"). Auto-match can't link it; it lands in Suspense under the payer's name. The claimant must create/pick a donor; Accounts reconciles manually; the real donor can end up with a near-duplicate profile named after the payer.

6. **Wrong/duplicate donor profiles on claims.** Donor resolution is `ilike`-by-name (latest created) or *create new*. Misspelled/foreign names pick the wrong existing profile or spawn duplicates ("Johny Sins" becomes a donor). No tie to the donor actually called.

7. **Month restriction.** Claims are only allowed for the current month (`froController.js:1013`). Money that lands in Suspense in a later month (late audit, month-boundary payment) can't be claimed by the FRO who worked it.

8. **Priya's visibility of work-as money is path-dependent.** As herself: call-based work-as money (fro_worker_id = Ravi) is *excluded* from her personal collections; claim-based work-as money (fro_worker_id = Priya) *appears* in her collections and credits her. The same work-as activity is visible/crediting in one path and invisible in the other.

9. **Anonymity is per-endpoint, not a rule.** Masking exists in two FRO views, but the operator's identity lives in `fro_worker_id`; every Accounts/admin/export query that joins workers on it exposes Ravi's name. There is no permission gate defining "only Accounts/admin may see the operator," so any future or missed view leaks it.

10. **No durable session/audit record.** Work-as exists only as JWT claims. Nothing records session start/end, which operator did which claim, or which claims were work-as. Forensics rely on comparing `fro_worker_id` vs assignment owner.

11. **Code-expiry friction.** Every re-entry needs a fresh admin-generated 5-minute code. Mid-day token loss → admin needed again. This encourages long single sessions, amplifying the attribution confusion for the whole day.

12. **Single-column credit with two writers.** Salary, incentives, day-end reports, and dashboards all derive from `fro_donor_logs.fro_worker_id`, but calls and claims write different values to it during work-as. There's no dual record of "who worked" vs "who owns the donor," so attribution flips by entry path.

13. **Scope guards protect NGOs/stations, not the earning FRO.** Project and station checks prevent wrong-NGO/station claims, but nothing protects the person who actually earned the money.

14. **Accounts gets no work-as signal.** A claim made during work-as shows Accounts a lead owned by Priya (fro_worker_id = Priya), while the actual caller was Ravi. Accounts can't tell — and can't flag — that the lead's credit went to the wrong person.
