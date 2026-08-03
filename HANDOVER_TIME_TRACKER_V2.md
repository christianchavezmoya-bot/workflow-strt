# Time Tracker Handover — V2 (canonical)

**Last updated:** 2026-08-03  
**Validated against:** `main @ 30686e4` (PRs #48–#52 merged)  
**Field status:** Time tracking **working OK** on web + phone (JO00991). Remaining work is **display polish** and deferred phases below.

**Companion docs**

| Doc | Purpose |
|-----|---------|
| `docs/TIME_TRACKER_HANDOVER_PLAN.md` | Agent implementation plan derived from this file |
| `docs/TIME_EDITOR_UX_PROPOSAL.md` | Clockify-style timeline UX (v3 shipped) |
| `docs/PHASE0_TIME_TRACKER_SMOKE_REPORT.md` | Phase 0 verification checklist |
| `docs/FIELD_TEST_ROUND2_2026-08-03.md` | Round 2 field findings |
| `docs/FIELD_TEST_ROUND2_INVESTIGATION_2026-08-03.md` | Root-cause notes for UTC, lock perf, sync |

---

## 1. Goals (unchanged)

1. **Accurate run time** — productive / downtime stored as UTC instants; totals survive offline sync.
2. **Project-site display** — all user-visible times in the project IANA zone (e.g. `Australia/Sydney` / AEST), not device local or mislabeled UTC.
3. **Post-run correction** — installers adjust time before sign-off; PM/Admin can correct after installer sign until customer sign.
4. **Read-only summary timeline (Model B)** — proportional productive/downtime bar; pauses are thin break dividers, not fat “paused” blocks.
5. **Single editor** — `TimeEntriesEditorDialog` only; timeline + table are views of the same data.

---

## 2. Architecture rules (do not break)

| Rule | Detail |
|------|--------|
| **UTC storage** | `startedAtUtc` / `endedAtUtc` on entries; `StartedAt` on runs. Never store wall-clock strings. |
| **Display** | `formatInstant(iso, timeZoneId, …)` from `src/utils/datetime.ts`. Resolve zone via `useProjectTimeZone(projectId)` (Redux → single-project fetch → office-country inference). |
| **Model B pauses** | Gaps > 60s between segments → `break` in `timelineModel.ts`; not a third “paused” category in stored JSON. |
| **Edit ladder** | `canEditRun(run, role)` in `src/utils/runEditPermissions.ts` — `.time` and `.data` independently. |
| **Frontend-first locks** | UI gates until Phase 5 backend enforcement. |
| **One editor** | Do not fork a second time UI; extend `TimeEntriesEditorDialog` / `TimeEntriesTimelineEditor`. |
| **Commits** | One logical fix per commit; frontend phases avoid `server/` unless explicitly scoped. |

---

## 2b. Signature lifecycle & edit rights

This section is the plain-language contract for **who can change what, when**, and how that relates to dashboard bucketing. It complements the shipped ladder in §3 (Phase 1) and the deferred **corrected run** work in §6 Phase F.

### Lifecycle stages (run + asset)

| Stage | Trigger | `run.isLocked` | `run.signatureStatus` | `asset.status` | Typical UI |
|-------|---------|----------------|----------------------|----------------|------------|
| **In progress** | Installer starts run | `false` | `None` | `InProgress` | Runner steps, live timer |
| **Summary review** | All steps done, not yet saved | `false` | `None` | `InProgress` | Summary → **Adjust time** / **Back to steps** |
| **Locked — awaiting installer** | `completeRun` succeeds | `true` | `PendingInstaller` | **`Pending`** | Installer sign screen |
| **Locked — awaiting customer** | Installer signs | `true` | `PendingCustomer` | **`Complete`** | Customer sign / send link |
| **Finalized** | Customer signs (or decline/waive path) | `true` | `Signed` / `Declined` / `WaivedCustomer` | **`Closed`** (or `Complete` on decline) | Read-only history |

**Key server transitions** (`AssetWorkflowRunsController.CompleteRun`, `SignatureEventsController`):

- Completing a run **locks** it and sets `signatureStatus = PendingInstaller`. Asset becomes **`Pending`**, not `Complete` — field work is done but sign-off chain is not.
- **Installer sign** advances to `PendingCustomer` and promotes asset to **`Complete`**.
- **Customer sign** finalizes the run and sets asset to **`Closed`** (accepted) or back to **`Complete`** (declined).

`isLocked` means the run row rejects further step/time mutations on the server. **`signatureStatus`** drives the edit ladder (`canEditRun`); they are related but not identical — a run is locked from the moment of completion, while edit rights change again at each signature milestone.

### Edit rights matrix (plain language)

Source: `src/utils/runEditPermissions.ts`. Roles: **Installer/Engineer** vs **Admin / PM / Supervisor**.

| Stage | Adjust / edit **time** | Edit **field captures** (steps) | Notes |
|-------|------------------------|----------------------------------|-------|
| Before installer sign (`None`, `PendingInstaller`) | Installer + PM | Installer + PM | Full access via summary **Adjust time** and **Back to steps** |
| After installer sign, before customer (`PendingCustomer`) | **PM only** | **PM only** (ladder) | Installer sees read-only time and captures |
| After customer sign (`Signed`, `Declined`, `WaivedCustomer`) | **Nobody** | **Nobody** | Corrections require a **new run** (§6 Phase F — not built) |

### Where edits happen in the UI

| Action | Location | Gate |
|--------|----------|------|
| **Adjust time** | Run summary footer (`WorkOrderRunner`) | `runEditPerms.time` |
| **Edit Times** (live) | Runner header while tracking | `runEditPerms.time` |
| **Back to steps** | Run summary footer | `runEditPerms.data` |
| Capture autosave | Runner step inputs | `runEditPerms.data` (`setInputValue` no-ops when false) |
| **Clock icon → time editor** | `WorkflowRunHistoryDialog` per run | `canEditRun(...).time` → `TimeEntriesEditorDialog readOnly` |
| **Continue** (resume in-progress run) | Run history | Only `!run.isLocked && run.status === "InProgress"` |

### Known gaps (do not assume these work today)

1. **PM capture edit on locked `PendingCustomer` runs** — The ladder grants `.data` to PM/Admin, but a locked completed run routes to the **customer-sign** stage (`transitionToLockedRunStage`), not back to running steps. There is no first-class “reopen captures on locked run” flow; PM time correction via history clock icon works, capture correction on the same run does not.
2. **Opening a locked run from dashboard** — `openQuickActionOrStart` resumes only **unlocked** active runs. Locked runs open the quick-action dialog / sign flow instead of the step editor.
3. **Post–customer-sign corrections** — Deferred Phase F: **Re-run / corrected run** with prefill + justification. Until then, finalized runs are immutable; any fix needs a new workflow run.
4. **Client offline rebucket** — `reconcileWorkspaceWithLocalStatus` treats only `Complete`/`Completed` as history; `Closed` assets can fall out of both buckets until the next online workspace fetch (server handles `Closed` → history correctly).

### My Jobs Today vs Job History — why “100% completed” stays in My Jobs

**Observed (phone, online):** Asset card in **My Jobs Today** shows **“100% completed”** even though the installer expects it under **Job History**.

**Root cause — two different “completion” concepts:**

| What the card shows | What controls the bucket |
|---------------------|---------------------------|
| `formatMyJobsStepCompletionLabel(completedSteps, totalSteps)` → e.g. **“100% completed”** | **`asset.status`**, not step % |

Bucketing rules:

- **Client** (`projectAssetService.bucketWorkspaceItems`): **My Jobs Today** = status **not** `Complete` / `Completed` / `Closed`; **Job History** = `Complete` or `Completed` only.
- **Server** (`ProjectAssetsController.IsCurrentWorkspaceAsset`): Same terminal check, plus locked run with `PendingInstaller` **stays current** intentionally (installer must sign from My Jobs).

**Typical sequence that produces the confusion:**

```
All workflow steps finished  →  card shows "100% completed"
        ↓
completeRun (lock)           →  asset.status = "Pending"  →  STILL in My Jobs Today
        ↓
installer signs              →  asset.status = "Complete" →  moves to Job History
        ↓
customer signs               →  asset.status = "Closed"   →  server → Job History
```

So **100% on the card means “all workflow steps captured”**, not “asset lifecycle finished”. Until installer sign promotes the asset to `Complete`, the job correctly (by current rules) remains in **My Jobs Today** — but the **“100% completed”** label reads like Job History material.

**Less common variants:**

- Steps at 100% but run not yet completed (`completeRun` not called) — asset still `InProgress`, stays in My Jobs.
- `pendingSigs` not loaded / not matching asset id — card chip may show **In Progress** instead of **Pending sign** even though the run is locked awaiting signature.

**Product fix options (not implemented — pick one before coding):**

| Option | Behavior |
|--------|----------|
| **A. Clearer label** | When locked + all steps done, show **“Awaiting sign-off”** instead of **“100% completed”** on My Jobs cards |
| **B. Rebucket after lock** | Move to Job History when `run.isLocked && completedSteps >= totalSteps`, even if `asset.status === Pending` |
| **C. Earlier status promotion** | Set `asset.status = Complete` at `completeRun` (conflicts with today’s `Pending` = awaiting installer semantics) |
| **D. Hybrid** | Keep in My Jobs until installer sign, but replace step-% with signature-stage chip text |

**Recommended for next UX pass:** **A + D** (label fix, low risk) unless product wants sign-off items out of My Jobs entirely (**B**).

**Files to touch for a fix:** `Dashboard.tsx` (`formatMyJobsStepCompletionLabel`, `getMyJobsCardAction`), optionally `ProjectAssetsController.IsCurrentWorkspaceAsset` / `BuildHistoryStatus` for server-driven rebucket.

---

## 3. Shipped on main (do not re-implement)

### Fix 1 + 2 — Offline / client start time (`242f0c7`)

- Client sends `startedAtUtc` + initial `timeTrackingJson` on `startRun` (online and offline queue).
- Server accepts client stamp when parseable; `RecomputeRunTimeMetrics` guards inverted windows.

### Phase 1 — Edit permission ladder (`d7ad54e` + tests)

| `signatureStatus` | Installer / Engineer | Admin / PM / Supervisor |
|-------------------|----------------------|-------------------------|
| `None`, `PendingInstaller` | edit time + data | edit time + data |
| `PendingCustomer` | read-only | edit time + data |
| `Signed`, `Declined`, `WaivedCustomer` | read-only | read-only |

**Gates wired:** `TimeEntriesEditorDialog` `readOnly={!canEditRun(...).time}`; summary **Adjust time** / **Back to steps** respect `.time` / `.data`; capture autosave skipped when `!runEditPerms.data` (`WorkOrderRunner` ~780).

### Phase 2 — Model B timeline

- `src/utils/timelineModel.ts` — proportions, multi-day break flag.
- `src/components/ui/RunTimeline.tsx` — summary bar on runner + run history.

### Phase A — Summary review UX (`5ecc664` + #48–#51)

- **`timeZoneId`** threaded: `useProjectTimeZone` → `WorkOrderRunner` → `RunTimeline`, `TimeEntriesEditorDialog`, run history.
- Summary actions: **Back to steps**, **Adjust time** (when ladder allows).
- Run history timestamps use `formatInstant` + resolved zone.

### Time editor v2 / v3 (#50, #51)

- Default view: **Timeline** (Clockify-style).
- **Drag pins** above bar to resize segment boundaries (44px touch targets).
- **Drag block** to move segment; **tap block** → time wheels (`SegmentTimeEditorDialog`).
- **Zoom** default 150%; +/- up to 1000%.
- **+ Add Entry** — category + duration preset (30m–12h).
- Single chronological track (no split productive/downtime rows).
- Table view retained for add/delete/manual ISO edits.

### Timezone hardening (#48, #52)

- Native: `getProject()` blocks for API when IndexedDB cache lacks valid `timeZoneId`.
- `useProjectTimeZone` listens to `repo:projects:updated`.
- Editor resolves zone internally from `projectId` if parent prop missing.
- Office-country fallback when project has no `timeZoneId` in DB.
- **Diagnostic clocks** — UTC + global office + site in `Topbar` and workflow runner header (troubleshooting only; can hide later).

### Performance / field fixes (#49)

- `CompleteRun` / lifecycle: COUNT instead of loading all project assets on complete.
- Web signature → asset row refresh via `notifications:run-state-changed`.
- Runs merge prefers latest `updatedAt` by run id.

---

## 4. Current field verdict (2026-08-03)

| Area | Status | Notes |
|------|--------|-------|
| Start/stop productive & downtime | **OK** | Web + phone |
| Offline sync of time entries | **OK** | Phone Sydney labels correct |
| Project zone display (AEST) | **OK** | After #48–#52; use diagnostic clocks to verify |
| Adjust time timeline | **OK** | Drag/tap/zoom functional |
| Lock run save | **Improved** | Sub-second target on large jobs after #49 server fix |
| **Display polish** | **In progress** | See §5 |

---

## 5. Polish backlog (next session — “what’s being shown”)

Priority order for the next agent. **No new features** until these are addressed or explicitly deferred.

### P1 — Timeline / editor display

| ID | Issue | Suggested fix |
|----|-------|----------------|
| **P1a** | Segment label glitch (e.g. `"7 7"` on short productive block) | Fix label layout in `TimeEntriesTimelineEditor` — min width, truncate duration, hide label under N px |
| **P1b** | Overlap warning when productive ends exactly when downtime starts | Treat abutting segments as non-overlapping in `findOverlappingIds` (end === start is OK) |
| **P1c** | Overlap totals banner alarming on valid field data | Soften copy; auto-merge adjacent same-category segments optional |
| **P1d** | Run history header shows UTC suffix while editor shows AEST | Ensure `WorkflowRunHistoryDialog` always passes resolved zone into all `formatInstant` calls (audit grep `toLocaleString`) |
| **P1e** | Summary `RunTimeline` Start/Finish labels | Confirm same zone as editor; show zone abbrev once in subtitle |

### P2 — Capture display (Phase B from original plan)

| ID | Issue | Fix |
|----|-------|-----|
| **P2a** | Run history shows **“Yes”** instead of serial / IP / text values | `formatStepResultValue` in `WorkflowRunHistoryDialog.tsx` ~217: return raw `value` for text/number fields; keep Yes/No only for checkbox/photo/video/signature |

### P3 — UX enhancements (from `TIME_EDITOR_UX_PROPOSAL.md`)

- Pinch-to-zoom on mobile timeline
- Snap-to-grid toggle (15 / 30 / 60 min)
- Undo last timeline edit
- “Fit workday” preset (07:00–19:00)
- Overlap highlighting on timeline blocks (not just table rows)

### P4 — Diagnostic clocks

- Keep until timezone stable in production; then gate behind Complex View or remove from production builds

**Exit for polish phase:** JO00991 retest — Adjust time, Run History, and summary bar show consistent **AEST** labels; no false overlap warnings; capture values show real text.

---

## 6. Deferred phases (not started — original §5B–§5H)

Execute only after §5 polish is signed off unless product reprioritizes.

| Phase | ID | Item | Branch hint |
|-------|-----|------|-------------|
| **C** | §5C | **Live run clock** in runner header (reuse `tickNow`, `formatInstant(now, zone)`) — partially superseded by diagnostic clocks | `cursor/live-run-clock-cd21` |
| **D** | §5D | **Minimizable run window** + floating resume pill; persist step inputs on minimize | `cursor/minimizable-run-window-cd21` |
| **E** | §5E | **Path B** — read-only review before customer `SignatureDialog` in run history | `cursor/path-b-sign-review-cd21` |
| **F** | §5F | **Corrected run** after customer sign — prefill time + justification, new run via `onRerun` | `cursor/corrected-run-cd21` |
| **G** | §5G | UTC audit on all offline pause/resume/complete paths; remaining `toLocaleString` call sites | `cursor/time-utc-audit-cd21` |
| **H** | §5H | Backend `PATCH /time-entries` enforcement + audit trail | deferred until payroll/invoicing |

---

## 7. Key files

| File | Role |
|------|------|
| `src/utils/runEditPermissions.ts` | Edit ladder |
| `src/utils/timelineModel.ts` | Model B math |
| `src/utils/datetime.ts` | `formatInstant`, zone conversion |
| `src/hooks/useProjectTimeZone.ts` | Zone resolution |
| `src/components/ui/RunTimeline.tsx` | Read-only summary bar |
| `src/components/ui/TimeEntriesEditorDialog.tsx` | Editor shell (timeline/table) |
| `src/components/ui/TimeEntriesTimelineEditor.tsx` | Clockify-style timeline |
| `src/components/ui/SegmentTimeEditorDialog.tsx` | Tap-to-edit wheels |
| `src/components/ui/DiagnosticClockBar.tsx` | UTC / office / site clocks |
| `src/features/workInstructions/WorkOrderRunner.tsx` | Live tracking, summary, Adjust time |
| `src/features/installations/WorkflowRunHistoryDialog.tsx` | History, time editor entry, capture display |
| `src/services/assetWorkflowRunService.ts` | startRun, patchTimeEntries, offline queue |
| `server/Commtrac.Api/Controllers/AssetWorkflowRunsController.cs` | StartRun, CompleteRun, time PATCH |

---

## 8. Test checklist (regression)

Use project **JO00991** (Yancoal, `Australia/Sydney`) and asset **CAD-0052** or any run with productive + downtime.

### Time tracking core

- [ ] Start run → productive timer increases; toggle downtime → bar turns amber.
- [ ] Complete run → Run History shows non-zero productive/downtime totals.
- [ ] Phone offline run → sync → history totals match wall time worked.

### Timezone

- [ ] Summary Start/Finish show **AEST** (or site abbrev), not `UTC`.
- [ ] Adjust time → subtitle: `Times shown in AEST (Australia/Sydney)`.
- [ ] Diagnostic UTC clock matches external reference; site clock = UTC + offset.

### Edit ladder (see §2b)

- [ ] Before installer sign: Engineer can Adjust time and Back to steps.
- [ ] After installer sign, before customer: Engineer read-only; Admin can Adjust time via run history clock.
- [ ] After customer sign: everyone read-only; corrections need Re-run (Phase F).
- [ ] My Jobs card at 100% steps + locked run: confirm expected bucket (§2b) or apply label fix.

### Timeline editor

- [ ] Drag top pin → adjacent segments resize.
- [ ] Drag block → moves in time.
- [ ] Tap block → wheel editor.
- [ ] Add 1h downtime → appends at end.
- [ ] No false overlap warning for back-to-back productive → downtime.

### Summary actions

- [ ] **Adjust time** opens editor when `.time` allowed.
- [ ] **Back to steps** returns to capture when `.data` allowed.

---

## 9. Suggested next agent prompt

```
Continue Time Tracker V2 polish per HANDOVER_TIME_TRACKER_V2.md §5.

Priority:
1. P1b — abutting segments not flagged as overlap
2. P1a — segment label glitch on short blocks
3. P2a — show actual capture text in run history (not "Yes")
4. P1d/e — audit timezone labels in WorkflowRunHistoryDialog

Do not start Phase C–H until polish exit criteria in §5 are met.
Run: npm test -- src/utils/runEditPermissions.test.ts src/utils/timelineModel.test.ts
Field retest on JO00991 after build.
```

---

## 10. PR history (time tracker related)

| PR | Summary |
|----|---------|
| #45 | Phase 0 docs + tests |
| #48 | `useProjectTimeZone`, run-list perf, add-asset dialog isolation |
| #49 | Field test round 2: signature refresh, lock perf, investigation doc |
| #50 | Time editor v2: zoom, drag segments, wheels |
| #51 | Time editor v3: Clockify pins, tap-to-edit, single track |
| #52 | Diagnostic clocks, office zone fallback, web assets load fix |

---

## 11. Changelog (this document)

| Date | Change |
|------|--------|
| 2026-08-03 | **V2 finalized** — reflects main through #52; field OK; §5 polish backlog + §6 deferred phases |
| 2026-08-03 | **§2b added** — signature lifecycle, edit-rights UI map, known gaps, My Jobs vs Job History bucketing |
