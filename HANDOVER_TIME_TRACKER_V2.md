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

### Edit ladder

- [ ] Before installer sign: Engineer can Adjust time.
- [ ] After installer sign, before customer: Engineer read-only; Admin editable.
- [ ] After customer sign: everyone read-only.

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
