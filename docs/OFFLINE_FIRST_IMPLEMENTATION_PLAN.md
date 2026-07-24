# Offline-first implementation plan

Phased delivery for native offline field operations. Phases **1–9** are implemented on the `cursor/phase*` PR stack; **Phase 10** adds release gates and acceptance docs; **Phase 11** is post-release monitoring.

| Phase | Theme | PR stack | Status |
|-------|-------|----------|--------|
| 1 | Measure & instrument | #12 area | ✅ Done |
| 2 | Unified workflow open + perf lock | #13 area | ✅ Done |
| 3 | Write path hardening | #15 | ✅ Done |
| 4 | Local-first reads | #15 | ✅ Done |
| 5 | Bootstrap + media prefetch | #16 | ✅ Done |
| 6 | Write completeness (issues, sigs, photos) | #17 | ✅ Done |
| 7 | Inspection workflows offline | #18 | ✅ Done |
| 8 | Secondary screens & honest limits | #19 | ✅ Done |
| 9 | Sync conflicts + SSE probing | #20 | ✅ Done |
| **10** | **Acceptance testing & release gates** | **#21** | **This phase** |
| 11 | Post-release monitoring | — | Planned |

User-facing summary: [`OFFLINE_FIRST_UX.md`](./OFFLINE_FIRST_UX.md) · Device sign-off: [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md)

---

## Phase 10 — Acceptance testing & release gates

**Goal:** Ship with proof — automated gates in CI and a documented native device matrix.

### Automated (CI + local)

```bash
npm run release-gates          # typecheck + backend + vitest + e2e smoke + offline perf
npm run test:e2e:full          # login flow (API + frontend) — run before production
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs backendtest  # optional locally
```

| Gate | Command | CI job |
|------|---------|--------|
| Typecheck + build | `check-gates typecheck` / `npm run build` | `frontend` |
| Vitest | `npm test` | `frontend` |
| Backend build + test | `dotnet build` / `dotnet test` | `backend` |
| E2E smoke | `npm run test:e2e` | `e2e` |
| Offline perf contract | `npm run test:e2e:perf` | `e2e-perf` |
| E2E login | `npm run test:e2e:full` | `e2e-full` |

### Manual native matrix

Record results in [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) before each phone release.

### Installer handout

Print or share [`OFFLINE_INSTALLER_QUICK_REF.md`](./OFFLINE_INSTALLER_QUICK_REF.md).

### Exit criteria

- [ ] `npm run release-gates` green on release commit
- [ ] CI jobs `e2e`, `e2e-perf`, `e2e-full` green
- [ ] Acceptance matrix signed for target release
- [ ] [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) Layer C offline section signed

---

## Phase 11 — Post-release monitoring (planned)

1. Sync error telemetry export from Sync Center debug log
2. Support playbook in `BUG_TRIAGE.md` for offline/sync issues
3. Quarterly staging restore + offline QA

---

## Smoke test reference

### Every PR (native offline stack)

```bash
npm test
npm run build
npm run test:e2e
npm run test:e2e:perf
```

### Before merge to main / phone build

```bash
npm run release-gates
npm run test:e2e:full
```

### Manual native (spot check)

1. Login online → wait for bootstrap
2. Airplane ON → Dashboard Resume → runner interactive (≤1s target)
3. Save one step → pending indicator
4. Force-quit → reopen → step saved
5. Airplane OFF → queue syncs
6. Sync Center → resolve conflict if test scenario applies

---

## Related docs

- [`OFFLINE_DEVICE_MEASUREMENT.md`](./OFFLINE_DEVICE_MEASUREMENT.md) — p95 baseline template
- [`MOBILE_BUILD.md`](./MOBILE_BUILD.md) — Capacitor build steps
- [`FIELD_RUN_QA_CHECKLIST.md`](./FIELD_RUN_QA_CHECKLIST.md) — permissions / field UX
- [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) — full release train
