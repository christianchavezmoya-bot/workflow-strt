# Field Test Round 2 — Investigation Report (2026-08-03)

## Summary

| # | Issue | Status | Root cause / fix |
|---|-------|--------|------------------|
| 1 | Adjust time → draggable timeline | **Implemented (v1)** | New `TimeEntriesTimelineEditor` with drag handles, multi-track layout, horizontal pan |
| 2 | Time tracker showing UTC on web | **Fixed in branch** | `useProjectTimeZone` + pass `timeZoneId` to runner/editor; user must deploy PR #48 + this branch |
| 3 | Lock run save ~4s | **Fixed (server)** | `SyncFromAssetsAsync` loaded all 1327 assets on every complete; now uses COUNT queries |
| 4 | CAD-0045 still "Pending sign" after web signatures | **Fixed (web refresh)** | Assets page did not listen to `notifications:run-state-changed`; runs merge kept stale multi-run cache |
| 5 | Phone offline run history — Sydney time | **PASS** | Native/offline path resolves project zone correctly |
| 6 | CAD-0047 — 14 pending sync items | **Expected queue depth** | See breakdown below; not a duplicate bug |

---

## 1. Draggable timeline (Adjust time)

**Before:** Table-only editor in `TimeEntriesEditorDialog`.

**Now:** Timeline view is the default. Users can:
- See productive (green) and downtime (orange) on separate tracks
- Drag segment start/end handles to resize (adjacent segments adjust)
- Scroll horizontally to pan the day span
- Switch to **Table** for add/delete/manual entry edits

**Not yet in v1:** Dragging whole segments to move in time, pinch zoom, paused/yellow track (Model B breaks remain non-proportional in read-only `RunTimeline`).

---

## 2. UTC on web time entries

When `timeZoneId` is undefined, `formatInstant(..., { withZone: true })` falls back to **UTC** and prints `"UTC"` in labels — exactly what the screenshot shows.

**Fix path:**
- `useProjectTimeZone(projectId)` reads Redux, then fetches `GET /projects/{id}` if missing
- Passed through `WorkOrderRunner` → `TimeEntriesEditorDialog` / `RunTimeline`

**Retest:** Pull branch `cursor/field-test-round2-fixes-cd21` (includes #48 timezone work). Open Adjust time on JO00991 — labels should show **AEST**, not UTC.

---

## 3. Lock run save latency (~4 seconds)

**Primary bottleneck (JO00991, ~1327 assets):**

Every `POST /asset-workflow-runs/{id}/complete` called `ProjectLifecycleService.SyncFromAssetsAsync`, which did:

```csharp
var assets = await _db.ProjectAssets.Where(...).ToListAsync(); // 1327 rows
```

**Fix:** Replace with two `CountAsync` queries (total vs incomplete). Also load only `IssuesJson` columns when checking open issues on complete (not full run rows).

**Web client:** Skip `mediaStore.resolveUploadPayload` on web complete — inline base64 needs no native media resolution.

**Target:** Sub-second complete on large projects after server fix; client-side JSON walk removed.

---

## 4. CAD-0045 — installer signature still pending on asset row

**Symptoms:** Workflow finished + both signatures captured in web runner, but Project Assets row still shows **Pending sign** / **Installer Sign-off**.

**Root causes:**
1. **Web signature path** fired `notifications:run-state-changed` but **not** `workflow-runs-cache-updated`. The Assets page only listened to the latter (native path).
2. **Runs merge bug:** When an asset had **2+ cached runs**, `refreshAssets` always kept the old `prevRuns` array, even when the server returned fresher signature status.

**Fixes:**
- Assets page (web): listen to `notifications:run-state-changed` and `repo:runs:updated` → `refreshAssets()`
- `signatureService` (web): after submit, fetch updated run and dispatch `workflow-runs-cache-updated`
- Merge runs **by id**, preferring whichever copy has the latest `updatedAt`; preserve `dirty=true` offline runs only

---

## 5. Phone offline run history — PASS

Offline run history uses project timezone from cached project record. No action required.

---

## 6. CAD-0047 — 14 pending sync items

### What the queue contains

Offline workflow completion enqueues a **dependency chain** per run:

| Op type | Typical count | Depends on |
|---------|---------------|------------|
| `TIME_ENTRY` | 1 per start/pause/resume/stop | Previous TIME_ENTRY or RUN_CREATE |
| `RUN_COMPLETE` | 1 | Last TIME_ENTRY |
| `SIGNATURE_SUBMIT` (Installer) | 1 | RUN_COMPLETE |
| `SIGNATURE_SUBMIT` (Customer) | 1 | Installer signature |
| `patchTimeEntries` (if time edited) | 0–1 | — |

**Example:** A run with 3 pauses/resumes → ~3 TIME_ENTRY + 1 RUN_COMPLETE + 2 signatures = **6 ops**.  
With more pauses, time edits, or retries → **10–14 ops** for one asset is normal.

Sync Center screenshot showed **4 labelled cards** (Complete run, Customer sign-off, Update time tracking, Installer sign-off) because grouped/labeled ops surface the milestone actions; the remaining ~10 are chained `TIME_ENTRY` ops (also labelled "Update time tracking").

### Why items show "InProgress"

During flush, the sync engine sets status `uploading` on the op being sent. Dependent ops wait until the parent completes (`dependsOnOpId` gating). While flush is active, visible cards show **InProgress**.

### When items get stuck

Ops remain pending if:
- First op in chain fails (422 business rule, 409 conflict) — dependents are skipped for that run
- Network drops mid-flush — `uploading` reset on reconnect via `pendingResetRetrySchedule`
- Server unreachable while "Work offline" is OFF but queue not flushing

### Recommended field actions for CAD-0047

1. Open Sync Center → **Sync Now** when online
2. If stuck >2 min, tap **Copy support bundle** and check first failed op error
3. Expand **Technical details** on the earliest pending `TIME_ENTRY` — if it failed, fix/resume before signatures can proceed

### Not a duplicate-enqueue bug

Each pause/resume intentionally creates a distinct ordered `TIME_ENTRY` so server time totals match what happened offline. Collapsing them would under-count (prior bug documented in `enqueueTimeEntry` comments).

---

## Branches / PRs

- **#48** `cursor/timezone-and-run-query-perf-cd21` — timezone propagation, run list query perf
- **This work** `cursor/field-test-round2-fixes-cd21` — signature refresh, lock perf, timeline editor, sync report

## Retest checklist

- [ ] Web Adjust time: timeline default, drag segment edge, save, totals update
- [ ] Web time labels: AEST not UTC on JO00991
- [ ] Lock run: save completes in <1s on JO00991
- [ ] CAD-0045 (or new asset): both signatures → asset row shows Closed/Complete, not Pending sign
- [ ] CAD-0047: Sync Now clears queue in order; count drops as TIME_ENTRY chain flushes
