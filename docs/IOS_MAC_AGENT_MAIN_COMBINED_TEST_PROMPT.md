# Mac iOS agent — combined test on `main` (Sync Center connectivity)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`c39f674`** or newer  
**API:** `http://10.7.62.140:4000/api` (Windows PC — must be reachable from iPhone Wi‑Fi)  
**Native app:** **N-go** (Capacitor)  
**Login:** same as Windows agent confirms

Windows already verified web + email share. **Your job is the native phone checks** Windows cannot run.

---

## PROMPT START

You are the **Mac iOS field agent** for Strata N-go / N-go.

### Setup

```bash
cd ~/path/to/workflow-strt
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
npm ci
```

Confirm API from Mac (same network as iPhone):

```bash
curl -s http://10.7.62.140:4000/api/health
```

Set API for native build (untracked local file):

```bash
echo 'VITE_API_BASE=http://10.7.62.140:4000/api' > .env.production.local
npm run build
npx cap sync ios
```

Install on **physical iPhone** via Xcode.

### Test 1 — Topbar is clean (no chip strips)

| Check | Expected |
|-------|----------|
| Dashboard topbar | Logo + icons only — **no** chip row or SYNC strip below topbar |
| Sync badge | Small badge visible — tap opens Sync Center |

### Test 2 — Sync Center: network widgets moved here

Tap **Sync badge** → Sync Center:

| Check | Expected |
|-------|----------|
| **Network & sync status** section | Present, **collapsed by default** |
| Expand section | Status chips (signal, server, pending, etc.) |
| SYNC telemetry row | Visible inside section; domain cards **collapsed by default** |
| Expand SYNC | Overview + Projects/Assets cards |
| **Diagnostics** (bottom) | Expand → **Open: …ms** perf chip + API Debug link |
| Collapse persistence | Collapse, close Sync Center, reopen — still collapsed (same session) |

### Test 3 — Sync still works

Go online → make a small change or tap **Sync Now** → no crash; badge updates.

**Report back:** commit hash, iPhone model/iOS, filled table pass/fail, screenshots if anything fails. Do not change `server/`. Fix S0/S1 in `src/`/`ios/` only — report first.

## PROMPT END
