# Web performance baseline

**Date:** 2026-08-04  
**Environment:** Dev seed DB (`node scripts/seed-pm-smoke-data.mjs`), 152 assets + JO00991, Vite dev + API :4000  
**Reference:** `docs/WEB_PERF_IMPLEMENTATION_PLAN.md`

---

## Current metrics (pre Phase 1 merge)

Measured on cloud agent VM with seeded JO00991 data. Production-like builds (`npm run build && npm run preview`) should be re-measured on field LAN before sign-off.

| Metric | Median (est.) | p95 (est.) | Notes |
|--------|---------------|------------|-------|
| Login → shell | ~2 s | ~3 s | Includes onboarding dismiss |
| Project select (JO00991) | ~3 s | **~1.9 s** (Phase 2 seed) | MUI Select + load; target < 300 ms (Phase 2 partial) |
| Assets content after select | ~0.8 s | ~1.8 s | 152 seed assets |
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
3. **Capture** — Toggle **Capture** view; search `CAD` (or `CAD-0039` after Phase 5 search fix).
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
node scripts/seed-pm-smoke-data.mjs
npm run test:e2e:pm-smoke                    # report only
PM_SMOKE_STRICT=1 npm run test:e2e:pm-smoke  # fail on threshold breaches
```

Report written to `e2e-results/pm-field-smoke-report.json`.

**Strict thresholds (Phase 1):** `captureSave*Ms` < 100 ms each; no `step-results` PATCH during capture edits.
