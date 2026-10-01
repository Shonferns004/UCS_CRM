# Security Documentation — UCS CRM

Reference set for the security posture of the CRM: threat model, authentication
and authorization, frontend, backend API, reverse proxy, data protection, secrets
handling, and a findings register with concrete fixes.

> ## 🟠 OPEN P0 INCIDENT — S3 bucket exposed donor and Aadhaar data
>
> `ucs-crm-uploads-mumbai` granted public read to the entire internet and holds
> 2,319 donation receipt PDFs plus 247 Aadhaar/UDID images. Receipt IDs are
> sequential and trivially enumerable, and **five receipt PDFs were already
> downloaded by external link-preview crawlers** — this was ongoing, not
> theoretical.
>
> **Containment applied 2026-09-30:** all four S3 Public Access Block flags set to
> `true`. Anonymous reads now return `403` and the insecure policy is inert but
> preserved, so the change is reversible in one command.
>
> **Not yet fixed:** the root cause — raw public URLs built in
> `backend/src/config/db.js:1366` and stored in Postgres — is still in the code.
> The next receipt generated recreates the exposure unless Phase 3 is completed.
>
> **Go to [S3-PII-EXPOSURE-REMEDIATION.md](S3-PII-EXPOSURE-REMEDIATION.md).**
> It outranks everything else in this set, including the remediation backlog in
> `SECURITY.md`.

> **Start with [SECURITY.md](SECURITY.md).** It is the source of truth: the
> security standard (`SEC-REQ-01`…), the gap analysis against it, the
> prioritised remediation backlog, the verification gates, and the secret
> rotation runbook. The files below are the per-area deep dives it draws on.

## Documents

| Document | Covers |
| --- | --- |
| [**S3-PII-EXPOSURE-REMEDIATION.md**](S3-PII-EXPOSURE-REMEDIATION.md) | **Open P0 incident.** Live checklist for the public-read bucket holding receipts and Aadhaar |
| [**SECURITY.md**](SECURITY.md) | **Entry point.** The standard, gap analysis, P0→P3 backlog, verification, rotation runbook |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, actors, trust boundaries, abuse cases, out-of-scope |
| [AUTHENTICATION.md](AUTHENTICATION.md) | JWT issuance/verification, token storage, roles, revocation, expiry |
| [FRONTEND.md](FRONTEND.md) | SPA trust boundary, XSS sinks, client storage, PII exposure, uploads |
| [BACKEND.md](BACKEND.md) | Middleware order, CORS, rate limiting, validation, SQL, static mounts |
| [REVERSE-PROXY.md](REVERSE-PROXY.md) | Edge audit: **production is Caddy**, HEAD is nginx. TLS, security headers, hardening config |
| [EDGE-HARDENING-PLAN.md](EDGE-HARDENING-PLAN.md) | Phased edge work (Phases 0-6) + verification commands |
| [DATA-PROTECTION.md](DATA-PROTECTION.md) | PII inventory, database access, backups, retention, logging hygiene |
| [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md) | Secret inventory, handling rules, rotation procedure |
| [FINDINGS.md](FINDINGS.md) | Prioritised findings register with evidence and remediation |
| [HARDENING-CHECKLIST.md](HARDENING-CHECKLIST.md) | Actionable pre-deploy checklist |

## Current posture in one paragraph

The backend enforces authorization properly on most routes, and raw SQL is
overwhelmingly parameterised, so the foundations are sound. The systemic
weakness is that **the perimeter is soft and the client is trusted too far**:
there are no security response headers anywhere, the JWT lives in
`localStorage` (so any XSS is a full account takeover), two HR letter rendering
paths inject worker-supplied names as raw HTML, and a shared password that gates
technical tickets is compiled into the shipped JavaScript bundle while the API
behind it only requires *any* valid token.

**Updated 2026-09-30** against `master` at `0ab8562a`: an audit for
[SECURITY.md](SECURITY.md) found a more severe class of problem that the ten
reference files do not mention — an **unauthenticated arbitrary-SQL endpoint**
on the public API, an unauthenticated tenant-provisioning endpoint, an admin
surface that **fails open** and can read and write every project's `.env`, an
unverified webhook feeding the AI reply pipeline, and **live production
credentials committed to git** (cloud tokens, database superuser password, an
AWS access key, the super-admin password). These are tracked as P0-A to P0-H in
[SECURITY.md §5](SECURITY.md#5-remediation-backlog) and outrank every item in
[FINDINGS.md](FINDINGS.md).

## How to use this set

- **Onboarding** — read `SECURITY.md`, then `THREAT-MODEL.md`, then the document
  for the area you own.
- **Before a release** — work [HARDENING-CHECKLIST.md](HARDENING-CHECKLIST.md).
- **During triage** — `FINDINGS.md` and `SECURITY.md §5` are ordered by severity;
  IDs are stable (`SEC-001`, `P0-A`, …) so they can be referenced in issues and
  commits.
- **After a change** — if you touched auth, CORS, uploads, or the reverse proxy,
  re-read the relevant document. Several findings exist because two copies of
  the same rule drifted apart.

## Ground rules

- Client-side role checks are **never** a security control. They are rendering
  sugar. `client/src/components/chat/chatIdentity.js` states this explicitly in a
  comment, and that comment is correct.
- Any new secret belongs in the environment, never in source, never in a
  `VITE_`-prefixed variable (Vite inlines those into the public bundle).
- Any new HTML injection point needs sanitisation and a justifying note.
- Any new route mount must declare its auth gate, or it is a defect.
- Findings marked **Confirmed** were verified by reading the code, not inferred.

## Last reviewed

2026-09-30, against `master` at commit `0ab8562a`, on branch
`security/hardening-2026-09`.
