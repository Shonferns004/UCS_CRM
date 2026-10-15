# UCS CRM — Security Overview

> **Document ID:** 10-Security/SECURITY-OVERVIEW
> **Status:** Summary view — authoritative detail lives in the existing `docs/security/` set (linked below)
> **Generated:** 2026-10-13

## 1. Relationship to Existing Security Docs

The repository already contains a mature security documentation set under `docs/security/`. This document is an index and digest; it does not duplicate or replace it. **No secrets or environment values are recorded anywhere in this documentation set.**

| Topic | Document |
| --- | --- |
| Entry point + standard + remediation backlog | `docs/security/SECURITY.md` |
| **Open P0 incident** — S3 bucket publicly readable (2,319 receipts + 247 Aadhaar/UDID images) | `docs/security/S3-PII-EXPOSURE-REMEDIATION.md` |
| Threat model | `docs/security/THREAT-MODEL.md` |
| Authentication & sessions | `docs/security/AUTHENTICATION.md` |
| Frontend security | `docs/security/FRONTEND.md` |
| Backend API security | `docs/security/BACKEND.md` |
| Reverse proxy / edge | `docs/security/REVERSE-PROXY.md`, `EDGE-HARDENING-PLAN.md` |
| Data protection | `docs/security/DATA-PROTECTION.md` |
| Secrets management | `docs/security/SECRETS-MANAGEMENT.md` |
| Findings register | `docs/security/FINDINGS.md` |
| Pre-deploy checklist | `docs/security/HARDENING-CHECKLIST.md` |

## 2. Implemented (Verified)

- JWT bearer auth with role normalization and role gates (`backend/src/middleware/authMiddleware.js`).
- Password hashing with `bcryptjs`; access-code gating for salary.
- Raw SQL overwhelmingly parameterised (per `docs/security/BACKEND.md`).
- Cron entry points gated by `CRON_API_KEY` (`backend/src/index.js`).
- Security header + TLS handling at the Caddy edge (`infra/caddy/Caddyfile`).

## 3. Known Gaps (as recorded in `docs/security/`, P0–P3)

- **P0 (open):** S3 bucket public read exposure of receipts + Aadhaar images; containment applied 2026-09-30 (all Public Access Block flags on), root cause (raw public URLs in `backend/src/config/db.js`) still in code.
- JWT stored in `localStorage` (XSS → account takeover).
- No security response headers on some paths; two HR letter render paths inject worker-supplied names as raw HTML.
- Unauthenticated/admin surfaces flagged (arbitrary-SQL endpoint, env-admin, unverified webhook) per `SECURITY.md §5` (P0-A…P0-H).

## 4. Ground Rules for This Documentation Set

- Client-side role checks are **not** security controls — backend re-enforces.
- Any new secret belongs in env, never in `VITE_` vars or source.
- New HTML injection points need sanitisation.
- New route mounts must declare an auth gate.

> **Action required by the project team (not this documentation build):** resolve the open P0 S3 exposure and the remediation backlog in `docs/security/SECURITY.md`.