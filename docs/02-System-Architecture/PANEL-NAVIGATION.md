# UCS CRM — Panel Navigation Map

> **Document ID:** 02-System-Architecture/PANEL-NAVIGATION
> **Status:** Verified
> **Generated:** 2026-10-13
> **Related:** [SYSTEM-ARCHITECTURE](SYSTEM-ARCHITECTURE.md) · [Panel Documentation](../03-Panel-Documentation/)

## 1. Purpose

Show how a logged-in user is routed to a panel and how panels relate to each other, based on `client/src/App.jsx`.

---

## 2. Routing Decision

![panel-navigation-1](../diagrams/panel-navigation-1.png "Flowchart — 02-System-Architecture/PANEL-NAVIGATION.md #1")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
flowchart TB
    LOGIN[Successful login] --> PP[panelPathFor user]
    PP --> DEPT{department contains develop or digital?}
    DEPT -->|develop| DEV["/dev-panel (Developer)"]
    DEPT -->|digital| SOC["/social (Social)"]hiii
    DEPT -->|no| ROLE{resolve by role}
    ROLE --> SA["/sa - super_admin"]
    ROLE --> HR["/hr - hr"]
    ROLE --> NGO["/ngo-admin - admin"]
    ROLE --> FRO["/fro - fro/worker"]
    ROLE --> ACC["/accounts - accounts"]
    ROLE --> REC["/recruiter - recruiter"]
    ROLE --> EVH["/event-head - event_head"]
    ROLE --> OTHER{department fallback}
    OTHER -->|match| ROLE
    OTHER -->|no match| DENY[AccessDenied]
```

</details>


**Explanation.** `panelPathFor()` is role-first; department is consulted only to split `digital` (→ `/social`) from `develop*` (→ `/dev-panel`). This ordering was deliberately changed so an accounts worker (department "Admin", role "accounts") lands on `/accounts`, not `/ngo-admin`.

**Source:** `client/src/App.jsx` lines 28–61 (`ROLE_PATHS`, `ROLE_PANELS`) and 139–163 (`panelPathFor`).

---

## 3. Panel Relationship Map

![panel-navigation-2](../diagrams/panel-navigation-2.png "Flowchart — 02-System-Architecture/PANEL-NAVIGATION.md #2")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
flowchart LR
    subgraph Standalone["Standalone panels (own route)"]
        SA[Super Admin /sa]
        HR[HR /hr]
        NGO[NGO Admin /ngo-admin]
        FRO[FRO /fro]
        ACC[Accounts /accounts]
        REC[Recruiter /recruiter]
        EVH[Event Head /event-head]
        DEV[Developer /dev-panel]
        SOC[Social /social]
        SIM[SIM Card /sim]
        WA[WhatsApp /wa]
        DOC[Documentation /docs]
    end

    subgraph Embedded["Embedded panels (no own route)"]
        BEN[Beneficiaries]
        SEV[Sevak Library]
    end

    SA -->|iframe PanelFrame| NGO
    SA -->|iframe PanelFrame| HR
    SA -->|iframe PanelFrame| ACC
    SA -->|iframe PanelFrame| FRO
    SA -->|iframe PanelFrame| EVH
    SA -->|iframe PanelFrame| REC
    ACC -->|route| BEN
    ACC -->|route| SEV
    HR -->|route| SEV
    SOC -->|reuses| EVH
```

</details>


**Explanation.** Super Admin embeds other panels read-only through `PanelFrame` iframes (config in `panels/super-admin/embedPanels.js`). `beneficiaries` and `sevak-library` are mounted inside `accounts` (and `sevak-library` also inside `hr`). `social` reuses the event-head `ActivityPlanner` and `ChatWorkspace`.

**Source references:** `client/src/panels/super-admin/SuperAdminPanel.jsx`, `client/src/panels/super-admin/embedPanels.js`, `client/src/panels/accounts/AccountsPanel.jsx`, `client/src/panels/hr/HRPanel.jsx`.

---

## 4. Cross-Panel Shared Components

| Component | Location | Used by |
| --- | --- | --- |
| `ChatWorkspace` | `client/src/components/chat/` | every panel's `/chat` route |
| `NoticesBar`, `NoticePopupHost` | `client/src/components/` | mounted per panel wrapper |
| `TicketPopupHost` | `client/src/components/TicketPopupHost.jsx` | per panel wrapper |
| `TechnicalTickets` | `client/src/components/TechnicalTickets.jsx` | dev, ngo-admin, recruiter, event-head |
| `DailyReport` | `client/src/components/DailyReport/` | hr, social, recruiter, dev |
| `SpecialIncentive`, `LeadIncentive` | `client/src/components/` | accounts, super-admin |
| `SimSection` | `client/src/panels/accounts/sim/` | accounts |
| `FroIdleReportPanel` | `client/src/components/froIdleReport/` | super-admin, ngo-admin |

---

## 5. Verification

All route bases and role lists above are read directly from `client/src/App.jsx`. Panel-internal sub-routes are enumerated in each panel's documentation under `docs/03-Panel-Documentation/`.
