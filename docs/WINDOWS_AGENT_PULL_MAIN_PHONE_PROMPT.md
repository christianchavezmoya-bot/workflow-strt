# Windows agent — pull `main`, restart dev, install Android app

**Copy everything below the line into your Windows Cursor agent.**

**Why:** Latest `main` includes **PR #134** — multi-page report preview fix (frontend only).

**API host (this PC):** `http://<YOUR-LAN-IP>:4000/api`  
**Login:** `admin@commtrac.local` / `Admin123!`

---

## PROMPT START

You are the **Windows web/API agent** for Strata N-go.

### 1. Pull latest `main`

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
npm ci
```

### 2. Restart API (if already running)

Stop the old API process, then:

```powershell
cd server\Commtrac.Api
dotnet run
```

Confirm: `curl http://localhost:4000/api/health` → OK  
(Optional) LAN: `curl http://<YOUR-LAN-IP>:4000/api/health`

### 3. Restart frontend (required — UI changed)

Stop old Vite dev server, then from repo root:

```powershell
npm run dev
```

Web: **http://localhost:5173**

### 4. Install / refresh Android phone app

Set API to this PC’s LAN IP (untracked local file):

```powershell
echo VITE_API_BASE=http://<YOUR-LAN-IP>:4000/api > .env.production.local
npm run build
npx cap sync android
```

Build + install (phone on USB, USB debugging on):

```powershell
# Git Bash or WSL:
source scripts/android-env.sh
cd android
./gradlew installDebug
```

APK path if sideloading: `android\app\build\outputs\apk\debug\app-debug.apk`

If firewall blocks phone: run `allow-network-access.ps1` as admin (ports 5173 + 4000).

### 5. Quick verify (report preview fix)

On **web** and **phone**: open a multi-page workflow report (View/Export Report or customer sign preview) → **scroll through all pages**, not just page 1.

**Report back:** commit hash, whether API/frontend were restarted, phone install result, pass/fail on multi-page scroll. Do not commit IP overrides.

## PROMPT END
