# WhatsApp Shared Inbox — Merge & Gap Plan

Status: **analysis only — no code, no SQL, no config was changed to produce this document.**
Date: 2026-10-10
Scope: reuse what the CRM already has, fill the real gaps, and lift the proven parts of the
orphaned `whtsapp/` project. **Do not build a parallel `inbox_*` shadow schema** — see §2.

---

## 0. Provenance of this document, and one caveat

`WHATSAPP_MERGE_PLAN.md` **did not exist** anywhere in the repository before this file was
written (verified: recursive search across all `*.md` and all directories; only
`docs/security/EDGE-HARDENING-PLAN.md` matched a `*PLAN*.md` glob). The task therefore
instructed me to plan from the repository and from the standalone `whtsapp/` project. That is
what this document is. **If an authoritative plan exists elsewhere, this should be re-checked
against it before any Phase 1+ work begins.**

Evidence base:

| Source | How it was read |
|---|---|
| `backend/supabase/schema.sql` @ commit `9e86fddd` | Deleted from the working tree in `c1fee879` ("migrate backend to AWS EC2"). Recovered read-only via `git show 9e86fddd:backend/supabase/schema.sql`. A 1385-line `pg_dump` DDL giving the **exact** live types/defaults/FKs for all pre-migration tables. |
| `backend/migrations/*.sql` | All 138 files. Numbering 071–182, hand-applied. |
| `whtsapp/backend/src/db/*.sql` | Standalone project's 10 schema files. |
| Live backend + client source | Route inventory, auth, webhook flow, frontend surfaces. |

**Limitation to carry forward:** the recovered dump is dated **2026-07-31**. Columns added
afterwards (listed in §2.3) are known from application code, not from the dump. The **live RDS
schema has not been queried** and nothing here should be treated as verified against the
running database until that happens.

---

## 1. Current architecture

### 1.1 There are two implementations, not one

| Tree | Mounted? | Database access | Data model | Status |
|---|---|---|---|---|
| `backend/src/**` + `client/src/panels/fro/**` | Yes, live at `api.beingsevak.org` | Hand-written `pg` pool (`config/db.js`) over Supabase-style tables | `conversations`, `messages`, `contacts`, `whatsapp_accounts`, `whatsapp_templates`, `whatsapp_routing_rules`, `whatsapp_broadcasts`, `whatsapp_ai_settings` | **Production.** Knows about projects, receipts, broadcasts, AI settings, HR letters, FRO donor scoping. |
| `whtsapp/**` (standalone, 143 files) | **No — orphaned**, imported by nothing | Its own `pg` pool, own `.env`, own JWT | `staff`, `contacts`, `conversations`, `messages`, `webhook_events`, `message_status_events`, `tags`, `contact_tags`, `calls`, `automation_*`, `reminders` | Complete, working shared inbox. Unreachable. Its `README.md` is a stale starter-kit template, which is why it reads as abandoned. |

Neither can be dropped wholesale. `backend/src` owns every CRM integration. `whtsapp/` owns the
webhook-hardening and inbox-UX patterns. **The merge is a port, not a replacement.**

### 1.2 Live data model (exact, from the recovered dump)

All chat tables were migrated SERIAL → UUID by a migration that no longer exists in
`backend/migrations/`. **All primary keys are `uuid` except `whatsapp_accounts.id`, which is
still `integer`** — and that asymmetry is load-bearing (`conversations.whatsapp_account_id` is
`integer`, while `conversations.phone_number_id` is `uuid`). Do not "modernise" it.

```
conversations (uuid PK)
  id, tenant_id(text), contact_id(uuid->contacts), phone_number_id(uuid->whatsapp_phone_numbers),
  status(text, default 'open'), last_message_at, last_inbound_at, project(text),
  assigned_to(text), unread_count(int, default 0), created_at,
  assigned_agent_id(uuid->users), whatsapp_account_id(int->whatsapp_accounts)

messages (uuid PK)
  id, tenant_id(text), conversation_id(uuid->conversations), contact_id(uuid->contacts),
  user_id(TEXT, no FK), direction(text NOT NULL), message_type(text, default 'text'),
  body_text, wa_message_id(text), status(text, default 'queued'), message_category,
  template_id(text), template_params(jsonb), failure_reason, status_updated_at,
  is_automated(bool), created_at, media_id, media_url, media_mime_type
  + interactive_payload(jsonb)   -- added by whatsapp_enhancements.sql

contacts (uuid PK)
  id, tenant_id(text), phone, phone_normalized, wa_profile_name,
  source(text, default 'whatsapp'), project, created_at

whatsapp_accounts (integer PK, nextval)
  id, name, project(text NOT NULL UNIQUE), phone_number_id, access_token,
  waba_id, is_active, is_default, created_at

whatsapp_templates (integer PK)
  ngo_id(uuid NOT NULL->ngos), name, language(default 'en'), category(default 'UTILITY'),
  status(default 'approved'), meta_template_id, components(jsonb), project, created_at, updated_at

worker_agent_assignments  PK(worker_id uuid, user_id uuid), account_id integer -> whatsapp_accounts
agent_phone_assignments   PK(user_id uuid, account_id bigint)   -- NO FK; survives via db.js EMBED_JOINS
fro_whatsapp_assignments  PK(id), fro_worker_id uuid->workers, whatsapp_account_id int
```

**There is no RLS.** Zero `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` statements in the dump.
`client/src/panels/documentation/data/whatsapp-crm.js` and `database.js` both claim RLS
enforces `tenant_id`; that documentation describes an app deleted in `f65c2fb3` and is wrong.
The RDS/PostgREST migration replaced PostgREST with a hand-written pool, and authorization is
now purely application-level.

**There is no migration runner.** `backend/migrations/*.sql` is hand-applied SQL; there is no
`schema_migrations` table, no ordering logic, no rollback tooling (`163_hr_daily_reports.sql:3-8`
states this explicitly). Idempotency is the safety mechanism, so every statement must be
individually re-runnable. Modern house style: no `BEGIN`/`COMMIT`, no `DO $$` blocks
(`154_sim_cards_schema_sync.sql:22-33` forbids procedural blocks because runners that split on
semicolons shred them), single quotes, `IF NOT EXISTS` everywhere.

### 1.3 Backend surface

Mounted in `backend/src/index.js`:

| Mount | Router | Guard | Endpoints |
|---|---|---|---|
| `:268` | `/api/whatsapp/fro-login` | **none** | 1 |
| `:269` | `/api/fro/whatsapp/*` | `authenticate` + `requireWhatsApp` (roles `fro, worker, agent, admin, super_admin, master`) | 19 |
| `:244` | `/api/hr/whatsapp/*` | `authenticateRole('super_admin','admin','hr')` | 5 |
| `:279` | `/api/webhooks/whatsapp` | **none (GET + POST)** | 2 |
| `:281` | `/api/whatsapp/*` | `authenticateRole('accounts','super_admin')` | 3 |
| `:282` | `/api/whatsapp/*` | `authenticateRole('accounts','super_admin')` | 20 |
| `:290-291` | `/api/whatsapp/agents/*` | `authenticate` + inline role check | 3 |
| `:292-293` | `/api/whatsapp-crm/*` | `authenticate` only, **no role check** | 11 |

Also global and affecting all of the above: **wildcard CORS `origin: '*'`** (`:149-153`),
**no `helmet`**, `express.json({ limit: '10mb', verify })` which *does* capture `req.rawBody`
(`:156`) — the WhatsApp webhook simply never reads it.

Orphaned but complete: `whatsappAccountController.js`, `froWhatsAppAssignmentController.js`,
`froWhatsAppAssignmentModel.js`. **There is no HTTP surface at all for `whatsapp_accounts`
CRUD**, despite a working model (`whatsappAccountModel.js:75,111,150`).

### 1.4 Auth model

`backend/src/middleware/authMiddleware.js` is the only auth middleware. HS256 JWT, verified
inline against `process.env.JWT_SECRET`. Header is `Authorization: <anything> <token>` — the
scheme is never checked for `Bearer` (`authMiddleware.js:74`). `req.user` **is** the decoded
payload; there is no database re-read, so **no revocation, no deactivation check**. Contrast
`whtsapp/backend/src/middleware/auth.js:13-38`, which re-reads the staff row on every request.

Roles are normalised through an alias map (`authMiddleware.js:9-47`) that lowercases the
incoming role but **does not normalise `allowedRoles`** — so any allowed-role string that is
not already lowercase is unreachable. Live dead guards: `'ngo_admin'`
(`workerRoutes.js:26`), `'Event Manager'` / `'Event Head'` (`eventHeadRoutes.js:13`),
and **`'tenant_admin'`** (`bulkAgentImportRoutes.js:12`, `agentTransferRoutes.js:10`) — no
login path anywhere in the repo ever issues that role.

Token lifetimes are a separate concern: `POST /api/whatsapp/fro-login` issues **`100y`** tokens
(`froWhatsAppAuthController.js:78,122`) and so does the WhatsApp-CRM login
(`whatsappCrmAuthController.js:6`). The main CRM login is 24h.

There is a **fourth, incompatible role vocabulary** in `whatsappCrmAuthController.js:89`
(`admin|agent|viewer|master`) that no `authenticateRole` guard ever checks.

**Authorization on conversations is by list-filter, not by ownership.** The only per-account
restriction anywhere is a `.or(...)` clause on the inbox *list* query
(`froWhatsAppService.js:501-506`). Every per-conversation handler then takes the caller's `:id`
verbatim with no ownership predicate — `getConversationMessages` (`:74-83`), `sendFroReply`
(`:85-100`, which also silently claims ownership), `markConversationRead` (`:453-460`),
`sendTemplateReply` (`:595-601`), `updateConversationLabels` (`:734-740`),
`sendInteractive` (`whatsappEnhancementsController.js:297-301`), and `getMedia`
(`froWhatsAppController.js:22-85`, which falls back to **any** active account's access token).

### 1.5 Webhook pipeline

`backend/src/controllers/whatsappWebhookController.js`, 248 lines. Inbound flow:
resolve `phone_number_id` → `whatsapp_accounts.project` (`:27-31`) → insert
`whatsapp_webhook_logs` (`:33-39`, **return value discarded**) → find/create `contacts`
(`:57-77`) → find/create `conversations` (`:79-104`) → **insert `messages` unconditionally**
(`:109-122`) → synchronously download media from Graph and re-upload (`:124-161`) → bump
timestamps (`:163-169`) → routing (`:171-182`) → AI auto-reply (`:184`) → status frames
(`:188-234`) → mark a log row processed by predicate, not by id (`:236-241`) → 200.
Any throw returns 500 (`:244-247`), which tells Meta to retry and re-runs steps 4-15.

### 1.6 Frontend surface

| Surface | Route | Linked from nav | Status |
|---|---|---|---|
| `panels/fro/components/enhanced/*` — the real inbox, 11 files, ~1691 LOC | via `/wa/*` (`App.jsx:225`) | **no** | Reachable only by typing the URL |
| Same, via FRO panel | `/fro/whatsapp-chat[/:project]` (`FROPanel.jsx:1407-08`) | yes, but `preventDefault`ed | **Hard-disabled** — renders "Inbox coming soon" (`FROPanel.jsx:366-373`, guard `:532-543`, commit `0a548a37`) |
| `panels/whatsapp/WhatsAppPanel.jsx` | 9-line re-export wrapper | no | Orphan |
| `accounts/pages/WhatsAppAgents.jsx`, `WhatsAppSettings.jsx`, `components/WhatsAppAccountsManager.jsx` | none | no | **Dead code** |
| `accounts/components/WhatsAppDeliveryBadge.jsx` | embedded in Receipts | yes | **Live** (only live accounts WhatsApp component) |
| `panels/documentation/data/whatsapp-crm.js` | `/docs` | yes | Live, but documents a deleted app — treat as spec only |

The FRO panel still actively polls and subscribes for unread counts behind the disabled link
(`FROPanel.jsx:916-967`). Live plumbing behind a dead UI.

The single largest gap between backend and frontend: **18 fully-implemented endpoints on
`whatsappEnhancementsRoutes.js` have zero client references** — AI suggestions/preview,
broadcasts, routing rules, analytics, template sync, and `send-interactive`.

---

## 2. Reuse decision

### 2.1 Reuse as-is (do not rebuild, do not duplicate)

| Asset | Why |
|---|---|
| `conversations`, `messages`, `contacts`, `whatsapp_accounts`, `whatsapp_templates`, `worker_agent_assignments`, `agent_phone_assignments`, `fro_whatsapp_assignments` | Already carry every capability in the original task list: conversations, messages, agent assignment (`assigned_agent_id`), approved-template metadata (`whatsapp_templates.status='approved'`, synced live by `templateSyncService.js`), and message status (`messages.status` + `status_updated_at` + `failure_reason`). |
| `whatsapp_ai_settings`, `whatsapp_ai_suggestions`, `whatsapp_broadcasts`, `whatsapp_broadcast_recipients`, `whatsapp_routing_rules`, `quick_replies`, `media_library` | Live, working, backend-wired. |
| `client/src/panels/fro/components/enhanced/*` | The only real inbox UI; newest functional work (`048152cf`, 2026-09-18). Base for any UI work. |
| `WhatsAppDeliveryBadge.jsx` | Newest commit in the tree (`00638fff`, 2026-10-01). |
| `WA_STATUS_RANK` monotonic guard | Already exists at `whatsappController.js:31,73-75` — but only on the *send* path, never on the webhook path. |
| `froWhatsAppService.js:5-10` phone normaliser | Correct; the webhook simply doesn't use it. |

### 2.2 Lift from `whtsapp/` (rewrite against the CRM model)

| From `whtsapp/` | Fixes |
|---|---|
| `middleware/webhookSignature.js:10-63` (`timingSafeEqual` over `req.rawBody`) + `lib/whatsapp/signature.js:7-8` | §5.1 no signature verification |
| `db/schema.sql:104-106` unique partial index + `webhook_events` + `INSERT ... ON CONFLICT DO NOTHING RETURNING id` (`message.repository.js:64-84, 389-398`) | §5.1 no idempotency |
| `db/message_status.schema.sql:36-59` + `applyProviderStatus` rank comparison (`message.repository.js:213-257`) + `recordStatusEvent` (`:265-292`) + `reconcileStatusEvents` (`:328-344`) | §5.2 status history + ordering |
| `db/tags.schema.sql:15-39` + `tags/tag.routes.js` | §5.4 no tags |
| `db/status.schema.sql:51-61` (`conversation_status_history`) | §5.3 audit trail |
| `away/away.service.js:83-207` (pure `evaluateAwayWindow`, claim-first cooldown) | §5.5 no away message |
| `middleware/auth.js:13-38` (re-read row per request → instant revocation) | §5.9 IDOR + no revocation |
| `app.js:17,39-48` (`helmet`, CORS allow-list) | §5.9 |
| zod body validation on every route | §5.9 mass assignment |

### 2.3 Rewrite (do not reuse)

- `whatsappWebhookController.js` — all 248 lines.
- `whatsappCrmDataController.js` — `req.body` spread straight into inserts/patches with no
  whitelist (`:18,30,111,123`), and `tenant_id` read from the **query string** rather than the
  token (`:41,83,135`), so any caller can read another tenant's rows.
- `whatsappCrmRoutes.js:8` — open public self-service signup into the CRM
  (`whatsappCrmAuthController.js:111-133`), plus silent `agent`/`viewer` → `admin` promotion
  (`:45-48`).
- `froWhatsAppService.js` per-conversation handlers (IDOR).
- The two inline guards referencing the never-issued `tenant_admin`.

### 2.4 Known schema drift to account for (dump is 2026-07-31)

Added out-of-band, **not in the dump**, confirmed from live code:
`conversations.labels text[]` (`froWhatsAppService.js:734-739`; route `froWhatsAppRoutes.js:64`);
`contacts.first_name / last_name / email / company` and `UNIQUE (tenant_id, phone_normalized)`;
`whatsapp_accounts.template_name / template_language / hr_letter_template / hr_warning_template`
(last two from `159_hr_whatsapp_sends.sql:136-139`). These must be confirmed against live RDS
before any migration that references them.

---

## 3. Actual missing features

Severity-ranked. Every claim is file:line backed.

### 3.0 The unread badge is permanently dead — `conversations.unread_count` is never incremented

Repo-wide, `unread_count` appears 4 times: two reads (`froWhatsAppService.js:533,543`), one
reset that writes only `0` (`:456`), and one unrelated community-chat mapper. **The webhook
never touches it** (`whatsappWebhookController.js:163-169` bumps only `last_message_at` /
`last_inbound_at`). Therefore `GET /api/fro/whatsapp/conversations/unread-count` and
`/agent-conversations/unread-count` **always return 0**, and the green nav badge the FRO panel
renders is always empty. There is also no per-message `read_at`, and no `message.reads`
receipt is ever sent to Meta.

### 3.1 Webhook integrity — the two most severe findings

1. **No `X-Hub-Signature-256` verification.** Zero hits for `X-Hub-Signature` across
   `backend/src`. `req.rawBody` is captured at `index.js:156` and never read. The handler is
   mounted with no middleware (`webhookRoutes.js:40`). **Anyone who learns
   `/api/webhooks/whatsapp` can forge inbound messages into `contacts`/`conversations`/`messages`
   and mutate any row keyed by `wa_message_id`.** The Razorpay and Paytm webhooks in the same
   process *do* verify HMAC (`razorpayWebhook.js:13-17,78`; `paytmWebhook.js:9`) — WhatsApp is
   the outlier.
2. **No idempotency, and the database cannot reject duplicates.** `messages.wa_message_id` has
   **no unique index anywhere** — it appears exactly once in all 1385 lines of the dump as a
   plain column. On redelivery the handler inserts a duplicate message row, re-downloads and
   re-uploads the media, and **re-enters the AI path**; because
   `countConsecutiveAiReplies` counts only *outbound* messages (`aiReplyService.js:74-88`), in
   `mode:'auto'` a single redelivery **sends the donor a second auto-reply**.

Also: `processed` is set by predicate instead of by the inserted id (`:33-39` vs `:236-241`);
`VERIFY_TOKEN` has a **hardcoded fallback** `'ucscompany123'` (`:6`); no rate limiting on the
webhook (`express-rate-limit` is imported only by `chatRoutes.js:2,44`); no phone normalisation
on inbound (`:60,68`); no race catch on contact creation (`:75`); `.maybeSingle()` throws
`PGRST116` on two open conversations (`:87`) or two accounts sharing a `phone_number_id`
(`whatsappAccountModel.js:59`), producing 500 → infinite Meta retry; an unknown
`phone_number_id` silently files the message under project `'bsct'` (`:171`).

### 3.2 Status receipts have no history and can move backwards

Status is **overwritten in place** (`:190-200`) with no rank comparison. A `sent` arriving after
`read` silently downgrades the message to `sent`. Meta's own `status.timestamp` is discarded and
`status_updated_at` is stamped with server `now()`. The update is **unscoped** — not by
`direction='outbound'`, not by project, not by account. A later success frame nulls
`failure_reason`. There is no reconciliation for a receipt that races its own message row, so
it is dropped forever. The same regression affects `receipts` (`:220-232`), which bypasses the
`WA_STATUS_RANK` guard that already exists on the send path (`whatsappController.js:31,73-75`).

### 3.3 Audit trail

`assigned_agent_id` is overwritten in place with no history — a transfer writes one column and
no audit row (`agentTransferController.js:11-16`). There is no status-transition history for
conversations; `open`/`closed` are freely updatable by any caller through an unrestricted
`req.body` patch (`whatsappCrmDataController.js:120-130`). Outbound sends record only a
free-text `user_id` with no FK (`froWhatsAppService.js:150`; `'ai-bot'` at
`aiReplyService.js:189`). Only HR sends are audited (`hrWhatsAppController.js:48-55`).

### 3.4 Tags

No `tags` / `contact_tags` table exists. The only tagging is a raw unvalidated overwrite of one
array column with no catalogue, no admin and no history (`froWhatsAppService.js:734-740`), no
inbox query filters by it, and **no UI** — `updateLabels` exists in
`client/src/panels/fro/api/whatsappApi.js:71` and the backend route exists, but no component
imports it.

### 3.5 Away messages and presence

No away-message feature, no schedule, no presence column, so routing cannot skip an absent
agent. The only automation is AI auto-reply, whose `max_auto_replies` is a *consecutive* cap
reset by any human reply, not a cooldown (`aiReplyService.js:82-86,147-148`).

### 3.6 Template send audit

Outbound template sends store only `body_text: templateName` — not the rendered text, the
language, or the parameters (`froWhatsAppService.js:652-666`). The `messages.template_id` and
`template_params` columns **exist but are never written by the current backend**. The template
definition is merged with live Meta state at send time (`:625-627`), so what was actually sent
is not frozen. Sync is manual only.

### 3.7 Authorization, tenancy, and mass assignment

Per-conversation **IDOR** on every FRO route (§1.4). **Mass assignment** on every
`/api/whatsapp-crm` write. **`tenant_id` from the query string, not the token.**
**Open public signup** into the WhatsApp CRM. `100y` JWTs on two login paths.
`auto-login` mints `role:'agent'` tokens and is registered *above* the role gate
(`froWhatsAppRoutes.js:42` vs `:44`). Wildcard CORS, no helmet.

### 3.8 Reliability

Any single failure → 500 → Meta retries → duplicate side effects. `whtsapp` returns 200 first
and ingests after (`webhooks/webhook.routes.js:75-83`); the CRM does not. Media download is
synchronous inside the webhook. Hardcoded `'bsct'` project fallback in 8 places.
`GET /broadcasts/:id` has a write side effect (a read starts the sender).

### 3.9 Absent inbox UX

Tags, status lifecycle, claim/unassigned queue, away message, snooze/reminders, team-inbox
filters, message pagination (all messages are fetched unpaginated), contact profile, message
actions (reply/forward/retry — `onContextMenu` is never passed), template management, AI
suggestions UI, broadcast UI, analytics UI, and audit/status-history view. Message search is
**built but unreachable** (`showSearch` is only ever set to `false`, `WhatsAppInbox.jsx:60,364`),
as is the multi-project tab switcher (`PROJECT_TABS` never rendered, `:16-21`) and the media
thumbnail strip (`mediaFile` is permanently `null`, `:61,205,306`).

---

## 4. Proposed safe changes

Phased so that **every phase is independently shippable and independently revertible**, and
so the highest-severity items land without waiting on schema work.

### Phase 0 — Documentation (this file) ✅
No code. No risk.

### Phase 1 — Security hotfix (no schema change, no migration)
Pure application-layer, revertible by revert.

1. Verify `X-Hub-Signature-256` on `POST /api/webhooks/whatsapp` using the existing
   `req.rawBody` (`index.js:156`) and a timing-safe compare; **fail closed in production, open
   only in dev**. Port `whtsapp/backend/src/middleware/webhookSignature.js:10-63`. *(fixes §3.1.1)*
2. Remove the hardcoded `VERIFY_TOKEN` fallback (`:6`).
3. Add an idempotency guard in-process — read `whatsapp_webhook_logs` for
   `payload->entry[0].id` before inserting a message — **and return 200 on a duplicate**.
   *(mitigates §3.1.2 without waiting for schema; the durable unique index lands in Phase 2)*
4. Gate `POST /api/whatsapp-crm/auth/register` behind an invite/allow-list, or remove it.
5. Stop taking `tenant_id` from the query string; derive it from the token
   (`whatsappCrmDataController.js:41,83,135`).
6. Whitelist fields on the `/api/whatsapp-crm` write handlers (`:18,30,111,123`).
7. Apply the existing `WA_STATUS_RANK` monotonic guard to the webhook status path
   (`:188-234`) and scope it by `direction='outbound'`.
8. Reduce `100y` token lifetimes (`froWhatsAppAuthController.js:78,122`;
   `whatsappCrmAuthController.js:6`).

### Phase 2 — Additive schema migration (`183_whatsapp_inbox.sql`)
See §5 for the specification. Additive only; every statement `IF NOT EXISTS`; no `BEGIN`/
`COMMIT`; no `DO $$`; new tables prefixed `inbox_` (verified zero collisions across all 138
existing migrations).

### Phase 3 — Backend correctness (consumes Phase 2)
Webhook rewritten against the CRM model: signature verify → idempotency gate → ingest →
status events with monotonic ranks and reconciliation → media download moved off the request
path. Increment `unread_count` on inbound and add per-message `read_at`. Add ownership
predicates to every per-conversation handler. Use the recovered phone normaliser
(`froWhatsAppService.js:5-10`) on inbound. Catch the contact-creation race. Replace `.maybeSingle()`
with a bounded query. Remove hardcoded `'bsct'` fallbacks. Freeze template sends
(`template_id`/`template_params`/rendered text).

### Phase 4 — Frontend re-enable
Remove the `waDisabled` guard (`FROPanel.jsx:532-543`) and point `:1407-08` at the real
`WhatsAppChat`. Decide the fate of `/wa/*` (`App.jsx:225`) and the 9-line orphan
`WhatsAppPanel.jsx`. Mount the dead accounts pages behind a real `/accounts/whatsapp` route
+ `NAV_GROUPS` entry, or delete them. Wire `updateLabels`. Make search, project tabs and the
media strip reachable. Add pagination.

### Phase 5 — Feature surfacing
Wire the 18 already-built endpoints: AI suggestions/preview, broadcasts, routing rules,
analytics, template sync, `send-interactive`. Port tags, status lifecycle, claim/assign and
away message from `whtsapp/`.

---

## 5. Proposed migration `183_whatsapp_inbox.sql` — specification only

**Not written. This section is the design that would be reviewed before any file is created.**
`183` is free (highest existing is `182`; `181` is also unused and would keep the number
adjacent to the gap, but `183` was explicitly requested and is equally safe since nothing
executes these in order).

### 5.1 Tables proposed (all genuinely missing — nothing here duplicates an existing table)

| Table | Purpose | Replaces/augments |
|---|---|---|
| `inbox_webhook_events` | Meta delivery idempotency ledger. `dedupe_key` UNIQUE (`'<entry.id>'`), payload, `processed_at`, matched row ids | Augments `whatsapp_webhook_logs` (which has only a uuid PK and no unique constraint — §3.1.2) |
| `inbox_message_status_events` | One row per delivery/read receipt. `dedupe_key` UNIQUE (`'<wamid>:<status>:<timestamp>'`), `wa_message_id`, `status`, `event_timestamp`, error fields, `matched_message_id`, `applied_at` for retry | New. `messages.status` stays as the denormalised current state |
| `inbox_conversation_status_history` | Audit of every status/assignment transition | New (§3.3) |
| `inbox_tags` / `inbox_contact_tags` | Tag catalogue + contact↔tag join | New (§3.4). `conversations.labels` stays as-is |

### 5.2 Hard constraints this migration must respect

- **Additive only.** No `ALTER`/`DROP`/`TRUNCATE` on any existing table. No change to
  `conversations`, `messages`, `contacts`, `whatsapp_accounts`, `whatsapp_templates`.
- **No FKs added to existing tables.** New `inbox_*` tables may hold *one-way* references to
  `conversations(id)`, `messages(id)`, `contacts(id)` — they start empty so the constraints
  cannot fail on existing data, and they do not modify the parents.
- **Do NOT add a unique index to `messages.wa_message_id`.** This is the single most dangerous
  statement available: the missing-guard bug (§3.1.2) means duplicate `wa_message_id` values
  very likely already exist, so `CREATE UNIQUE INDEX` would **fail and abort the entire
  migration**. Dedupe must live on `inbox_webhook_events` instead. Any de-duplication of
  existing rows is a separate, explicitly-scoped, separately-approved operation.
- **Project/account isolation** via `whatsapp_account_id integer → whatsapp_accounts(id)` plus
  `project text`, matching the existing `conversations.project` convention
  (`bsct` / `aflf` / `mann` / `ucs`, lowercase). Do **not** introduce `ngos.id` isolation on the
  chat path — no existing chat table uses it. Do not rely on `tenant_id`; it is vestigial and
  always NULL (§2.4).
- **No CHECK constraints** on columns that existing code writes freely. Notably
  `conversations.status`, `messages.status` and `messages.direction` have **no** CHECK live, and
  adding one would reject rows the webhook has already written. New `inbox_*` tables may have
  CHECKs on their *own* columns only.
- **No credentials, tokens, passwords or `access_token` values** in any seed data.
- **No seed data at all**, beyond a single-row counter if one is needed.
- Timestamps `created_at`/`updated_at` as `timestamptz NOT NULL DEFAULT now()`.
- Index names `idx_inbox_<table>_<cols>` / unique `<table>_<col>_key`, per house style.

### 5.3 Validation before writing the file

1. Re-verify the live schema — the dump is from 2026-07-31 (§0).
2. Confirm `inbox_` still has zero collisions.
3. Confirm `183` is still free.
4. Dry-run the file against a scratch database wrapped in `BEGIN; ... ROLLBACK;`, following
   the existing harness pattern at `backend/scripts/verify-chat-migration.mjs:50-74`.

---

## 6. Files to modify (planned; none touched yet)

**Phase 1 — backend**
- `backend/src/middleware/whatsappSignature.js` *(new)* — port from `whtsapp/`
- `backend/src/routes/webhookRoutes.js:39-40` — attach the verifier
- `backend/src/controllers/whatsappWebhookController.js` — idempotency guard, rank-guarded
  status, scoping, `VERIFY_TOKEN` fallback removal, phone normalisation, race catch
- `backend/src/routes/whatsappCrmRoutes.js:8` — gate or remove public signup
- `backend/src/controllers/whatsappCrmAuthController.js:6,45-48,111-133`
- `backend/src/controllers/whatsappCrmDataController.js:18,30,41,83,111,123,135` — whitelists,
  token-derived tenancy
- `backend/src/controllers/froWhatsAppAuthController.js:78,122` — token lifetime
- `backend/src/services/froWhatsAppService.js:74-100,453-460,501-506,595-601,734-740` —
  ownership predicates, unread increment
- `backend/src/index.js:149-153` — CORS allow-list

**Phase 2 — schema**
- `backend/migrations/183_whatsapp_inbox.sql` *(new)*

**Phase 4 — frontend**
- `client/src/panels/fro/pages/FROPanel.jsx:1407-08,532-543` — re-enable
- `client/src/App.jsx:225` — `/wa/*` route disposition
- `client/src/panels/fro/components/enhanced/WhatsAppInbox.jsx:16-21,53,60,61,134-139,364-367`
  — tabs, search, media strip, pagination
- `client/src/panels/accounts/AccountsPanel.jsx:57-204,503-545` — mount account admin
- `client/src/panels/fro/api/whatsappEnhanced.js` — claim/assign/status calls

**Explicitly NOT to be modified:** anything under `whtsapp/`; any `.env` file.

---

## 7. Testing plan

No test tooling exists for this area beyond `npm test` (`node --test "src/**/*.test.js"`).
There is **no lint and no typecheck** script. Note `security:check` and
`security:check:staged` are both broken — `backend/scripts/security-check.mjs` does not exist.

**Unit** (`node --test`)
- Phone normaliser parity: inbound webhook path vs `froWhatsAppService.js:5-10`.
- `WA_STATUS_RANK` monotonicity: `sent` after `read` must not regress; `failed` is terminal.
- Away-window evaluator — port `whtsapp/away/away.service.js:83-131`, which is already written
  as a pure function for exactly this.
- Dedupe-key derivation is stable and collision-free for the three receipt statuses sharing one
  wamid.

**Integration** — requires a scratch database, never RDS
- Apply `183_whatsapp_inbox.sql` inside `BEGIN; ... ROLLBACK;`.
- Replay a captured webhook payload twice; assert exactly one message row.
- Deliver statuses out of order; assert final state is `read` and the ledger holds all three
  events.
- Deliver a status for a message that does not exist yet; assert `applied_at IS NULL`, then
  that reconciliation resolves it.
- Missing/incorrect `X-Hub-Signature-256` → 401, and **no** row written.
- Concurrent first contact → one contact row, no 500.

**Manual / smoke**
- Existing surfaces must be unchanged: receipts + `WhatsAppDeliveryBadge`, HR letters,
  FRO donor chat, broadcasts, AI settings, template sync.
- Confirm `GET /fro/whatsapp/conversations/unread-count` now returns non-zero.

---

## 8. Rollback plan

**There is no migration runner and no down-migration tooling** — `backend/migrations/*.sql` is
hand-applied, and no down file exists anywhere in the repo. Rollback is therefore manual and
must be written per phase.

| Phase | Rollback |
|---|---|
| 1 | `git revert` the commit. No data change. Safe. |
| 2 | The four `inbox_*` tables are **additive and unreferenced** until Phase 3, so rollback is `DROP TABLE inbox_webhook_events, inbox_message_status_events, inbox_conversation_status_history, inbox_contact_tags;` — but only before Phase 3 writes anything. **After Phase 3, dropping destroys history; instead leave the tables in place and stop writing to them.** Never roll back by touching existing tables. |
| 3 | `git revert`. New columns on existing tables, if any, must be additive-only and left in place on revert rather than dropped. |
| 4-5 | `git revert`. Frontend only; re-disabling the nav guard (`FROPanel.jsx:532-543`) restores the current behaviour. |

**Preconditions for any Phase 2 work:** a verified backup/pg_dump of RDS, and a dry run on a
scratch database. Never trial-run a migration against production.

---

## 9. Open questions — unresolved

These must be answered before Phase 2, and several before Phase 1:

1. **Is signature verification safe to enable immediately?** Enabling it before Meta's
   `X-Hub-Signature-256` is confirmed reaching this deployment will reject all inbound traffic.
   Needs the app secret and a live check.
2. **How many duplicate `wa_message_id` rows already exist in `messages`?** Determines whether
   the missing-index fix can ever be backfilled, and quantifies current data damage.
3. **Should `/api/whatsapp-crm/*` exist at all?** It has no role checks, open signup, 100y
   tokens, and a fourth role vocabulary that no guard honours. It may be better retired than
   secured. This is a product decision.
4. **Is `/wa/*` or `/fro/whatsapp-chat` the intended canonical inbox URL?** Both exist; one is
   orphaned.
5. **Are the `whatsapp-crm` self-service users real production users?** If yes, retiring that
   surface needs a migration path.
6. **`FROPanel.jsx:930` reads `loginData.agents || loginData.sessions` while
   `WhatsAppChat.jsx:74` reads `data.sessions || data.agents`** — inverted order. Which is
   correct? One of the two is silently wrong when only one field is present.
7. **Should `conversations.unread_count` be incremented, or replaced** by a per-agent read
   model? A shared inbox with multiple agents needs per-agent read state; a single integer
   counter cannot express it. This changes the Phase 2 schema.
8. **Do the dead accounts WhatsApp pages get revived or deleted?** `WhatsAppAgents.jsx` and
   `WhatsAppAccountsManager.jsx:145-187` duplicate agent-assignment logic, and there is currently
   **no HTTP surface for `whatsapp_accounts` CRUD at all**.
9. **Live schema confirmation** — everything in §2.2 is from a 2026-07-31 dump plus code
   inference. Nothing has been checked against the running RDS database.

---

## 10. Summary

The CRM already has a complete WhatsApp data model and a complete, if orphaned, inbox UI. The
work is **not** "add an inbox" — it is to fix a webhook that is unauthenticated and
non-idempotent, a status pipeline that can move backwards, an unread counter that is never
incremented, an authorization model that trusts caller-supplied ids, and a UI that was disabled
in August 2026 while its backend kept running. Roughly two thirds of the missing capability
already exists, complete and unused, in `whtsapp/`.

**Recommended next step:** review §3.0 and §3.1 with the team. The unread badge and the
unsigned webhook are user-visible and security-relevant respectively, and neither requires any
schema change, so they can proceed immediately and independently of everything else.