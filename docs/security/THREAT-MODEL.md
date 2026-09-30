# Threat Model

Scope: the `client/` SPA, the `backend/` API, the reverse proxy in front of both,
and the PostgreSQL database. Mobile apps under `apps/` are out of scope except
where they consume the same API.

## System shape

```
 Browsers (client/ SPA, plus other static panels)
        |  HTTPS
        v
 Reverse proxy  (nginx on the app host — config NOT in version control)
        |
        +---> /            static SPA bundles          (unauthenticated)
        |
        +---> /api/*       backend (Express + PM2)     (JWT required)
        |
        v
 PostgreSQL (worker_loans, workers, donors, beneficiaries, leads, ...)
        ^
        |  credentials from environment only
 AWS (RDS backups, WhatsApp Cloud API, Razorpay)
```

Everything above the database line is reachable from the public internet. There
is no VPN, no IP allow-list at the proxy, and no WAF in front of the API.

## Assets

Ranked by the damage their disclosure causes.

| Asset | Sensitivity | Notes |
| --- | --- | --- |
| Aadhaar, PAN, bank account/IFSC, salary | **Restricted** — personal data under India DPDP Act 2023 | Readable by HR, super-admin, and several report/export paths |
| Donor records incl. PAN, UPI IDs, addresses | **Restricted** | Exported to spreadsheets and persisted in browser storage |
| `JWT_SECRET`, WhatsApp/Razorpay/AWS credentials | **Secret** | Full compromise if disclosed |
| Impersonation / work-as tokens | **Secret** | Yield super-admin authority (SEC-004) |
| Salary, loans, attendance, incentive payouts | Confidential | Business and personal impact |
| Lead and donor pipeline | Confidential | Competitive value |
| Source code, this documentation set | Internal | Reconnaissance value (SEC-009) |

## Actors

| Actor | Capability assumed |
| --- | --- |
| Anonymous internet user | Can reach the proxy and the API; no valid token |
| Compromised low-privilege account | Has a valid `worker`/`fro`/telecaller token — assumed **likely** |
| Malicious insider (HR/accounts) | Legitimate access to restricted data, abuses it |
| Opportunistic attacker | Script-kiddie tooling: credential stuffing, XSS payloads, dependency CVEs |

## Trust boundaries

1. **Browser ↔ proxy.** Everything on the browser side is attacker-controlled,
   including `localStorage`, the `ucs_user` object, and all DOM content.
2. **Proxy ↔ backend.** Assumed trusted; the only place TLS is terminated.
3. **Backend ↔ database.** Assumed trusted; the credential lives in the backend
   environment. `trust proxy` settings govern whether the backend can identify
   the real client IP.
4. **Backend ↔ third parties.** WhatsApp Cloud API, Razorpay, AWS. Outbound only,
   but credentials and webhook verification live here.

**The critical boundary is #1.** Every client-side permission check, hidden tab,
and disabled button is a rendering hint only; the enforcement point is
`authenticateRole` / `authenticate` in `backend/src/middleware/authMiddleware.js`.

## Abuse cases

| # | Abuse case | Mitigation today | Finding |
| --- | --- | --- | --- |
| A1 | Credential stuffing against `/api/auth/login` | none | SEC-006 |
| A2 | Session theft via XSS → impersonate super-admin | none | SEC-002, SEC-004 |
| A3 | Low-privilege user reads restricted HR/salary data by calling the API directly | role checks on most routes; verify coverage | SEC-012 |
| A4 | Read donor documents by guessing `/uploads/...` paths | none | SEC-005 |
| A5 | SQL injection through a parameter that is concatenated into SQL | mostly parameterised | SEC-012 |
| A6 | Read internal architecture docs with any token | none | SEC-009 |
| A7 | Frame the app to trick a privileged user into clicking | none | SEC-003 |
| A8 | Cross-origin requests to the API | partial (bearer token, not cookie) | SEC-007 |
| A9 | Reuse a leaked long-lived token indefinitely | none | SEC-017 |
| A10 | Insider exports restricted PII in bulk | access codes on some screens only | SEC-008 |

## Assumptions and out of scope

- The reverse proxy configuration is not in version control, so its hardening
  cannot be verified from the repository. It is treated as unknown and must be
  reviewed on the host (see [REVERSE-PROXY.md](REVERSE-PROXY.md)).
- Physical security, host hardening, and AWS IAM are out of scope except as
  they affect these layers.
- Denial of service is only partly addressed: no WAF, no global rate limit, and
  `express.json({ limit: '10mb' })` buffers large bodies before validation.
- Availability of the WhatsApp/Razorpay integrations is a third-party dependency.

## Review triggers

Re-run this model when any of these change: the token storage mechanism
(SEC-004 remediation), the CORS policy (SEC-007), the reverse proxy
configuration, any new public static mount, any new outbound integration, or any
new role.
