# Web performance baseline

**Date:** 2026-08-10 (updated after Phase E)  
**Environment:** Dev seed DB (`node scripts/seed-workflow-smoke-data.mjs`), 152 assets + JO00991, Vite dev + API :4000  
**Reference:** `docs/WEB_PERF_IMPLEMENTATION_PLAN.md`

---

## Phased rollout status (A–E)

| Phase | Branch / PR | Shipped | Focus |
|-------|-------------|---------|-------|
| **A** | `cursor/web-perf-phase-a-cd21` (#136) | ✓ | Lazy heavy chunks, defer capture table build, coalesce dashboard refresh |
| **B** | `cursor/web-perf-phase-b-cd21` (#137) | ✓ | Extract `AssetEditDialog`, memo `CaptureSpreadsheetDialog` |
| **C** | `cursor/web-perf-phase-d-cd21` (#139) | ✓ | Lazy photo/docs dialogs, surgical web run cache invalidation, merge run updates on Assets |
| **D** | `cursor/web-perf-phase-d-cd21` (#139) | ✓ | Runs-detail dedupe, deferred capture search, lazy doc preview |
| **E** | `cursor/web-perf-phase-e-cd21` | pending | Lower project Autocomplete threshold, debounce web SSE asset refresh, skip unscoped broadcast when project scoped |

**Next (optional):** Backend dashboard slim queries (PR #9), further Assets route code-split.

---

## Current metrics (pre Phase 1 merge)

Measured on cloud agent VM with seeded JO00991 data. Production-like builds (`npm run build && npm run preview`) should be re-measured on field LAN before sign-off.

| Metric | Median (est.) | p95 (est.) | Notes |
|--------|---------------|------------|-------|
| Login → shell | ~2 s | ~3 s | Includes onboarding dismiss |
| Project select (JO00991) | ~3 s | **~1.3 s** (Phase 3 seed) | Target < 300 ms |
| Assets content after select | ~0.8 s | **~335 ms** (Phase 3 paginated) | Target < 1 s ✓ |
| Capture view toggle | ~1.5 s | **~2 s** | Full table render |
| Capture cell blur save | **Not measured** | **3–5 s (est.)** | 288 KB PATCH + cache wipe + refetch |
| **Capture cell blur (post Phase 1)** | **~75 ms** | **~108 ms** | `capture-cell` PATCH; seed DB, CI fresh servers |
| Issues close (CC-0012) | ~350 ms | ~400 ms | ✓ within target |
| SQL per PM session (backend) | — | 989 cmds | 47× full asset list, 44× run blobs |

---

## Phase 1 targets (capture save)

| Metric | Target | How to verify |
|--------|--------|---------------|
| Capture blur (LAN) | **< 100 ms** p95 | Playwright `captureSave*Ms` or DevTools Performance |
| PATCH body (text cell) | **< 2 KB** | Network tab → `capture-cell` |
| Requests per blur | **≤ 2** | No `by-project` / `by-product` within 2 s |
| NotificationInbox SQL after blur | **0** | EF log / middleware |
| `[ApiTiming]` log line | Present | Dev console for `capture-cell` |

---

## Field DevTools checklist (JO00991)

Use Chrome on LAN against field API (`http://<server-ip>:4000/api`).

1. **Login** — `jose.lopez@strataworldwide.com`; shell interactive without long freeze.
2. **Assets** — Navigate to Installations → Assets; open project dropdown, select **JO00991**.
3. **Capture** — Toggle **Capture** view; search **`CAD-0039`** (full tag with hyphen).
4. **Edit 3 cells** on CAD-0039:
   - Open Network tab; filter `capture-cell`.
   - Edit a text field; tab out (blur).
   - Confirm: PATCH body < 2 KB; response < 100 ms; **no** `by-project` GET within 2 s.
5. **Issues** — Open Issues board; expand CC-0012; close with resolution note; save < 500 ms.
6. **Hard refresh** — Confirm capture edits persisted.

Record timings in the table above when re-baselining after each phase.

---

## Automated gate

```bash
node scripts/seed-workflow-smoke-data.mjs
npm run test:e2e:workflow-consistency
npm run test:e2e:web-perf
```

**Strict thresholds (Phase 1):** `captureSave*Ms` < 100 ms each; no `step-results` PATCH during capture edits.  
**Strict thresholds (Phase 5):** `captureSearchMs` < 200 ms when searching full asset tag.

---

## Phase 4 — Dev & polish notes

### React StrictMode (dev only)

`src/main.tsx` wraps the app in `<React.StrictMode>`. In **Vite dev** (`npm run dev`), React intentionally double-invokes effects and certain lifecycles to surface side effects. That means:

- `App.tsx` runs `initSecureStorage()` + `getLaunchAuthModeAsync()` **twice** on first load in dev.
- Auth `[App]` console logs appear in pairs; network prefetch hooks may fire twice.

**Production builds do not double-mount** — treat duplicate dev logs as expected, not a perf regression. Do not remove StrictMode to “fix” dev noise.

### React Router future flags

`BrowserRouter` enables `v7_startTransition` and `v7_relativeSplatPath` so route navigations wrap state updates in `React.startTransition` (smoother tab switches on large pages like Assets).

### SQLite indexes (server boot)

`DbInitializer.EnsurePerformanceIndexes` idempotently ensures:

| Index | Covers |
|-------|--------|
| `IX_ProjectAssets_ProjectId` | EF migration — project-scoped asset lookups |
| `IX_ProjectAssets_ProjectId_AssetTag` | Paginated `by-project` default sort |
| `IX_AssetWorkflowRuns_AssetId_ConfigId_StartedAt` | Latest run per config |
| `IX_AssetWorkflowRuns_AssetId_StartedAt` | Run summaries / open-issues |

Verify after deploy: `sqlite3 commtrac.db ".indexes ProjectAssets"` and `.indexes AssetWorkflowRuns`.

---

## Field sign-off checklist (Jose — JO00991)

Run on **LAN** against the field API build (`npm run build && npm run preview` or deployed bundle).

| # | Step | Pass criteria |
|---|------|---------------|
| 1 | Login as PM | Shell ready in < 2 s; lands on **Assets** (not Dashboard) |
| 2 | Select **JO00991** | First rows or honest spinner within **1 s** |
| 3 | Open **Capture** view | Toggle < **500 ms** |
| 4 | Search **`CAD-0039`** | Row visible in **< 200 ms** |
| 5 | Edit 3 cells on CAD-0039 | Each blur feels instant (< 100 ms); Network shows `capture-cell` PATCH only |
| 6 | Open **Issues** → close **CC-0012** | Save < **500 ms** |
| 7 | Hard refresh | Capture edits persisted; no false *"No assets added"* |

**Sign-off = all seven pass.** Record results in the table above when re-baselining.
