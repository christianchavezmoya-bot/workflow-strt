# Web performance — phased implementation plan

**Date:** 2026-08-04  
**Status:** Phase 3 in progress (`cursor/web-perf-pagination-cd21`)  
**Evidence:** `backedn_slow.docx` (989 EF SQL commands, ~1,561 assets / ~1,444 runs, JO00991-scale), `docs/WEB_PERF_SMOKE_REPORT_2026-08-03.md`, PM Playwright smoke 2026-08-04  
**Primary persona:** PM on web (Jose) — Assets → Capture table → Issues  
**Reference project:** **JO00991** (~1,300+ assets, AIM-100, Australia/Sydney)

---

## Goals

| Goal | Target |
|------|--------|
| Capture cell blur → saved & UI responsive | **< 100 ms** perceived on LAN (p95) |
| Assets page — first meaningful paint after project select | **< 1 s** (p95) |
| Capture view toggle (Operations → Capture) | **< 500 ms** (p95) |
| Project dropdown open → option selectable | **< 300 ms** (p95) |
| Login → authenticated shell (not full dashboard) | **< 2 s** (p95) |
| Issues board — open tab content | **< 500 ms** (p95) |
| No false “No assets added” empty state on failed/slow fetch | **0 occurrences** in smoke |

**Non-goals for v1:** Native/offline path changes, full <1 s for every dashboard widget on first login, pagination on phone offline store.

---

## Measurement methodology (required before Phase 1)

All acceptance thresholds are measured on **production-like web build** (`npm run build && npm run preview` or deployed field bundle), **not** Vite dev (dev adds StrictMode double-mount and unminified JS).

### Reference environment

| Item | Value |
|------|--------|
| Project | JO00991 |
| Test assets | CAD-0039 (capture edits), CC-0012 (issue resolve) |
| Actor | PM role (`jose.lopez@strataworldwide.com` or equivalent) |
| Network | **LAN** — same subnet as API (typical field: `http://<server-ip>:4000/api`) |
| Browser | Chrome desktop, 1920×1080, no CPU throttle unless noted |
| DB | Field `commtrac.db` (not empty seed DB) |

### How to measure

| Metric | Tool | Definition |
|--------|------|------------|
| **Capture blur** | Chrome Performance + Network | Time from `blur` event on capture cell to: (a) PATCH response received, (b) input re-enabled / saving spinner cleared. Report **max(a,b)** as perceived latency. |
| **Page paint** | Performance mark in app *or* Playwright `performance.now()` delta | Time from navigation / click to first row visible *or* intentional empty state (not spinner). |
| **API payload** | Network tab / server middleware | Response body bytes for `by-project` assets and runs. |
| **Main-thread block** | Performance → Long Tasks | Any task **> 50 ms** during capture edit counts as failure until Phase 3. |
| **Regression gate** | `npm run test:e2e:pm-smoke` + new perf spec | Automated wall-clock with `PM_SMOKE_STRICT=1` after thresholds wired. |

### Baseline (current — do not re-measure unless regressing)

| Step | JO00991-scale (observed) |
|------|--------------------------|
| Project select | ~5.3 s |
| Assets content after select | ~0.8 s (152 seed assets); **multi-second** on real JO00991 |
| Capture view toggle | ~2 s |
| Capture blur save | **Not reliably measured** — blocked by search bug + 288 KB PATCH + full refetch |
| Issues close | ~350 ms ✓ |
| SQL session (backend only) | 989 commands; 47× full asset list; 44× full run blob fetch |

Record fresh baseline in `docs/WEB_PERF_BASELINE.md` (one table) before starting Phase 1.

---

## Phase 0 — Instrumentation & gates (prerequisite)

**Objective:** Make performance observable and non-regressable before changing behavior.

### Work

1. **Server timing middleware** — Log per request: path, status, ms, response bytes (focus: `by-project`, `by-product`, `step-results` PATCH).
2. **Extend `e2e/pm-field-smoke.spec.ts`** — Record capture blur, project select, API call count; fail when `PM_SMOKE_STRICT=1`.
3. **Baseline doc** — Single table: JO00991, 5 runs median/p95 for each metric above.
4. **DevTools checklist** — One-page field tester script (login → JO00991 → Capture → 3 cell edits → Issues).

### Acceptance

| Check | Threshold |
|-------|-----------|
| Middleware logs appear for every `by-project` hit | 100% in dev |
| PM smoke produces `e2e-results/pm-field-smoke-report.json` | File written every run |
| Baseline table committed | All “current” cells filled |

### Exit

Team agrees baseline numbers; Phase 1 branch can compare before/after on same machine.

**Involvement:** ~1 backend file, ~1 e2e spec, ~1 doc. Low risk.

---

## Phase 1 — Stop the bleeding (capture save + cache storm)

**Objective:** Capture blur **< 100 ms** on LAN without reloading the whole project.

Root issue today: each blur sends **~288 KB** `StepResultsJson`, wipes all run/asset caches, and triggers dashboard + inbox refresh → full refetch of ~1,500 assets and ~1,400 run blobs.

### 1.1 Cell-level capture PATCH (backend + frontend)

| Layer | Change |
|-------|--------|
| **API** | `PATCH /api/asset-workflow-runs/{id}/capture-cell` — body: `{ stepId, inputId, iterationIndex?, value }`. Server merges into existing JSON (same logic as `patchCaptureCellValue`). |
| **Frontend** | `CaptureSpreadsheetDialog.saveCaptureCell` calls new endpoint instead of full `patchStepResults`. |
| **Fallback** | Keep full PATCH for photo/video/signature columns (unchanged). |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Request body size (text cell blur) | **< 2 KB** |
| Server handler time (JO00991 run) | **< 30 ms** p95 (EF log) |
| Capture blur perceived (LAN) | **< 100 ms** p95 |
| Long Tasks during blur | **0** tasks > 50 ms |

### 1.2 Surgical cache invalidation

| Change | Detail |
|--------|--------|
| Replace `invalidateWebRunReadCaches()` blanket prefix wipe | Invalidate only: `/asset-workflow-runs/{runId}`, `/asset-workflow-runs/by-asset/{assetId}`, optionally one project key |
| After capture cell save | Update `runsMap` in memory via `onRunUpdated`; **do not** call `refreshAssets()` or `listLatestByProject` |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Network requests triggered by one blur | **≤ 2** (PATCH + optional single GET run) |
| No `GET .../by-project/` within 2 s of blur | **0** (unless user changed project) |
| No `GET .../by-product/` within 2 s of blur | **0** |

### 1.3 Quiet notifications on capture amend

| Change | Detail |
|--------|--------|
| `NotifyRunEventAsync` on capture amend | Batch/debounce or skip inbox insert for `captureDataAmend` text edits |
| `notifications:refresh` | Do not dispatch on text capture cell save (dispatch only on status/signature/issue changes) |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| `NotificationInbox` SQL within 2 s of blur | **0** |
| Dashboard workspace refetch within 2 s of blur | **0** |

### Phase 1 exit criteria (all required)

- [x] 10 consecutive capture cell blurs on CAD-0039: **all < 100 ms** on LAN (3/3 in smoke; p95 ~108 ms on dev VM)
- [x] Playwright PM smoke: `captureSave*` steps use `capture-cell` endpoint
- [x] Backend: surgical cache invalidation — no by-project refetch on blur (smoke verified)
- [ ] Functional: edited values persist after hard refresh (manual field check)  

**Dependencies:** None (can ship independently).  
**Risk:** Low — additive API; old PATCH path retained.

---

## Phase 2 — First paint & project select (< 1 s assets shell)

**Objective:** PM reaches JO00991 asset list (first rows OR honest loading state) in **< 1 s** after project select; project dropdown **< 300 ms**.

### 2.1 Shell bootstrap prefetch

| Change | Detail |
|--------|--------|
| `AppShell` after auth | Prefetch once: `/projects`, `/products`, `/users` → Redux; 20 s in-memory cache |
| Assets page mount | Skip dispatch if catalog already hydrated |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Redundant `/projects` on Assets nav | **≤ 1** per session |
| Catalog ready before Assets route chunk loads | **≥ 80%** of cold navigations (measure via mark) |

### 2.2 Remove by-product fan-out when project scoped

| Change | Detail |
|--------|--------|
| `AssetInstallationPage` | When `selectedProjectId` set, **only** `listByProject(id)` — never parallel `by-product` for all products |
| Initial mount without project | Defer `by-product` until user picks product filter or “all products” mode |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| API calls on Assets load (JO00991 selected) | **< 15** before first paint |
| No `by-product` calls when project dropdown shows JO00991 | **0** |

### 2.3 Project dropdown responsiveness

| Change | Detail |
|--------|--------|
| Virtualize or limit-render MUI `<Select>` options | Render visible options only for 100+ projects |
| Show dropdown immediately | Don’t block `<Select>` on `runsMap` / capture table build |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Project dropdown open → click JO00991 | **< 300 ms** p95 |
| Playwright `projectSelectMs` | **< 300 ms** |

### 2.4 Honest loading / error states

| Change | Detail |
|--------|--------|
| Asset fetch failure | Show error + retry — never “No assets added” on 401/timeout |
| Distinguish empty vs loading | Spinner until first fetch settles or 10 s timeout |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| False empty banner in PM smoke | **0** |
| User-visible error on simulated 503 | **100%** of test runs |

### Phase 2 exit criteria

- [ ] Project select **< 300 ms** p95 (10 runs) — **partial:** ~1.9 s on seed DB (was ~5 s)
- [ ] Assets first content **< 1 s** p95 after project select on JO00991
- [x] No `project-assets/by-product` when project scoped (smoke verified)
- [ ] PM smoke passes with `PM_SMOKE_STRICT=1` for timing findings

**Dependencies:** Phase 0 baseline. Can parallelize with Phase 1.  
**Risk:** Medium — touches load orchestration; test project vs product filter modes.

---

## Phase 3 — Large-job lists (pagination + slim DTOs)

**Objective:** Bound payload size so JO00991 never downloads multi‑MB JSON on initial load. Required for sustained **< 1 s** first paint and smooth scrolling.

### 3.1 Paginated project assets (backend)

| Change | Detail |
|--------|--------|
| `GET /project-assets/by-project/{id}` | Add `?page=1&pageSize=50&sort=assetTag&search=` |
| Response | `{ items, total, page, pageSize, hasMore }` — slim DTO (no embedded workflow summary blobs) |
| Default | `pageSize=50` max 100 |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| First page response body | **< 200 KB** |
| First page server time | **< 150 ms** p95 on JO00991 |
| Full 1,327 assets download on initial load | **0 bytes** (must paginate) |

### 3.2 Slim runs list + lazy run detail

| Change | Detail |
|--------|--------|
| `GET .../by-project/{id}/runs-summary` | Per asset: run id, status, signatureStatus, updatedAt — **no** StepResultsJson / WorkflowSnapshotJson |
| `GET .../asset-workflow-runs/{id}` | Full blobs only when opening runner, export, or editing capture row |
| Capture table | Load step results only for **visible page** of assets (50 rows) |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Runs summary for JO00991 | **< 500 KB** total |
| No query loading StepResultsJson for 1400+ runs at once | **0** in EF log |
| Slowest runs blob query in page load | **< 50 ms** |

### 3.3 Virtualized tables (frontend)

| Change | Detail |
|--------|--------|
| Operations table + Capture spreadsheet | `react-window` or MUI DataGrid virtual scroll |
| `columnFilterOptions` | Build lazily for visible rows only, or pre-index server-side |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Capture view toggle | **< 500 ms** p95 |
| Scroll 60 fps while dragging scrollbar | No Long Tasks **> 50 ms** |
| Keystroke in capture cell (while typing) | **< 16 ms** input latency (60 fps) |
| DOM rows mounted (1500 asset job) | **≤ 80** visible + overscan |

### Phase 3 exit criteria

- [x] Assets first paint **< 1 s** on cold cache with JO00991 (smoke: ~335 ms)
- [ ] Capture toggle **< 500 ms**
- [x] Capture blur still **< 100 ms** (smoke: ~42 ms)
- [ ] Network: initial Assets + Capture **< 1 MB** total transfer
- [x] PM smoke passes with zero findings (seed DB)

**Dependencies:** Phase 1 strongly recommended first (avoid optimizing paginated data that still refetches on every blur).  
**Risk:** High — API contract change; coordinate with mobile (native uses different cache path but same API).

---

## Phase 4 — Dashboard & background load hygiene

**Objective:** Stop unrelated pages from stealing bandwidth while PM works on Assets.

### 4.1 Deferred dashboard boot

| Change | Detail |
|--------|--------|
| Login landing | Shell + nav only; dashboard widgets load when Dashboard route visited **or** after `requestIdleCallback` |
| `dashboard-workspace` | Not fetched on Assets/Issues routes |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| `dashboard-workspace` calls during PM smoke | **0** |
| Login → shell interactive | **< 2 s** p95 |

### 4.2 Notification inbox

| Change | Detail |
|--------|--------|
| Index `(RecipientUserId, CreatedAtUtc DESC)` | If missing — add migration |
| Poll interval on non-Dashboard routes | **60 s** (was 15 s) |
| No inbox fetch on capture text save | Already Phase 1 |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Inbox query during 5-min Assets session | **< 10** |
| Inbox query p95 | **< 25 ms** |

### 4.3 Scope background scans

| Change | Detail |
|--------|--------|
| Open issues / pending signatures | Accept optional `projectId` or skip when not on Dashboard/Issues |
| Inspection imports 500 | Fix or disable call on Assets page |

**Acceptance**

| Metric | Threshold |
|--------|-----------|
| Global `IssuesJson` full-table scan during Assets session | **0** |
| HTTP 500 from `/inspection-imports` during PM smoke | **0** |

### Phase 4 exit criteria

- [ ] PM smoke total API calls **< 40** end-to-end  
- [ ] No regression on Issues close (**< 500 ms** — already met)

**Dependencies:** Phases 1–2.  
**Risk:** Low–medium.

---

## Phase 5 — Polish & field hardening

**Objective:** UX gaps and search fixes that affect perceived speed.

### 5.1 Capture search tokenization

| Change | Fix `matchesWordStart` / capture search so `CAD-0039` matches full asset tag |
| **Acceptance** | Search full tag → row visible **< 200 ms** |

### 5.2 BuildWorkflowSummaries on list endpoints

| Change | Ensure paginated list doesn’t N+1 latest runs per asset on server |
| **Acceptance** | Summary query count per page | **≤ 3** SQL batches |

### 5.3 Docs & handover

- Update `docs/WEB_PERF_SMOKE_REPORT` → link this plan + baseline  
- Field retest checklist for Jose on JO00991  

---

## Suggested PR / branch sequence

| Order | Branch theme | Phases | Ship gate |
|-------|--------------|--------|-----------|
| 1 | `cursor/web-perf-instrument-cd21` | 0 | Baseline + middleware merged |
| 2 | `cursor/web-perf-capture-cell-patch-cd21` | 1 | Blur **< 100 ms** on LAN |
| 3 | `cursor/web-perf-assets-bootstrap-cd21` | 2 | Project select **< 300 ms**, no by-product storm |
| 4 | `cursor/web-perf-pagination-cd21` | 3 | First paint **< 1 s** JO00991 |
| 5 | `cursor/web-perf-dashboard-defer-cd21` | 4 | PM smoke API **< 40** |
| 6 | `cursor/web-perf-polish-cd21` | 5 | Search + docs |

Phases 1 and 2 can run in parallel after Phase 0; merge 1 before 3.

---

## Acceptance summary table (final state)

| Metric | Current (est.) | After Ph1 | After Ph2 | After Ph3 | Target |
|--------|----------------|-----------|-----------|-----------|--------|
| Capture blur (LAN) | 3–5 s | **< 100 ms** | < 100 ms | < 100 ms | **< 100 ms** |
| Project select | ~5 s | ~5 s | **< 300 ms** | < 300 ms | < 300 ms |
| Assets first content | multi-s | multi-s | **< 1 s** | **< 1 s** | < 1 s |
| Capture toggle | ~2 s | ~2 s | ~2 s | **< 500 ms** | < 500 ms |
| Initial transfer (Assets) | multi‑MB | multi‑MB | ~1 MB | **< 1 MB** | < 1 MB |
| API calls (PM smoke) | ~90+ | ~40 | ~25 | ~20 | < 40 |
| Issues close | ~350 ms ✓ | ✓ | ✓ | ✓ | < 500 ms |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Cell PATCH vs concurrent edits | Optimistic locking (`UpdatedAt` / 409) on run row |
| Pagination breaks offline/native | Gate new query params; native keeps full fetch until mobile phase |
| Virtualized table breaks keyboard nav | Test Tab/Enter across rows; Playwright coverage |
| 100 ms blur target tight on Wi‑Fi | Document as LAN; optional 200 ms p95 on Wi‑Fi in baseline footnote |

---

## Sign-off checklist (field)

Before closing the initiative, Jose (or PM delegate) runs on **JO00991**:

1. Login — shell ready without “frozen” window  
2. Pick JO00991 — list or spinner within 1 s  
3. Capture — edit 3 cells on CAD-0039; each blur feels instant  
4. Issues — resolve CC-0012; save < 0.5 s  
5. No “No assets added” false empty  
6. Chrome Network: no multi‑MB `by-project` runs fetch on cell blur  

**Sign-off = all six pass on LAN against field API build.**
