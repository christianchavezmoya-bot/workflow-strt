# Mac agent — native Sync UX phase 2 (PR #304) on iPhone

**Copy everything below the line into your Mac Cursor agent.**

**Branch:** `cursor/sync-ux-phase2-cd21` (PR **#304** — includes foreground sync session + phase 2 usability fixes)  
**Base context:** Field test on 22 Aug found overlay held forever with 1 pending item offline, download banner stuck at “100%”, offline banner wrong pending count, RC002 dropdowns untappable. Phase 2 addresses these systemically.

**Requires:** Mac on same Wi-Fi as iPhone, Xcode, Docker Desktop (staging API), physical iPhone.

**Logins:** `installer1@StrataNgo.local` or `c_chavez_m@hotmail.com` (Installer) · `admin@StrataNgo.local` / `Admin123!`

**Do NOT merge PR #304 until this report is PASS or blockers are filed with evidence.**

**Known fix (2026-08-23):** bootstrap phase 6 self-deadlock via `waitForBackgroundWorkSlot()` — fixed on branch after Mac report. Re-test download completes past step 5/10.

---

## PROMPT START

You are the **Mac native Sync UX test agent** for Commtrac (app name **Strata NGo**).

### Your job

Check out **PR #304**, stand up Docker staging, build and install the **iPhone app** pointing at the Mac LAN IP, then run the **sync UX smoke checklist** below. Execute every terminal step yourself. Use the physical iPhone for all native checks — simulators do not validate keep-awake, overlay, or airplane mode.

**Do not patch source** to work around failures. Capture screenshots, debug bundle JSON from the in-app bug button, and API logs.

### What changed in PR #304 (know before you test)

| Area | Expected behaviour |
|------|-------------------|
| **Focused sync** | Full-screen spin overlay only for Sync Now, first login, readiness refresh |
| **Background sync** | Reconnect / pull-sync → blue download banner only; app stays usable |
| **Offline release** | Airplane mode with pending queue → **overlay dismisses**; Sync Center still shows pending count |
| **Download progress** | Banner shows “step X/10 · Y% overall”, caps below 100% until truly done |
| **Offline banner** | Orange banner pending count matches Sync Center / runner footer |
| **Runner dropdowns** | All `dropdown` inputs use native iOS menu fix (RC002 Mine Air Valve type fields) |

### Rules

- **Never commit** `.env.production.local`, LAN IPs, or `dist/`
- Phones **cannot reach `localhost`** — bake `VITE_API_BASE=http://<LANIP>:8080/api` into the native build
- Prefer Docker staging API on **port 8080** (`./scripts/standup-staging.sh`)
- If something fails, report exact UI text + debug JSON + `docker compose -f docker-compose.staging.yml logs api --tail 80`
- Leave Docker stack running unless asked to tear down

---

## Step 0 — Clean slate and checkout PR branch

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git checkout cursor/sync-ux-phase2-cd21
git pull --no-rebase origin cursor/sync-ux-phase2-cd21
git log -1 --oneline
git status --porcelain
```

| ID | PASS if |
|----|---------|
| S0 | On branch `cursor/sync-ux-phase2-cd21`, latest commit pulled, no stray tracked edits |

---

## Step 1 — LAN IP and Docker staging

```bash
LANIP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
echo "LANIP=$LANIP"
export LANIP
```

```bash
docker compose -f docker-compose.staging.yml ps
curl -sf http://localhost:8080/api/health || ./scripts/standup-staging.sh
curl -sf "http://$LANIP:8080/api/health" && echo "LAN API OK"
```

**If LAN health fails:** System Settings → Network → Firewall — allow Docker or disable firewall for this session.

| ID | PASS if |
|----|---------|
| L1 | `$LANIP` is a real LAN address (not empty, not 127.0.0.1) |
| L2 | `http://localhost:8080/api/health` healthy |
| L3 | `http://$LANIP:8080/api/health` healthy from Mac |

---

## Step 2 — Build and install iPhone app (PR branch)

```bash
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-native:staging
open ios/App/App.xcodeproj
```

In Xcode:

1. Connect iPhone by USB, select **physical device** (not simulator)
2. Signing → set your Team
3. **Run** to install

First install: **Settings → General → VPN & Device Management → trust developer**.

| ID | PASS if |
|----|---------|
| B1 | `build:cloud-native:staging` exits 0, `cap sync` completes |
| B2 | App installs and passes biometric/PIN lock → login screen |
| B3 | Login as Installer succeeds (proves LAN API path) |

---

## Step 3 — Sync UX smoke (iPhone) — **core checklist**

### 3a — Sync Now (focused overlay)

1. Log in, open **Sync Center** or topbar sync badge → tap **Sync Now** / refresh field data
2. Watch for **full-screen STRATA spin overlay** during upload + download
3. Wait until overlay **fully dismisses** while still online and Wi-Fi good

| ID | Check | PASS if |
|----|-------|---------|
| N1 | Sync Now shows spin overlay | Overlay visible with “Syncing…” |
| N2 | Overlay clears when done | Dismisses within reasonable time; no infinite spin while online |
| N3 | Logo spin | Vertical Y-axis ballerina spin (not coin tumble) |

### 3b — Download progress (no fake 100%)

During Sync Now or first field download, read the **blue top banner**:

| ID | Check | PASS if |
|----|-------|---------|
| N4 | Progress copy | Shows **“step X/10 · Y% overall”** (not “Workflow configs 3/3 (100%)” alone) |
| N5 | No stuck 100% | Banner does **not** sit at 100% while header still says “Downloading” for minutes |
| N6 | Banner clears | Blue banner gone after download completes |

### 3c — Offline release (the 22 Aug blocker)

1. Start a workflow run on an asset (e.g. RC002 or any assigned asset)
2. Pause time tracking or make a change that queues sync (**1 pending** in Sync Center)
3. Turn on **airplane mode** (or disable Wi-Fi)
4. Observe overlay and usability

| ID | Check | PASS if |
|----|-------|---------|
| N7 | No infinite overlay offline | Full-screen sync overlay **does not** block the app indefinitely |
| N8 | Pending visible | Sync Center / runner footer shows **1 queued** (or correct count) |
| N9 | Orange offline banner | Shows correct pending count (not “0 changes” when queue has items) |
| N10 | App usable offline | Can navigate dashboard, open runner, continue field work |

4. Turn Wi-Fi back on — pending should flush without forcing logout

| ID | Check | PASS if |
|----|-------|---------|
| N11 | Auto-sync on reconnect | Pending count drops to 0 without manual “Sync Now” (may take ~30s) |

### 3d — Background reconnect (no overlay)

1. With app idle online, toggle airplane mode **off → on → off** (or walk out of Wi-Fi briefly)
2. Do **not** tap Sync Now

| ID | Check | PASS if |
|----|-------|---------|
| N12 | No full-screen overlay on reconnect | Reconnect sync uses banner/badge only, not spin overlay lock |

### 3e — Runner dropdowns (RC002 step 3 class bug)

1. Open a workflow run with **dropdown** fields (PASS/FAIL, inspection result — e.g. RC002 step 3 Mine Air Valve)
2. Tap each dropdown — menu must open and accept a selection

| ID | Check | PASS if |
|----|-------|---------|
| N13 | Dropdown opens | Menu appears above runner (not blank / not behind dialog) |
| N14 | Selection sticks | Chosen value shows in field; red validation border clears when required field filled |

### 3f — Bell notifications (sanity)

| ID | Check | PASS if |
|----|-------|---------|
| N15 | Bell icon | Opens notification list; no permanent empty freeze while online |

---

## Step 4 — Debug capture on any FAIL

From the in-app **bug button** (bottom-right on native), copy debug JSON. Also run:

```bash
docker compose -f docker-compose.staging.yml logs api --tail 80
```

Note: large `RUN_UPDATE` payloads (>5 MB) in debug `recentRequests` are a known perf risk — include payload size if sync is slow.

---

## Step 5 — Optional Android spot-check

If Android device available:

```bash
source scripts/android-env.sh
VITE_API_BASE="http://$LANIP:8080/api" npm run build:cloud-native:staging
cd android && ./gradlew installDebug && cd ..
```

Repeat checks **N7–N12** only (overlay / offline release).

| ID | PASS if |
|----|---------|
| A1 | Same offline-release behaviour as iPhone (no infinite overlay) |

---

## Report template (fill and paste back)

```
Sync UX phase 2 — Mac device test @ <git hash>
Branch: cursor/sync-ux-phase2-cd21
PR: #304
LANIP: <ip>
Device: iPhone <model> / iOS <version>

SETUP
S0 branch checkout: PASS / FAIL
L1 LAN IP: PASS / FAIL
L2 API localhost:8080: PASS / FAIL
L3 API LAN: PASS / FAIL
B1 native build: PASS / FAIL
B2 install + lock screen: PASS / FAIL
B3 login: PASS / FAIL

SYNC UX (iPhone)
N1  Sync Now overlay: PASS / FAIL
N2  overlay dismisses online: PASS / FAIL
N3  logo spin axis: PASS / FAIL
N4  step X/10 overall progress: PASS / FAIL
N5  no stuck 100% banner: PASS / FAIL
N6  banner clears: PASS / FAIL
N7  no infinite overlay offline: PASS / FAIL
N8  pending count in Sync Center: PASS / FAIL
N9  offline banner count correct: PASS / FAIL
N10 app usable offline: PASS / FAIL
N11 auto-sync on reconnect: PASS / FAIL
N12 no overlay on background reconnect: PASS / FAIL
N13 dropdown opens: PASS / FAIL
N14 dropdown selection works: PASS / FAIL
N15 bell notifications: PASS / FAIL / SKIP

ANDROID (optional)
A1 offline release parity: PASS / FAIL / SKIP

Blockers: none / <list with exact UI text + debug JSON excerpt>
Recommendation: MERGE #304 / DO NOT MERGE — <one line why>
Local patches applied: NONE (expected)
```

**On any FAIL:** attach screenshot description, debug JSON `sync.pendingCount` + `api.serverReachable`, and API log excerpt.

## PROMPT END
