# Field test findings — Round 2 (web + phone)

**Date:** 2026-08-03  
**Tester:** Juan Perez (Installer)  
**Environment:** Web @ `192.168.1.104:5173`, phone online/offline  
**Code under test:** `main` @ `e0cff04` (#44 + #46 + #45 + #47 merged)

---

## Executive summary

| # | Issue | Severity | Verdict |
|---|--------|----------|---------|
| 1 | Web keystroke lag (~6s) | **S0** | **Partial fix in PR** — add-asset dialog isolated; edit dialog still re-renders page; backend run query optimized |
| 2 | Web summary UTC times (CAD-0041) | **S1** | **Fixed in PR** — project has `Australia/Sydney`; `timeZoneId` was not reaching `RunTimeline` / editor at runtime |
| 3 | Adjust time = old table, not draggable timeline | **S2 (gap)** | **Not implemented** — mockup is future work; Phase A shipped read-only bar + table editor |
| 4 | Back to steps works | **PASS** | — |
| 5 | Phone UTC times (CAD-0042) | **S1** | Same root cause as #2 |
| 6 | Phone missing Adjust time / Back to steps | **S1** | Likely **footer overflow** on `maxWidth="sm"` + verify phone build @ `e0cff04` |
| 7 | Lock run slow | **S1** | Up to **60s network timeout** before offline path + heavy IndexedDB chain |
| 8 | Phone online/offline notifications / refresh | **S1** | **No connectivity toasts**; dashboard misses several reconnect events |
| 9 | Offline start → “No workflow assigned” | **S0 regression** | Assignment cache empty offline → repository returns `[]` |

---

## 1. Web keystroke lag (~6 seconds) — STILL FAIL

### What you saw
Asset create/edit dialog: each keystroke takes several seconds.

### What #44 fixed (on `main`)
- Batched `featureDependencyService.mapByProduct` (one call per product, not N× per feature)
- Batched `assetDocumentLinkService.countsByScope`
- Capture table no longer rebuilds on **page search** keystroke

### What #44 did **not** fix
`AssetInstallationPage.tsx` (~7,800 lines) holds `editForm` / `addForm` at the **root**. Every field `onChange` → `setEditForm` → **full page re-render**, including:

- Operations table: all visible asset rows + feature completeness chips (JSON parse per row)
- Embedded `CaptureSpreadsheetDialog` when capture view is active (still keyed on filtered `displayAssets`)
- Asset search dialog loop (unmemoized) if that dialog is open

**No API calls fire per keystroke** — this is pure React reconciliation cost.

### Fix in PR (partial)
1. **Add asset:** `AssetAddDialog` holds form state — typing no longer re-renders the 7.8k-line page
2. **Backend:** `GET /asset-workflow-runs/by-project/{id}` now loads lightweight run keys first, then fetches full rows only for the 1–2 representative runs per asset (was loading **all** historical runs with JSON blobs — 708ms–1368ms in API logs for ~1300 assets)
3. **Still TODO:** Extract **edit** asset dialog the same way; memoize capture spreadsheet when open

### API log evidence (JO00991 slowness)
When the web app felt slow, the API showed repeated heavy queries for the Yancoal project (~1327 assets):
- `AssetWorkflowRuns` bulk SELECT with `ORDER BY StartedAt DESC` — **708ms** and **1368ms**
- Duplicate dashboard workspace fetches (assets + runs + assignments)
- Notification inbox queries — **194ms**, **315ms**

The run-list optimization targets the 708ms/1368ms queries directly.

---

## 2 & 5. UTC times on web (CAD-0041) and phone (CAD-0042) — FAIL (fix in progress)

### What you saw
- Summary **Start/Finish:** `Aug 3, 2026, 5:46 AM` (reads as UTC)
- **Adjust time** table: `Aug 3, 2026, 03:46 PM` (device local — e.g. UTC+10)

That **10–11 hour gap** is exactly “UTC display vs Sydney local” for the same instant.

### Corrected root cause (2026-08-03 retest)
JO00991 **does** have `Australia/Sydney` set in the project edit UI. The bug is **not** missing DB configuration.

| Component | Timezone source | What went wrong |
|-----------|-----------------|-----------------|
| `RunTimeline` (summary bar) | `timeZoneId` prop → `formatInstant` | Prop was **undefined at runtime** (Redux list cache / no single-project fetch fallback) → falls back to UTC |
| `TimeEntriesEditorDialog` | Was `toLocaleString` / device `datetime-local` | Used **device local**, not project zone — matched Sydney by coincidence on AU devices |

### Fix (PR `cursor/timezone-and-run-query-perf-cd21`)
1. `useProjectTimeZone(projectId)` — Redux first, then `GET /projects/{id}` if zone missing from list cache
2. Pass zone into `TimeEntriesEditorDialog`; format and edit in project wall-clock via `utcToDatetimeLocalInZone` / `datetimeLocalInZoneToUtc`
3. Dashboard + Assets runner wired through the hook; Assets also falls back to `selectedProject.timeZoneId`

### Retest after pull
- Summary Start/Finish on CAD-0041 should show **~3:46 PM AEST**, matching Adjust time table
- Phone: rebuild Capacitor bundle from same commit and retest

---

## 3. Adjust time = old table, not draggable Clockify-style editor — GAP (not a bug)

### What you saw
“Adjust time” opens **Time Entries — Run #1** table (add row, edit, delete).

### What was shipped (Phase A / #47)
- **Read-only** `RunTimeline` on summary (Model B proportional bar + break dividers)
- **Table editor** `TimeEntriesEditorDialog` (existing) — gated by `canEditRun().time`

### What was **never built**
Your mockup (slide segment boundaries, multi-track productivity/downtime, drag to adjust) is **Phase 5+ / new feature**. Not in handover Phase A–D scope.

`RunTimeline.tsx` line 23–24 explicitly states editing is via `TimeEntriesEditorDialog`.

### Proposed fix (new feature)
- **Phase E:** Interactive timeline editor component (drag segment edges, recalc entries client-side, save via existing `PATCH time-entries`)
- Ignore “Paused” track per your note — Model B already treats pauses as thin dividers

---

## 4. Back to steps — PASS

Works on web as reported. Implemented in #47 summary `DialogActions` when `runEditPerms.data` is true.

---

## 6. Phone missing Adjust time / Back to steps — FAIL (investigate)

### Code state on `main`
Buttons exist on **summary** stage only (`WorkOrderRunner.tsx` ~2616–2632), gated by:
- `!saved` (hidden after Lock run)
- `runEditPerms.data` / `runEditPerms.time`

**Installer on InProgress run** should see both buttons.

### Likely causes
1. **Stale phone build** — rebuild required: `npm run build && npx cap sync ios` after pulling `e0cff04`
2. **Footer layout** — dialog is `maxWidth="sm"`. Left stack (Discard / Back / Adjust) vs right stack (Resolve issues / Add photos / Lock run) has **no `flexWrap`** — on narrow phones left buttons can clip or sit off-screen
3. **Wrong stage** — buttons only on **summary**, not consumables/sign/installer-sign stages. Running stage has header “Edit Times” only
4. **Permission ladder** — if run is `PendingCustomer`, Engineer loses edit; Installer should retain access

### Proposed fix
1. Confirm phone build hash matches `e0cff04`
2. Summary `DialogActions`: `flexWrap="wrap"`, stack primary actions on two rows for native
3. Duplicate “Adjust time” / “Back to steps” in a visible summary toolbar above the fold on mobile

---

## 7. Lock run slow — FAIL

### Call chain
`WorkOrderRunner.handleSave` → `flushTimeQueue()` (non-blocking) → `assetWorkflowRunService.completeRun()` → `transitionToLockedRunStage()`

### Bottlenecks
| Step | Issue |
|------|--------|
| Online attempt first | Up to **60s timeout** (`RUN_MUTATION_TIMEOUT_MS`) if server slow/unreachable before offline fallback |
| Offline `completeRun` | Sequential: `offlineStore.saveRun` → asset sync → `entityReplaceIssuesForAsset` → queue scan → enqueue |
| Every save/lock | `deriveOpenIssuesFromRun` loads **all projects** from IndexedDB (`entityGetAllProjects`) |
| UI | `setSaving(true)` for entire operation — spinner visible whole time |

### Proposed fix
1. Skip network attempt when offline or circuit open (go straight to queue)
2. Cache project lookup per `projectId`; don’t scan all projects per save
3. `completeRun` offline: dispatch `notifications:run-state-changed` (currently missing vs `patchIssues`)
4. Show progress text (“Saving run…”, “Queuing sync…”) instead of blocking spinner

---

## 8. Phone online/offline notifications & refresh — FAIL

### What you expected
Visible offline/online transition and dashboard/assets refresh when connectivity returns.

### What exists
- `SyncStatusBadge` / connectivity chips update state
- **No user toast** on reconnect ( `FieldNotification` is unrelated — settings field names only)
- `NotificationInbox` debounced refresh **skips when offline** (`shouldSkipBlockingFetch()`)
- `Dashboard` listens to `notifications:refresh`, `repo:*`, `sync-engine:flush-complete` — but **not** `offline-mode-online`, `app-foregrounded`, `bootstrap:complete`, Capacitor network events

### P1 #47 improvements (partial)
- Flush debounce, less false offline — helps sync but **does not add notifications**

### Proposed fix
1. Native toast/banner on `offline-mode-online` / radio loss (“Back online — syncing…”)
2. Dashboard: listen to `offline-mode-online`, `app-foregrounded`, `bootstrap:complete`
3. NotificationInbox: refresh when server reachable even if inbox was empty offline

---

## 9. Offline workflow start → “No workflow assigned” — S0 REGRESSION

### What you saw
Asset already has workflow assigned on server; phone offline shows **“No workflow assigned to this asset yet”** and **Assign Workflow**.

### Root cause chain

```
Dashboard.openQuickActionDialog
  → assetWorkflowAssignmentService.listByAsset(asset.id)
    → WorkflowAssignmentRepository.listByAsset
      → getLocalByAsset → empty?
      → if offline (shouldSkipBlockingFetch): return []   ← treats empty as “no assignment”
```

**Empty IndexedDB ≠ confirmed unassigned.** Assignments are only deep-cached for bootstrap subset (`offlineBootstrapService` phase 6, assigned/active assets). Dashboard **does not** prime assignment cache (Assets page does at `AssetInstallationPage.tsx:1208–1237`).

Also: quick-action dialog state is **not refreshed** when `repo:assignments:updated` fires while dialog is open.

### Why it worked before
Regression likely from stricter offline empty-cache return + dashboard not preloading assignments for My Jobs cards.

### Proposed fix (P0 offline)
1. Dashboard: preload assignments from IndexedDB for all `myInstallAssets` on native boot (mirror Assets page)
2. Repository: offline + empty local → return “unknown” / try cached asset `productConfigId` workflow fallback — **never show “No workflow” from empty cache alone**
3. Expand bootstrap phase 6 to all workspace assets, not only `deepAssets` filter
4. Refresh quick-action assignments on `repo:assignments:updated` and `bootstrap:complete`

---

## Priority fix order

| Priority | Work | Fixes issues |
|----------|------|--------------|
| **P0** | Offline assignment cache + dashboard prime | #9 |
| **P0** | Asset form isolate re-render (web perf v2) | #1 |
| **P1** | Set/pass project `timeZoneId`; editor uses project zone | #2, #5 |
| **P1** | Summary footer mobile layout; verify cap sync | #6 |
| **P1** | Lock run perf + notification events | #7 |
| **P1** | Connectivity toasts + dashboard reconnect listeners | #8 |
| **P2** | Draggable timeline editor (Clockify-style) | #3 |

---

## Retest checklist (after fixes)

### Web
- [ ] Asset edit: keystroke < 300ms perceived lag
- [ ] CAD-0041 summary Start/Finish in **project local time** (with zone label)
- [ ] Adjust time table matches summary times

### Phone
- [ ] Pull `main`, rebuild, cap sync
- [ ] Offline: open CAD asset with known assignment → **Start Run** (not “No workflow”)
- [ ] Online summary: **Adjust time** + **Back to steps** visible
- [ ] Times in project zone
- [ ] Reconnect: banner + dashboard refresh
- [ ] Lock run: completes in < 3s offline

---

## References

- Round 1 findings: `docs/FIELD_TEST_FINDINGS_2026-08-03.md`
- Time tracker plan: `docs/TIME_TRACKER_HANDOVER_PLAN.md`
- Key files: `AssetInstallationPage.tsx`, `RunTimeline.tsx`, `TimeEntriesEditorDialog.tsx`, `WorkflowAssignmentRepository.ts`, `useSyncEngine.ts`, `Dashboard.tsx`
