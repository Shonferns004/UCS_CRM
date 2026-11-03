# DEPLOY — Full working-tree update (attendance/payroll + WhatsApp → OpenWA)

> **Merge/package/env conflicts ke liye alag guide hai: [`SETUP-AFTER-MERGE.md`](SETUP-AFTER-MERGE.md)**
> — pull ke baad kuch bhi toote to wahan dekho.

Ye document **poore pending kaam** ke liye hai jo is working tree me hai (3,000+
file changes), sirf attendance wale update ke liye nahi. Server pe isi order me
chalao.

---

## 1. Is update me kya-kya hai

| Group | Kya | Files |
|---|---|---|
| **Attendance / payroll** | Month ka last day fix (31 Oct), offline punch ka asli time + per-worker queue, `punch_method` save | backend + attendance app |
| **Payroll rule** | Unauthorized absence → 180 min grace charge (rule wapas) | backend + HR panel + apps |
| **Admin rollback** | Galti se kata 180 min grace wapas karne ka option | backend + admin app |
| **WhatsApp → OpenWA** | Purana `whatsapp/` gateway hata kar naya `openwa/` gateway; backend me `/api/openwa/*` proxy routes; client me naye WhatsApp screens | ~1,700 deleted + ~1,800 new |
| **Client** | Naye packages (react-table, i18next, linkify, lightbox…), index.css, apiBase, FRO/Accounts panels | client |
| **Housekeeping** | `.gitignore`, `backend/.env.example`, `start.bat`/`stop.bat`, bootstraps, watchdogs | misc |

**Naye backend files (pull ke baad milenge):**

```
backend/src/utils/punchTime.js
backend/src/utils/punchTime.test.js
backend/src/models/lateRollbackModel.js
backend/src/bootstrap/ensureLateRollbackSchema.js
backend/src/bootstrap/ensureWhatsAppSessionAssignmentSchema.js
backend/src/routes/openwa/*.js
backend/src/services/whatsappDeletionLog.js
backend/src/services/whatsappMessageDeleteIntent.js
```

**Naya DB table:** `salary_late_rollbacks` (server start pe auto-create).

**Deleted:** `whatsapp/` (1716 files) — naya `openwa/` uski jagah leta hai.

---

## 2. Server details

| Item | Value |
|---|---|
| Backend server | `192.168.1.100` (wahi machine jispe PostgreSQL hai) |
| Repo path | `C:\Users\Administrator\Desktop\UCS_CRM` |
| Backend port | `5000` |
| Public URL | `https://audio-diagnoses-ream.ngrok-free.dev` |
| Database | `postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm` |
| Node | `24.x` |
| Flutter | `3.47.5` |

### Dev DB vs server DB

| Environment | Database |
|---|---|
| Local dev (`backend/.env`) | `postgres://postgres:Shawn2004@localhost:5432/local_crm` |
| Office server (`192.168.1.100`) | `postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm` |

Local dev ko server ka data chahiye to (poora mirror, `public` schema replace
hota hai):

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM
.\scripts\sync-server-db-to-local.ps1
```

Ye `ucs_crm` ka snapshot le kar `local_crm` me restore karta hai aur row counts
compare karke dikhata hai. Live server dump ke dauraan bhi likhta rehta hai,
isliye 1-2 row ka drift normal hai — dobara chala do.

---

## 3. Step 1 — Code pull

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM

git fetch origin
git status --short
```

- Server pe local changes **nahi** chahiye:
  ```powershell
  git reset --hard origin/master
  ```

- Server ke local changes **bachane** hain:
  ```powershell
  git stash push -m "before full deploy"
  git merge --ff-only origin/master
  git stash pop        # conflict aaye to resolve
  ```

Verify:

```powershell
git log -1 --oneline
git status -sb        # clean hona chahiye
```

> Pull ke baad `whatsapp/` folder gayab ho jayega aur `openwa/` aa jayega —
> ye expected hai.

---

## 4. Step 2 — Dependencies (zaroori)

`client/package.json` + lock badle hain, isliye sirf pull se kaam nahi chalega.

```powershell
# 1) backend (deps change nahi hue, par safe)
cd C:\Users\Administrator\Desktop\UCS_CRM\backend
npm ci

# 2) client (naye packages)
cd ..\client
npm ci
npm run build          # dist/ banega

# 3) openwa gateway (naya project)
cd ..\openwa
npm ci                 # postinstall patches chalti hain, 3-5 min lag sakte hain
npm run build          # dist/main
```

---

## 5. Step 3 — Jo git me NAHI hai (server pe manually chahiye)

Ye cheezein `.gitignore` me hain — GitHub se nahi aayengi:

| Path | Kya | Kaise laayein |
|---|---|---|
| `backend/.env` | DB URL, JWT_SECRET, API keys | pehle se server pe hai — **mat chhero** |
| `openwa/.env` | OpenWA gateway secrets | is PC se copy karo: `openwa\.env` → server ke `openwa\.env` |
| `openwa/data/` | WhatsApp sessions, media, sqlite (1.2 GB) | **optional** — copy karo to sessions bache rahenge; nahi kiya to app se QR dobara scan karna padega |
| `openwa/dist/` | build output | `npm run build` se ban jayega |
| `node_modules/` | deps | `npm ci` se |

`openwa/.env` nahi hai to template se bana lo:

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\openwa
copy .env.minimal .env      # phir values edit karo
```

Backend ke `backend/.env` me gateway ka key match hona chahiye:

```
OPENWA_GATEWAY_API_KEY=<same key as openwa/.env me API_MASTER_KEY / gateway key>
```

---

## 6. Step 4 — Database

Auto: backend start pe `ensureLateRollbackSchema()` table bana deta hai.

Manual (agar auto fail ho):

```sql
CREATE TABLE IF NOT EXISTS salary_late_rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  salary_month TEXT NOT NULL,
  waived_minutes INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, salary_month)
);

CREATE INDEX IF NOT EXISTS idx_salary_late_rollbacks_month
  ON salary_late_rollbacks(salary_month);
```

Check:

```sql
\d salary_late_rollbacks
```

> Attendance app ka offline queue (SQLite) **device pe** hota hai — DB me kuch
> nahi karna. App khulte hi v1 → v2 migrate ho jata hai.

---

## 7. Step 5 — Restart (**ye step miss mat karna**)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM
stop.bat
timeout /t 3
start.bat
```

`start.bat` backend + ngrok dono uthata hai.

**Sirf backend** restart:

```powershell
for /f "tokens=5" %a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /F /PID %a
cd backend
start "" cmd /c "node src/index.js"
```

**OpenWA gateway** (agar use ho raha hai):

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\openwa
start "" cmd /c "npm run start:prod"
```

Port `2786` (ya jo `.env` me `PORT` hai) pe sunna chahiye.

---

## 8. Step 6 — Verify

### 8.1 Backend health

```powershell
curl.exe http://192.168.1.100:5000/api/health
curl.exe -H "ngrok-skip-browser-warning: true" https://audio-diagnoses-ream.ngrok-free.dev/api/health
```

Expected: `"status":"ok","db":"ok"`, `uptime_seconds` chhota.

### 8.2 Naya rollback route

```powershell
curl.exe -i "http://192.168.1.100:5000/api/salary/late-rollback/24c09374-2180-4e07-9d50-2d9fda9f0151?month=2026-10"
```

| Response | Matlab |
|---|---|
| `404` (HTML) | ❌ purana code — pull/restart nahi hua |
| `401 No token` | ✅ route live |
| `200` | ✅ poora live |

### 8.3 Attendance calendar

Kisi worker ka **October 2026** kholo → **31 Oct** ka cell dikhna chahiye.

### 8.4 WhatsApp / OpenWA

- Backend logs me `/api/openwa` routes load hone chahiye
- Gateway chal raha ho to: `http://192.168.1.100:2786/` (ya jo port ho)
- Dashboard se session connect karke test message

---

## 9. Step 7 — Apps build + distribute

### Admin app (rollback button isi me hai)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\apps\admin
flutter pub get
flutter build apk --release
```

APK: `build\app\outputs\flutter-apk\app-release.apk`

### Attendance app (offline punch fix)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\apps\attendance
flutter pub get
flutter build apk --release
```

### CRM web

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\client
npm ci
npm run build
```

`client/dist` ko pehle jaisa serve/deploy karo.

---

## 10. Admin app me 180-min rollback

1. Admin app → bottom nav **Attendance**
2. Naam search → worker card tap
3. Month select (jis month ka rollback karna hai)
4. Month bar ke niche card:
   ```
   ↺  Late deduction: 2.5 day(s)
      1032 late min · roll back the 180 min grace     [ Rollback ]
   ```
5. **Rollback** → reason → **Roll back 180 min**
6. Green card:
   ```
   ↺  Late deduction: 2 day(s)
      180 min grace rolled back · 1032 late min       [ Manage ]
   ```

Undo: **Manage → Remove rollback**.

Rules:

- Rollback = worker ka grace (default **180 min**), days nahi
- Sirf tab jab us month me deduction > 0
- Max = `late minutes + grace` (jab absence ne grace charge kiya ho)
- Reason mandatory (audit trail)
- Turant asar: salary breakdown, payroll sheet, pagar export, attendance report

---

## 11. Troubleshooting

| Symptom | Reason | Fix |
|---|---|---|
| Admin app: *"This server does not have the rollback feature yet"* | backend purana | pull + restart |
| Rollback route 404 | restart nahi hua | Step 5 |
| `403 Access denied` | role allowed nahi | `super_admin` / `admin` / `hr` / `accounts` |
| Card hai par button disabled | us month ka deduction 0 | kuch rollback karne ko nahi |
| Card hi nahi dikhta | purana app build | admin app rebuild |
| 31 Oct nahi dikh raha | backend restart nahi | restart + app/browser refresh |
| Client build fail: module not found | `npm ci` nahi chala | `cd client; npm ci` |
| OpenWA start fail | `openwa/.env` missing / deps | Step 3 + `npm ci` + `npm run build` |
| WhatsApp messages deliver nahi ho rahe | gateway band / key mismatch | gateway start + `OPENWA_GATEWAY_API_KEY` match |

---

## 12. Rollback of this release

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM

git log --oneline -5
git reset --hard <purana-commit>     # ya: git revert <commit>

stop.bat && start.bat
```

Data:

```sql
DELETE FROM salary_late_rollbacks;                          -- saare rollbacks
DELETE FROM salary_late_rollbacks
 WHERE worker_id='<uuid>' AND salary_month='2026-10';       -- ek worker
```

> `openwa/` ka `data/` folder delete mat karo — sessions wahi hain.

---

## 13. Checklist

- [ ] `git fetch` + `git reset --hard origin/master` (ya stash + merge)
- [ ] `git log -1` → latest commit
- [ ] `backend`: `npm ci`
- [ ] `client`: `npm ci` + `npm run build`
- [ ] `openwa`: `npm ci` + `npm run build`
- [ ] `openwa/.env` server pe maujood (copy/template)
- [ ] `openwa/data` copy kiya (optional, sessions ke liye)
- [ ] `salary_late_rollbacks` table exist
- [ ] `stop.bat` + `start.bat`
- [ ] `/api/health` → ok, uptime chhota
- [ ] rollback route → 401/200 (404 nahi)
- [ ] Worker ka October → 31 Oct visible
- [ ] Admin app rebuild + install
- [ ] Attendance app rebuild + install
- [ ] CRM web `dist` deploy
- [ ] OpenWA gateway running + session connected
