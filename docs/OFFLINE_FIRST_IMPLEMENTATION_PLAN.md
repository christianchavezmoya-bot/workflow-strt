# Offline-First Implementation Plan (Phone Native)

**Scope:** Capacitor native app (iOS/Android) only. Web stays always-online.  
**Goal:** Every field-relevant data source is available offline after bootstrap; every field write syncs correctly on reconnect.  
**Process:** Implement → **Review** → **Bug hunt** → **Smoke test** → **Adjust next phase** → repeat.

**Status baseline:** Phases A–D landed on `main` (`d8f5373`, `36613d3`). This plan covers remaining work to **complete** coverage and **prove** the ≤1s open target.

---

## Principles

1. **Native-only gating** — all offline behavior behind `isMobileNativePlatform()`. Never change web read paths.
2. **Local-first reads, optimistic writes** — UI never waits on network when cached data exists.
3. **Single open path** — all workflow runner entry points use one service (`workflowOpenService`).
4. **One queue** — all writes through `syncQueue.enqueue` with `opType` + `idempotencyKey`.
5. **Prove it** — automated perf assertion + device checklist before phone release.
6. **Phase gate** — no phase starts until prior phase gate passes.

---

## Data domain inventory

Every row must reach **Read offline** + **Write offline→sync** (or explicit **N/A** with user messaging).

| Domain | Service / store | Read offline today | Write offline today | Phase owner |
|--------|-----------------|--------------------|---------------------|-------------|
| Auth session | `secureStorage`, JWT grace | ✅ | N/A | — |
| Projects | `projectService`, `ProjectRepository` | ✅ cache | ❌ admin only | P4 |
| Project assets | `projectAssetService`, `AssetRepository` | ✅ cache | ⚠️ status via run sync | P4 |
| Dashboard summaries | `dashboardCache`, `projectAssetService.*Local` | ✅ | N/A | P4 |
| Workflow types/templates | `workflowTypeService`, `workflowTemplateService` | ✅ bootstrap | N/A | P5 |
| Workflow configs | `workflowConfigService` | ✅ local-first | N/A | P2 |
| Config reference media | `configMediaCache` | ✅ prefetch | N/A | P5 |
| Workflow assignments | `assetWorkflowAssignmentService`, `WorkflowAssignmentRepository` | ✅ cache | ❌ | P4 |
| Workflow runs | `assetWorkflowRunService`, `offlineStore` | ✅ local-first | ✅ queue | P2, P3 |
| Step results | via run PATCH | ✅ | ✅ `STEP_RESULTS` | P3 |
| Run complete | via run POST/PATCH | ✅ | ✅ `RUN_COMPLETE` | P3 |
| Time entries | `assetWorkflowRunService.trackTimeEntry` | ✅ | ✅ `TIME_ENTRY` | P3 |
| Run issues | embedded in run + `IssueRepository` | ✅ | ✅ `ISSUE_*` | P3 |
| Asset issues | on `ProjectAsset.issuesJson` | ✅ | ⚠️ partial | P3 |
| Signatures | `signatureService` | ✅ | ✅ `SIGNATURE_SUBMIT` | P3 |
| Work instructions | `workInstructionService` | ✅ | ✅ queue | P3 |
| Asset document links | `assetDocumentLinkService` | ✅ | ✅ queue | P3 |
| Captured media | `mediaStore` | ✅ local blob | ✅ `MEDIA_UPLOAD` | P3, P5 |
| Documents index/files | `documentService` | ⚠️ index yes, files partial | ❌ | P5 |
| Open/closed issues board | `assetWorkflowRunService` + `IssueRepository` | ⚠️ read yes | ⚠️ resolve path | P6 |
| Inspection runs | `projectInspectionRunService` | ❌ | ❌ | P7 |
| Project contacts | `projectContactService` | ❌ | ❌ | P8 (N/A field) |
| Notifications | `notificationService` | ❌ | N/A | P8 |
| Global search | `globalSearchService` | ❌ | N/A | P8 |
| Admin CRUD | users, customers, sites | ❌ | ❌ | N/A (web) |
| BOM module | flag-gated | ❌ | ❌ | Out of scope unless flagged |
| SSE live updates | `useSseEvents` | N/A | N/A | P9 (reconcile on sync) |

---

## Phase gate checklist (run after EVERY phase)

### Review
- [ ] Diff scoped to native paths only; no web behavior change
- [ ] All new reads use local-first or `cachedGet`; no naked `api.get` on critical open path
- [ ] All new writes use `syncQueue.enqueue` with correct `opType`
- [ ] Perf markers emitted at tap → interactive
- [ ] User-visible error when data not cached (actionable message)

### Bug hunt
- [ ] Cold cache miss does not white-screen
- [ ] Double-tap start run does not duplicate queue ops (idempotency)
- [ ] Offline → online → offline cycle preserves local state
- [ ] 401 offline grace does not hard-redirect when token refresh impossible
- [ ] Circuit breaker: first failure → subsequent reads skip without 10s wait
- [ ] Conflict path: 409/412 surfaces in Sync Center, not silent drop

### Automated smoke
```bash
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs typecheck backend test
npm run test:e2e
npm run test:e2e:full    # if API available
```

### Native smoke (device or emulator)
- [ ] Login → bootstrap completes without crash
- [ ] Dashboard loads assigned assets
- [ ] Resume cached workflow ≤1s (stopwatch)
- [ ] Save one step offline → pending badge increments
- [ ] Reconnect → queue drains → badge Synced

### Adjust next phase
Document in PR / phase notes:
- What failed → reprioritize next phase tasks
- New gaps discovered → add to domain inventory
- De-scope if risk too high; move to follow-up phase

---

## Phase 0 — Baseline & branch hygiene

**Status:** ✅ Done (Phases A–D on `main`).

**Deliverables already on `main`:**
- Circuit breaker, offline perf markers, workflow open cache
- `getByIdLocalFirst`, bootstrap service, sync queue idempotency
- Review fixes: signature dedup, reconcile via `getByIdFresh`

**Remaining known gaps (input to Phase 1+):**
- `workflowOpenService` has zero callers
- No automated ≤1s test
- Incomplete §14 diagnostics
- `useSyncEngine.queueOrSend` bypasses `syncQueue` idempotency
- Inspection runs not offline
- First captive-WiFi failure still ~10s before circuit opens

**Gate:** Inventory agreed; this plan approved.

---

## Phase 1 — Measure & instrument

**Goal:** Know actual open latency on device; make gaps visible before building more.

### Tasks
1. **Perf readout** — show `getInteractiveReadyMs()` + last 5 markers in `ConnectivityDebugBar` (native DEV or always-on debug build).
2. **Tap-level markers** — emit `navigation_start` in Dashboard, AssetInstallationPage, ProjectAssetInspectionPage, WorkflowBuilder at user tap (not inside runner).
3. **Emit missing markers:**
   - `first_render` in `WorkOrderRunner` (first paint)
   - `local_database_open_*` in `localDB.getDB()`
   - `workflow_local_read_*` in wired open path (prep for Phase 2)
4. **Bootstrap progress UI** — optional subtle indicator on native ("Downloading field data…") using `bootstrap:progress` events.
5. **Device measurement script** — add `docs/OFFLINE_DEVICE_MEASUREMENT.md` with matrix: small/medium/large workflow × airplane × captive Wi‑Fi.

### Exit criteria
- [ ] Perf readout visible on native
- [ ] Markers fire in correct order on resume path
- [ ] Baseline p95 recorded for 3 workflow sizes (spreadsheet in PR)

### Gate → adjust Phase 2
- If resume p95 already ≤1s on all sizes → Phase 3 progressive render **de-scoped**
- If pre-runner `getById` dominates latency → Phase 2 prioritizes unified open path

---

## Phase 2 — Unified workflow open path + perf lock

**Goal:** One code path opens the runner; ≤1s p95 enforced in CI.

### Tasks
1. **Wire `loadWorkflowOpenPayload`** into all four entry points:
   - `Dashboard.tsx` (start, resume, product workflow launch)
   - `AssetInstallationPage.tsx`
   - `ProjectAssetInspectionPage.tsx`
   - `WorkflowBuilder.tsx`
2. **Delete or deprecate** duplicated inline config+parse logic after wiring.
3. **`refreshWorkflowOpenDataInBackground`** after local open (reconcile, not block).
4. **New-run fast path** — if `shouldSkipRunMutation() || isCircuitOpen()`, skip POST attempt; create offline run immediately when config cached.
5. **Playwright perf spec** `e2e/offline-open-perf.spec.ts`:
   - Mock native platform + seeded IDB
   - Assert `interactive_ready - navigation_start ≤ 1000`
   - Assert no `network_request_start` before `interactive_ready` when offline flag set
6. **Vitest** for `loadWorkflowOpenPayload` (cache hit, cache miss, active run detection).

### Exit criteria
- [ ] All runner entry points call `workflowOpenService`
- [ ] CI perf test green
- [ ] Device remeasure: resume p95 ≤1s on assigned assets

### Gate → adjust Phase 3
- If CI passes but device fails → add Phase 3 progressive render
- If new-run still slow → extend fast path to Dashboard start buttons

---

## Phase 3 — Workflow write path hardening

**Goal:** Every run mutation offline-safe with correct ordering and idempotency.

### Tasks
1. **Audit `assetWorkflowRunService`** — ensure every mutation path:
   - tries local optimistic update first on native
   - enqueues with correct `opType`
   - sets `dependsOnOpId` where server ID not yet known
2. **Step saves** — coalesce rapid `STEP_RESULTS` patches per run (idempotency key includes step scope).
3. **`RUN_COMPLETE`** — queue only after local validation; surface 422 blocking-issue message on sync failure.
4. **Time entries** — verify `useOfflineTimeQueue` flush order after run ID remap.
5. **Asset status cascade** — offline Complete/Paused/InProgress updates `projectAssetService` local cache + dashboard cards.
6. **Consolidate `useSyncEngine.queueOrSend`** → delegate to `syncQueue.enqueue` with typed `opType` (non-run entities).

### Exit criteria
- [ ] Full workflow lifecycle offline: start → steps → pause → resume → issue → complete → field sign-off
- [ ] Reconnect sync with zero duplicates (idempotency test)
- [ ] Temp run ID remapped before dependent ops flush

### Gate → adjust Phase 4
- Any failing op type → add targeted fix before Phase 4 bootstrap work

---

## Phase 4 — Read path: all field screens local-first

**Goal:** No field screen blocks on network when cache exists.

### Tasks
1. **Dashboard (native)**
   - Seed all card data from `projectAssetService.*Local` methods first
   - Background refresh only; never empty card list on fetch failure
2. **AssetInstallationPage**
   - Replace remaining bare `getById` with `getByIdLocalFirst` + background refresh
   - Assignment priming on list load (already partial — complete coverage)
   - Offline message only when config truly absent from IDB
3. **Projects list / detail (native)**
   - Read from `ProjectRepository` cache; stale banner when >4h
   - Disable mutating buttons offline (clear tooltip)
4. **Issues board (native)**
   - Load open issues from `IssueRepository` / `assetWorkflowRunService.getOpenIssuesLocal`
5. **Workflow run history dialog**
   - List runs from `offlineStore.listRunsByAsset` first

### Exit criteria
- [ ] Airplane mode navigation: Dashboard → Assets → Resume → back — no spinners >1s
- [ ] No blank pages on fetch failure; cached data + banner

### Gate → adjust Phase 5
- Slow screens identified by perf log → target in Phase 5 media/bootstrap

---

## Phase 5 — Bootstrap completeness & media

**Goal:** Everything an installer needs is on device after one online session.

### Tasks
1. **Bootstrap audit**
   - Verify all `deepAssets` include assigned + InProgress + Paused + Pending
   - Add missing domains: open issues prefetch, closed issues cache, asset documents metadata
2. **`configMediaCache.prefetchConfig`** — verify all step reference images offline-decodable
3. **`documentService`** — prefetch PDFs/images for documents linked to assigned assets (bounded size cap)
4. **`mediaStore` eviction policy** — document limits; never evict pending upload blobs
5. **Bootstrap status in Settings** — last run time, asset count, "Ready for offline" badge
6. **First-open UX** — if asset visible but config missing, show "Connect once to download" with retry button

### Exit criteria
- [ ] Fresh install → login → wait bootstrap → airplane mode → all assigned workflows open
- [ ] Step reference photos render offline
- [ ] Documents linked to asset open offline when prefetched

### Gate → adjust Phase 6
- Large media blocking budget → lazy media tier (shell first, media on step scroll) in Phase 6

---

## Phase 6 — Issues, signatures, documents (write completeness)

**Goal:** All field capture modalities queue and sync.

### Tasks
1. **Signatures** — installer + customer pad offline; verify separate idempotency keys per role
2. **Asset issues** — create/resolve on asset record offline; sync via asset PATCH queue
3. **Run issues** — create/resolve with photo offline; `ISSUE_CREATE` / `ISSUE_UPDATE` with media deps
4. **Work instructions** — offline CRUD on assigned assets (if permitted by role)
5. **Asset document links** — attach/upload/detach offline (already partial — audit all paths)
6. **Missing photos repair flow** — offline capture from Dashboard + Assets attention widgets
7. **PhotoUploadDialog / mobile upload** — queue integration for QR upload path

### Exit criteria
- [ ] `RELEASE_CHECKLIST.md` offline section passes entirely
- [ ] Installer + customer signatures queued separately offline (manual QA)
- [ ] Issue with photo survives kill-app → sync

### Gate → adjust Phase 7
- Inspection scope decision: if field uses inspections heavily, prioritize Phase 7; else defer

---

## Phase 7 — Inspection workflows offline

**Goal:** Project asset inspection path parity with installation runs.

### Tasks
1. **`projectInspectionRunService` native layer**
   - Local-first list/create mirroring `assetWorkflowRunService` patterns
   - Route inspection runner through `loadWorkflowOpenPayload`
2. **`ProjectAssetInspectionPage`**
   - Cache-first load; offline runner open
3. **Bootstrap** — include inspection configs + runs in deep cache
4. **Queue op types** — reuse `RUN_*` or add `INSPECTION_*` if API differs

### Exit criteria
- [ ] Inspection run start/resume/complete offline on cached asset
- [ ] Sync remaps inspection run IDs correctly

### Gate → adjust Phase 8
- If inspection API incompatible with run queue → document server changes needed

---

## Phase 8 — Secondary screens & honest limits

**Goal:** Graceful degradation everywhere; no silent failures.

### Tasks
1. **Documents page** — offline browse cached; clear "not downloaded" per file
2. **Tips, Profile, Settings** — cached read-only where applicable
3. **Notifications inbox** — show cached last fetch; hide if empty offline
4. **Global search** — disabled offline with explanation (or local-only asset search)
5. **Geocoding / map fields** — skip offline; manual entry still works
6. **Manual offline mode** — verify toggle forces skip even on good radio (QA)
7. **Update `OFFLINE_FIRST_UX.md`** cheat sheet with final honest limits

### Exit criteria
- [ ] Every route shows purposeful offline UI (data, message, or disabled-with-reason)
- [ ] No infinite spinners on any native route

---

## Phase 9 — Sync engine, conflicts, edge cases

**Goal:** Production-grade sync under stress.

### Tasks
1. **Conflict UX** — Sync Center shows entity label, timestamp, diff summary
2. **409/412/422 handling** — per-op user messaging (blocking issues, version mismatch)
3. **Large queue flush** — 50+ pending ops: batch without UI freeze; progress in Sync Center
4. **SSE reconciliation** — on reconnect, invalidate stale caches; no duplicate apply
5. **Token expired offline** — show "Login expired" chip; queue preserved until re-auth
6. **Server unreachable vs radio off** — verify connectivity strip accuracy
7. **Concurrent web + phone edit** — manual QA scenario documented
8. **Dropped action recovery** — surface permanently failed ops with support export

### Exit criteria
- [ ] Conflict test scenario passes (web edit while phone offline)
- [ ] Queue survives token refresh cycle
- [ ] No S0/S1 sync defects in `BUG_TRIAGE.md` taxonomy

---

## Phase 10 — Acceptance testing & release gates

**Goal:** Ship with proof.

### Tasks
1. **Automated**
   - CI: perf spec + vitest sync/circuit tests + e2e smoke + e2e full
   - Optional: backend integration test for idempotent run create
2. **Device matrix** (record in PR sign-off):

   | Scenario | Pass | p95 open ms |
   |----------|------|-------------|
   | Airplane, small workflow, resume | | |
   | Airplane, large workflow, resume | | |
   | Captive Wi‑Fi, first open | | |
   | Backend down, cached open | | |
   | Offline start new run | | |
   | Kill app mid-run, reopen | | |
   | 20 queued ops, reconnect | | |
   | Conflict resolve | | |
   | Expired token, reconnect login | | |

3. **Update `RELEASE_CHECKLIST.md`** — link to this plan + UX doc
4. **Installer one-pager** — export `OFFLINE_FIRST_UX.md` §Quick reference for PDF/handout

### Exit criteria
- [ ] All matrix rows pass
- [ ] Release checklist Layer C offline section signed
- [ ] Draft PR merged; phone build staged 10% → 100%

---

## Phase 11 — Post-release monitoring

**Goal:** Catch regressions in the field.

### Tasks
1. Sync error telemetry (existing debug log → optional export in Sync Center)
2. Support playbook entry in `BUG_TRIAGE.md` for offline/sync issues
3. Quarterly restore + offline QA on staging

---

## Smoke test reference

### Automated (every phase gate)
```bash
# Blocking gates
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs typecheck backend test

# UI smoke (no API)
npm run test:e2e

# Login + API (when server available)
npm run test:e2e:full

# After Phase 2+
npx playwright test e2e/offline-open-perf.spec.ts
```

### Manual native (every phase gate)
1. Login online → wait 60s for bootstrap
2. Note assigned asset on Dashboard
3. Airplane mode ON
4. Dashboard → Resume → runner interactive (stopwatch ≤1s)
5. Complete one step → badge shows pending
6. Force-quit app → reopen → step saved
7. Airplane mode OFF → badge Synced within 2 min
8. Sync Center → no conflicts (or resolve one)

---

## Risk register

| Risk | Mitigation | Phase |
|------|------------|-------|
| First captive-WiFi open ~10s | New-run fast path + circuit; progressive render if needed | P2, P3 |
| Large workflow over 1s budget | Staged render shell → steps → media | P2 gate |
| Media storage fills device | Eviction policy; warn in Settings | P5 |
| Duplicate runs on sync | Idempotency + `dependsOnOpId` | P3 |
| Web offline regression | Native gate on every PR; web e2e unchanged | All |
| Inspection API mismatch | Spike in P7 before full build | P7 |

---

## Out of scope

- Web offline-first (intentional)
- BOM module offline (unless product enables flag + separate plan)
- Admin user/customer CRUD offline
- Real-time collaboration / live co-editing
- External customer sign URL generation offline

---

## Document map

| Doc | Audience |
|-----|----------|
| [`OFFLINE_FIRST_UX.md`](./OFFLINE_FIRST_UX.md) | Installers, PMs, QA — platform matrix + screen cheat sheet |
| This plan | Engineering — phased implementation |
| [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) | Release manager — sign-off |
| [`FIELD_RUN_QA_CHECKLIST.md`](./FIELD_RUN_QA_CHECKLIST.md) | QA — permissions + field flows |
| [`MOBILE_BUILD.md`](./MOBILE_BUILD.md) | DevOps — Capacitor build |

---

## Suggested execution order (summary)

```
P0 ✅ Baseline (on main)
P1  Measure + instrument
P2  Unified open + perf test      ← highest leverage
P3  Write path hardening
P4  All field screens local-first read
P5  Bootstrap + media completeness
P6  Issues / signatures / documents writes
P7  Inspection offline (if needed)
P8  Secondary screens + honest limits
P9  Conflicts + edge cases
P10 Acceptance + release
P11 Post-release monitoring
```

Each phase: **implement → review → bugs → smoke → adjust → gate → next**.
