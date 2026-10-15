# UCS CRM — Entity Relationship Overview

> **Document ID:** 05-Database-Documentation/ER-DIAGRAM
> **Status:** Partially verified — entity names are read from code; cardinalities below are **inferred from naming conventions and key names** unless a bootstrap FK was confirmed.
> **Generated:** 2026-10-13
> **Cross-reference:** [DATA-DICTIONARY](DATA-DICTIONARY.md) · [MODELS-INDEX](MODELS-INDEX.md) · `backend/src/bootstrap/ensure*.js` (column/FK truth)

## 1. Core CRM Entities

![er-diagram-1](../diagrams/er-diagram-1.png "ER Diagram — 05-Database-Documentation/ER-DIAGRAM.md #1")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
erDiagram
  USERS ||--o{ WORKERS : "worker account"
  USERS ||--o{ CRM_AGENTS : "agent account"
  USERS ||--o{ LEADS : "owner"
  WORKERS ||--o{ ATTENDANCE : "punches"
  WORKERS ||--o{ LEAVES : "applies"
  WORKERS ||--o{ WORKER_LOANS : "borrows"
  WORKERS ||--o{ WORKER_NGO_ALLOCATIONS : "allocated"
  WORKERS ||--o{ SALARY_ALLOCATIONS : "has salary"
  WORKERS ||--o{ FRO_TARGETS : "targeted"
  WORKERS ||--o{ FRO_ASSIGNMENTS : "assigned donors"
  USERS ||--o{ FRO_DONOR_LOGS : "logs donor interaction"
  LEADS }o--|| DONOR_PROFILES : "verified into"
  DONOR_PROFILES ||--o{ RECEIPTS : "receives"
  DONOR_PROFILES ||--o{ SUSPENSE_DONATIONS : "may be unlinked"
  RECEIPTS ||--o{ PAYMENT_WEBHOOK_LOG : "matched"
  RECEIPTS }o--|| RAZORPAY_ACCOUNTS : "gateway"
  NGOS ||--o{ WORKER_NGO_ALLOCATIONS : "funds"
  NGOS ||--o{ USERS : "members"
```

</details>

**Explanation.** `workers`/`crm_agents` are the operational personnel; `leads` become `donor_profiles` on verification and then generate `receipts`. FRO workflows revolve around `fro_assignments`, `fro_donor_logs`, `fro_targets`. NGO allocations tie worker salaries to funding NGOs. Confirm each FK in the matching `ensure*Schema.js` bootstrap.

**Sources:** table names from `backend/src/**` `.from()` references; cardinalities from naming (`_id` suffixes) — **inferred**.

## 2. Beneficiary Domain

![er-diagram-2](../diagrams/er-diagram-2.png "ER Diagram — 05-Database-Documentation/ER-DIAGRAM.md #2")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
erDiagram
  BENEFICIARIES ||--o{ BENEFICIARY_FAMILY_MEMBERS : "family"
  BENEFICIARIES ||--o{ BENEFICIARY_DOCUMENTS : "documents"
  BENEFICIARIES ||--o{ BENEFICIARY_EDUCATION : "education"
  BENEFICIARIES ||--o{ BENEFICIARY_EMPLOYMENT : "employment"
  BENEFICIARIES ||--o{ BENEFICIARY_DISABILITIES : "disabilities"
  BENEFICIARIES ||--o{ BENEFICIARY_ASSISTANCE_REQUIREMENTS : "assistance"
  BENEFICIARIES ||--o{ BENEFICIARY_CARDS : "has card"
  BENEFICIARIES ||--o{ OPERATOR_ASSIGNMENTS : "served by"
  OPERATORS }o--|| BNF_OPERATORS : "operator"
```

</details>

**Explanation.** A beneficiary aggregates sub-records (family, documents, education, employment, disability, assistance) each keyed by beneficiary id. Operators/`bnf_operators` handle daily events and distributions (`benefit_distributions`, `benefit_distribution_items`).

## 3. Event Head Domain

![er-diagram-1](../diagrams/er-diagram-1.png "ER Diagram — 05-Database-Documentation/ER-DIAGRAM.md #1")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
erDiagram
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_ACTIVITIES : "activities"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_ATTENDANCE : "attendance"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_MEDIA : "media"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_CHECKLIST : "checklist"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_DISTRIBUTIONS : "distributions"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_EXPENSES : "expenses"
  EVENT_HEAD_EVENTS ||--o{ EVENT_HEAD_SOCIAL_TRACKING : "social"
  EVENT_HEAD_ASSETS ||--o{ EVENT_HEAD_ASSETS : "issue/return"
  GUARD_HAND ||--o{ EVENT_HEAD_EVENTS : "approval"
```

</details>

**Explanation.** The event-head module is a self-contained project system: events carry activities, volunteers, assets, materials, media, checklist, expenses and social-tracking records; events pass an approval workflow before completion.

## 4. Communication Domain

![er-diagram-4](../diagrams/er-diagram-4.png "ER Diagram — 05-Database-Documentation/ER-DIAGRAM.md #4")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
erDiagram
  CONVERSATIONS ||--o{ MESSAGES : "contains"
  CONVERSATIONS ||--o{ CONVERSATIONS : "direct/group"
  NOTICES ||--o{ NOTICES : "seen by"
  NOTIFICATION_LOG ||--o{ NOTIFICATION_LOG : "delivered"
  SUPPORT_TICKETS ||--o{ TICKET_REPLIES : "replies"
  DEVELOPER_TICKETS ||--o{ DEVELOPER_TICKET_REPLIES : "replies"
```

</details>


## 5. References

- Model files `backend/src/models/*.js` (see [MODELS-INDEX](MODELS-INDEX.md))
- Schema guarantees `backend/src/bootstrap/ensure*.js` — these are authoritative for columns and FKs
- Legacy SQL migrations: `backend/migrations/`, `backend/src/migrations/`

## 6. Verification to-do

- [ ] Confirm FK constraints in each `ensure*Schema.js` (column-level; **Partially verified**)
- [ ] Verify `receipts.log_id ↔ leads` linkage (controller-level, confirmed for receipt flow in Accounts docs)
- [ ] Verify `fro_assignments/lead_assignments` split