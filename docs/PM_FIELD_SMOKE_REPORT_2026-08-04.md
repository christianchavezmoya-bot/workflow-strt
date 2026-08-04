# PM field smoke — JO00991 performance report

**Date:** 2026-08-04  
**Actor:** Jose Lopez (`jose.lopez@strataworldwide.com`) — Project Manager  
**Scenario:** Login → Assets → project **JO00991** → Capture table → edit **CAD-0039** → Issues → resolve blocking issue **CC-0012**  
**Automation:** `e2e/pm-field-smoke.spec.ts` + `playwright.pm-field.config.ts`  
**Raw metrics:** `e2e-results/pm-field-smoke-report.json`

---

## Environment caveat (read first)

This cloud run used a **synthetic JO00991** seeded locally (`node scripts/seed-pm-smoke-data.mjs`):

| | Cloud smoke DB | Real field JO00991 |
|--|----------------|-------------------|
| Assets | **152** (2 real + 150 filler) | **~1,327** |
| API latency (curl, warm) | 3–4 ms for by-project endpoints | **708–1,368 ms** for run lists alone (prior logs) |
| Network | localhost | LAN to field server |

Timings below are **valid for UX/architecture issues** but **understate** real JO00991 load. Extrapolate using `docs/WEB_PERF_SMOKE_REPORT_2026-08-03.md` and `docs/FIELD_TEST_FINDINGS_2026-08-03.md`.

---

## Flow results

| Step | Result | Wall time | Verdict |
|------|--------|-----------|---------|
| Login → app shell | **PASS** | **4.2 s** | Borderline — acceptable under 5 s threshold but sluggish for a daily-login app |
| Navigate to Assets shell | **PASS** | 0.8 s | OK |
| Open project dropdown + select JO00991 | **PASS** (slow) | **5.3 s** | **Unacceptable** — MUI select feels stuck; blocks all downstream work |
| Assets content after project select | **PASS** | 0.8 s | OK at 152 assets; expect multi-second at 1,327 |
| Switch Operations → Capture view | **PASS** | 2.0 s | Acceptable at 152 rows; will worsen on large jobs |
| Search + edit CAD-0039 (3 capture cells) | **NOT RUN** | — | See functional gap below |
| Issues board load | **PASS** | 0.9 s shell / 14 ms rows | Excellent |
| Expand + Close Issue CC-0012 | **PASS** | 79 ms expand / **353 ms save** | Excellent — save feels instant |

---

## Unacceptable / professional-app concerns

### P0 — Project selector latency (~5 s)

Opening the MUI **Project** dropdown and selecting JO00991 took **5.3 s** every run. For a PM who switches jobs dozens of times per day, this is **not acceptable**. Likely contributors:

- Dropdown waits on catalog hydration (`fetchProjects` / `fetchProducts` / `fetchUsers`) before feeling interactive
- Large option list rendering without virtualization
- Competing dashboard fetches on first navigation after login

**Recommendation:** Prefetch projects in authenticated shell; virtualize project `<Select>` options; defer dashboard widgets until after first user interaction.

### P0 — Capture search broken for hyphenated asset tags (CAD-0039)

Playwright could not locate **CAD-0039** after typing the full tag into the Capture search box, even though the asset exists and `/project-assets/by-project/proj-jo00991` returned it.

**Root cause (code):** `matchesWordStart` in `src/utils/textMatch.ts` splits the **query** on whitespace only. Query `CAD-0039` becomes one token `cad-0039`, but the asset tag tokenizes to `cad` + `0039`. No word starts with `cad-0039`, so the row is filtered out.

**User impact:** PMs cannot search capture table by full asset tag (CAD-xxxx, CC-xxxx) — only partial prefixes like `CAD` or `0039` work. This matches field reports of “search feels broken” on asset grids.

**Recommendation:** Normalize query tokenization to split on hyphens/slashes, or add explicit asset-tag substring match before word-start logic.

### P0 — API fan-out before project-scoped fetch (architecture)

On a single Assets page visit, the browser fired **~90+ API calls**, including:

- **`/project-assets/by-product/{id}` × 7 products × 2 (duplicate)** — before and after project selection
- **`/project-assets/dashboard-workspace` × 2** on login
- **`/role-configs` × 6+**
- **`/products` × 3**, **`/projects` × 3**, **`/users` × 3**

On real JO00991, each unnecessary by-product call can pull hundreds of assets. This is the main reason field testers see **multi-second waits and false empty states** (`docs/WEB_PERF_SMOKE_REPORT_2026-08-03.md`).

**Recommendation:** Phase 2 pagination plan — gate by-product fetches behind explicit product filter; single bootstrap prefetch in `AppShell`.

### P1 — Login still heavy (~4.2 s)

Login includes dashboard workspace + role config + SSE + multiple dashboard widgets before the user reaches Assets. Acceptable for cold start once per session, but **not** for a snappy enterprise SaaS feel.

### P1 — Server errors on ancillary endpoints

Repeated **HTTP 500** during the session:

- `/notifications` (×3)
- `/inspection-imports` (×4)

These don’t block the PM path but add retry noise, console errors, and spinner flicker — unprofessional in front of customers.

### P1 — First-login onboarding modal blocks automation (and new users)

New PM accounts see a **Welcome / Quick setup** dialog that must be dismissed before the Assets page is usable. Not a perf issue, but adds **~2–5 s** and confusion on first visit.

---

## Acceptable timings (this run)

| Interaction | Time | Notes |
|-------------|------|-------|
| Issues board content | 14 ms | Good |
| Close Issue save | 353 ms | Good |
| Capture view toggle | 2.0 s | OK at 152 rows |
| Assets content (152 assets) | 848 ms | OK locally; not representative of 1,327 |

---

## Extrapolation to real JO00991 (from prior field evidence)

From `docs/FIELD_TEST_FINDINGS_2026-08-03.md` and API logs on the field server:

| Concern | Field evidence | Severity |
|---------|----------------|----------|
| Asset create/edit keystroke lag | Reported by Juan Perez on web PM | **Unacceptable** |
| Assets page false empty | “No assets added for AIM-100 yet” until refresh | **Unacceptable** |
| Monolithic by-project payload | 1,327 assets + runs JSON multi-MB | **Unacceptable** at current architecture |
| Run list API | 708–1,368 ms | **Unacceptable** for interactive editing |

**Keystroke/save timings for CAD-0039 capture cells were not measured** in this run because search failed to surface the row. On field retest, measure: cell focus → first character visible (<50 ms target), blur → save complete (<500 ms target on LAN).

---

## How to re-run

```bash
# Seed synthetic JO00991 (dev DB only)
node scripts/seed-pm-smoke-data.mjs

# Run smoke (starts API + Vite if not already up)
npx playwright test --config playwright.pm-field.config.ts

# Fail CI on perf findings
PM_SMOKE_STRICT=1 npx playwright test --config playwright.pm-field.config.ts
```

Against **real field data**, point at your LAN API:

```bash
PM_SMOKE_BASE_URL=http://10.7.15.159:5173 npx playwright test --config playwright.pm-field.config.ts
```

(Ensure Vite/API on that host use the field DB with JO00991.)

---

## Summary

| Category | Status |
|----------|--------|
| Login | Borderline slow |
| Project pick | **Fail — too slow** |
| Assets load (small job) | Pass |
| Capture view | Pass (switch time OK) |
| Capture search CAD-0039 | **Fail — hyphenated tag bug** |
| Capture cell edit/save | Not measured |
| Issues load | Pass |
| Close blocking issue CC-0012 | Pass (~353 ms) |

**Bottom line:** Issue resolution and Issues board performance are fine. The Assets/Capture PM path is **not production-grade** for JO00991-scale work: project selection is too slow, API fan-out is excessive, capture search fails on standard asset tags, and field testers already report keystroke lag and false empty states on the real job.
