# Offline device measurement (Phase 1)

Use this matrix to record **baseline p95** open latency before Phase 2 perf lock.  
Target: **navigation_start → interactive_ready ≤ 1000 ms** on resume (cached workflow).

## Setup

1. Build native app with LAN API (`VITE_API_BASE=http://<LAN-IP>:4000/api`).
2. Login as installer assigned to test assets.
3. Wait for bootstrap to finish (blue **Downloading field data…** banner clears).
4. Note the **Open: Nms** chip in the connectivity strip after each test.

## Test assets

Prepare three workflow sizes on staging:

| Size | Step count | Reference photos | Asset label |
|------|------------|------------------|-------------|
| Small | ≤10 steps | few | |
| Medium | 20–40 steps | moderate | |
| Large | 60+ steps | many | |

## Measurement matrix

Run **5 opens per cell**; record p95 (4th highest of 5). Use stopwatch or the in-app **Open: Nms** chip.

| Workflow | Network condition | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | p95 (ms) | Pass ≤1s? |
|----------|-------------------|-------|-------|-------|-------|-------|----------|-----------|
| Small | Online, resume | | | | | | | |
| Small | Airplane, resume | | | | | | | |
| Small | Captive Wi‑Fi*, resume | | | | | | | |
| Medium | Online, resume | | | | | | | |
| Medium | Airplane, resume | | | | | | | |
| Medium | Captive Wi‑Fi*, resume | | | | | | | |
| Large | Online, resume | | | | | | | |
| Large | Airplane, resume | | | | | | | |
| Large | Captive Wi‑Fi*, resume | | | | | | | |

\*Captive Wi‑Fi = connected to router/AP with **no internet** and API unreachable (server stopped or wrong IP).

## Marker checklist (ConnectivityDebugBar tooltip)

After each airplane resume, confirm recent markers include:

1. `navigation_start` (entry point, e.g. `dashboard-resume:…`)
2. `workflow_local_read_start` / `workflow_local_read_end`
3. `first_render runner`
4. `interactive_ready` (before `network_request_start runner-reconcile`)

## Phase 1 exit criteria

- [ ] Perf readout visible on native (`Open: Nms` chip)
- [ ] Markers fire in order on resume path
- [ ] Baseline p95 recorded for small / medium / large (attach this sheet to PR)

## Phase gate → Phase 2 adjustments

| Result | Next phase |
|--------|------------|
| All p95 ≤ 1000 ms airplane resume | Phase 2: unified open + CI perf test; **skip** progressive render |
| Medium/large over budget | Phase 2 + plan Phase 3 staged rendering |
| Captive Wi‑Fi first-open slow | Phase 2: new-run fast path + circuit tuning |

## Tester sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| App version | |
| API tag | |
| Device / OS | |
