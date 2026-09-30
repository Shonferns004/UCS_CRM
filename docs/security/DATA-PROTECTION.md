# Data Protection

## Applicable regime

The CRM processes Aadhaar, PAN, bank account and IFSC data, donor records
including UPI transaction IDs, salary and attendance. In India this places the
organisation under the **Digital Personal Data Protection Act, 2023**, which
requires a lawful basis, purpose limitation, data minimisation, reasonable
security safeguards, and breach notification. It also touches Aadhaar-specific
handling expectations, so treat Aadhaar as the most restricted field in the
system.

## Data inventory

| Data | Where stored | Who can read it | Notes |
| --- | --- | --- | --- |
| Aadhaar number | `workers`, beneficiaries | HR, super-admin, some reports | **Restricted.** Rendered unmasked in `beneficiaries/pages/AllBeneficiaries.jsx:159,185`, `DonorDetailModal.jsx:85-86`; editable in `ngo-admin/pages/DonorCRM.jsx:105` |
| PAN | `workers`, `donors` | accounts, super-admin | **Restricted.** Persisted to browser storage — SEC-008 |
| Bank account / IFSC | `workers`, donors | accounts, HR | Printed in worker reports (`Workers.jsx:332,366`) |
| Salary, loans, incentives | `worker_salaries`, `worker_loans`, targets | HR, accounts, super-admin | Confidential |
| Attendance, biometrics | attendance tables | HR, super-admin | Biometric data is sensitive |
| Donor contact details | `donors` | accounts, FRO, super-admin | Includes address, mobile, email |
| Lead pipeline | `leads` | recruiters, FRO, HR | Confidential |
| Razorpay `key_secret` / `webhook_secret` | accounts settings | accounts, super_admin | Typed from the browser (`RazorpayAccountsManager.jsx:185,189`); documented as stored encrypted and masked on read |
| Chat attachments | `uploads/` | **anyone who knows the URL** | SEC-005 — most urgent data-protection defect |

## Database access

- Connection details come from the environment only
  (`backend/.env`, keys in `.env.example`); no credentials in source.
- The application uses a `public` schema with a mirrored copy in `test`; **the
  app must always read and write `public`**. A stray `search_path` change can
  silently target the wrong copy.
- Direct access is currently enabled by opening TCP 5432 to a CIDR range
  (`LOCAL_DB_ACCESS`, `LOCAL_DB_ACCESS_RULE_TTL_HOURS`, and the
  `backend/scripts/add-db-client.mjs` helper). The rule should be short-lived
  and removed when work finishes.
- The API has no row-level security; authorisation is enforced entirely in
  application code. That is acceptable only while every route is audited — see
  the coverage caveat in [AUTHENTICATION.md](AUTHENTICATION.md).

## Backups

`.github/workflows/backup-restore-test.yml` exists, and `.env.example` defines
`BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `BACKUP_MONTHLY_RETENTION_DAYS`, and
AWS/RDS identifiers. Confirm and record:

1. Backups are encrypted at rest and in transit.
2. **Restore is tested on a schedule**, not assumed. A backup that has never been
   restored is not a backup.
3. Retention matches policy, and backups inherit the same classification as the
   live data — a backup containing Aadhaar and salary is as sensitive as the
   database.
4. Access to backups is limited to the people who need it, and is logged.

## Retention and minimisation

No retention policy is enforced in code. Define one and implement it:

| Category | Proposed retention |
| --- | --- |
| Aadhaar / PAN / bank details | Mask after the relationship ends; keep only what a statutory obligation requires |
| Salary and loan history | Retain for the statutory wage-record period, then archive |
| Chat attachments and uploads | Delete on a defined schedule; today they are world-readable (SEC-005) |
| Logs | Redact PII; cap retention |
| Browser storage | Should hold no PII at all (SEC-008) |

Masking already exists as a pattern and can be reused: `SalaryPrivacyContext.jsx:94-112`
renders `₹ ••••••` when locked. Apply the same approach to Aadhaar and PAN
columns, with reveal gated by a server-checked permission.

## Logging hygiene

Confirm nothing sensitive reaches logs:

- No JWTs, passwords, or full `Authorization` headers.
- No Aadhaar/PAN values, salary figures, or donor bank details.
- No raw request bodies on the upload or import routes.
- The client `console.error`s API failures in several places
  (`Letters.jsx:1009,1023`) — a browser console is user-visible and unsuitable
  for server detail.

## Third-party processors

| Processor | Data | Control required |
| --- | --- | --- |
| WhatsApp Cloud API | message content, phone numbers | vendor agreement; minimise payload; rotate the access token |
| Razorpay | donor payment references, `key_secret` | webhook signature verification and replay protection; keep secrets server-side |
| AWS (RDS, backups) | full database | least-privilege IAM; encryption; access logging |
| Supabase-style query API | database | anon key must stay server-side and restricted; the anon JWT found in `client/.env` should be treated as public |

## Immediate priorities

1. Close SEC-005 — uploaded donor and bank documents are currently world-readable.
2. Stop persisting PII in browser storage (SEC-008).
3. Inventory every Aadhaar/PAN read path and confirm the role gate on each.
4. Document and test the restore procedure.
5. Write down the retention schedule and implement the first deletion pass.
