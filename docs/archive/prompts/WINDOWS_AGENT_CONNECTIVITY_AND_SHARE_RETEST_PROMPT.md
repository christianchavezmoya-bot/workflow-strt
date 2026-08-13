# Windows agent — connectivity UI relocation + email share signature re-test

**Copy everything below the line into your Windows Cursor agent.**

**Branches:**

- **Connectivity UI:** `cursor/connectivity-sync-center-ui-cd21` (new PR)
- **Bulk reports + email share fix:** `cursor/bulk-workflow-reports-web-cd21` (PR #42) — re-test signatures after merge or checkout that branch

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt`

**Goal:** Verify (A) network/connectivity widgets moved into Sync Center on **native phone only**, removed from **all web** views; (B) bulk report **email share** preview links show signatures in PDFs (commit `b37d66e` on PR #42 branch).

**Default admin:** `admin@commtrac.local` / `Admin123!`

---

## PROMPT START

You are the **Windows web/API + native smoke agent** for **Strata N-go** (Commtrac Codex 915).

Your job:

1. Check out the connectivity branch (and optionally PR #42 branch for email share re-test)
2. Run API + web locally; use Android emulator or physical device for native checks
3. Verify connectivity UI relocation (Part A)
4. Re-test email share signatures if PR #42 branch is available (Part B)
5. Post filled results tables

**Rules:**

- **Never** commit machine-specific IP overrides or API keys
- You **may** fix S0/S1 bugs in layout/connectivity UI or share viewer only — report first for S2
- Do **not** merge PRs unless explicitly asked
- Do **not** change users, roles, projects, settings, assets workflows, or unrelated API code

---

## Part 0 — Checkout

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust if different
git fetch origin
git checkout cursor/connectivity-sync-center-ui-cd21
git pull origin cursor/connectivity-sync-center-ui-cd21
git log -1 --oneline
npm ci
```

For email share re-test (Part B), also fetch PR #42 branch:

```powershell
git fetch origin cursor/bulk-workflow-reports-web-cd21
# Test Part B on that branch after Part A passes, or merge both locally
```

---

## Part 1 — Start API + web

**Terminal 1 — API (port 4000):**

```powershell
cd server\Commtrac.Api
dotnet run
```

**Terminal 2 — Web (port 5173):**

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt
npm run dev
```

---

## Part A — Connectivity UI relocation

### A1 — Desktop web (wide browser, not phone emulation)

Sign in as Admin. Navigate Dashboard, Projects, Assets.

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| No connectivity chip strip below topbar | Topbar only — no "Has signal", "SYNC", etc. strips | | |
| No sync telemetry panel on any page | No horizontal SYNC domain cards under topbar | | |
| Page content not clipped under topbar | Main content starts below topbar (~80px padding on narrow desktop if resized) | | |
| Sync badge absent on desktop | `SyncStatusBadge` is native-only | | |

### A2 — Mobile web (Chrome DevTools ~390px width, **not** Capacitor)

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| No connectivity strips | Same as desktop — clean topbar | | |
| Bottom tab bar still works | Navigation OK | | |

### A3 — Native phone app (Capacitor Android or iOS)

Build with LAN API if needed:

```powershell
# Set VITE_API_BASE in .env.production.local to http://<LAN-IP>:4000/api
npm run build
npx cap sync
# Android: source scripts/android-env.sh; cd android; ./gradlew assembleDebug
```

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| Dashboard topbar clean | No chip row or SYNC strip below logo/actions | | |
| Sync badge visible | Compact badge in topbar (tap to open Sync Center) | | |
| Sync Center → "Network & sync status" | Section present, **collapsed by default** | | |
| Expand network section | Status chips visible (signal, server, pending, etc.) | | |
| SYNC telemetry inside section | SYNC row visible; domain cards **collapsed by default** | | |
| Expand SYNC telemetry | Overview + Projects/Assets cards appear | | |
| Collapse state persists in session | Collapse section, close Sync Center, reopen — still collapsed | | |
| Diagnostics accordion | At bottom; expand → "Open: …ms" perf chip + API Debug link | | |
| Pull-to-refresh | Indicator appears below topbar (not hidden under strips) | | |
| Offline readiness panel | Still at top of Sync Center (unchanged) | | |

---

## Part B — Email share signature re-test (PR #42 branch)

> **Important:** Send a **new** share email after checkout — old share links contain PDFs generated before the fix.

On branch `cursor/bulk-workflow-reports-web-cd21` (or after merge to main):

1. Desktop web → Assets → select assets with **completed signed workflows**
2. **View / Print Reports** → verify signatures in dialog preview (baseline)
3. **Email / Share** → send to your test inbox
4. Open **Preview** link from email (`/share/reports/{id}`)
5. Select a signed report in explorer → iframe preview must show signatures
6. Download ZIP from viewer → open PDFs → signatures present

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| Preview link opens viewer (not raw ZIP download) | Explorer + iframe UI | | |
| Iframe PDF shows signatures | Matches in-dialog preview | | |
| ZIP PDFs include signatures | Same as preview | | |
| Resend optional | Only if Resend configured | | |

---

## Part C — Regression smoke (both parts)

Quick checks that unrelated areas still work:

| Area | Pass? | Notes |
|------|-------|-------|
| Login / logout | | |
| Dashboard loads | | |
| Open asset, view workflow run | | |
| Native sync queue (if device available) | | |

---

## Report back

Post both tables filled in, branch SHAs tested, and any console errors or screenshots for failures.

## PROMPT END
