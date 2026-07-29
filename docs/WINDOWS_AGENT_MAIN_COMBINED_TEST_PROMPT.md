# Windows agent — combined test on `main` (connectivity + email share)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ **`c39f674`** or newer  
**API host (this PC):** `http://10.7.62.140:4000/api`  
**Web dev:** `http://localhost:5173` (or `http://10.7.62.140:5173` from another device)  
**Login:** `admin@commtrac.local` / `Admin123!`

Both fixes are now on **`main`**: (1) network chips removed from web, moved to native Sync Center; (2) bulk report email share shows signatures in preview + ZIP.

---

## PROMPT START

You are the **Windows web/API agent** for Strata N-go.

### Setup

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
npm ci
```

**Terminal 1 — API** (must listen on LAN for phone/Mac later):

```powershell
cd server\Commtrac.Api
dotnet run
```

Confirm: `curl http://10.7.62.140:4000/api/health` → OK

**Terminal 2 — Web:**

```powershell
npm run dev
```

Open **http://localhost:5173** in a desktop browser (wide window).

### Test 1 — Web: no network chips (connectivity fix)

| Check | Expected |
|-------|----------|
| Topbar on Dashboard / Assets | **No** SYNC strip, **no** "Has signal" chips below topbar |
| Mobile web (~390px DevTools) | Same — clean topbar |
| Sync badge | **Not** shown on web (native only) |

### Test 2 — Bulk reports + email signatures

1. Assets → pick assets with **signed** completed workflows (e.g. CAD0017)
2. **View / Print Reports** → preview shows signatures
3. **Email / Share** → send **new** email (old share links are stale)
4. Open **Preview** link from email → `/share/reports/{id}` viewer with signatures in iframe
5. Download ZIP → PDFs have signatures

### Test 3 — Quick smoke

Login, Dashboard, open asset — no errors.

**Report back:** commit hash, pass/fail for each test, any console errors. Do not merge. Do not commit IP overrides.

## PROMPT END
