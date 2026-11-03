# SETUP AFTER MERGE — conflicts, packages, env, DB

Merge/pull ke baad jo **conflicts, package errors aur env problems** aati hain,
sabka step-by-step fix yahan hai. Order me chalao — jahan atak jao, us section
ka error table dekho.

> Golden rule: **`.env` aur `data/` folders kabhi git me nahi hain** — isliye
> `git reset --hard` bhi unhe nahi chhedta. Tension sirf code files ki hai.

---

## 0. Pehle backup (5 minute, skip mat karna)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM

# 1) purani state ka branch (wapas jaana ho to switch karna)
git branch backup-before-merge

# 2) env files alag copy
$b = "C:\backup-ucs-$(Get-Date -Format yyyyMMdd-HHmm)"
New-Item -ItemType Directory -Force -Path $b | Out-Null
Copy-Item backend\.env  "$b\backend.env"
if (Test-Path openwa\.env) { Copy-Item openwa\.env "$b\openwa.env" }

# 3) WhatsApp sessions bachane hain to (optional, 1.2 GB)
# robocopy openwa\data "$b\openwa-data" /E /NFL /NDL /NJH /NJS

Write-Host "backup: $b"
```

DB dump (optional, safe):

```powershell
pg_dump "postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm" -F c `
  -f "$b\ucs_crm.dump"
```

---

## 1. Merge — 3 scenarios me se ek chuno

### A) Server pe koi local code change nahi (RECOMMENDED)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM
git fetch origin
git status --short            # sirf ?? (untracked) dikhna chahiye
git reset --hard origin/master
```

✅ Isme **koi conflict nahi aata**. `.env`, `openwa/.env`, `openwa/data`,
`uploads/` — sab ignored hain, safe rehte hain.

### B) Server pe local changes bachane hain

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM
git fetch origin
git stash push -u -m "server-local-before-merge"   # -u = untracked bhi
git merge --ff-only origin/master
git stash pop                                       # yahan conflicts aa sakte hain
```

Conflict aaye to Section 2.

### C) Merge pehle se mess up ho gaya

```powershell
git merge --abort          # merge cancel
# ya
git reset --hard origin/master   # sab clean, local code chala jayega
```

---

## 2. Conflict resolution — cheat sheet

### 2.1 Pehle dekho kya conflict hai

```powershell
git status --short
```

| Code | Matlab |
|---|---|
| `UU` | dono side badla — **manually resolve karo** |
| `AA` | dono side ne file add ki |
| `DU` | humne delete, unke yahan changed |
| `UD` | humne changed, unke yahan delete |
| `M ` | staged, theek hai |

### 2.2 Ek-ek file ka faisla

```powershell
# incoming (origin/master) version rakho
git checkout --theirs -- <file>
git add <file>

# apna (server) version rakho
git checkout --ours -- <file>
git add <file>

# file kholo, <<<<<<< markers hatao, dono ke changes milao
notepad <file>
git add <file>
```

> `--ours` = tumhari current branch (server ka purana code)
> `--theirs` = jo merge ho raha hai (origin/master = naya code)

### 2.3 Kaunsi file pe kya karna hai (jo normally conflict karti hai)

| File | Kya karo |
|---|---|
| `package-lock.json` (root/client) | **kabhi manually merge mat karo** → `git checkout --theirs -- package-lock.json` → `npm install` |
| `pubspec.lock` (flutter) | `git checkout --theirs -- pubspec.lock` → `flutter pub get` |
| `client/src/lib/apiBase.js` | incoming rakho (ngrok default + `/api` normalize) |
| `client/src/index.css` | dono ke blocks rakho — CSS me merge safe hai |
| `backend/src/index.js` | incoming rakho; agar server pe koi **local hotfix** tha to wo manually wapas add karo |
| `.env` / `openwa/.env` | conflict aata hi nahi (ignored) — agar aaya to git se nikal do: `git rm --cached .env` |

### 2.4 Markers bache hain? (safety check)

```powershell
git diff --check
Select-String -Path backend\src\*.js,client\src\**\*.js,client\src\**\*.jsx -Pattern "<<<<<<<|>>>>>>>|=======" -List
```

Kuch mile to wahi file dobara fix karo.

### 2.5 Merge complete

```powershell
git add -A
git commit            # merge ke waqt message auto aata hai
git log -1 --oneline
```

---

## 3. Package conflicts (npm)

### 3.1 Node version pehle check karo

```powershell
node -v      # v24.x hona chahiye (backend/package.json: engines node 24.x)
npm -v
```

Galat version ho to nvm/fnm se 24 laga lo — warna `ERESOLVE`/native build errors
aayenge.

### 3.2 Har project me fresh install

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\backend
rmdir /s /q node_modules
del package-lock.json 2>$null   # (git-tracked nahi hai to hi)
npm ci

cd ..\client
rmdir /s /q node_modules
npm ci

cd ..\openwa
rmdir /s /q node_modules
npm ci
```

### 3.3 Common npm errors → fix

| Error | Fix |
|---|---|
| `npm ERR! ERESOLVE unable to resolve dependency tree` | `npm ci --legacy-peer-deps` |
| `npm ERR! EINTEGRITY` / hash mismatch | `npm cache clean --force` → `npm ci` |
| `npm ERR! ENOENT package-lock.json` | `npm install` (lock generate karega) |
| `npm ERR! code EPERM` (file lock) | backend/client ke saare node/cmd band karo → retry |
| `npm WARN EBADENGINE` | Node version galat — 24.x karo |
| `MODULE_NOT_FOUND` start pe | `rmdir node_modules` → `npm ci` |
| openwa `postinstall` fail | `npm ci --ignore-scripts` → `node scripts/postinstall.js` |
| `node-gyp` / `sharp` / native build fail | (admin PowerShell) `npm ci --build-from-source` ya Visual Studio Build Tools install |
| path too long | `git config --system core.longpaths true` |
| PowerShell script blocked (`.ps1`) | `Set-ExecutionPolicy -Scope Process Bypass` |

### 3.4 Build steps (install ke baad)

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\openwa
npm run build            # dist/main banega

cd ..\client
npm run build            # dist/ banega
```

---

## 4. Flutter conflicts

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\apps\admin
flutter clean
rmdir /s /q .dart_tool 2>$null
flutter pub get
flutter build apk --release

cd ..\attendance
flutter clean
rmdir /s /q .dart_tool 2>$null
flutter pub get
flutter build apk --release
```

| Error | Fix |
|---|---|
| `Because ... depends on ... version solving failed` | `pubspec.lock` delete → `flutter pub get` |
| `Gradle task assembleDebug failed` | `cd android; .\gradlew clean` phir build |
| `Unsupported class file major version` | Java **17** install karo (`flutter doctor -v`) |
| `SDK location not found` | `flutter config --android-sdk <path>` |
| `Could not resolve package` | `flutter pub cache repair` |
| APK sign error | `apps/*/android/key.properties` + keystore check |

---

## 5. ENV setup (sabse zyada yahan galti hoti hai)

`.env` git me nahi hain, isliye naye keys **manually** add karne padte hain.
Naya code purani `.env` ke saath chal jata hai, par naye features chup-chaap fail
hote hain (jaise WhatsApp gateway).

### 5.1 Backend — `backend/.env`

Ye keys hona **zaroori** hain (is release ke liye):

```ini
# --- OpenWA gateway (naya) ---
OPENWA_GATEWAY_URL=http://localhost:3001
OPENWA_GATEWAY_API_KEY=<same key jo openwa/.env me gateway API key hai>
OPENWA_GATEWAY_TIMEOUT_MS=15000
# backwards-compatible aliases
OPENWA_URL=http://localhost:3001
OPENWA_API_KEY=<same as above>
```

Purani keys jo waise hi rehni chahiye:

```ini
DATABASE_URL=postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm
JWT_SECRET=...            # same rakho, warna sab logout ho jayenge
PORT=5000
WS_PORT=5001
```

**Missing keys check karo** (`.env.example` vs `.env`):

```powershell
$envKeys = (Get-Content backend\.env | Where-Object { $_ -match '^[A-Z0-9_]+=' } | ForEach-Object { ($_ -split '=')[0] })
$exKeys  = (Get-Content backend\.env.example | Where-Object { $_ -match '^[A-Z0-9_]+=' } | ForEach-Object { ($_ -split '=')[0] })
Compare-Object $envKeys $exKeys | Where-Object SideIndicator -eq '=>' | Select-Object -ExpandProperty InputObject
```

Jo list aaye wo optional/new keys hain — dekh lo kaunsi chahiye (`HEAD_AWS_*`,
`SEVAK_SUPABASE_*`, `REALTIME_TRANSPORT`, `LOCAL_DB_ACCESS_RULE_TTL_HOURS`).

### 5.2 OpenWA — `openwa/.env`

Server pe ye file **nahi hai** (gitignored). Banao:

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\openwa
copy .env.minimal .env
notepad .env
```

Minimum values:

```ini
PORT=3001
NODE_ENV=production

DATABASE_TYPE=postgres
DATABASE_HOST=192.168.1.100
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=bsct_2014
DATABASE_NAME=ucs_crm
POSTGRES_SCHEMA=openwa
DATABASE_SYNCHRONIZE=false
DATABASE_SSL=false

AUTO_START_SESSIONS=true
ENGINE_TYPE=whatsapp-web.js
SESSION_DATA_PATH=./data/sessions
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/media

REDIS_ENABLED=false
QUEUE_ENABLED=false
CACHE_ENABLED=false
```

⚠️ Gateway ka **API key** wahi hona chahiye jo backend ke
`OPENWA_GATEWAY_API_KEY` me hai, nahi to backend ko `401` milega.

### 5.3 JWT_SECRET change mat karo

Change karne se saare users (web + apps) logout ho jayenge aur purane tokens
invalid ho jayenge. Sirf tab badlo jab security incident ho.

---

## 6. Database setup

### 6.1 Backend table (auto)

Backend restart pe `ensureLateRollbackSchema()` ye table bana deta hai:

```sql
\d salary_late_rollbacks
```

Manual chahiye to:

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
```

### 6.2 OpenWA schema (must)

Gateway alag schema use karta hai (`POSTGRES_SCHEMA=openwa`), aur
`DATABASE_SYNCHRONIZE=false` hai — matlab **migrations chalane padenge**:

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM\openwa
npm run migration:run
```

Schema pehle se nahi hai to:

```sql
CREATE SCHEMA IF NOT EXISTS openwa;
```

Verify:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'openwa' ORDER BY 1;
```

---

## 7. Restart + smoke test

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM
stop.bat
timeout /t 3
start.bat

# OpenWA gateway (alag window)
cd openwa
start "" cmd /c "npm run start:prod"
```

### Checks

```powershell
# 1) backend
curl.exe http://127.0.0.1:5000/api/health
# {"status":"ok","db":"ok",...} + uptime chhota

# 2) rollback route (404 = purana code)
curl.exe -i "http://127.0.0.1:5000/api/salary/late-rollback/24c09374-2180-4e07-9d50-2d9fda9f0151?month=2026-10"
# 401 = live

# 3) openwa gateway
curl.exe http://127.0.0.1:3001/
# HTML/JSON aana chahiye (connection refused = gateway band)

# 4) tunnel
curl.exe -H "ngrok-skip-browser-warning: true" https://audio-diagnoses-ream.ngrok-free.dev/api/health
```

UI checks:

- [ ] Attendance calendar me **31 Oct** dikh raha hai
- [ ] Admin app → worker → October → **rollback card** dikh raha hai
- [ ] WhatsApp panel khul raha hai, session connected hai, test message gaya
- [ ] Login/logout works (JWT intact)

---

## 8. Bada error → fix table

| Error (jahan dikhe) | Asli wajah | Fix |
|---|---|---|
| `Cannot find module './routes/openwa/index.js'` | pull adhoora / untracked files missing | `git status`, phir `git reset --hard origin/master` |
| `EADDRINUSE :5000` | purana backend band nahi hua | `stop.bat` ya `netstat -ano \| findstr :5000` → `taskkill /F /PID <pid>` |
| `EADDRINUSE :3001` | gateway pehle se chal raha | purana process kill |
| `relation "openwa.xxx" does not exist` | migrations nahi chali | `npm run migration:run` |
| `password authentication failed` | `DATABASE_PASSWORD` galat | `openwa/.env` / `backend/.env` check |
| `OpenWA gateway is not configured` | backend `.env` me `OPENWA_GATEWAY_URL` nahi | Section 5.1 |
| WhatsApp panel 502/504 | gateway band ya port galat | gateway start + URL/port match |
| `401` gateway pe | API key mismatch | backend key = openwa key |
| Rollback card: *"does not have the rollback feature"* | backend purana | pull + restart |
| `403 Access denied` | role allowed nahi | `super_admin`/`admin`/`hr`/`accounts` |
| Client build: `Module not found` | `npm ci` nahi chala | Section 3.2 |
| `ENOSPC` / disk full | 1.9 GB openwa + node_modules | disk free karo |
| App purana UI dikha raha | APK rebuild nahi hua | Section 4 |

---

## 9. Sab kuch galat ho gaya? — full rollback

```powershell
cd C:\Users\Administrator\Desktop\UCS_CRM

git checkout backup-before-merge      # ya: git reset --hard <purana-commit>
stop.bat
start.bat

# env backup se wapas
Copy-Item "C:\backup-ucs-*\backend.env" backend\.env -Force
```

DB side (agar rollback wali table hataani ho):

```sql
DELETE FROM salary_late_rollbacks;
-- DROP SCHEMA openwa CASCADE;   -- sirf tab jab gateway bilkul use nahi karna
```

---

## 10. Checklist (print karo)

- [ ] Backup branch + `.env` copies banayi
- [ ] `git reset --hard origin/master` (ya stash + merge)
- [ ] `git status` clean, `git log -1` naya commit
- [ ] Node 24 check
- [ ] `backend`: `npm ci`
- [ ] `client`: `npm ci` + `npm run build`
- [ ] `openwa`: `npm ci` + `npm run build`
- [ ] `openwa/.env` bana (DB + port 3001 + api key)
- [ ] `backend/.env` me `OPENWA_GATEWAY_URL` + key
- [ ] `JWT_SECRET` unchanged
- [ ] `salary_late_rollbacks` table exist
- [ ] `openwa` schema + migrations run
- [ ] `stop.bat` + `start.bat`
- [ ] gateway `npm run start:prod` (port 3001)
- [ ] health ok, rollback route 401/200
- [ ] 31 Oct calendar me visible
- [ ] Admin app rollback card visible
- [ ] WhatsApp session connected + test message
- [ ] Admin/Attendance APK rebuild + install
