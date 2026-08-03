# Phase 0 — Smoke Report (Time Tracker)

**Date:** 2026-08-03  
**Against:** `origin/main @ d7ad54e`  
**Branch:** `cursor/time-tracker-handover-plan-cd21`

Phase 0 is verification only (no product feature work). Goal: prove Fix 1/2,
the edit-permission ladder, and Model B timeline are present and correct enough
to build Phase A+ on top — and document what still needs a human device pass.

---

## Verdict

| Area | Automated / code review | Device / UI smoke |
|---|---|---|
| Fix 1+2 offline start-time | ✅ PASS (code + DTO wiring) | ⏳ Needs phone offline pass below |
| Phase 1 `canEditRun` ladder | ✅ PASS (unit tests) | ⏳ Needs role-override UI pass |
| Phase 1 time editor gates | ✅ PASS (runner + history wired) | ⏳ Confirm read-only UI |
| Phase 1 **data** edit gates | ⚠️ GAP — `.data` never consumed | N/A until wired (Phase A+) |
| Phase 2 Model B timeline math | ✅ PASS (unit tests) | ⏳ Confirm summary bar visually |
| Phase 2 summary mount | ✅ PASS (`RunTimeline` in summary) | ⏳ |
| Phase 2 `timeZoneId` + Adjust/Back | ❌ Not on main (Phase A) | Skip until Phase A |

**Phase 0 code gate: PASS.** Proceed to Phase A after (or in parallel with) the
manual checklist below. Do **not** treat builds-clean as offline-behavior proven.

---

## What was verified in code

### Fix 1 + Fix 2 (`242f0c7`)
- Client `startRun` always builds `startedAtUtc` + `timeTrackingJson` and sends
  them online; offline `RUN_CREATE` queue body includes the same fields.
- Backend `StartRunRequest` accepts nullable `StartedAtUtc` / `TimeTrackingJson`;
  `StartedAt` uses client stamp when parseable; `CreatedAt` stays server now.
- `RecomputeRunTimeMetrics` skips negative durations (end-before-start) and
  logs — prevents zeroing from inverted windows on new runs.

### Phase 1 (`d7ad54e` + `runEditPermissions.ts`)
Ladder matches handover §2 for Installer/Engineer vs Admin/PM/Supervisor.
Gates found:
- `WorkOrderRunner` → `TimeEntriesEditorDialog readOnly={!canEditRun(...).time}`
- `WorkflowRunHistoryDialog` → clock tooltip + same `readOnly` on editor

**Finding:** `canEditRun().data` is defined but **never used**. Capture/step
editing is not ladder-gated yet. Track for Phase A (Back to steps / data lock).

### Phase 2 foundation
- `buildTimelineModel`: productive/downtime proportional; gaps > 60s → `break`
  with `fraction: 0`; multi-day break flagged.
- Summary mounts `<RunTimeline entries={...} />` **without** `timeZoneId`
  (labels fall back via `formatInstant` → UTC). Phase A must thread project zone.

### Automated tests added
- `src/utils/runEditPermissions.test.ts` — full ladder matrix  
- `src/utils/timelineModel.test.ts` — Model B proportions + multi-day break  

Run: `npm test -- src/utils/runEditPermissions.test.ts src/utils/timelineModel.test.ts`

---

## How to test (manual smoke)

Use a project that has a published workflow and at least one asset. Seeded admin:
`admin@commtrac.local` / `Admin123!`.

**Role override:** Topbar avatar/menu → switch role. Use **Engineer** as the
installer stand-in (Installer is not in the override list). Also run once with a
real Installer account if you have one.

### T1 — Fresh offline run time (Fix 1/2) — **phone required**

1. On phone (native build), go offline (airplane / block API).
2. As Engineer: start a **new** workflow run on an asset; work ≥2–3 minutes;
   optionally toggle downtime once; complete/lock if your flow allows.
3. Go online; wait for sync (Sync Center / pending queue clear).
4. Open **Run History** for that asset.
5. **PASS:** Productive (and downtime if used) show real minutes, not `0m`.
6. **FAIL:** `0m` / `0s` on a brand-new run → Fix 1/2 regression (old pre-fix
   runs like corrupted CAD-0035 can still show 0 — ignore those).

Also spot-check online web start → same history totals look sane.

### T2 — Ladder: before installer sign (None / PendingInstaller)

1. Start or open an in-progress / pending-installer run.
2. As **Engineer:** open time editor (clock / Edit Times) → can add/edit entries.
3. As **Admin** or **Project Manager:** same — editable.
4. **PASS:** both roles can edit time before customer-pending.
5. Note: step/capture data lock is **not** enforced yet (known gap).

### T3 — Ladder: PendingCustomer (installer signed)

1. Complete installer sign-off so `signatureStatus === PendingCustomer`
   (do not customer-sign yet).
2. As **Engineer:** open time editor → **read-only** (no save of edits).
3. As **Admin/PM:** open time editor → **still editable**.
4. **PASS:** installer locked; PM/Admin can still correct.

### T4 — Ladder: Signed (customer signed)

1. Complete customer signature (or waive if your env supports) → `Signed`.
2. As Engineer **and** Admin: time editor read-only.
3. **PASS:** everyone locked. Corrected-run flow is Phase E (not expected yet).

### T5 — Timeline on summary (Model B)

1. During a run, create productive time, then a long pause (or edit entries so
   there is a multi-hour / overnight gap), then more productive.
2. Reach the runner **summary** screen.
3. **PASS:** bar shows green productive / amber downtime; pause is a **thin**
   break divider (tooltip like paused / resumed next day), not a huge grey block.
4. **Note:** timestamps may show UTC until Phase A wires `timeZoneId`.

### T6 — Web + phone

Repeat T2–T5 once on **web** and once on **phone** (shared `src/`).  
T1 is phone-only for the offline path.

---

## Exit criteria → Phase A

- [x] Fix 1/2 + Phase 1/2 foundation confirmed on main  
- [x] Ladder + Model B covered by unit tests  
- [ ] T1 offline phone pass (human)  
- [ ] T2–T4 role ladder UI pass (human)  
- [ ] T5 timeline visual pass (human)  

**Next implementation:** Phase A — thread `timeZoneId`, add summary “Adjust time”
/ “Back to steps”, and start gating `canEditRun().data` where capture edits happen.
