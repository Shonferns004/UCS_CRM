# UCS CRM — Request & Authentication Flow

> **Document ID:** 02-System-Architecture/REQUEST-FLOW
> **Status:** Verified (auth code paths) / Partially verified (per-route gates)
> **Generated:** 2026-10-13
> **Related:** [SYSTEM-ARCHITECTURE](SYSTEM-ARCHITECTURE.md) · [PANEL-NAVIGATION](PANEL-NAVIGATION.md)

## 1. Purpose

Trace how a browser action becomes an authenticated API request and how the backend authorizes and serves it.

---

## 2. Authentication Flow (login)

![request-flow-1](../diagrams/request-flow-1.png "Sequence Diagram — 02-System-Architecture/REQUEST-FLOW.md #1")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser)
    participant L as Login page
    participant S as UcsProvider (store.jsx)
    participant A as Express /api/auth
    participant DB as PostgreSQL

    U->>L: enter identifier + password
    L->>S: login(identifier, password)
    S->>A: POST /api/auth/login
    A->>DB: verify user + bcrypt compare
    DB-->>A: user record
    A-->>S: { token, user }
    S->>S: setSession('ucs', token, user) -> localStorage
    S->>L: user state set
    L->>U: redirect via panelPathFor(user)
```

</details>


**Source references:** `client/src/store.jsx` (`login`, `setSession`), `client/src/api/auth.js` (`login`, `setSession`), `backend/src/controllers/authController.js`, `backend/src/middleware/authMiddleware.js`.

**Note.** Login route itself is public by necessity; every other route is expected to require a valid bearer token.

---

## 3. Authenticated Request Flow

![request-flow-2](../diagrams/request-flow-2.png "Sequence Diagram — 02-System-Architecture/REQUEST-FLOW.md #2")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant C as Client component
    participant API as api() fetch wrapper
    participant M as authMiddleware
    participant R as Route controller
    participant SV as Service
    participant DB as PostgreSQL

    C->>API: api('/resource', { method })
    API->>API: read token from localStorage
    API->>M: GET /api/resource (Authorization: Bearer)
    alt missing/invalid token
        M-->>API: 401
        API->>C: clear session + redirect /login
    else valid token
        M->>M: jwt.verify(token, JWT_SECRET) + normalizeRole
        alt role not permitted
            M-->>API: 403
            API->>C: surface error
        else permitted
            M->>R: req.user = decoded
            R->>SV: business logic
            SV->>DB: query (Supabase builder or raw SQL)
            DB-->>SV: rows
            SV-->>R: result
            R-->>API: 200 JSON
            API->>C: parsed data
        end
    end
```

</details>


**Source references:** `client/src/api/auth.js` (401 handling), `backend/src/middleware/authMiddleware.js` (`authenticate`, `authenticateRole`, `normalizeRole`).

---

## 4. Authorization Model

![request-flow-3](../diagrams/request-flow-3.png "Flowchart — 02-System-Architecture/REQUEST-FLOW.md #3")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
flowchart LR
    TOKEN[JWT payload.role + department] --> NORM[normalizeRole / ROLE_ALIASES]
    NORM --> GUARD{authenticateRole allowed list}
    GUARD -->|in list| ALLOW[proceed]
    GUARD -->|not in list| DENY[403]
    DEPT[user.department fallback] --> GUARD
```

</details>


- Canonical roles and aliases: `backend/src/middleware/authMiddleware.js` (`ROLE_ALIASES`, `normalizeRole`).
- Predefined guards: `authenticateAdmin`, `authenticateWorker`, `authenticateSalary`, `authenticateAccountsOrEventTeam`.
- Department is used as a fallback for event-team scope to mirror the client (`isEventTeam`).

---

## 5. Client-Side Route Guard Flow

![request-flow-4](../diagrams/request-flow-4.png "Flowchart — 02-System-Architecture/REQUEST-FLOW.md #4")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
flowchart TB
    NAV[Navigate to /panel/*] --> PR{ProtectedRoute}
    PR -->|no user| LOGIN[redirect /login]
    PR -->|role '*'| OK[render]
    PR -->|super_admin| OK
    PR -->|role or department in allowed| OK
    PR -->|else| AD[AccessDenied - clears session]
```

</details>


**Source references:** `client/src/App.jsx` (`ProtectedRoute`, `panelPathFor`, `ROLE_PANELS`).

---

## 6. Realtime Event Flow

![request-flow-5](../diagrams/request-flow-5.png "Sequence Diagram — 02-System-Architecture/REQUEST-FLOW.md #5")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    participant API as Express + Socket.IO
    participant S as socket.js
    participant C as Client lib/socket.js
    participant UI as Component

    API->>S: emit db change / FRO action
    S->>C: socket event
    C->>UI: onDbChange callback (insert/update/delete)
    UI->>UI: refresh local state
```

</details>


**Source references:** `backend/src/socket.js`, `client/src/lib/socket.js` (`onDbChange`, `onFroAction`, `onSocketConnect`).

---

## 7. Unverified Items

- Per-route auth gates: not every one of the ~86 mounts was individually inspected. Each route's gate must be confirmed during Phase 4 (API reference). Status: **Partially verified**.
