# Authentication

## Flow

1. Client posts credentials to `/api/auth/login` (or `/api/workers/login`).
2. Backend verifies the password hash with `bcryptjs` and signs a JWT with
   `jsonwebtoken`.
3. Client stores the token and the user object in `localStorage`
   (`client/src/api/auth.js:5-8`).
4. Every subsequent call attaches `Authorization: Bearer <token>`
   (`client/src/api/auth.js:34-38`).
5. Backend verifies on each request in
   `backend/src/middleware/authMiddleware.js`.

## Token issuance

| Location | Lifetime | Note |
| --- | --- | --- |
| `authController.js:18` | `24h` | main staff/HR/admin token |
| `authController.js:223` | **none** | `/worker/login` — SEC-017 |
| `whatsappCrmAuthController.js:6` | ~100 years | integration token — SEC-017 |
| `froWhatsAppAuthController.js:78` | ~100 years | integration token — SEC-017 |
| `config/db.js:1232` | ~100 years | issued token — SEC-017 |

**Remediation:** bound every lifetime, add server-side revocation, and prefer
short-lived access tokens plus refresh for the long-lived integrations.

## Verification

```js
// backend/src/middleware/authMiddleware.js:61 (and :77, :111, :128)
const decoded = applyNormalizedRole(jwt.verify(token, process.env.JWT_SECRET));
```

The secret comes from `process.env.JWT_SECRET` and is never in source. Two
improvements:

- **Pin the algorithm.** `jwt.verify` without an `algorithms` allow-list trusts
  the token's own header. Pass `{ algorithms: ['HS256'] }` explicitly, and make
  sure nothing can set `alg: none`.
- **Use a dedicated, rotatable secret.** One `JWT_SECRET` for every subsystem
  means a single leak invalidates or impersonates all of them. See
  [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md).

## Client-side storage

```js
// client/src/api/auth.js:5-8 — token in localStorage, no httpOnly
localStorage.setItem(`${prefix}_token`, token)
localStorage.setItem(`${prefix}_user`, JSON.stringify(user))
```

- No cookie, therefore no `httpOnly` / `Secure` / `SameSite`. Any XSS is full
  account takeover (SEC-004).
- Impersonation stores the **original privileged** token too
  (`auth.js:152-153`, `ucs_original_token`), so an XSS during a "work as"
  session yields a super-admin token.
- The `user` object is also read from `localStorage` (`store.jsx:58`) and drives
  all role gating, so editing one key satisfies every `ProtectedRoute`
  (`App.jsx:53-63`).
- No refresh flow. On a 401 the client clears the session and redirects to
  `/login` (`auth.js:56-66`).

**Target state:** `httpOnly; Secure; SameSite=Strict` cookie, backend-only
reads, and role decisions made exclusively from the verified token. That change
must land **with** the CORS fix in SEC-007, never before it.

## Logout

`client/src/store.jsx:75-99` clears `localStorage` and calls the server logout
best-effort (`.catch(() => {})`). There is no server-side token denylist, so a
token captured before logout stays valid until it expires — up to 24 hours for
the main token and effectively forever for SEC-017's long-lived tokens.

Add a denylist keyed on `jti`, or move to short-lived tokens plus refresh so
logout can invalidate the refresh token.

## Roles

Normalisation happens in `normalizeRole` (`authMiddleware.js:43`) and
`applyNormalizedRole`. Enforcement helpers:

| Helper | Purpose |
| --- | --- |
| `authenticateRole(...roles)` (`:54`) | primary role gate |
| `authenticate` (`:73`) | any valid token |
| `authenticateAdmin` (`:82`) | `master`, `super_admin` |
| `authenticateWorker` (`:83`) | `worker`, `fro` |
| `authenticateAccountsOrEventTeam` (`:107`) | accounts or event-team |
| `authenticateSalary` (`:124`) | salary-scope token |

Usage examples: `accountsRoutes.js:26` uses
`authenticateRole('accounts','super_admin')`; `ngoAdminRoutes.js:126` gates the
NGO admin panel.

**Two caveats:**

1. `authMiddleware.js:63` echoes the required roles in the 403 body
   (`Access denied. Required role: …`), which the client displays verbatim
   (SEC-014). Return a stable code instead.
2. Coverage is uneven. `developerTicketRoutes.js:11` applies only
   `authenticate`, which is what makes SEC-001 critical. Audit every router
   mount in `backend/src/index.js:197-277` to confirm each has an explicit gate;
   a router mounted with no middleware is fully public.

## Password handling

- Hashing uses `bcryptjs`. Confirm the cost factor is at least 10 in
  `authController.js` and is applied uniformly to every login path, including
  `/worker/login`.
- No brute-force protection exists (SEC-006).
- `client/src/panels/super-admin/pages/Users.jsx:11,27` and `NGOs.jsx:12,50`
  pre-fill `password: '123456'` (SEC-018).
- A shared username/password is hardcoded in the client bundle
  (`client/src/components/TicketGate.jsx:5-6`) and must be treated as public.
  The value is deliberately not reproduced here — see SEC-001.

## Service and integration credentials

`client/.env:23-24` holds plaintext `VITE_WHATSAPP_MASTER_EMAIL` /
`VITE_WHATSAPP_MASTER_PASSWORD`, and `deploy-frontend.yml:43-44` wires the same
values into the client build from GitHub secrets. `VITE_` variables are inlined
into the public bundle by design, so this is unsafe the moment any source reads
them (SEC-011). Move this authentication server-side.
