# Offline ops playbook (Phase 11)

Recurring operational tasks after offline-first release. Pair with [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) and [`BUG_TRIAGE.md`](./BUG_TRIAGE.md).

---

## Quarterly staging restore + offline QA

Schedule every **3 months** (or after any major sync/schema change). Owner: ops + field QA lead.

### 1. Staging environment reset

- [ ] Restore production backup to **staging** (`commtrac.db` + `Storage/`) or run fresh DB + seed
- [ ] Deploy release-candidate API + web build with staging `VITE_API_BASE`
- [ ] Verify `/api/health` and admin login

### 2. Automated gates on staging build

```bash
npm run release-gates
npm run test:e2e:full
```

### 3. Native offline smoke (one device)

Follow [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) — minimum rows:

- [ ] 1 — Airplane resume (small workflow)
- [ ] 6 — Kill app mid-run, reopen
- [ ] 7 — Queued ops reconnect
- [ ] 8 — Conflict resolve

Record p95 open ms where applicable.

### 4. Support tooling check

- [ ] Sync Center → **Copy support bundle** produces valid JSON (no tokens in URLs)
- [ ] API Debug Log → **Copy sanitized logs** works
- [ ] Attach sample bundle to staging sign-off ticket (redact user email if needed)

### 5. Sign-off

| Role | Name | Date |
|------|------|------|
| QA / field lead | | |
| Dev lead | | |

File completed matrix + bundle sample with release notes.

---

## Post-release monitoring (ongoing)

| Signal | Where | Action |
|--------|-------|--------|
| Sync errors | Support tickets + bundle `droppedActions` | Triage per BUG_TRIAGE playbook |
| Conflict rate | Bundle `summary.conflictCount` | Review concurrent-edit training |
| Bootstrap stale | Bundle `bootstrap.isStale` | Remind field download before jobs |
| Perf regression | Bundle `offlinePerf` / device matrix p95 | Compare to [`OFFLINE_DEVICE_MEASUREMENT.md`](./OFFLINE_DEVICE_MEASUREMENT.md) |

### War room triggers (S0)

- Confirmed data loss after sync
- Widespread “pending forever” with healthy API
- Duplicate workflow completes for same asset/run

Stop phone rollout; collect support bundles from affected devices.

---

## Related docs

- [`OFFLINE_FIRST_IMPLEMENTATION_PLAN.md`](./OFFLINE_FIRST_IMPLEMENTATION_PLAN.md)
- [`OFFLINE_INSTALLER_QUICK_REF.md`](./OFFLINE_INSTALLER_QUICK_REF.md)
- [`MOBILE_BUILD.md`](./MOBILE_BUILD.md)
