# Follow-up / Promise / Callback Loans (Station → Station)

Time-boxed lending of one station's open **follow-ups**, **promises to pay** and
**callbacks** to another station's FRO. No ownership is moved: the source station
keeps the lead, the donor's history stays intact, and the loan only controls
**who may work the lead while the window is active**.

## Eligibility (must match the FRO's lists)

A lead is loanable when it is in one of these families and is not reassigned,
already collected in the donor's current donation period, or on another live
loan:

| Bucket | Statuses |
|---|---|
| Follow-up | `scheduled`, `follow_up`, `office_visit_scheduled`, `program_visit_scheduled` |
| Promise | `promise_to_pay`, `payment_pending`, `will_donate_online`, `visit_donate`, `whatsapp_sent`, `promise_pay_wa_email` |
| Callback | `callback` |

The effective due time is the earliest **open** `fro_scheduled_contacts.scheduled_at`,
falling back to `fro_assignments.next_follow_up`. Leads with a future (or no) due
time are *upcoming*; past-due leads are *overdue*. Leads worked today are not
counted as overdue. One card per donor + NGO is counted, mirroring the FRO UI.

`preview` and `create` share `loadEligibleLeads()`, so the modal count is exactly
what gets snapshotted. Example (BOD-10): 4 follow-ups + 1 promise = 5 upcoming,
22 overdue, 27 total.

## Why a separate layer

Follow-up and callback lists are owner-based (`fro_assignments.fro_worker_id`),
so the existing Temporary Data Access grant (whole station / high-tier / normal)
does not expose another station's follow-up backlog. A loan adds exactly that
missing window without rewriting `fro_assignments`.

## Data model

| Table | Purpose |
|---|---|
| `followup_loans` | One row per loan: source/target station, recipient FRO, scope, selection, window, status, reason, counts. |
| `followup_loan_items` | The snapshotted `fro_assignments.id` list. `returned_at` releases the lead. |
| `followup_loan_events` | Append-only audit: `CREATED`, `EXTENDED`, `RETURNED_EARLY`, `REVOKED`, `EXPIRED`. |

Schema is applied by `backend/src/bootstrap/ensureFollowUpLoanSchema.js` on boot
(migrations are not auto-run in this deployment). The tracked copy lives at
`backend/src/migrations/191_followup_loans.sql`.

A partial unique index (`assignment_id WHERE returned_at IS NULL`) guarantees a
lead can only be on one live loan.

## Roles and visibility

| Surface | Source FRO | Recipient FRO |
|---|---|---|
| Follow Ups / Promises / Callbacks / Overdue / Scheduled | lead hidden while lent | lead visible with `⇄ From <station>` badge |
| Donor detail | read-only, banner explains the loan | full work access |
| Disposition / status / schedule | `409 LEAD_LOANED_OUT` | allowed; logs credit the recipient |
| Ownership (`fro_worker_id`, `station`) | unchanged | unchanged |
| Expiry | lead returns automatically | lead disappears from the loan list |

## Admin flow

1. **Lead Loans** page → station row → **Lend** (the modal is pre-filled with
   that station as the source; there is no source dropdown).
2. Choose scope (`Follow-ups + promises + callbacks` / `Follow-ups + promises` /
   `Callbacks only`), selection (`All open` / `Upcoming only` / `Overdue only` /
   `Fixed count`), target station, recipient FRO, start, expiry, reason.
3. The modal previews follow-ups, promises, callbacks, overdue, total,
   already-loaned count and conflicts. Follow-ups/promises mirror the FRO's
   Follow Ups tab; overdue mirrors the Overdue tab and is included in
   `All open`.
4. Confirm → loan + items + audit event. The station row shows a loan chip.
5. Tabs are **Old | New | Lending out | Receiving | History**; the detail modal
   extends, returns early, revokes, and shows items + audit.

## API

All routes are admin-guarded and NGO-scoped:

```
GET    /ngo-admin/followup-loans
GET    /ngo-admin/followup-loans/preview
GET    /ngo-admin/followup-loans/fro-candidates?ngo_id=
GET    /ngo-admin/followup-loans/:id
POST   /ngo-admin/followup-loans
POST   /ngo-admin/followup-loans/:id/extend
POST   /ngo-admin/followup-loans/:id/return
POST   /ngo-admin/followup-loans/:id/revoke
```

## Expiry

Read paths evaluate the window on every request, so an expired loan stops
authorizing work immediately. A 5-minute scheduler sweep
(`closeExpiredLoans`) stamps `returned_at`, flips statuses, writes `EXPIRED`
events and frees the live-assignment unique index.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `FOLLOWUP_LOANS_ENABLED` | `true` | Set to `false` to hide/disable the feature entirely. |

## Tests

- `backend/src/services/followUpLoanService.test.js` — window boundaries,
  return/revoke precedence, invalid expiry, feature flag.
- Manual on the test URL/DB: create a loan from a station with follow-ups, log
  in as the recipient, work one lead, verify the source cannot dispose it,
  then expire/return and verify the lead moves back.

## Out of scope (v1)

- Station-level dashboards do not count borrowed leads (ownership is unchanged);
  the recipient's calls and collections are credited through `fro_donor_logs`.
- No approval workflow; only NGO admins / super admins can grant.
- The source FRO's work lists simply hide the lead; the **Lending out** tab on
  the Lead Loans page is the admin-side view, and direct disposition attempts
  return `LEAD_LOANED_OUT`.
