# Security Documentation — UCS CRM

Reference set for the security posture of the CRM: threat model, authentication
and authorization, frontend, backend API, reverse proxy, data protection, secrets
handling, and a findings register with concrete fixes.

## Documents

| Document | Covers |
| --- | --- |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Assets, actors, trust boundaries, abuse cases, out-of-scope |
| [AUTHENTICATION.md](AUTHENTICATION.md) | JWT issuance/verification, token storage, roles, revocation, expiry |
| [FRONTEND.md](FRONTEND.md) | SPA trust boundary, XSS sinks, client storage, PII exposure, uploads |
| [BACKEND.md](BACKEND.md) | Middleware order, CORS, rate limiting, validation, SQL, static mounts |
| [REVERSE-PROXY.md](REVERSE-PROXY.md) | nginx/TLS, security headers, proxy hardening, sample config |
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
behind it only requires *any* valid token. Treat every item in
[FINDINGS.md](FINDINGS.md) as a real, verified finding — each one cites a file
and line.

## How to use this set

- **Onboarding** — read `THREAT-MODEL.md`, then the document for the area you own.
- **Before a release** — work [HARDENING-CHECKLIST.md](HARDENING-CHECKLIST.md).
- **During triage** — `FINDINGS.md` is ordered by severity; IDs are stable
  (`SEC-001`, `SEC-002`, …) so they can be referenced in issues and commits.
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
- Findings marked **Confirmed** were verified by reading the code, not inferred.

## Last reviewed

2026-09-30, against `master` at commit `4ef33a6b`.
