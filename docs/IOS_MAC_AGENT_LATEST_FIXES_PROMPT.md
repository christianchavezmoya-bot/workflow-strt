# Mac iOS agent — install latest fixes (logo, capture table, documents, tips)

**Copy everything below the line into your Mac Cursor agent.**

Branch: `cursor/phase11-post-release-monitoring-cd21` @ **`dec49b0`** or newer (PR [#22](https://github.com/christianchavezmoya-bot/workflow-strt/pull/22))

**API backend:** `172.20.8.16` (moved off Mac LAN — do **not** point the phone at `localhost` or an old IP)

---

## PROMPT START

You are the **Mac iOS field agent** for **Commtrac Codex 915**. This session:

1. Pull latest branch, **build + install on physical iPhone**
2. Point the app at **`http://172.20.8.16:4000/api`**
3. Run field sync (**Download now**) while online
4. **Test four fixes** (sync logo, capture table headers, Documents offline, Tips offline)
5. Post **pass/fail + screenshots** on PR #22

You may change `src/` or `ios/` only to fix bugs you find — report S0/S1 first. Do **not** modify `server/`.

---

## Part 0 — Checkout

```bash
git clone https://github.com/christianchavezmoya-bot/workflow-strt.git
cd workflow-strt
git fetch origin
git checkout cursor/phase11-post-release-monitoring-cd21
git pull origin cursor/phase11-post-release-monitoring-cd21
npm ci
git log -1 --oneline   # expect dec49b0 or newer
```

**Expected commits on this branch (newest first):**

| Commit | Fix |
|--------|-----|
| `dec49b0` | Capture table — sticky headers stay pinned while scrolling |
| `4a6a2c3` | Documents + Tips — prefetch file blobs during field sync |
| `ff67b7c` | Sync overlay — logo spins on **vertical axis** (`rotateY`) |
| `4ff766f` | Sync overlay — real **Strata Worldwide PNG** (not synthetic SVG) |
| `12394fc` | Sync busy overlay (native reconnect flush) |

---

## Part 1 — Backend reachability + iOS install

### 1a. Verify API on `172.20.8.16`

The API runs on the team server — **not** on your Mac (unless you are explicitly told to run it locally).

```bash
# From Mac (same network as iPhone)
curl -s http://172.20.8.16:4000/api/health
```

**PASS:** JSON health response (HTTP 200).

**If curl fails:** confirm iPhone and Mac are on a network that routes to `172.20.8.16`. Do not proceed with device testing until health check passes.

**Optional — run API locally instead (only if server is down):**

```bash
dotnet run --project server/Commtrac.Api/Commtrac.Api.csproj --launch-profile http
# Then use your Mac LAN IP in 1b instead of 172.20.8.16
```

### 1b. Build web bundle + sync to iOS

```bash
# Untracked — do not commit
echo "VITE_API_BASE=http://172.20.8.16:4000/api" > .env.production.local

npm run build
npx cap sync ios
```

### 1c. Install on physical iPhone (Xcode)

```bash
open ios/App/App.xcodeproj
```

1. Connect **physical iPhone** (Simulator is **not** valid for offline/radio tests).
2. **Signing & Capabilities** — Team + provisioning for `com.christianchavez.kinet`.
3. Select iPhone → **Product → Run** (⌘R).
4. Complete login + biometric/PIN lock if shown.

**Install sanity check:**

- Login succeeds against `172.20.8.16`
- Sync Center → Offline readiness eventually **Ready**
- Sync badge **Synced** when online

**Test accounts:** field installer assigned to project assets; role with **Assets → Field User Workflow** and document access.

---

## Part 2 — Field sync (required before offline document tests)

All offline document/tips previews depend on bootstrap prefetch.

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Online → open **Sync Center** (top status badge) | Panel loads |
| 2 | Tap **Download now** / wait for bootstrap | Progress completes; chip **Ready** |
| 3 | Optionally open **Documents** and **Tips & Tricks** while online for ~30s | Lists populate |
| 4 | Note sync badge | **Synced** |

**Screenshot:** Sync Center showing **Ready** after download.

---

## Part 3 — Sync busy overlay + logo (native only)

**What shipped:** Full-screen overlay during queue flush after reconnect — dimmed backdrop (**no blur**), **Strata Worldwide wordmark** (`strata_transparent.png`), **3D flip on vertical axis** (`rotateY`, ~1.15s), **“Syncing…”** caption.

### Test steps

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Online; confirm no overlay when idle | No overlay |
| 2 | Airplane ON → save **3–5 workflow steps** on assigned asset | Sync Center pending > 0 |
| 3 | Reconnect Wi‑Fi/cellular (any screen) | Overlay within ~1s |
| 4 | Observe logo animation | **Full Strata wordmark** (icon + STRATA + WORLDWIDE), **flips on vertical axis** — **not** flat clockwise spin |
| 5 | Observe backdrop | **Crisp** dim overlay — **no** blurry/frosted halo |
| 6 | Wait for flush | Overlay disappears; badge **Synced**; pending **0** |
| 7 | Reconnect with **empty queue** | **No overlay** |

### FAIL criteria

- Synthetic blue triangle icon (old SVG)
- Flat clockwise 2D spin instead of vertical-axis flip
- Blurry backdrop or solid box around logo
- Overlay stuck after queue empty
- No overlay when pending items flush

**Screenshots:** overlay mid-sync (logo visible) + Sync Center pending clearing.

---

## Part 4 — Capture table sticky headers

**What shipped:** Capture table measures header row heights at runtime; all three header rows stay **pinned** while body scrolls underneath (no overlap).

### How to open on phone

**Assets** tab → select project → switch to **Capture table** / table view → full-screen **Capture table** dialog (or embedded capture view).

### Test steps

| Step | Action | PASS if |
|------|--------|---------|
| 1 | Open capture table with **10+ assets** and multiple feature columns | Table loads |
| 2 | Scroll **down** through rows | Row data moves; headers stay at top |
| 3 | Scroll **up** aggressively | **No overlap** — “Yes” / asset tags / values do **not** paint over column headers |
| 4 | All three header tiers visible while scrolling | Row 1 (group names), row 2 (P/N), row 3 (field labels) all stay fixed |
| 5 | Horizontal scroll (if many columns) | **Asset Tag** sticky column still works; headers remain pinned vertically |

### FAIL criteria

- Body cell text visible on top of header labels when scrolling up
- Header rows scroll away or stack incorrectly
- Only first header row sticks while rows 2–3 scroll off

**Screenshot:** mid-scroll showing headers pinned with body rows underneath.

---

## Part 5 — Documents page offline

**What shipped:** Bootstrap **Phase 1b** prefetches library document file blobs (Tips prioritized, **100 MB / 50 files**). Preview uses same `MobileDocumentPreviewDialog` as online (full-screen popup, zoom in/out).

### Test steps

| Step | Action | PASS if |
|------|--------|---------|
| 1 | While **online** after Part 2 field sync | Documents list shows items |
| 2 | Open **one PDF** and **one image** online | Full-screen preview; pinch/zoom works |
| 3 | Airplane ON (or Sync Center → **Work offline**) | Offline banner on Documents page |
| 4 | Documents list | **Cached documents still listed** (not empty) |
| 5 | Tap same PDF/image offline | **Same popup preview** opens from cache |
| 6 | Zoom in / out offline | Same behavior as online |
| 7 | Tap a doc **never opened** and over prefetch cap | Honest error (“Not available offline”) — not a silent blank |

### FAIL criteria

- Empty document list offline after successful field sync
- Preview works online but fails offline for files that were prefetched
- Broken zoom or different UI shell offline vs online

**Screenshots:** Documents list offline + open preview with zoom.

---

## Part 6 — Tips & Tricks page offline

Same offline file cache as Documents; tips are **prioritized** during bootstrap prefetch.

### Test steps

| Step | Action | PASS if |
|------|--------|---------|
| 1 | While online | Tips grid/list shows tip documents |
| 2 | Open a tip (PDF/photo) online | Full-screen preview + zoom |
| 3 | Go offline | Offline info banner visible |
| 4 | Tips list | **Cached tips still listed** |
| 5 | Tap tip offline | **Same preview dialog**; thumbnails load where cached |
| 6 | Zoom in / out | Works same as online |

### FAIL criteria

- Empty tips list offline after field sync
- Grid shows generic icons only with preview failing for prefetched files
- Missing offline banner / misleading “server unreachable” when cache exists

**Screenshots:** Tips page offline + open tip preview.

---

## Part 7 — Quick regression (5 min)

| Check | PASS if |
|-------|---------|
| 4-hour stale warning | After long idle, Assets/Dashboard shows **“data may be outdated”** banner (expected) |
| Stuck sync error badge | Clears when queue empty |
| Dashboard job list | Not zeroed after offline session |
| Offline assign | Queues without error alert; syncs on reconnect |

---

## Part 8 — Optional: token expiry (matrix row 9)

If you can leave the app idle **12+ hours** logged in:

1. Queue at least one offline write first.
2. After idle, open app offline → then reconnect.
3. **PASS:** Pending queue preserved across re-login; sync overlay may appear during flush.

Record idle duration and pass/fail separately.

---

## Deliverables — post on PR #22

Copy this table filled in:

| Area | Pass/Fail | Notes |
|------|-----------|-------|
| Install @ `172.20.8.16` | | |
| Field sync (Download now) | | |
| Sync overlay + logo (rotateY, real PNG) | | |
| Capture table sticky headers | | |
| Documents offline list + preview + zoom | | |
| Tips offline list + preview + zoom | | |
| Quick regression | | |
| Row 9 token (optional) | | |

Attach:

1. Screenshot — sync overlay mid-flush
2. Screenshot — capture table mid-scroll (headers pinned)
3. Screenshot — Documents preview offline
4. Screenshot — Tips preview offline
5. Device model + iOS version
6. **Go / no-go** for merge to `main`

### Merge rubric

| Severity | Merge? |
|----------|--------|
| S0 / S1 (data loss, stuck sync, assign not on server) | **NO** |
| Logo wrong / overlay broken / headers overlap | **NO** |
| Documents/Tips offline preview broken after field sync | **NO** |
| All four fixes pass + regression clean | **GO** |

---

## Reference

- `docs/OFFLINE_FIRST_UX.md` — offline behavior spec
- `docs/OFFLINE_ACCEPTANCE_MATRIX.md` — full matrix template
- `src/components/layout/SyncBusyOverlay.tsx` — sync logo overlay
- `src/features/installations/CaptureSpreadsheetDialog.tsx` — capture table
- `src/services/documentService.ts` — document/tips prefetch

## PROMPT END
