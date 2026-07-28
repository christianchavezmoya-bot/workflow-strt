# Offline acceptance matrix (Phase 10)

Record results on a **physical device** before each native app release. Attach a completed copy to the release PR or staging sign-off.

**Automated CI** covers smoke, login, and offline-open perf contract (`npm run release-gates`). This matrix covers scenarios that still require manual native QA.

**Mac agent:** copy-paste instructions in [`IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md`](./IOS_MAC_AGENT_OFFLINE_SYNC_UX_PROMPT.md) (final test on `main`). Index: [`AGENT_RETEST_INDEX.md`](./AGENT_RETEST_INDEX.md). Legacy: [`IOS_MAC_AGENT_PROMPT.md`](./IOS_MAC_AGENT_PROMPT.md), [`IOS_PRE_MERGE_ACCEPTANCE_PROMPT.md`](./IOS_PRE_MERGE_ACCEPTANCE_PROMPT.md).

Related: [`OFFLINE_DEVICE_MEASUREMENT.md`](./OFFLINE_DEVICE_MEASUREMENT.md) (p95 resume latency), [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) Layer C.

---

## Sign-off header

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| App version / build | |
| API tag / commit | |
| Device / OS | |
| PR / release candidate | |

---

## Scenario matrix

Run each row on a **native build** with field bootstrap completed (Sync Center shows ready or stale, not “not downloaded”).

| # | Scenario | Steps (summary) | Pass? | p95 open (ms) | Notes |
|---|----------|-----------------|-------|---------------|-------|
| 1 | Airplane, small workflow, **resume** | Bootstrap online → airplane ON → Dashboard Resume | | | Target ≤1000 ms to interactive |
| 2 | Airplane, large workflow, **resume** | Same with 60+ step workflow | | | |
| 3 | Captive Wi‑Fi, first open | Router on, no internet/API unreachable → open cached run | | | |
| 4 | Backend down, cached open | Stop API, radio on → open cached run | | | |
| 5 | Offline **start new run** | Airplane → start run on assigned asset with cached config | | | |
| 6 | Kill app mid-run, reopen | Airplane → save step → force-quit → reopen → step intact | | | |
| 7 | ~20 queued ops, reconnect | Airplane → many step saves → online → Sync Center clears | | | No duplicates |
| 8 | **Conflict resolve** | Web edits asset while phone offline → sync → Sync Center → resolve | | | Keep + discard both tested once |
| 9 | Expired token, reconnect login | Let token expire offline → login again → queue preserved | | | |

**Pass** = expected UX with no S0/S1 data loss (see [`BUG_TRIAGE.md`](./BUG_TRIAGE.md)).

---

## Marker checklist (resume paths)

After rows 1–2, confirm ConnectivityDebugBar / perf log order:

1. `navigation_start`
2. `workflow_local_read_start` / `workflow_local_read_end`
3. `first_render runner`
4. `interactive_ready` **before** `network_request_start runner-reconcile`

---

## Exit criteria (Phase 10)

- [ ] All matrix rows pass or have documented waivers
- [ ] [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) Layer C offline section signed
- [ ] `npm run release-gates` green on release commit
- [ ] Staged phone rollout 10% → 100% with no S0/S1 sync regressions
