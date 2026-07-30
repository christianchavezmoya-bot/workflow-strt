# Windows agent — offline workflow-assignment + slow offline-detection fix re-test

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ `b11e7339f` — already merged and pushed, no PR to review, just pull.

**Repo:** `https://github.com/christianchavezmoya-bot/workflow-strt`

**Goal:** Verify a fix for a regression that broke phone offline-first behavior (introduced Jul 28,
commits `fa23e42d1` / `705209e91`, PR #37) plus a related offline-detection latency issue that
turned out to be a pre-existing gap, not a regression. **PR #43 (connectivity UI move into Sync
Center) stays merged — do not revert it, it was investigated and ruled out as a cause.**

**Default admin:** `admin@commtrac.local` / `Admin123!`

---

## PROMPT START

You are the **Windows web/API + native smoke agent** for **Strata N-go** (Commtrac Codex 915).

Your job:

1. Pull `main`, confirm `b11e7339f` is present
2. Run API + web locally
3. Re-test offline workflow-assignment reads and offline-detection latency (native — Android
   emulator or physical device; web has no behavior change here, see "What changed" below)
4. Post filled results table

**Rules:**

- **Never** commit machine-specific IP overrides or API keys
- You **may** fix S0/S1 regressions found during this re-test — report first for S2
- Do **not** merge/revert other PRs
- Do **not** change users, roles, projects, settings, or unrelated code

---

## Part 0 — Checkout

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust if different
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline   # expect b11e7339f or newer
npm ci
```

---

## Part 1 — What changed and why (context, no action needed)

Two days after PR #36 (a chain of native auth/session fixes, confirmed working), PR #37 shipped a
data bug: a new `dedupeAssignmentsByConfig()` helper in `WorkflowAssignmentRepository.ts` could
throw on a malformed cached record (non-string `id`, or a legacy `createdAt` field before the
`assignedAt` rename). The throw was silently swallowed by `.catch(() => [])` in
`AssetInstallationPage.tsx`, so the UI reported "workflow not assigned" even when a valid
assignment existed in IndexedDB. Separately, `AssetRepository.ts` and `workflowConfigService.ts`
had background refreshes that could let an empty/bad server response wipe a non-empty local cache
(same bug family already fixed twice elsewhere — Dashboard job list, Needs Attention widget).

Independently, offline detection only ever updated when a page navigation triggered a real (failed)
API call — turning Wi-Fi off while cellular stayed on left the badge showing "online" indefinitely,
because the periodic health ping only ever confirmed *success*, never signaled failure, and
`CapacitorHttp`'s `connectTimeout`/`readTimeout` aren't reliably honored on iOS (a ping to an
unroutable address could hang far longer than configured). Fixed by racing the native ping against
a hard JS-level timeout and having ping failures feed the same "server unreachable" signal a real
request failure would.

**Files touched:** `WorkflowAssignmentRepository.ts`, `AssetRepository.ts`,
`workflowConfigService.ts`, `connectivityMonitor.ts`, `networkService.ts`, `useSyncEngine.ts`.

**Web impact: none.** Every consumer of the changed signals (`api.ts`'s `skipBlocking` check,
`cachedGet`'s fast-bail, `silentRefresh`, `shouldSkipRunMutation`) is already gated behind
`isMobileNativePlatform()`. The repository/service changes are inside native-only branches — web
has its own separate `webCachedGet` code paths that were not touched. This was traced consumer-by-
consumer before merging, not assumed.

---

## Part 2 — Start API + web

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

## Part A — Offline workflow-assignment reads (native — emulator or device)

Build with your LAN API IP:

```powershell
# Set VITE_API_BASE in .env.production.local to http://<LAN-IP>:4000/api
npm run build
npx cap sync
# Android: source scripts/android-env.sh; cd android; ./gradlew assembleDebug
```

1. Sign in, open a project asset that has a workflow already assigned
2. Confirm it loads and shows the assignment while online
3. Go offline (Wi-Fi off / airplane mode)
4. Reopen the same asset

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| Asset with assigned workflow, opened offline | Still shows the assignment, not "not assigned" | | |
| Assign-workflow dropdown offline | Populates with available configs | | |
| Force-quit app, relaunch offline, reopen asset | Assignment still visible (survives cold start) | | |

---

## Part B — Offline-detection latency (native — emulator or device)

1. While the app is open and idle on any screen (do **not** navigate)
2. Turn Wi-Fi off, leave cellular on (or airplane mode if no cellular available)

| Check | Expected | Pass? | Notes |
|-------|----------|-------|-------|
| Sync badge flips to "Offline" without navigating | Within ~10s | | |
| Reconnect Wi-Fi | Badge returns to synced/online promptly | | |

---

## Part C — Regression smoke (both parts)

| Area | Pass? | Notes |
|------|-------|-------|
| Login / logout | | |
| Dashboard loads (web + native) | | |
| Open asset, view workflow run | | |
| Assign a workflow while online, confirm it persists after reload | | |
| Native sync queue still flushes on reconnect | | |

---

## Report back

Post all three tables filled in, the commit SHA you tested against, and any console errors or
screenshots for failures.

## PROMPT END
