# Mac iOS agent — N-go native app latest verification (`main`)

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `main` @ **`d542f2d`** or newer

**API:** `http://172.20.8.16:4000/api` (Windows dev server — confirm reachable from iPhone Wi‑Fi)

**Native app name:** **N-go** (home screen label)

**In-app / web branding:** **Strata N-go**

**Goal:**
1. Fresh install of **N-go** on physical iPhone from latest `main`
2. Sanity pass for prior field fixes + new branding
3. **Matrix row 9** — **12-hour JWT token expiry** idle test (720 min in `appsettings.json`)

**References:**
- `docs/OFFLINE_CLOSURE_GUIDE.md`
- `docs/OFFLINE_ACCEPTANCE_MATRIX.md` (row 9)
- `docs/IOS_MAC_AGENT_SANITY_CHECK_PROMPT.md` (baseline checks)

---

## PROMPT START

You are the **Mac iOS field agent** for **Strata N-go / N-go**.

1. Pull **`main`**, build, install on **physical iPhone**
2. Confirm **N-go** branding on device
3. Run sanity checks below (~45 min active testing)
4. **Start or complete matrix row 9** (12 h idle — plan ahead)
5. Post filled results table

Do **not** modify `server/`. You may fix `src/` / `ios/` only for S0/S1 bugs — report first.

**Phone web browser layout (Option B) is tested on Windows — not your scope.** You test the **Capacitor native app only.**

---

## Part 0 — Checkout + build

```bash
cd ~/path/to/workflow-strt   # or clone fresh
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline    # expect d542f2d or newer
npm ci
```

Verify API from Mac (same network as phone):

```bash
curl -s http://172.20.8.16:4000/api/health
```

Build for device:

```bash
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode: **physical iPhone** → signing `com.christianchavez.kinet` → **Product → Run** (⌘R).

---

## Part 1 — N-go branding (native)

| Check | PASS if |
|-------|---------|
| **Home screen icon label** | **N-go** (not Kinet / Commtrac) |
| Login screen welcome (first-time) | **Welcome to Strata N-go** (or brand setting override) |
| Native topbar | Strata logo; **no** “Full View / Minimal View” chip |
| Bottom tab bar | Visible (Dashboard, Projects, Assets, …) |
| **No** desktop left sidebar | Sidebar absent on native |

Optional: Settings → App name in admin web should show **Strata N-go**; native label stays **N-go**.

Screenshot: home screen showing **N-go** under icon + in-app login/header.

---

## Part 2 — Bootstrap (once per install)

| Step | PASS if |
|------|---------|
| Online → **Sync Center** (sync badge) | Panel loads |
| **Download now** | Completes; **Ready** or **Data may be stale** |
| Badge when idle online | **Synced** |

---

## Part 3 — Sanity regression (~30 min)

### 3a — Startup connectivity

| PASS if |
|---------|
| Force-quit → reopen online: no stuck **“Server not responding”** within 60 s while API health OK |

### 3b — Sync overlay + 3D logo

| PASS if |
|---------|
| Airplane ON → save 3–5 workflow steps → pending > 0 |
| Reconnect → overlay with **continuous** 3D Strata logo spin; clears after sync |

### 3c — Capture table sticky headers

| PASS if |
|---------|
| Capture table scroll: Asset Tag + feature + sign-off headers stay pinned; no overlap |

### 3d — Documents + Tips offline

| PASS if |
|---------|
| After bootstrap, airplane ON: Documents + Tips lists visible |
| PDF + DOCX preview offline (DOCX full page, pinch zoom) |
| Reconnect: no full re-download of every document |

### 3e — Native workflow (randomId on secure context)

| PASS if |
|---------|
| Complete 2–3 workflow steps with photo/issue; no crash |
| Native webview has `crypto.randomUUID` — this validates field flows on device |

---

## Part 4 — Matrix row 9: 12-hour token expiry

JWT lifetime = **720 minutes (~12 hours)** (`Jwt:ExpiresMinutes` in API config).

This test **requires real idle time**. Plan on day 1; finish on day 2.

### Setup (before idle)

1. Log in on device; confirm **Synced**.
2. Airplane **ON** → make **one offline write** (save workflow step or similar).
3. Sync Center → confirm **pending > 0**.
4. Note time: `____` (local).
5. Force-quit app. Leave phone **offline or online** — either is OK for expiry test; document which you used.

### After 12+ hours idle

1. Open **N-go** (radio ON if you left offline).
2. If token expired → app should prompt **re-login** (connectivity may show **token expired**).
3. Log in again with same user.

| PASS if |
|---------|
| **Pending queue preserved** after re-login (pending count ≥ what you queued before idle) |
| Queue **flushes** after reconnect; no data loss |
| Sync overlay may appear during flush — OK |

| FAIL if |
|---------|
| Pending queue empty after re-login with no sync |
| Duplicate or lost workflow writes |

Record: idle duration `____` h, offline/online during idle, pass/fail.

**Tip:** You cannot shorten this test — JWT expiry is server-configured at 12 h.

---

## Part 5 — Deliverables

Post this table filled in:

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Install @ main (d542f2d+) | | commit hash |
| Home screen name **N-go** | | |
| In-app **Strata N-go** branding | | |
| No Full/Minimal toggle (native) | | |
| Bootstrap Ready | | |
| Startup connectivity | | |
| Sync overlay + 3D logo | | |
| Capture table headers | | |
| Documents/Tips offline | | |
| Reconnect doc sync | | |
| Native workflow steps | | |
| **Row 9: 12 h token expiry** | | idle ___ h; queue preserved? |

Include:
- iPhone model + iOS version
- `git log -1 --oneline`
- Screenshots: home screen **N-go**, login Strata N-go, sync overlay, row 9 result (Sync Center pending before/after)

**If sanity passes + row 9 passes:** reply **“N-go native OK — matrix row 9 signed off”** for human Layer C sign-off.

**If row 9 not finished yet:** reply **“Sanity OK — row 9 in progress (idle until ___)”**.

---

## PROMPT END

**Windows agent** handles HTTP LAN web + invite/`randomId` + phone **browser** shell — see `docs/WINDOWS_AGENT_RANDOMID_MOBILE_WEB_PROMPT.md`.
