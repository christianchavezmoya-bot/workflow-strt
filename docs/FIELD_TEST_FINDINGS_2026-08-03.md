# Field test findings — performance, sync, and readable UI

**Date:** 2026-08-03  
**Tester:** Juan Perez (Installer, phone + web PM)  
**API under test:** `http://10.7.15.159:4000/api`  
**Main @:** `d7ad54e` (Fix 1/2 + Phase 1/2 time-tracker foundation + Job History reconcile)

---

## Executive summary

Manual testing on phone and web confirms **Fix 1/2 offline start time works** (CAD-0038 PASS), but three systemic problems block field use:

1. **Sync queue stuck** — signature + complete-run POSTs stay pending at 0% upload; jobs never reach server Complete state.
2. **Performance** — web asset create/edit keystrokes lag badly; phone offline workflow saves are very slow (`Saving…` spinner).
3. **Unreadable sync UI** — Sync Center pending queue shows raw API paths and UUID fragments instead of asset tag / job number / action type.

Until sync completes reliably, **Job History will not update** even when the phone UI shows 100% complete locally.

---

## PASS — time tracker (Fix 1/2)

| Case | Result | Notes |
|------|--------|-------|
| CAD-0038 offline start | **PASS** | Started run before going offline; tracked time and date populate correctly after reconnect/sync. |

Phase 0 code review + unit tests (12/12 on handover branch) also pass for `canEditRun` ladder and Model B timeline math.

---

## FAIL — sync reliability

### Symptoms (from screenshots)

- Topbar: **14 pending** while offline banner says **0 changes waiting to sync** (count mismatch).
- Sync Center: **Server reachable** + **Has signal**, but **SYNC 4 uploading · 0%** stuck.
- Pending queue rows show:
  - Title: `Workflow run · 569e0a31` (UUID fragment)
  - Subtitle: `POST /signature-events?runId=569e0a31-…` or `POST /asset-workflow-runs/569e0a31-…`
- Diagnostics: endless `queue_flush_start` / `queue_flush_end` loop (flush storm).

### Likely root causes

| Layer | Cause | Key files |
|-------|-------|-----------|
| Flush gating | `useSyncEngine` skips flush when connectivity is `server-unreachable` even if user has signal | `useSyncEngine.ts`, `connectivityMonitor.ts` |
| Health ping | Wrong/stale `VITE_API_BASE` or failed asset fetch marks server unreachable | `networkService.ts`, `.env` |
| Dependency chain | `SIGNATURE_SUBMIT` depends on `RUN_COMPLETE`; if run-create never mapped, downstream POSTs never send | `signatureService.ts`, `syncQueue.ts` |
| Flush storm | Repeated flush attempts while blocked or failing | `useSyncEngine.ts` |

### Proposed fixes (P1)

1. **Decouple false offline** — treat “has signal + recent successful GET” as flush-eligible; don’t block entire queue on ping failure alone.
2. **Debounce queue flush** — coalesce `queue_flush_start/end` to one attempt per 2–5 s while pending.
3. **Surface flush block reason** in Sync Center (“Waiting: server unreachable” vs “Uploading 2/4”).
4. **After successful flush** — refresh dashboard workspace from server + local asset cache (`projectAssetService.reconcileWorkspaceWithLocalStatus`).

---

## FAIL — Job History not updating

### Symptoms

- CAD-0038 / CAD-0040: completed offline with installer + customer signatures; still in **My Jobs Today** after sync.
- Contradictory UI on same asset:
  - One view: **100% completed** + **In Progress** / Continue Run
  - Another view (offline): **Not Started** / Start Run
- Web project assets table shows mixed statuses for JO00991 (some Complete, some In Progress).

### Likely root cause

Job History is driven by **server** workspace status. Pending `RUN_COMPLETE` + `SIGNATURE_SUBMIT` ops mean the server never received Complete — local optimistic UI advanced, server did not. `reconcileWorkspaceWithLocalStatus` (`b5f5d32`) only helps when **local** asset cache is already Complete **and** sync has applied.

### Proposed fixes (depends on P1 sync)

1. Fix sync flush first (above).
2. On flush success for `RUN_COMPLETE` / signatures, emit `dashboard-workspace-refresh` and re-fetch workspace.
3. Add installer-visible banner when local status is Complete but queue still has complete/sign ops: *“Finished on phone — waiting to sync to server.”*

---

## FAIL — web performance (keystroke lag)

### Symptoms

Admin/PM asset create and edit: very slow, unresponsive keystrokes; pages sometimes fail to render.

### Likely root cause

PR [#44](https://github.com/christianchavezmoya-bot/workflow-strt/pull/44) (`da99150`) **not on `main`**. Known N+1 patterns:

- Per-keystroke refetch of feature dependencies
- Per-asset document link fetches
- Capture table full rebuild on every form change

### Proposed fix (P0)

Cherry-pick `da99150` onto current `main` (do **not** merge PR #44 as-is — branch is 13 commits behind and would revert time-tracker work).

---

## FAIL — phone offline workflow UX (slowness)

### Symptoms

- **Saving…** spinner persists on consumables confirm and step navigation during offline runs.
- Time tracker UI works but step transitions feel sluggish.

### Likely causes

- Large optimistic writes to IndexedDB + offline store on every step
- Sync engine flush storm competing for main thread
- Possible redundant `workflow-runs-cache-updated` / dashboard re-renders

### Proposed fixes (P2)

1. Batch step saves (debounce 300–500 ms) for non-critical fields.
2. Stop flush loop when offline (`navigator.onLine === false`).
3. Profile with Sync Center diagnostics after P1 debounce.

---

## FAIL — unreadable / “JSON” data shown to users

This is the issue highlighted in the latest screenshots. Technicians see **internal API and ID data** instead of field-friendly labels.

### Where it appears today

| Surface | Bad example | What user expects |
|---------|-------------|-------------------|
| Sync Center pending queue | `Workflow run · 569e0a31` | `CAD-0038 · JO00991` |
| Sync Center subtitle | `POST /signature-events?runId=569e0a31-…` | `Installer sign-off · In Progress` |
| Sync Center conflicts (fallback) | `PATCH /asset-workflow-runs/…` | Asset tag + “Save workflow progress” |
| Topbar vs banner | `14 pending` vs `0 changes waiting` | Single consistent pending count |
| Diagnostics (default visible) | `queue_flush_start` spam | Hidden unless “Technical details” expanded |

### Root cause in code

`resolvePendingActionLabel` treated `entityId` on `workflow-run` actions as an **asset id**. For runs and signatures, `entityId` is the **run UUID**, so lookup fails and falls back to `entityId.slice(0, 8)` and `action.url`.

```62:67:src/utils/syncActionLabels.ts
// Before fix: looked up asset by run UUID → showed "569e0a31" + raw URL
```

Sync Center also used `action.url` as subtitle fallback while labels were loading.

### Fix implemented (this branch)

**Branch:** `cursor/sync-center-readable-labels-cd21`

1. **`syncActionLabels.ts`** — resolve run → asset → project job number via `offlineStore` / `entityGetWorkflowRun` / `entityGetAsset`.
2. **`describeSyncOpType`** — map `SIGNATURE_SUBMIT`, `RUN_COMPLETE`, etc. to plain English.
3. **`SyncCenterPage.tsx`** — remove raw URL from default row; show **Technical details** collapse (API path only when expanded).
4. **Unit tests** — `src/utils/syncActionLabels.test.ts`.

**After fix, pending row example:**

| Field | Value |
|-------|-------|
| Title | `CAD-0038 · JO00991` |
| Subtitle | `Customer sign-off · InProgress` |
| Technical details (collapsed) | `POST /signature-events?runId=…` |

### Remaining readable-data gaps (not in this PR)

| Surface | Proposal |
|---------|----------|
| Topbar pending badge vs offline banner | Single source: `useSyncEngine().pendingCount` everywhere |
| Dashboard job cards | Prefer `assetTag` + `jobNumber - customerName` over bare `JO00991` |
| Global search snippets | Cherry-pick from PR #44 search sanitization |
| ApiDebugPanel / Diagnostics markers | Keep behind debug flag; default collapsed on phone |

---

## Recommended fix order

| Priority | Work | Unblocks |
|----------|------|----------|
| **P0** | Cherry-pick web asset perf (`da99150`) | Web admin usability |
| **P0** | Sync Center readable labels (**this branch**) | Installer trust in pending queue |
| **P1** | Sync flush stuck + false offline + flush debounce | Signatures → server Complete → Job History |
| **P1** | Post-flush dashboard workspace refresh | My Jobs / Job History accuracy |
| **P2** | Phase A time-tracker UI (`canEditRun().data`, Adjust time) | Capture edit locks |
| **P2** | Offline step save debounce | Phone workflow speed |

---

## Retest checklist (after P0 + P1)

### Phone

1. Complete CAD-0038 offline (install + customer sign-off).
2. Sync Center pending rows show **asset tag + job # + action type** (no raw URLs).
3. Sync Now → progress reaches 100%; pending count → 0.
4. Job moves from **My Jobs Today** to **Job History**.
5. Web project assets shows **Complete** for that asset.

### Web

1. Create/edit asset on JO00991 — keystrokes stay responsive.
2. PM view matches phone status after sync.

---

## References

- Time tracker handover: `docs/TIME_TRACKER_HANDOVER_PLAN.md`
- Phase 0 smoke: `docs/PHASE0_TIME_TRACKER_SMOKE_REPORT.md`
- Web perf PR: [#44](https://github.com/christianchavezmoya-bot/workflow-strt/pull/44) (cherry-pick only)
- Sync labels PR: (this branch)
