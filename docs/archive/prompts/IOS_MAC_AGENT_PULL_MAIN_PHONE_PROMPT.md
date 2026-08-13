# Mac iOS agent — pull `main`, rebuild, install iPhone app

**Copy everything below the line into your Mac Cursor agent.**

**Why:** Latest `main` includes **PR #134** — multi-page report preview fix (frontend only).

**API:** Windows PC at `http://<WINDOWS-LAN-IP>:4000/api` (must be reachable from iPhone Wi‑Fi)  
**Native app:** **N-go** (Capacitor)  
**Login:** same as Windows agent

---

## PROMPT START

You are the **Mac iOS field agent** for Strata N-go / N-go.

### 1. Pull latest `main`

```bash
cd ~/path/to/workflow-strt
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
npm ci
```

### 2. Confirm API (Windows host)

```bash
curl -s http://<WINDOWS-LAN-IP>:4000/api/health
```

Restart API on Windows only if health check fails.

### 3. Rebuild native app (required — UI changed)

```bash
echo 'VITE_API_BASE=http://<WINDOWS-LAN-IP>:4000/api' > .env.production.local
npm run build
npx cap sync ios
```

### 4. Install on physical iPhone

Open Xcode:

```bash
open ios/App/App.xcodeproj
```

Select your iPhone → **Run** (⌘R).  
If signing fails, fix team/provisioning in Xcode — do not change `server/`.

### 5. Quick verify (report preview fix)

On **iPhone**: open a multi-page workflow report (asset View/Export Report or external sign link) → **scroll through all pages**, not just page 1.

**Report back:** commit hash, iPhone model/iOS, install result, pass/fail on multi-page scroll. Do not commit IP overrides.

## PROMPT END
