# Findings Register

Prioritised security findings, each verified by reading the code. IDs are stable
and safe to reference from issues and commit messages.

Severity reflects impact against the current threat model (see
[THREAT-MODEL.md](THREAT-MODEL.md)): a compromise of one low-privilege
authenticated account is assumed to be **likely** and **initial access is
always available**.

| ID | Severity | Title | Status |
| --- | --- | --- | --- |
| SEC-001 | **Critical** | Shared password in the bundle gates tickets; API needs only any token | Open |
| SEC-002 | **High** | Stored XSS in HR letter preview/print | Open |
| SEC-003 | **High** | No security response headers anywhere | Open |
| SEC-004 | **High** | JWT and impersonation token in `localStorage` | Open |
| SEC-005 | **High** | `/uploads` served statically with no authentication | Open |
| SEC-006 | **Medium** | No rate limiting on authentication endpoints | Open |
| SEC-007 | **Medium** | Wildcard CORS with an admin header allowed | Open |
| SEC-008 | **Medium** | Donor PII (incl. PAN) persisted in `localStorage` | Open |
| SEC-009 | **Medium** | Internal engineering docs readable by every role | Open |
| SEC-010 | **Medium** | Unsanitised DOCX conversion into `dangerouslySetInnerHTML` | Open |
| SEC-011 | **Medium** | CI injects a master password into a client build | Open |
| SEC-012 | **Medium** | Raw SQL built with string interpolation (68 sites) | Needs audit |
| SEC-013 | Low | Unescaped label written into a same-origin print window | Open |
| SEC-014 | Low | Server error messages and a 404 oracle reach the UI | Open |
| SEC-015 | Low | `trust proxy loopback` while no limiter uses the IP | Open |
| SEC-016 | Low | Diagram render error injected via `innerHTML` | Open |
| SEC-017 | Info | 100-year tokens issued by auxiliary subsystems | Open |
| SEC-018 | Info | Pre-filled default password `123456` in admin forms | Open |
| SEC-019 | Info | base64 uploads exceed the JSON body limit, fail late | Open |

---

## SEC-001 — Shared password in the bundle gates tickets; API needs only any token

**Severity:** Critical · **Status:** Open · **Confirmed**

A shared credential is hardcoded in client source and compared in plain
JavaScript, in two separate files:

```js
// client/src/components/TicketGate.jsx:4-8  (values redacted here on purpose:
// they are committed in source and must be considered public)
const TICKET_GATE = {
  username: '<hardcoded shared username>',
  password: '<hardcoded shared password>',
  sessionKey: 'ucs_ticket_unlocked',
};
// :32 — plain string comparison
if (input.username.trim() === TICKET_GATE.username && input.password === TICKET_GATE.password) {
  sessionStorage.setItem(TICKET_GATE.sessionKey, '1');
```

Duplicated at `client/src/components/TechnicalTickets.jsx:8-12`, compared at
`:190`. The literal is present in the built bundle
(`client/dist/assets/index-*.js`), so it is public to anyone who loads the app.

Defeated three ways: read the bundle, set
`sessionStorage.ucs_ticket_unlocked = '1'`, or skip the gate entirely.

The server provides no equivalent protection —
`backend/src/routes/developerTicketRoutes.js:11` applies only `authenticate`, so
**any** valid JWT of **any** role reaches `GET /` (all tickets), `PUT /bulk`, and
`PUT /:id/approve`. The UI copy claiming an "authorised username and password"
is misleading: the credential grants nothing that the token does not already
grant, while appearing to.

**Remediation**
1. Remove `TicketGate`/`TechnicalTickets` credential comparison entirely.
2. Protect the routes with a real role check, e.g.
   `authenticateRole('super_admin','developer')`.
3. Rotate the exposed credential, since it must be considered public.
4. If step-up confirmation is genuinely wanted, implement it server-side as a
   short-lived, single-use challenge — never in the bundle.

---

## SEC-002 — Stored XSS in HR letter preview/print

**Severity:** High · **Status:** Open · **Confirmed**

Letter bodies are built with template literals and injected as raw HTML. An
`esc()` helper exists but is applied to only a few fields:

```js
// client/src/panels/hr/components/Letters.jsx:88
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
```

Unescaped interpolation of attacker-influenceable values:

| Value | Lines |
| --- | --- |
| `${w.name}` (worker name) | `Letters.jsx:431,484,566,794` |
| `${ngo.name}` | `:367,382,397,431,484,546,566,770,774,896,909,923,941,963,972` |
| `${hrNameText}` (free text input) | `:381,448,501,573,896,909` |
| `${ngo.address}` | `:351,408,812,871,947,972` |

Two sinks consume the result:

- `Letters.jsx:1303` — `<div dangerouslySetInnerHTML={{ __html: out.body }} />`
- `Letters.jsx:1043` — `el.innerHTML = bodyText;` before `html2canvas`
  rasterises it, so it fires even with the preview closed.

`w.name` originates from the workers table and a low-privilege role can set
their own display name, so this is **stored XSS against an HR administrator's
browser**, executing with that administrator's session.

**Remediation:** apply `esc()` to every interpolated field, or render the body
as React elements instead of an HTML string. Add a lint rule banning
`dangerouslySetInnerHTML` outside an allow-list.

---

## SEC-003 — No security response headers anywhere

**Severity:** High · **Status:** Open · **Confirmed**

A repository-wide search for `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Frame-Options`, `add_header`, and `helmet` returns **zero** matches. There is
no nginx config, no `vercel.json`, and no `_headers` file for `client/`.

Consequences: no CSP backstop for SEC-002/SEC-010, no HSTS, and the app is
framed by any origin (clickjacking). The client is deployed by copying
`client/dist` into an EC2 web root (`deploy-frontend.yml:76-100`), so any headers
now in place are configured outside version control — unversioned, unreviewed,
and undocumented.

**Remediation:** add the header block in
[REVERSE-PROXY.md](REVERSE-PROXY.md) to the nginx site config and commit it.
`helmet()` on the backend is still recommended for the API origin.

---

## SEC-004 — JWT and impersonation token in `localStorage`

**Severity:** High · **Status:** Open · **Confirmed**

```js
// client/src/api/auth.js:5-8
export function setSession(prefix, token, user) {
  localStorage.setItem(`${prefix}_token`, token)
  localStorage.setItem(`${prefix}_user`, JSON.stringify(user))
}
```

No cookie, therefore no `httpOnly`, `Secure`, or `SameSite`. Any XSS — including
SEC-002 — can read the token and exfiltrate it. Worse, impersonation stores the
**original privileged** token alongside the impersonated one
(`auth.js:152-153`, keys `ucs_original_token`), so one XSS during a "work as"
session yields a super-admin token.

`user` is also read from `localStorage` (`client/src/store.jsx:58`) and used for
all role gating, so `{"role":"super_admin"}` satisfies every `ProtectedRoute`
(`App.jsx:53-63`).

**Remediation:** move the token to an `httpOnly; Secure; SameSite=Strict`
cookie, and make the backend the only reader. Until then, SEC-002 is Critical in
practice — treat CSP as a compensating control.

---

## SEC-005 — `/uploads` served statically with no authentication

**Severity:** High · **Status:** Open · **Confirmed**

```js
// backend/src/index.js:501
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
```

Mounted before the auth-aware routes and with no middleware of any kind. Every
file in `uploads/` is world-readable to anyone who can guess or enumerate a path.
Uploaded documents here include donor paperwork, bank statements, certificates
and payment screenshots — see [DATA-PROTECTION.md](DATA-PROTECTION.md).

**Remediation:** move behind `authenticate` and authorise per-owner, or store
outside the web root and serve through a controller that checks ownership before
streaming. Confirm the directory has no historic confidential files before it is
locked down, and audit access logs if it has ever been exposed.

---

## SEC-006 — No rate limiting on authentication endpoints

**Severity:** Medium · **Status:** Open · **Confirmed**

`express-rate-limit` is a dependency, but the only usage in the backend is in
`chatRoutes.js`. There is no global limiter and none on login, so password
spraying and credential stuffing against `/api/auth/login` and
`/api/workers/login` are unthrottled.

Compounding: `app.set('trust proxy', 'loopback')` (`index.js:116`) means
`req.ip` is only correct for loopback hops; behind nginx the limiter would see
the proxy address unless the hop count is set correctly. There is no lockout or
delay-after-failure logic.

**Remediation:** add a strict limiter on the auth routes (e.g. 5 attempts / 15
min / IP + identifier), a global coarse limiter, and correct `trust proxy` to
the actual proxy hop count. See SEC-015.

---

## SEC-007 — Wildcard CORS with an admin header allowed

**Severity:** Medium · **Status:** Open · **Confirmed**

```js
// backend/src/index.js:118-122
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Client-Type','x-admin-key'],
}));
```

Not directly exploitable today because auth is a `localStorage` bearer token
rather than a cookie, so cross-origin sites cannot read it. It is unnecessary
breadth and becomes **critical the moment auth moves to cookies** (the SEC-004
remediation), because `Access-Control-Allow-Credentials` with a wildcard origin
is exactly the CSRF-enabling combination. Allowing `x-admin-key` invites a future
caller to send an admin key from a browser.

**Remediation:** replace `'*'` with an explicit allow-list of origins, drop
`x-admin-key` unless a browser client genuinely needs it, and never combine
`origin: '*'` with credentials.

---

## SEC-008 — Donor PII persisted in `localStorage`

**Severity:** Medium · **Status:** Open · **Confirmed**

`client/src/panels/accounts/pages/Dashboard.jsx:207-225` writes donor name,
address, **PAN**, email, UPI transaction ID, bank name and mobile to
`receipts_verified_data` in `localStorage` — unencrypted, readable by any script
on the origin, and persisted across sessions. It is only incidentally removed by
the `localStorage.clear()` in the logout handler.

Also present: receipt template settings (`TemplateSettings.jsx:41,48`), WhatsApp
agent session tokens (`panels/fro/pages/WhatsAppChat.jsx:83`), and worker
records including Aadhaar and bank details (`panels/hr/components/Workers.jsx:12-16`).

**Remediation:** keep PII in memory only, or in `sessionStorage` with an explicit
expiry. Never persist Aadhaar, PAN, or bank data to disk in a browser.

---

## SEC-009 — Internal engineering docs readable by every role

**Severity:** Medium · **Status:** Open · **Confirmed**

```jsx
// client/src/App.jsx:205-209
<Route path="/docs/*" element={<ProtectedRoute role={['*']}><DocumentationPanel /></ProtectedRoute>} />
```

`/docs/*` is open to **any** authenticated user, including `worker` and
telecaller roles. The bundle contains internal documentation describing API
routes, database schema, `aadhaar_number` columns, and the `JWT_SECRET`
verification flow (`panels/documentation/data/*.js`). No live secret values are
present, but this is a free reconnaissance package for an attacker holding a
low-privilege token.

**Remediation:** restrict to `super_admin`/`developer`, or better, move the
content out of the production bundle entirely.

---

## SEC-010 — Unsanitised DOCX conversion into `dangerouslySetInnerHTML`

**Severity:** Medium · **Status:** Open · **Confirmed**

`client/src/panels/accounts/pages/Certificates.jsx` fetches a `.docx` template
and renders it with `mammoth` without sanitisation, in two places:

- `:55` → `:79` — template thumbnail
- `:437` → `:1316` — live certificate preview

A malicious or compromised template file executes in-origin. Upload is limited to
Accounts/Super-admin, so this is a privilege-escalation-via-file vector rather
than an unauthenticated one — but it escalates to any role that can reach
certificates.

**Remediation:** sanitise the converted HTML with DOMPurify using an allow-list
before injection (`dompurify@3` is already in the tree as a transitive
dependency; add it as a direct dependency). Restrict `<script>`, event handlers,
and external resource loading.

---

## SEC-011 — CI injects a master password into a client build

**Severity:** Medium · **Status:** Open · **Confirmed**

`.github/workflows/deploy-frontend.yml:40-44` passes secrets into the Vite build:

```yaml
VITE_API_URL: https://api.beingsevak.org/api
VITE_SOCKET_URL: https://api.beingsevak.org
VITE_WHATSAPP_MASTER_EMAIL: ${{ secrets.CRM_WHATSAPP_EMAIL }}
VITE_WHATSAPP_MASTER_PASSWORD: ${{ secrets.CRM_WHATSAPP_PASSWORD }}
```

`VITE_`-prefixed variables are **inlined into the public bundle by design**. No
source file currently references `VITE_WHATSAPP_MASTER_*`, so the credential is
not in today's bundle — but the wiring is one `import.meta.env` reference away
from publishing an admin password. The same variables sit uncommented in the
untracked `client/.env:23-24`.

**Remediation:** move WhatsApp master auth entirely server-side and delete these
two build-time variables. Add a CI grep that fails the build if a `VITE_` secret
name is referenced in `client/src`.

---

## SEC-012 — Raw SQL built with string interpolation

**Severity:** Medium · **Status:** Needs audit · **Partially confirmed**

68 `_pool.query(\`...\`)` call sites across 16 backend files. The codebase also
contains 268 lines using `$1`-style placeholders, so the majority appear
parameterised. The residual risk is in the sites that interpolate values directly
into the SQL string (values, `ORDER BY`, `LIMIT`, dynamic table/column names).

`workerModel.js:85-90` is a representative example of the safe pattern using
`.or()` filters through the query builder, and
`utils/loanTerm.js` deliberately keeps its rules database-free so they can be
unit tested — follow both.

**Remediation:** audit all 68 sites; convert any interpolated value to a
placeholder. Dynamic identifiers (`ORDER BY` columns) must be validated against
an allow-list. Add a lint rule against `_pool.query` with template literals
containing `${`.

---

## SEC-013 — Unescaped label written into a same-origin print window

**Severity:** Low · **Status:** Open · **Confirmed**

`client/src/panels/hr/components/GenerateQR.jsx:78` writes
`win.document.write(\`<h2>${label}</h2>\`)` into a
`window.open('', '_blank')` document. `label` is a plain text input (`:157`) with
no escaping, and the window is same-origin, so injected markup runs in the app's
origin.

**Remediation:** set `textContent` instead of `document.write`, or escape the
value.

---

## SEC-014 — Server error messages and a 404 oracle reach the UI

**Severity:** Low · **Status:** Open · **Confirmed**

`client/src/api/auth.js:56-83` surfaces the raw server `err.message` into the UI
with no allow-list, and derives `e.routeMissing` from the `Content-Type` of a 404
(`:79-82`). That flag distinguishes "route not mounted" from "resource absent",
which is deployment reconnaissance handed to any authenticated user. On the
server, `authMiddleware.js:63` echoes the required role list in a 403 body,
which is then displayed.

**Remediation:** return a stable error code plus a generic message to the client
and log the detail server-side; map codes to copy in the UI. Remove the
`routeMissing` signal or make it indistinguishable from other 404s.

---

## SEC-015 — `trust proxy loopback` while no limiter uses the IP

**Severity:** Low · **Status:** Open · **Confirmed**

`app.set('trust proxy', 'loopback')` (`backend/src/index.js:116`) is correct only
for a single loopback proxy hop. Behind nginx on another interface, `req.ip`
resolves to the proxy rather than the client, which will make any IP-based
limiter or audit log group every user together. Harmless today because no limiter
uses it; it becomes a correctness bug the moment SEC-006 is fixed.

**Remediation:** set the hop count to match the real chain (for example
`app.set('trust proxy', 1)`), and verify the observed IP in a staging request
before enabling enforcement.

---

## SEC-016 — Diagram render error injected via `innerHTML`

**Severity:** Low · **Status:** Open · **Confirmed**

`client/src/panels/documentation/components/DiagramViewer.jsx:67` assigns
`` container.innerHTML = `<pre …>Diagram render error: ${e.message}</pre>` ``.
Exception text can echo diagram input. Source data is hardcoded documentation,
so exploitability is low, but it is an unescaped sink.

**Remediation:** build the node with `textContent`. Separately, set
`securityLevel` explicitly in `mermaid.initialize` (`:40-52`) rather than relying
on the v11 default.

---

## SEC-017 — 100-year tokens issued by auxiliary subsystems

**Severity:** Info · **Status:** Open · **Confirmed**

Beyond the 24-hour main token (`authController.js:18`), `/worker/login` is issued
with **no expiry** (`authController.js:223`), and other subsystems sign very
long-lived tokens — `whatsappCrmAuthController.js:6`,
`froWhatsAppAuthController.js:78`, `config/db.js:1232`. A leaked long-lived
token cannot be rotated out of circulation by waiting.

**Remediation:** give every token a bounded lifetime, add server-side
denylist/rotation, and prefer short-lived access tokens with refresh for the
long-lived integrations.

---

## SEC-018 — Pre-filled default password in admin forms

**Severity:** Info · **Status:** Open · **Confirmed**

`client/src/panels/super-admin/pages/Users.jsx:11,27` and `NGOs.jsx:12,50`
pre-fill `password: '123456'`. If submitted unchanged, every new NGO or user
account shares a publicly known password.

**Remediation:** remove the default, require a minimum length, and force a
change on first login.

---

## SEC-019 — base64 uploads exceed the JSON body limit, fail late

**Severity:** Info · **Status:** Open · **Confirmed**

Pasted/dragged images are base64-encoded into JSON (for example
`client/src/utils/usePasteImage.js:38-47`), inflating payload size by ~33%
before JSON encoding, while the parser is capped at 10 MB
(`backend/src/index.js:123`). A 7 MB audio cap at
`panels/accounts/pages/LeadAudit.jsx:122` becomes ~9.4 MB base64 and is rejected
**after** the whole payload is buffered — a confusing failure and a cheap way to
consume server memory.

**Remediation:** multiply client-side caps by 4/3, and enforce upload limits in
`multer` (already a dependency) on the multipart routes rather than in the JSON
body parser.
