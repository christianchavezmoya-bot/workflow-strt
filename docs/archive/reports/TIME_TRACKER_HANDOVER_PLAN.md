# Time Tracker Handover — Validated Status + Implementation Plan

**Validated against:** `origin/main @ 30686e4` (2026-08-03)  
**Source handover:** [`HANDOVER_TIME_TRACKER_V2.md`](./HANDOVER_TIME_TRACKER_V2.md) — **canonical; finalized 2026-08-03**  
**Branch for this review:** `cursor/time-tracker-handover-plan-cd21`

> **Note:** Phase A, timezone (#48–#52), and time editor v3 (#50–#51) are **merged to main**.  
> Field verdict: time tracking **working OK**; next work is **§5 polish** in the V2 handover doc.

---

## 1. Where the app is (recent main)

Main has moved past the handover base (`b5f5d32`). Recent themes on main:

| Area | State on main |
|---|---|
| Offline run-start time (Fix 1+2) | ✅ Landed (`242f0c7`) |
| Time edit ladder + timeline (Phase 1+2 foundation) | ✅ Landed (`d7ad54e`) — **handover “VERIFY IF PUSHED” is outdated** |
| Offline sync / Job History / RUN_COMPLETE ordering | ✅ Recent fixes on main |
| Per-project timezone + customer sign report | ✅ Landed |
| Document preview (web + native) | ✅ Multiple PRs merged (#38–#41) |
| Connectivity → Sync Center (native) | ✅ Merged (#43) |
| Search readability + asset typing perf | ⏳ **Open PR #44** — not on main; needs rebase onto current main |

Phone + web still share `src/`. Time work below is frontend-first unless noted.

---

## 2. Handover validation (claim vs repo)

### ✅ Confirmed on main (do not re-apply patches)

| Item | Evidence |
|---|---|
| Fix 1+2 offline start time | `242f0c7` — client `startedAtUtc` + backend `StartRun` + recompute guard |
| Phase 1 `canEditRun` | `src/utils/runEditPermissions.ts` — ladder matches §2 |
| Phase 1 gates | `WorkOrderRunner` + `WorkflowRunHistoryDialog` pass `readOnly={!canEditRun(...).time}` |
| Phase 2 Model B | `src/utils/timelineModel.ts` — pause = gap/break, not segment |
| Phase 2 `RunTimeline` | `src/components/ui/RunTimeline.tsx` — mounted on runner summary |

### ⚠️ Phase 2 incomplete vs handover wording

`d7ad54e` is a **foundation** commit, not the full Phase 2 described in the handover:

| Claimed | Actual |
|---|---|
| “Adjust time” + “Back to steps” on summary | **Missing.** Only header “Edit Times”; no summary actions to reopen steps |
| `timeZoneId` threaded from all 3 runner call sites | **Missing.** `WorkOrderRunner` has **no** `timeZoneId` prop; summary calls `<RunTimeline entries={...} />` without zone → falls back toward UTC in labels |
| Timeline in summary | ✅ Present |

### ❌ Not started (still matches handover)

| ID | Item |
|---|---|
| §5B | “Yes instead of value” — still at `WorkflowRunHistoryDialog.tsx:217` |
| §5C | Live run clock in header |
| §5D | Minimizable run window + floating resume pill |
| §5E | Path B reopen-to-sign review (before `SignatureDialog`) |
| §5F | Corrected run after customer sign-off (prefill time + justification) |
| §5G | Fix 3 offline UTC audit; Fix 5 display-zone rollout gaps |
| §5H | Phase 5 backend `PATCH /time-entries` enforcement — **deferred** |

### Architecture constraints (still valid — do not re-litigate)

- Frontend-first locks (UI only) until Phase 5  
- Model B pauses (gaps, not “paused” category)  
- UTC store/transport; display via `formatInstant` + project `timeZoneId`  
- Reuse `TimeEntriesEditorDialog` — no second editor  
- Engineer ≡ Installer for ladder tests (Topbar override)  
- No `server/` for frontend phases; one fix per commit  

---

## 3. Implementation plan (ordered)

### Phase 0 — Smoke / close the verification gap (before new features)

**Status (2026-08-03):** Code/unit verification **PASS**. Manual device checklist
is in `docs/PHASE0_TIME_TRACKER_SMOKE_REPORT.md` (T1–T6). Finding: `canEditRun().data`
is not yet consumed anywhere — wire in Phase A with Back-to-steps / data lock.

**Goal:** Prove Fix 1/2 + ladder + timeline on device/web. Builds-clean ≠ behavior-proven.

1. Fresh **offline** run as Engineer (installer stand-in) → sync → Run History productive/downtime ≠ 0.  
2. Ladder (Engineer **and** Admin/PM):
   - `None` / `PendingInstaller`: both can edit time  
   - `PendingCustomer`: Engineer read-only; PM/Admin editable  
   - `Signed`: both read-only  
3. Multi-day / pause run: timeline shows thin break (“resumed next day”), not a huge pause block.  
4. Optionally rebase/merge **PR #44** (search/perf) onto main so assets-page typing work isn’t lost — separate from time tracker.

**Exit:** Checklist signed off; no re-application of Phase 1/2 patches.

---

### Phase A — Finish incomplete Phase 2 (small, frontend)

**Branch:** `cursor/time-tracker-phase2-complete-cd21` (from updated main)

1. **Thread `timeZoneId`** into `WorkOrderRunner` from Assets / Dashboard / any other open sites; pass into `RunTimeline`.  
2. **Summary actions:**
   - “Adjust time” → opens existing `TimeEntriesEditorDialog` (respect `canEditRun`)  
   - “Back to steps” → return to running stage to fix capture data (respect `canEditRun().data`)  
3. Hide/disable those actions when ladder says read-only; show short reason if useful.

**Exit:** Summary review matches handover §2 “review before signing”; times show project zone.

---

### Phase B — Quick win: “Yes instead of value” (§5B)

**Branch:** `cursor/fix-capture-value-display-cd21`

In `formatStepResultValue` (`WorkflowRunHistoryDialog.tsx` ~217):

- Keep Yes/No (or Pass/Fail) for checkbox / photo / video / signature / presence-style component  
- For text/number (and labeled capture fields with real strings): **return `value`**, not `"Yes"`

**Exit:** Serial / IP / firmware show actual text in run history.

---

### Phase C — Live run clock (§5C)

**Branch:** `cursor/live-run-clock-cd21`

- Header in `WorkOrderRunner` while `stage === "running"` (and optionally summary)  
- Reuse existing `tickNow` (1s) — no new timer  
- `formatInstant(now, projectTimeZoneId, { withZone: true })`  
- Optional secondary device-zone only if it differs  

**Exit:** Installer sees live project-zone clock while running.

---

### Phase D — Minimizable run window (§5D) — medium

**Branch:** `cursor/minimizable-run-window-cd21`

**Why safe:** elapsed time is timestamp-driven (`startedAtUtc` + tick for display only). Minimize must not pause/complete/sync.

1. **Autosave / persist** open step inputs on minimize (don’t lose unsaved capture).  
2. **Lift active-run state** above the page (context or small store) so navigation doesn’t unmount the run.  
3. Hide Dialog UI; show floating pill: asset tag + productive duration; tap restores.  
4. Chevron always; swipe-down on touch.  
5. Only one minimized run at a time.  
6. Web: collapsible panel / same pill pattern — keep shared `src/` working.

**Exit:** Navigate Assets/Dashboard with run still tracking; reopen restores same run + data.

---

### Phase E — Path B review + corrected run (§5E / §5F)

**Branch(es):** separate commits/PRs

1. **Path B:** Before standalone `SignatureDialog` in Run History, insert read-only review (timeline + captured data).  
   - Reopen **same locked run** — never `onRerun` / `startRun` (duplicate-run trap ~reconcile).  
2. **Corrected run (§5F):** On finalized run, “Create corrected run” extends `onRerun(prefillValues, latestRun)` to also prefill time entries + require justification (date + user) into existing notes/description — **no schema change** if a field already fits.

**Exit:** Reopen-to-sign is review-only; post-sign corrections create a new prefilled run with justification.

---

### Phase F — Time architecture follow-ups (§5G)

1. **Fix 3:** Audit pause/resume/downtime/complete/patch offline paths for preserved UTC device instants.  
2. **Fix 5:** Finish `timeZoneId` at remaining report / `toLocaleString` call sites.  
3. **Fix 4 (backend, optional):** device skew — only if needed later.

---

### Phase G — Backend enforcement (§5H) — deferred

Gate `PATCH /time-entries` by role + `signatureStatus`; audit trail. Do when time feeds payroll/invoicing.

---

## 4. Suggested execution order (next agent)

```
0  Smoke Fix1/2 + ladder + timeline (Engineer + Admin, web + phone, offline)
A  Complete Phase 2 gaps (tz + Adjust time / Back to steps)
B  Fix "Yes instead of value"
C  Live run clock
D  Minimizable run window
E  Path B review → corrected run
F  UTC audit + display-zone rollout
G  Backend enforcement (later)
```

Parallel optional: rebase/merge PR #44 (search/perf) — independent of time tracker.

---

## 5. Standing engineering rules

- Frontend phases: **no `server/`**  
- One logical fix per commit; explicit staging; keep lockfile/`ARCHITECTURE.md` churn out unless required  
- Gates: `npx tsc -b`, `dotnet build`  
- Display work times with `formatInstant` + project zone  
- Always re-`git fetch` and verify files — do not trust handover “unpushed” claims without checking  

---

## 6. Key files (unchanged map)

- `src/utils/runEditPermissions.ts` — ladder  
- `src/utils/timelineModel.ts` / `src/components/ui/RunTimeline.tsx` — Model B UI  
- `src/components/ui/TimeEntriesEditorDialog.tsx` — only editor  
- `src/features/workInstructions/WorkOrderRunner.tsx` — run + summary + tick (~352/433)  
- `src/features/installations/WorkflowRunHistoryDialog.tsx` — history, §5B, Path B  
- `src/services/assetWorkflowRunService.ts` — offline start/sync  
- `src/utils/datetime.ts` — `formatInstant`  
- `server/.../AssetWorkflowRunsController.cs` — Fix 1/2 done; Phase 5 later  
