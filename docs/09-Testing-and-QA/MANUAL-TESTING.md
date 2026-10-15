# UCS CRM — Manual Testing Checklist

> **Document ID:** 09-Testing-and-QA/MANUAL-TESTING
> **Status:** Recommended (checklist; not yet executed)
> **Generated:** 2026-10-13

Use a development/staging environment with a test database. Do **not** run against production.

## 1. Authentication & Authorization

- [ ] Login with each role maps to the correct panel (`/sa`, `/hr`, `/accounts`, `/fro`, `/ngo-admin`, `/recruiter`, `/event-head`, `/dev-panel`, `/social`, `/sim`, `/wa`, `/docs`).
- [ ] Invalid password and unknown identifier reject with 401.
- [ ] Wrong-role user reaching a guarded route sees Access Denied and session is cleared.
- [ ] FRO impersonation (super-admin) enters work-as and release restores the original token.
- [ ] Change password, then re-login with new password; old password fails.

## 2. Leads → Receipts (Accounts/FRO)

- [ ] FRO creates a lead; Accounts verifies manually/quick/done; recipient mapping is correct.
- [ ] Rejected lead appears in NGO Admin rejected-leads with acknowledge.
- [ ] Receipt generation is idempotent (double submit creates one receipt).
- [ ] Mark-sent, undo, imported receipts and names import behave.

## 3. Attendance & QR

- [ ] QR validate accepts valid QR+geo, rejects wrong location.
- [ ] Punch-in/out updates `today-status`; selfie punch appears for HR verification.
- [ ] Correction raised → HR verify → super_admin approve persists to history.
- [ ] Present-days export matches attendance records.

## 4. Payroll & NGOs

- [ ] Salary add/edit with hold; hold prevents pay.
- [ ] Compensation entry and `pagar-export` reflect values.
- [ ] NGO salary allocation generation splits correctly; report matches.

## 5. FRO Time & Idle

- [ ] Live status transitions: active → paused → offline.
- [ ] Idle reconciliation report matches actual idle windows.
- [ ] Auto-logout fires after configured idle cap.

## 6. Beneficiaries

- [ ] Import batch → preview → confirm flows.
- [ ] Collection OTP generation and verification (1-month window enforced).
- [ ] Kit-given marks card state.

## 7. Events (Event Head)

- [ ] Event create → submit → approve/reject → complete.
- [ ] Asset issue/return, material stock adjust, checklist, media upload.

## 8. Communication

- [ ] Chat direct/group; realtime delivery; unread counts.
- [ ] Notice create + popup seen-re-sets.
- [ ] Ticket raise/reply/popup; developer ticket assign → resolve.

## 9. Docs & Ops

- [ ] `/docs` panel renders Mermaid diagrams and search works.
- [ ] `/sim` panel import/export and replacements.
- [ ] Cron endpoints reject without `CRON_API_KEY`.