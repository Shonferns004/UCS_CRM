# S3 PII Exposure — Remediation Checklist

**Status:** OPEN — anonymous access contained; root cause not yet fixed
**Severity:** P0
**Bucket:** `ucs-crm-uploads-mumbai` (`ap-south-1`, account `938364502045`)
**Owner:** _(assign)_
**Started:** 2026-09-30
**Containment applied:** 2026-09-30 18:25 IST (10:25 UTC)

> This is a live incident, not a code review. Work top to bottom.
> `HARDENING-CHECKLIST.md` is the pre-release gate and does not replace this file.

## Where this stands

| Phase | State |
| --- | --- |
| 0 — Visibility | ✅ done (2 of 8 items need admin creds) |
| 1 — Decide and preserve | ◐ partial — snapshot taken, decisions + UI check pending |
| 2 — Stop the bleeding | ✅ **applied and verified** — anonymous reads return `403` |
| 3 — Presigned URLs | ☐ not started |
| 3b — Close link sharing | ☐ not started |
| 4 — Verify | ☐ not started |
| 5 — Follow-ups | ☐ not started |

**The exposure is contained but not closed.** Anyone on the internet can no longer
read the bucket. The mechanism that exposed it — raw public URLs stored in Postgres
and shared as links — is still in the code, so the next receipt generated recreates
the same problem unless Phase 3 and 3b are completed.

---

## What is confirmed

Verified on 2026-09-30, not inferred:

| Fact | Evidence |
| --- | --- |
| Bucket granted public read to everyone | policy `Principal: "*"` on `s3:GetObject` for `arn:.../*` |
| All four public-access-block flags were disabled | now `true` (containment applied) |
| 2,711 objects / 1.53 GB exposed | `list-objects-v2` |
| 2,319 donor receipt PDFs, IDs 1–83,498, only 69 gaps | dense/sequential, trivially enumerable |
| 247 worker + beneficiary Aadhaar/UDID images | keys `aadhaar_card_*.jpeg`, `udid_card_*.jpeg` |
| Anonymous read succeeded pre-containment | `GET .../receipts/receipts/83259.pdf` → `200`, 638,284 bytes |
| **External third parties fetched 5 receipt PDFs** | `facebookexternalhit/1.1` from `69.63.184.7`, `69.63.184.9`, `173.252.82.35`, `173.252.95.37`, `173.252.70.54` |
| Exposure is architectural, not a stray ACL | `backend/src/config/db.js:1366` builds raw public URLs persisted in Postgres; `backend/scripts/setup-s3.js:2` applied public-read by design |
| Anonymous access now refused | `403` on receipts, enumeration IDs, and Aadhaar paths — re-verify any time |

**Audit boundary:** server access logging began **09:54 UTC, 2026-09-30**. The bucket was
created 2026-08-13. There is **no** visibility into the ~6 weeks before logging was enabled.
An empty log for a period does **not** prove no access — it proves no record.

---

## Phase 0 — Visibility (DONE)

- [x] Create private log bucket `ucs-crm-audit-logs-938364502045`
- [x] Public access block: all four flags `true`
- [x] SSE-S3 encryption, versioning `Enabled`, lifecycle (400d / noncurrent 30d)
- [x] Log-delivery policy for `logging.s3.amazonaws.com`
- [x] **No `aws:SourceAccount` condition** — it silently blocks S3 log delivery
- [x] Server access logging enabled on `ucs-crm-uploads-mumbai`
- [x] Delivery verified end-to-end
- [x] Remove throwaway probe bucket
- [ ] CloudTrail S3 data events — needs admin creds
- [ ] S3 Access Analyzer — needs admin creds

Run the remaining two:

```powershell
.\scripts\aws\enable-s3-audit.ps1
```

Credentials needed: `cloudtrail:*`, `access-analyzer:*`.

**Do not add an `aws:SourceAccount` condition to the log-delivery policy.** It is the
documented-hardened form and it prevents logs from ever being written — observed
directly: with the condition present no logs were delivered for ~20 minutes; removing
it restored delivery immediately. The log bucket already has all four
public-access-block flags set, and the statement is resource-scoped to one prefix.

---

## Phase 1 — Decide and preserve (PARTIAL — snapshot done, decisions pending)

- [ ] Assign a single incident owner
- [ ] Record the decision: is this a notifiable breach under the DPDP Act 2023? Involve counsel now, in parallel with the fix
- [x] Snapshot current state so the "before" is provable — written to `incident/s3-exposure-2026-09-30/`:
  - [x] `policy-before.json` — the `PublicReadGetObject` grant
  - [x] `pab-before.json` — all four flags `false`
  - [x] `logging-before.json`
  - [x] `ownership-before.json` — `BucketOwnerEnforced`
- [x] Server access logging enabled, so volume is measured rather than guessed
- [ ] **Confirm the UI still works** — Phase 2 closed anonymous access. Someone must open a receipt, an attendance selfie, and an Aadhaar/UDID doc in a browser and report. Field apps and office browsers were serving `304` from cache during verification, so this is *unverified*, not *confirmed working*.
- [ ] Establish how receipt links reach donors (email / WhatsApp / public social post). This determines whether link sharing is a Phase 3 requirement or a separate workstream.

---

## Phase 2 — Stop the bleeding ✅ APPLIED 2026-09-30 18:25 IST (10:25 UTC)

- [x] Snapshot taken (Phase 1) before any change
- [x] Set all four public-access-block flags to `true` — this makes the public-read policy **inert** while leaving it in place, so revert is one command
  ```bash
  aws s3api put-public-access-block --bucket ucs-crm-uploads-mumbai \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  ```
- [x] Verified the policy is still present but no longer effective — revert path intact
- [x] Verified anonymous reads are refused:
  - [x] `receipts/receipts/19735.pdf` → `403`
  - [x] `receipts/receipts/1.pdf`, `500`, `1200`, `83259` → `403` (enumeration blocked)
  - [x] `beneficiary-documents/.../aadhaar_card_*.jpeg` → `403`
- [x] Verified server-side access is unaffected: authenticated `GetObject` returned 644,607 bytes
- [x] **Revert path:** to restore the previous (insecure) state, set `BlockPublicPolicy=false`. There is no reason to do this; it exists so the change is provably reversible.

### What Phase 2 did and did not achieve

**Achieved:** anonymous internet access to the PII prefixes is closed. This is the
correct immediate containment and it is holding in the logs.

**Not achieved, and important:** it did not stop the *mechanism* that produced the
exposure. Receipt IDs are sequential and each new receipt creates a new object, so
**every newly generated receipt was a new publicly-fetchable URL**. Closing the bucket
ends the current window; it does not change the behaviour that opened it.

**Not yet verified:** whether the CRM UI can still display receipts, selfies, and
Aadhaar documents. The app reads via raw stored URLs (`db.js:1366`), not IAM, so a
`403` is the expected outcome for anything the browser fetches directly. Cached `304`
responses masked this during verification. **Treat UI impact as unknown until a human
checks.**

---

## Finding: the leak mechanism is link sharing, and it is ongoing

Server access logs from the 10:14–12:00 UTC window recorded **four receipt PDFs
fetched successfully by external crawlers**, all `facebookexternalhit/1.1`:

| Time (UTC) | Crawler IP | Object | Status |
| --- | --- | --- | --- |
| 10:05:50 | `69.63.184.7` | `receipts/receipts/19736.pdf` | `200` |
| 10:22:06 | `173.252.95.37` | `receipts/receipts/19737.pdf` | `200` |
| 10:22:26 | `173.252.70.54` | `receipts/receipts/19738.pdf` | `200` |
| 11:51:41 | `69.63.184.9` | `receipts/receipts/19739.pdf` | `200` |

`19736`–`19739` are **consecutive**. That pattern is the signature of routine
operation, not targeted attack: a receipt is generated, its public URL is shared
somewhere, and a link-preview crawler fetches it.

The same logs distinguish legitimate traffic from the leak, which is why this is
attributable rather than speculative:

| Source IP | User agent | What it is |
| --- | --- | --- |
| `13.207.47.116` | `aws-sdk-js` | the app itself uploading receipts |
| `152.58.28.31`, `1.38.138.205` | `Dart/3.12 (dart:io)` | the Flutter field apps reading worker photos |
| `115.96.217.131` | browser UA, `304` | office IP, already in the RDS allowlist |
| `69.63.184.x`, `173.252.x.x` | `facebookexternalhit/1.1` | **external crawlers — the leak** |

### Consequence for the Phase 3 design

A presigned URL fixes *storage access*. It does **not** fix *link sharing* — a
15-minute presigned URL pasted into a public channel is still readable for those
15 minutes, and crawlers fetch within seconds.

Phase 3 must therefore include a delivery-path change, not only a storage change:
- serve receipts and Aadhaar documents from an **authenticated backend route**, not a URL a browser can be handed
- never put a PII link in a subject line or message body that a preview crawler will fetch
- where a link is unavoidable, serve through a route that requires the session

Add this as a Phase 3 task once the sharing channel is confirmed.

---

## Phase 3 — The real fix: presigned URLs

The stored URLs in Postgres are the blocker. Raw `https://<bucket>.s3...` URLs cannot
survive a policy change, so this is a refactor, not a toggle.

- [ ] Change `backend/src/config/db.js:1366` to store the **object key**, and add a `presignKey()` helper using `@aws-sdk/s3-request-presigner`
- [ ] Generate URLs at read time with a 5–15 min expiry — never persist a signed URL
- [ ] Update each consumer to presign on read (~20 call sites):
  - `controllers/attendanceController.js:367` — selfies
  - `controllers/selfiePunchController.js:104` — selfies
  - `controllers/onboardingController.js:132,194,248,304,360` — photo, document, signature
  - `controllers/beneficiaryController.js:56` — **Aadhaar/UDID**
  - `controllers/whatsappController.js:188,309` — receipts
  - `controllers/operatorController.js:220`
  - `controllers/leadIncentiveController.js:546`
  - `controllers/specialIncentiveController.js:447,499`
  - `controllers/eventHeadController.js:894`
  - `controllers/certificateController.js:34`
  - `controllers/chatController.js:92`
  - `controllers/notificationController.js:74`
  - `controllers/froController.js:3090`
  - `services/froWhatsAppService.js:776`
  - `controllers/whatsappWebhookController.js:146`
  - `src/index.js:309,425`
- [ ] Migrate existing DB rows: rewrite stored raw URLs to bare keys, one table at a time
- [ ] Keep genuinely public assets public by **moving them to a separate public bucket** (`certificates/`, `event/`, `media-library/`) rather than weakening the PII bucket
- [ ] Delete `backend/scripts/setup-s3.js` or rewrite it — it recreates the vulnerable policy on next run
- [ ] Delete the `PublicReadGetObject` statement from the bucket policy (now safe: public access is already blocked)
- [ ] Backfill: `backend/scripts/backfill-media-s3.js:98` writes the same raw-URL pattern — fix with the rest

### Phase 3b — Close the link-sharing path (do not skip this)

Presigning alone leaves a live hole: a 15-minute presigned URL pasted into a public
channel is still readable for those 15 minutes, and crawlers fetch within seconds.
Phase 2 proved this is the actual mechanism, not a hypothetical.

- [ ] Serve receipts and Aadhaar/UDID documents through an **authenticated backend route** that requires the session, rather than handing the browser a fetchable URL
- [ ] Confirm no PII URL is placed where a link-preview crawler will reach it (email subject/body, WhatsApp text, social post)
- [ ] Where a link is unavoidable, require the session on the serving route
- [ ] Re-run the external-read check in Phase 4 after the change — the `facebookexternalhit` pattern must stop appearing entirely

---

---

## Phase 4 — Verify (must all pass)

```bash
# 1. Anonymous read of a known receipt must FAIL
curl -sI https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/receipts/receipts/1.pdf
#    expect 403

# 2. Enumeration must FAIL on several random ids
for n in 500 1200 19735 83259; do
  curl -s -o /dev/null -w "$n -> %{http_code}\n" \
    https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/receipts/receipts/$n.pdf
done
#    expect 403 403 403 403

# 3. Aadhaar prefix must FAIL
curl -sI https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/beneficiary-documents/
#    expect 403

# 4. Legitimate flow still works: log in as HR, open a receipt, open a selfie.
#    Confirm the presigned URL is short-lived and NOT what is stored in the DB.

# 5. No new EXTERNAL successful reads after the fix.
#    Do NOT just grep out the EC2 IP. Legitimate traffic also comes from the
#    office IP and the Flutter field apps, so "anything not 13.207.47.116" is
#    NOT the right test - it produced a false "18 external reads" reading when
#    Phase 2 was verified. Filter on SUCCESS + non-internal sources.
aws s3 sync s3://ucs-crm-audit-logs-938364502045/ucs-crm-uploads-mumbai/ ./s3logs

# 5a. Any successful anonymous GET (requester "-") is a leak
grep -h ' REST.GET.OBJECT ' ./s3logs/* | awk '$8=="200" && $6=="-"'      # expect empty

# 5b. Any receipt PDF read from outside the known-internal sources
grep -h 'receipts/receipts/' ./s3logs/* \
  | awk '$8=="200" && $5 !~ /13\.207\.47\.116|115\.96\.217\.131/'
# expect empty. Add any other office/app IPs after confirming them.
```

- [ ] All of the above pass
- [ ] Spot-check the DB: no row still contains `amazonaws.com/`

---

## Phase 5 — Follow-ups

- [ ] Request removal of cached copies from Meta (link preview cache) and Google
- [ ] Add a CI guard so public access can never be re-enabled silently:
  ```bash
  aws s3api get-public-access-block --bucket ucs-crm-uploads-mumbai \
    --query 'PublicAccessBlockConfiguration.*' --output text
  # assert all four are true
  ```
- [ ] Alert on anonymous access to the bucket (CloudTrail + CloudWatch alarm)
- [ ] Decide retention for the 2,319 receipts already cached by crawlers
- [ ] Record the finding in `docs/security/FINDINGS.md` and update `SECURITY.md` P0 list
- [ ] Add the DPDP incident record to the repository (redacted)

---

## Parallel — do not wait on the S3 fix

| # | Item | Why now |
| --- | --- | --- |
| 1 | Auth-gate `/api/db/*` and `/api/customer/*` (`src/index.js:522-768`) | Anonymous arbitrary SQL, and `index.js:681` **commits**. Delete the fallback at `client/src/panels/hr/store.jsx:156-168` first |
| 2 | Rotate the 4 Meta WhatsApp tokens | No network layer protects them; abusable by anyone, immediately |
| 3 | Verify whether the leaked AWS key is still live | Unclear if it is in use |
| 4 | Close SSH `22` to `0.0.0.0/0` (`sg-0eaff76e14060855f`) | One rule, closes the brute-force path |
| 5 | Rotate the 5 leaked RDS DSNs | Lower urgency: `sg-0947f3d87e6807617` already allows `5432` from 3 CIDRs only |
| 6 | Edge hardening (`docs/security/REVERSE-PROXY.md`) | Demoted — nothing at the edge offsets a world-readable PII bucket |
| 7 | RDS: `StorageEncrypted=false`, `PubliclyAccessible=true` | Real, but mitigated by the security group; needs a snapshot/restore cycle |
