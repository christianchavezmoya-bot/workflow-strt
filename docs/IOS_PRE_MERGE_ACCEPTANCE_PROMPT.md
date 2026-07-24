# iOS pre-merge acceptance — Mac agent prompt

**Copy everything below the line into a Mac Cursor Cloud Agent (or hand to a QA engineer on Mac + physical iPhone).**

Run this **before** merging the offline-first PR stack (`#19` → `#22`) to `main`.

---

## PROMPT START

You are the **iOS device acceptance agent** for **Commtrac Codex 915** (Capacitor 8 + React bundle in `ios/`).

### Mission

1. Build and install the app on a **physical iPhone**.
2. Run **offline-first acceptance** plus **core regression** on device.
3. Return a **go / no-go** recommendation with evidence **before** the team merges to `main`.

You may fix **iOS-native-only** issues under `ios/` (signing, Info.plist, Capacitor config).  
Do **not** change `server/` or `src/` unless you find an S0/S1 defect and the fix is explicitly scoped — report gaps first.

---

### Repository

- **Repo:** `christianchavezmoya-bot/workflow-strt`
- **Branch to test:** `cursor/phase11-post-release-monitoring-cd21` (top of stack; includes Phases 8–11)
- **Stack PRs:** #19 (P8) → #20 (P9) → #21 (P10) → **#22 (P11)** — all should be green in CI before merge

```bash
git fetch origin
git checkout cursor/phase11-post-release-monitoring-cd21
git pull origin cursor/phase11-post-release-monitoring-cd21
npm ci
```

---

### Backend setup (required)

The phone **cannot** use `localhost`. API must be reachable over LAN or staging HTTPS.

**Option A — Mac runs API for LAN testing (recommended for QA):**

```bash
# Terminal 1 — from repo root
dotnet run --project server/Commtrac.Api/Commtrac.Api.csproj --launch-profile http
# API listens on http://0.0.0.0:4000 — confirm:
curl -s http://127.0.0.1:4000/api/health
```

Find Mac LAN IP: `ipconfig getifaddr en0` (Wi‑Fi) or System Settings → Network.

**Option B — Staging API:** use your team's staging URL instead of LAN IP below.

**Seed admin (fresh DB):** `admin@commtrac.local` / `Admin123!`  
For field-work tests, also need an **Engineer/Installer** user **assigned to test assets** with role permission **Assets → Field User Workflow** enabled (see `docs/FIELD_RUN_QA_CHECKLIST.md`).

---

### iOS build & install

```bash
# From repo root — set API to Mac LAN IP (NOT localhost)
echo "VITE_API_BASE=http://<MAC-LAN-IP>:4000/api" > .env.production.local

npm run build
npx cap sync ios

# Open Xcode
open ios/App/App.xcodeproj
```

In Xcode:

1. Select your **physical iPhone** (not Simulator — airplane/captive tests require real radio).
2. **Signing & Capabilities:** valid Team + provisioning for bundle id `com.christianchavez.kinet`.
3. **Product → Run** (⌘R) to install on device.
4. On first launch: allow network permissions; complete **biometric/PIN lock** if prompted after login.

**Verify API URL baked in:** after login, Sync Center should reach the API (sync badge goes green when online). If login fails with network error, `VITE_API_BASE` was wrong — rebuild with correct LAN IP.

---

### Pre-test bootstrap (online)

Do this once before any airplane tests:

1. Log in as the **assigned field user** (not only admin).
2. Wait for field download — blue **Downloading field data…** banner clears; Sync Center → **Offline readiness** shows **Ready** (or **Data may be stale** — tap **Download now**).
3. Open each test assignment once (Dashboard **My Jobs Today** or Assets).
4. Confirm sync badge shows **Synced** (green) with **0** pending.

Note: **App version / build** from Settings or Xcode (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`).

---

### Part 1 — Offline acceptance matrix (required)

Fill in `docs/OFFLINE_ACCEPTANCE_MATRIX.md` on the device. Pass = expected UX with **no S0/S1 data loss** (see `docs/BUG_TRIAGE.md`).

| # | Scenario | What to verify |
|---|----------|----------------|
| 1 | Airplane, **small** workflow, **resume** | Bootstrap online → Airplane ON → Dashboard **Resume** → interactive ≤ **1000 ms** (watch **Open: Nms** chip in connectivity strip) |
| 2 | Airplane, **large** workflow (60+ steps), resume | Same as #1 |
| 3 | Captive Wi‑Fi | Wi‑Fi on router with **no internet** / API down → open cached run |
| 4 | Backend down, radio on | Stop API on Mac → open cached run |
| 5 | Offline **start new run** | Airplane → start run on assigned asset with cached config |
| 6 | Kill app mid-run | Airplane → save step → force-quit → reopen → step intact |
| 7 | ~20 queued ops, reconnect | Airplane → many step saves → online → Sync Center queue clears, **no duplicates** on server/web |
| 8 | **Conflict resolve** | Web edits same asset while phone offline → sync → Sync Center → test **Keep my change** AND **Accept server version** once each |
| 9 | Expired token, reconnect | Long idle offline or wait for token expiry → login again → **queue preserved** |

**Marker checklist (rows 1–2):** long-press / tooltip on **ConnectivityDebugBar** — order must be:

1. `navigation_start`
2. `workflow_local_read_start` / `workflow_local_read_end`
3. `first_render runner`
4. `interactive_ready` **before** `network_request_start runner-reconcile`

---

### Part 2 — Core regression (required)

From `docs/RELEASE_CHECKLIST.md` Layer C — run on the same iPhone build:

**Auth**

- [ ] Login / logout
- [ ] Biometric/PIN lock after backgrounding
- [ ] Cached session works in airplane mode (no spurious logout)

**Core flows**

- [ ] Projects list and open
- [ ] Assets — list, assigned user sees workflow actions
- [ ] Start workflow from Assets
- [ ] Resume from Dashboard
- [ ] Complete steps: **text**, **photo** (camera), **signature**
- [ ] Pause / resume run
- [ ] Log issue on asset
- [ ] Complete run → field sign-off (customer email sign-off needs network — expect honest block offline)

**Offline UX limits (Phase 8 — must fail gracefully, not silently)**

- [ ] Global search disabled offline with explanation
- [ ] Profile save blocked offline
- [ ] Documents list from cache; preview error if file not prefetched
- [ ] Notifications show cached list + offline banner
- [ ] **Work offline** toggle in Sync Center forces offline on good signal

**Sync / support (Phase 9–11)**

- [ ] Sync Center: pending → synced after reconnect
- [ ] Conflict count on sync badge when review needed
- [ ] **Copy support bundle** works (paste into Notes — confirm **no JWT/tokens** in JSON)
- [ ] **Download JSON** support bundle saves to Files

---

### Part 3 — Severity gate (merge blocker)

| Severity | Examples | Merge to `main`? |
|----------|----------|------------------|
| **S0** | Lost steps/photos, duplicate runs, wrong locked state | **NO** — block merge, file issue with support bundle |
| **S1** | Cannot login, cannot open/start/complete workflow offline when cached | **NO** |
| **S2+** | Cosmetic, minor UI | OK with documented waiver |

---

### Deliverables (post in PR #22 or linked issue)

1. **Completed** `docs/OFFLINE_ACCEPTANCE_MATRIX.md` (paste table into comment or attach file).
2. **Sign-off header:** tester name, date, device model + iOS version, app build, API commit/tag, branch `cursor/phase11-post-release-monitoring-cd21`.
3. **Screenshots:** Sync Center (ready + pending + conflict if tested), airplane resume, support bundle metadata section (redact user email if public).
4. **p95 open times** for rows 1–2 (from **Open: Nms** chip).
5. **Go / no-go** one-liner with list of any S0/S1/S2 findings.
6. If defects found: Sync Center → **Copy support bundle** attached to each S0/S1 ticket.

---

### Reference docs (in repo)

| Doc | Purpose |
|-----|---------|
| `docs/OFFLINE_ACCEPTANCE_MATRIX.md` | Sign-off template |
| `docs/OFFLINE_INSTALLER_QUICK_REF.md` | Expected field behavior |
| `docs/OFFLINE_FIRST_UX.md` | Offline limits cheat sheet |
| `docs/OFFLINE_DEVICE_MEASUREMENT.md` | p95 methodology |
| `docs/MOBILE_BUILD.md` | Build/version sync |
| `docs/BUG_TRIAGE.md` | Severity + support bundle |
| `docs/FIELD_RUN_QA_CHECKLIST.md` | Field-user permission setup |
| `docs/RELEASE_CHECKLIST.md` | Full release train Layer C |

---

### Automated gates (already run in CI — do not skip reporting if device fails)

Cloud CI on the PR should already have:

```bash
npm run release-gates   # typecheck + backend + vitest + e2e + offline perf
```

Your device run is the **manual native gate** CI cannot replace. **Both** must pass for merge.

## PROMPT END
