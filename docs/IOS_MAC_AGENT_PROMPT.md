# iOS Mac agent — install, retest, and scoped UX fix

**Copy everything below the line into a Mac Cursor Cloud Agent.**

Branch: `cursor/phase11-post-release-monitoring-cd21` @ **`cc53279`** (or newer on PR [#22](https://github.com/christianchavezmoya-bot/workflow-strt/pull/22))

Do **not** merge to `main` until you post a **go / no-go** with evidence.

---

## PROMPT START

You are the **Mac iOS field agent** for **Commtrac Codex 915** — build/install on a **physical iPhone**, verify offline fixes, implement one scoped UX change, then finish acceptance testing.

### Prime directive

| Area | Allowed |
|------|---------|
| `ios/` | Yes — signing, Capacitor, native config |
| `src/` | **Only for Finding 3 (scoped below)** + tests for that change |
| `server/` | **No** — report API gaps, do not modify |

---

## Part 0 — Checkout

```bash
git clone https://github.com/christianchavezmoya-bot/workflow-strt.git
cd workflow-strt
git fetch origin
git checkout cursor/phase11-post-release-monitoring-cd21
git pull origin cursor/phase11-post-release-monitoring-cd21
npm ci
```

Confirm HEAD is at least `cc53279` (`Fix offline workflow assign queue and circuit breaker recovery`).

---

## Part 1 — Backend + iOS install (required every session)

### 1a. Run API on Mac (LAN testing)

The phone **cannot** reach `localhost`. API must be on your Mac’s LAN IP.

```bash
# Terminal 1 — repo root
dotnet run --project server/Commtrac.Api/Commtrac.Api.csproj --launch-profile http

# Verify
curl -s http://127.0.0.1:4000/api/health

# Mac Wi‑Fi IP (example: 192.168.1.42)
ipconfig getifaddr en0
```

**Staging option:** use team staging API URL instead of LAN IP in step 1b.

**Test accounts:**
- Admin: `admin@commtrac.local` / `Admin123!`
- Field installer (assigned to CC-/JO00991 assets, **Assets → Field User Workflow** enabled on role)

### 1b. Build web bundle + sync to iOS

```bash
# Replace with YOUR Mac LAN IP
echo "VITE_API_BASE=http://<MAC-LAN-IP>:4000/api" > .env.production.local

npm run build
npx cap sync ios
```

### 1c. Install on physical iPhone (Xcode)

```bash
open ios/App/App.xcodeproj
```

In Xcode:

1. Connect **physical iPhone** (Simulator is **not** valid for airplane/offline radio tests).
2. **Signing & Capabilities** — valid Team + provisioning for `com.christianchavez.kinet`.
3. Select the iPhone as run destination.
4. **Product → Run** (⌘R).
5. On device: trust developer cert if prompted; complete **biometric/PIN lock** after login if shown.

**Install sanity check:** Login succeeds; Sync Center → Offline readiness eventually shows **Ready**; sync badge goes **Synced** when online.

---

## Part 2 — Blocking retests (must pass before matrix / merge)

Prior bugs were fixed in `972ac07` (dashboard wipe) and `cc53279` (assign queue + circuit breaker). Verify both.

### Retest A — Dashboard job list (Bug-1 regression)

1. Online bootstrap — confirm **5–6** assigned jobs visible (MY INSTALLS > 0).
2. Airplane ON ~30+ min with normal use (or full 3h if time allows); queue several step saves.
3. Reconnect; if UI feels stuck, **force-quit once** (original repro path) then reopen.
4. **PASS:** Job list still populated — not zeroed. Blocking issues / pending sig counts not all falsely zero.

### Retest B — Offline assign workflow (Finding 1 — S0)

1. Pick asset **CC-0012** (or similar) with **no** workflow assigned yet.
2. Airplane ON → Dashboard → **Assign Workflow**.
3. **PASS:** No `"Failed to assign workflow"` alert.
4. **PASS:** Sync Center shows pending `WORKFLOW_ASSIGNMENT_CREATE`.
5. Reconnect → pending clears.
6. **PASS (server):** Assignment exists on server — verify via web admin or  
   `GET /api/asset-workflow-assignments/by-asset/{assetId}`  
   (not only local/temp ID in IndexedDB).

### Retest C — Reconnect without force-quit (Finding 2 — S1)

1. Airplane ON; queue ~10+ writes (step saves).
2. Reconnect Wi‑Fi/cellular — **do not** force-quit.
3. **PASS:** Within ~60s, sync badge clears pending; app is usable without restart.
4. **PASS:** Top connectivity strip and debug panel **Server** chip agree (both reachable after sync).

**If A, B, or C fail:** STOP. Attach Sync Center **Copy support bundle** + steps. Do not recommend merge.

---

## Part 3 — Scoped code change: Finding 3 (UX)

**Only after Retests A–C pass**, implement this in `src/`:

### Problem

Dashboard **Assign Workflow** dialog (`src/features/dashboard/Dashboard.tsx` ~6147–6196) is worse than the Assets page dialog:

1. **Workflow Type** dropdown is editable — project already determines Installation vs Inspection; technicians can pick the wrong type.
2. **Workflow Config** loads `workflowConfigService.getAll()` (entire org) instead of configs scoped to the asset’s product/project.

### Reference implementation (match this behavior)

`src/features/installations/AssetInstallationPage.tsx`:

- `openAssignDialog()` (~2580) — loads `workflowConfigService.listByProduct(asset.productId, "Published")`
- Dialog (~6482) — **config only**; no editable type dropdown
- `resolveConfigWorkflowTypeId()` (~284) — derives `workflowTypeId` from chosen config for the API call
- `saveAssignment()` (~2608) — resolves type from config before `assetWorkflowAssignmentService.create()`

### Your tasks

1. Align **Dashboard** assign dialog with Assets page pattern:
   - Remove editable Workflow Type `<Select>`; show read-only label/chip from project `workflowMode` (Installation / Inspection / Mixed).
   - Load published configs via `listByProduct` for the asset’s `productId` (fetch full asset with `projectAssetService.getById` if workspace item lacks `productId`).
   - Filter configs to the project’s workflow mode where applicable.
   - Derive `workflowTypeId` from selected config (extract shared helper if needed — prefer reusing/extracting from AssetInstallationPage over duplicating logic).
2. Offline: dialog must still work when `listByProduct` serves cached configs (native local-first).
3. Run `npm test` and `npm run build`.
4. Commit on branch `cursor/phase11-post-release-monitoring-cd21` (or `cursor/dashboard-assign-dialog-ux-cd21` stacked on it if you prefer a separate PR — ask if unsure).
5. Re-install on iPhone (`npm run build && npx cap sync ios` → Xcode Run) and smoke-test assign dialog online + offline.

**Out of scope:** Other dashboard refactors, server changes, Finding 3 on web-only paths beyond Dashboard + parity with Assets.

---

## Part 4 — Full acceptance matrix (after Parts 2–3)

Fill `docs/OFFLINE_ACCEPTANCE_MATRIX.md` on device. Summary:

| # | Scenario | Key pass criteria |
|---|----------|-------------------|
| 1 | Airplane, small workflow, Resume | ≤1000 ms (`Open: Nms` chip) |
| 2 | Airplane, large workflow, Resume | Same |
| 3 | Captive Wi‑Fi | Cached run opens |
| 4 | API down, radio on | Cached run opens |
| 5 | Offline start new run | Starts on cached config |
| 6 | Kill app mid-run offline | Step intact on reopen |
| 7 | ~20 offline saves → reconnect | Queue clears, no duplicates |
| 8 | Conflict resolve | Keep + Accept server both tested |
| 9 | Token expired offline → re-login | Queue preserved |

Also run **RELEASE_CHECKLIST Layer C** spot checks (login, photo, signature, Sync Center support bundle has **no JWT**).

---

## Deliverables (post on PR #22)

1. **Retest A–C:** pass/fail table + device model, iOS version, app build, commit SHA.
2. **Finding 3:** PR commit link + before/after screenshot of assign dialog.
3. **Matrix:** completed `OFFLINE_ACCEPTANCE_MATRIX.md` table (or paste in comment).
4. **Go / no-go** for merge to `main` with any waivers explicitly listed.

### Merge rubric

| Severity | Merge? |
|----------|--------|
| S0 / S1 (data loss, stuck sync, assign not on server) | **NO** |
| S2 with workaround | OK with waiver |
| Finding 3 incomplete | OK for merge **only if** A–C + matrix pass and UX fix is follow-up PR |

---

## Reference docs

- `docs/OFFLINE_ACCEPTANCE_MATRIX.md`
- `docs/OFFLINE_INSTALLER_QUICK_REF.md`
- `docs/OFFLINE_FIRST_UX.md`
- `docs/MOBILE_BUILD.md`
- `docs/BUG_TRIAGE.md`

## PROMPT END
