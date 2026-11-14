# UCS Extractor (CRM module)

Business-lead capture, integrated into UCS CRM. The Chrome extension captures
publicly visible business listings, the CRM API normalises and stores them in
`ucs_crm`, and the Accounts panel exposes them under **Accounts → Extractor**
(directly below WhatsApp).

This is a native port of the standalone `UcsExtractor` project: capture, leads,
batches, CSV export and Gemini AI tagging. Discovery and the email finder are
not part of this build.

## Layout

```
extractor/
  extension/            vendored MV3 capture extension (TypeScript + esbuild)
    src/                content script, service worker, auto-run, side panel
    release/            built, loadable package (committed)
  tsconfig.base.json    compiler settings shared by the extension
```

Backend counterpart:

```
backend/src/extractor/                 phone engine, row hash, taxonomy, constants
backend/src/extractor/gemini.js         Gemini prompt/parse for lead tagging
backend/src/extractor/aiWorker.js       DB-backed tagging queue
backend/src/bootstrap/ensureExtractorSchema.js
backend/src/controllers/extractorController.js
backend/src/routes/extractorRoutes.js
backend/src/migrations/196_extractor.sql
backend/src/migrations/197_extractor_ai.sql
backend/scripts/extractor-import.mjs
```

## Database

All objects live in the existing `ucs_crm` database and are prefixed
`extractor_` so they cannot collide with CRM tables:

| Table | Purpose |
| --- | --- |
| `extractor_leads` | one row per business, keyed by `row_hash` (phone → website → name+address) |
| `extractor_capture_batches` | one row per capture run / auto-run batch |
| `extractor_capture_batch_items` | exact `(batch_id, row_hash)` membership |
| `extractor_ai_keywords` | the only vocabulary AI tags may use |

The schema mirrors the standalone extractor column-for-column (plus
`category_label`), so a later clone from Supabase needs no mapping.

Schema is created on every backend boot by `ensureExtractorSchema`. The SQL file
is the same DDL for reviewers or manual application.

## API

Mounted at `/api/accounts/extractor`, guarded with the `accounts` / `super_admin`
role.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/captures/batch` | validate → normalise → reject non-mobile → upsert |
| GET | `/leads` | filtered, paginated list |
| GET | `/leads/stats` | overview counters |
| PATCH | `/leads/:id` | lead status, owner, tags |
| GET | `/leads/export` | `format=whatsapp` or `format=full` CSV |
| GET | `/batches` | capture batches with counts |
| GET | `/ai/settings` | model, keyword list, queue counts |
| POST | `/ai/keywords`, `/ai/keywords/bulk` | add vocabulary (max 15) |
| DELETE | `/ai/keywords/:id` | remove a keyword |
| POST | `/ai/run` | `scope=pending\|failed\|all`, kicks the worker |
| DELETE | `/leads/:id`, `/batches/:batchId` | cleanup |
| GET | `/status` | table presence + counts (panel, extension test) |
| GET | `/extension.zip` | per-user package with the token injected |

Only **mobile** numbers are stored. Landlines, toll-free and unreadable numbers
are returned in `rejections` with a reason. `verification_status` is never
"verified" — `format_valid` means well-formed for its country.

## AI tagging

Leads start with `ai_status = 'pending'`. A DB-backed worker claims 12 at a
time, asks Gemini for tags/score/reason, and writes the verdict back. Rows left
in `running` by a crash are reset on boot, so nothing is lost. A slow model call
never blocks a capture.

```bash
# backend/.env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite   # optional override
```

Without a key the queue simply stays pending and **Accounts → Extractor → AI &
Settings** says so — it never invents tags. The model may only return keywords
from `extractor_ai_keywords`, so the AI filter always matches real tags. Remove
the key and tagging stops; rows keep whatever verdict they already had.

The panel exposes: keyword add/bulk-add/remove (cap 15), pending/tagged/failed
counts, **Tag pending**, **Retry failed** and **Re-tag all**. Leads can be
filtered by AI keyword, minimum score and AI status, and both export shapes
carry the tags and score.

## Extension

Build:

```bash
cd extractor/extension
npm install
npm run build        # writes release/
npm run typecheck    # optional
```

Load locally: `chrome://extensions` → Developer mode → **Load unpacked** →
`extractor/extension/release`.

For a per-user package (API base + token pre-filled), download it from
**Accounts → Extractor → Extension Setup**. The zip's `config.js` is injected
and prepended to the built service worker with `importScripts`; source-folder
loads fall back to `http://localhost:5000` and the side panel's token field.

## Importing existing Supabase data

```bash
# backend/.env
SOURCE_DATABASE_URL=postgres://...supabase...:6543/postgres
DATABASE_URL=postgres://...ucs_crm...

# dry run (default) — counts and quality checks only
node backend/scripts/extractor-import.mjs

# write, after snapshotting the target tables
node backend/scripts/extractor-import.mjs --apply
```

Guarantees:

- the source session is `READ ONLY`; Postgres rejects any write or DDL there;
- nothing in the target is deleted or truncated;
- `--apply` creates `extractor_*_backup_<stamp>` snapshots first;
- source and target pointing at the same database aborts the run;
- timestamps are copied as-is, never set to `now()`;
- re-runs are idempotent (`row_hash` / batch keys) and do not overwrite
  `lead_status`, `owner_name` or `tags`.
