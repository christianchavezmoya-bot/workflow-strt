# Web performance smoke test & fix plan

**Date:** 2026-08-03 (updated 2026-08-04)  
**Related docs:** [`WEB_PERF_IMPLEMENTATION_PLAN.md`](./WEB_PERF_IMPLEMENTATION_PLAN.md) · [`WEB_PERF_BASELINE.md`](./WEB_PERF_BASELINE.md)  
**Context:** After merge of PR #52 (diagnostic clocks + assets first-load spinner fix), field tester still reports slow web loads and Assets page showing *"No assets added for AIM-100 yet"* before a manual refresh recovers data.  
**Target:** **<1 s** from navigation to meaningful content on all primary web routes (cold in-session cache, not full page reload).

---

## Smoke tests run

| Test | Environment | Result |
|------|-------------|--------|
| `e2e/smoke.spec.ts` — SPA boot, no crash | Vite `:5173`, no API | **PASS** (3.8 s wall; includes dev-server cold start) |
| `e2e/web-perf.spec.ts` — login + Assets navigation | API `:4000` + Vite, seed DB (1 project, 0 assets) | **PASS** — login **1.97 s**, assets content **427 ms**, **24 API calls** |
| API latency (curl, seed DB) | Local API | `/projects` 76 ms, `/products` 20 ms, `/users` 8 ms, `/notifications` 30 ms |

**Important:** Seed DB has **~0 assets**. JO00991 field data (~**1,327 assets**) is **orders of magnitude heavier** — prior API logs showed **708–1,368 ms** for run-list queries alone on that project.

Playwright timing for individual API calls was unreliable in headless mode (`-1 ms`); use browser DevTools Network tab or server logs on JO00991 for authoritative numbers.

---

## Symptoms (from latest screenshot + report)

1. **Assets page empty state** — Project dropdown shows `JO00991 · Yancoal`, product context `AIM-100`, but banner reads *"No assets added for AIM-100 yet."*
2. **Manual refresh fixes it after a few seconds** — classic stale/empty-first-render or failed-then-retry pattern.
3. **Diagnostic clocks work** — UTC + site (GMT+10) display correctly; timezone path from #52 is functioning.
4. **Console shows duplicate `[App] Initializing secure storage…`** — React 18 **StrictMode** double-mount in dev (expected, adds noise not prod cost).

---

## Root causes (ranked)

### P0 — Waterfall gating before asset fetch starts

`AssetInstallationPage` will **not start** the asset load until:

1. `products.length > 0` (or loading finishes with demo fallback), **and**
2. `fetchProjects` / `fetchProducts` / `fetchUsers` have populated Redux.

On cold navigation to Assets, the sequence is:

```
Route lazy chunk download (AssetInstallationPage ≈ 250 KB gzipped)
  → dispatch fetchProducts, fetchProjects, fetchUsers  (3 network round-trips)
  → productsKey stabilizes
  → GET /project-assets/by-project/{id}  (blocking spinner on web)
  → parallel: configs, wf configs, runs/by-project, doc counts, features…
```

**Impact:** Best case adds **200–600 ms** on LAN before the main asset request even starts. On JO00991, the asset payload itself can exceed **1 s**.

**Code:** `AssetInstallationPage.tsx` lines ~689–697 (catalog gate), ~997–1005 (products empty early return).

---

### P0 — Silent failure → false empty state

Asset remote fetch uses `.catch(() => clearLoadingOnce())` with **no error state**. Any **401, timeout (10 s), or LAN blip** leaves `assets = []` and shows *"No assets added…"* — indistinguishable from a genuinely empty project.

Refresh works because the second attempt succeeds or hits `webCachedGet` after partial hydration.

**Code:** `AssetInstallationPage.tsx` Tier 2 `.catch` (~line 1118).

---

### P0 — Monolithic list endpoints for large jobs

Server returns **full asset rows** for entire project/product with no pagination:

- `GET /project-assets/by-project/{id}` — all assets + `MapAssetsToDtosAsync`
- `GET /asset-workflow-runs/by-project/{id}` — up to **2 representative runs per asset** with JSON blobs

For **1,327 assets**, this is multi‑MB JSON and **cannot** meet <1 s on a typical LAN link.

**Code:** `ProjectAssetsController.GetByProject`, `AssetWorkflowRunsController.ListByProject`.

---

### P1 — No app-level bootstrap cache warming

Every major page independently dispatches `fetchProjects` / `fetchProducts` / `fetchUsers` on mount (Dashboard, Assets, Projects, Workflows, Admin…). There is **no authenticated shell prefetch**, so each route pays the catalog tax on first visit.

`webFreshCache` (20 s TTL, memory-only) helps **revisit within the same tab session**, not first paint after login.

---

### P1 — Oversized route bundle

Vite build output:

| Chunk | Gzipped |
|-------|---------|
| `AssetInstallationPage-*.js` | **~71 KB** (250 KB parsed) |
| `Dashboard-*.js` | ~33 KB |
| Main `index-*.js` | ~245 KB |

First visit to Assets downloads and parses a **very large** module before any data fetch begins.

---

### P1 — StrictMode + auth init duplicate work (dev only)

`main.tsx` wraps the tree in `<React.StrictMode>`. `App.tsx` runs `initSecureStorage()` + `getLaunchAuthModeAsync()` twice in dev — harmless in prod build but confusing during debugging.

---

### P2 — URL / project id mismatch risk

Links from Project List use `project={project.id}` (UUID). Bookmarks or manual URLs with **job number** (`?project=P-8862`) will query the API with a non-id value → **empty list**, while the dropdown (once projects load) may show the correct job from a **different** `selectedProjectId` source (sessionStorage vs URL race).

#52 init-from-URL helps but does not resolve job-number aliases.

---

## Why #52 did not fully fix the empty page

#52 correctly keeps the **spinner** until the web remote fetch settles (no premature empty from empty Tier-1 local cache). Remaining gaps:

1. If the fetch **errors**, spinner clears → false empty (unchanged).
2. If fetch ** succeeds with []** due to wrong `projectId` in URL, empty is correct but misleading.
3. Catalog **gate** still delays fetch start until products load.
4. JO00991 payload + runs query can exceed **1 s** even when logic is correct — user perceives “slow then empty” if they navigate away or refresh mid-flight.

---

## <1 s target — realistic scope

| Route | Today (JO00991, LAN) | Achievable <1 s? |
|-------|----------------------|------------------|
| Dashboard | 2–5 s (workspace + runs + assets) | **After** pagination + prefetch |
| Assets | 2–8 s (1327 rows + runs) | **Requires** list slimming + pagination |
| Projects list | ~0.5–1.5 s | Likely yes with prefetch |
| Workflows | ~0.5–2 s | Likely yes |
| Documents | varies | Depends on folder size |

**Conclusion:** <1 s for **all** pages including JO00991 Assets is **not achievable** without **backend list pagination + slim DTOs** and **frontend deferred loading**. Smaller projects and revisit navigations can hit <1 s sooner.

---

## Fix plan (phased)

### Phase 1 — Quick wins (1–2 PRs, no schema change)

**Goal:** Stop false empty states; shave 300–500 ms off Assets first fetch start.

| # | Task | Files / area |
|---|------|----------------|
| 1.1 | **Shell bootstrap prefetch** — after auth, dispatch `fetchProjects`, `fetchProducts`, `fetchUsers` once from `AppShell` / `useAuth` | `AppShell.tsx`, new `useAppBootstrap.ts` |
| 1.2 | **Remove products gate for project-scoped load** — if `selectedProjectId` or URL `?project=` is set, fetch assets immediately (don't wait for products catalog) | `AssetInstallationPage.tsx` |
| 1.3 | **Fetch error UX** — on Tier-2 `.catch`, set `assetsError` state; show retry banner instead of "No assets added" | `AssetInstallationPage.tsx` |
| 1.4 | **Resolve project URL aliases** — `?project=` accepts UUID **or** jobNumber; normalize once projects list arrives | `AssetInstallationPage.tsx`, small helper |
| 1.5 | **Defer non-critical fetches** — runs map, doc counts, feature deps: start **after** `setAssets` + `setLoadingAssets(false)` (request idle callback / 0 ms timeout) | `AssetInstallationPage.tsx` |
| 1.6 | **webCachedGet `onFresh` for list endpoints** — update Redux/assets state when background revalidate completes (stale UI after cache hit) | `AssetRepository.ts`, consumers |

**Exit criteria:** Assets never shows false empty on transient error; spinner → data or explicit error; first fetch starts without waiting for products on project URLs.

---

### Phase 2 — Large-job performance (backend + frontend, required for JO00991 <1 s)

**Goal:** Paginated/summary-first loading for 1k+ asset projects.

| # | Task | Details |
|---|------|---------|
| 2.1 | **Slim list DTO** — `ProjectAssetListItemDto` without `IssuesJson`, heavy feature blobs; full detail on row expand / GET by id | `Dtos.cs`, `ProjectAssetsController` |
| 2.2 | **Paginated list API** — `GET by-project/{id}?page=&pageSize=&productId=` default pageSize 50–100 | Server + client |
| 2.3 | **Virtualized table** — react-window / MUI DataGrid virtual scroll for Operations + Capture views | `AssetInstallationPage` splits |
| 2.4 | **Runs: status-only first paint** — new endpoint or query flag returning `{ assetId, status, signatureStatus }` without JSON blobs; full run on expand | `AssetWorkflowRunsController` |
| 2.5 | **Split mega-page** — lazy-load dialogs, capture matrix, export tooling | Reduce initial chunk <150 KB |

**Exit criteria:** JO00991 Assets first screen interactive **<1 s** on LAN (50 rows visible); remaining pages load in background.

---

### Phase 3 — Session resilience & perf gates

| # | Task | Details |
|---|------|---------|
| 3.1 | **Session list cache** — `sessionStorage` last asset list per project id for instant paint (SWR) | `webFreshCache` extension |
| 3.2 | **Axios request dedup** — coalesce identical in-flight GETs | `api.ts` |
| 3.3 | **Perf CI budget** — extend `e2e/web-perf.spec.ts` with `<1000 ms` assert on seed data; separate nightly job with large fixture | `playwright.web-perf.config.ts` |
| 3.4 | **Bundle budget** — fail CI if `AssetInstallationPage` chunk exceeds threshold | Vite plugin / size-limit |

---

### Phase 4 — Polish (optional)

- Remove StrictMode double-init noise in dev docs (or accept as dev-only)
- React Router v7 future flags (`startTransition`) for smoother navigations
- Server-side index review for `ProjectAssets(ProjectId)`, `AssetWorkflowRuns(AssetId, StartedAt)`

---

## Recommended PR sequence

1. **`cursor/web-bootstrap-prefetch-cd21`** — Phase 1.1–1.3 (prefetch + error UX + drop products gate)
2. **`cursor/web-assets-defer-secondary-cd21`** — Phase 1.5–1.6 (defer runs/docs; onFresh)
3. **`cursor/project-list-pagination-cd21`** — Phase 2.1–2.2 (backend + client pagination — **blocks JO00991 <1 s**)
4. **`cursor/assets-page-split-cd21`** — Phase 2.5 (chunk split + virtualization)

---

## Immediate retest checklist (JO00991)

After Phase 1 PR:

```bash
git pull origin main
npm run build && npm run dev
```

1. Open DevTools → Network → filter `project-assets` — confirm request fires **before** products response on `?project=<uuid>`.
2. Throttle network to **Offline** mid-load — expect **error/retry banner**, not *"No assets added"*.
3. Cold login → Assets — note time from navigation to first row (target trending down).
4. Compare UTC/site clocks (already OK per latest screenshot).

---

## Files added for ongoing perf monitoring

- `e2e/web-perf.spec.ts` — login + assets timing smoke
- `playwright.web-perf.config.ts` — runs perf smoke with API + Vite

Run locally:

```bash
npx playwright test --config playwright.web-perf.config.ts
```
