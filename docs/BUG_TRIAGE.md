# Bug triage and response

Use this guide for every production or field bug report.

## Severity levels

| Level | Definition | Target response | Release track |
|---|---|---|---|
| **S0 — Data loss** | Field work lost, sync duplicates, wrong locked/completion state | Begin fix within 4h; hotfix within 24h | Emergency hotfix |
| **S1 — Blocker** | Cannot login, cannot open/start/complete workflow | Triage within 4h; fix within 1–2 days | Hotfix or next patch |
| **S2 — Major** | Feature broken; workaround exists | Next scheduled release | Biweekly/monthly train |
| **S3 — Minor** | UI glitch, cosmetic, non-blocking | Backlog | Scheduled release |
| **S4 — Enhancement** | Not a defect | Product backlog | Planned |

## Required information in every report

- Platform: web / Android / iOS + OS version
- App version (`versionName` / `package.json`) and API build/tag
- Online or offline; sync badge state if native
- Steps to reproduce (numbered)
- Expected vs actual
- Screenshots or screen recording
- For sync issues: Sync Center export / diagnostics (no tokens in tickets)

## Workflow

```
Report → Triage (severity + owner) → Reproduce → Fix branch → Tests → Staging → Release
```

1. **Triage** — Assign severity and owner within 4 business hours.
2. **Reproduce** — On staging with the reported app/API versions, or document why not reproducible.
3. **Fix** — Smallest correct change; add a regression test for S0/S1 and all sync/auth/workflow paths.
4. **Verify** — `npm run gates` (or `check-gates.mjs typecheck backend test`) + targeted rows from `docs/RELEASE_CHECKLIST.md`.
5. **Release** — S0/S1: hotfix branch → staging → production (+ phone build if native). S2+: scheduled train.

## Regression rules

- Every **S0/S1** fix should include an automated test when feasible.
- **Offline/sync** fixes must pass the offline section of `docs/RELEASE_CHECKLIST.md` on a physical phone.
- **Schema/API** fixes must pass `dotnet test` (migrations + fresh DB boot).
- Do not merge to `main` without green CI on the PR.

## Native diagnostics (field support)

| Tool | Access |
|---|---|
| Offline open timing | `window.__offlinePerf` / `getOfflinePerfLog()` in dev tools (remote WebView debug) |
| API timing/errors | `window.__apiDebugLogs` or Sync Center → **View API Debug Log** → Copy sanitized logs |
| Pending sync | Sync Center → pending / failed / conflict rows |
| **Support bundle** | Sync Center → **Copy support bundle** or **Download JSON** (sanitized — safe for tickets) |

Attach a support bundle for **all S0/S1 sync reports**. Never paste JWTs, passwords, or raw `stepResultsJson`.

---

## Offline and sync support playbook

Use this when triaging native field reports (badge stuck, data missing, conflicts, duplicates).

### 1. Collect (ask the reporter)

- Platform + OS version, app version (`package.json` / About), API tag
- Online, offline, or airplane; sync badge text (Synced / Offline · ↑N / N conflicts)
- Steps to reproduce (numbered)
- **Sync Center → Copy support bundle** (or Download JSON) — attach to ticket

### 2. Classify severity

| Symptom | Likely cause | Default severity |
|---------|--------------|------------------|
| Field work lost after reconnect | Queue drop, wrong discard, duplicate apply | **S0** |
| Cannot complete/sign workflow offline when cached | Missing bootstrap, business-rule 422 | **S1** |
| Stuck pending >30 min online | Server unreachable, token expired, conflict | **S1** |
| Conflict banner / wrong server version | Concurrent edit (web + phone) | **S2** until data loss |
| Stale dashboard counts | SSE/cache lag; not data loss | **S3** |
| Document not previewable offline | File not prefetched (bootstrap cap) | **S3** (documented limit) |

### 3. Read the support bundle

| Section | What to check |
|---------|----------------|
| `summary` | pending / conflict / dropped counts |
| `connectivity` | `manualOffline`, `serverReachable`, `navigatorOnLine` |
| `bootstrap` | `readyForOffline`, `isStale`, last download time |
| `conflicts` | `conflictKind`: `concurrency` vs `business_rule`; `conflictMessage` |
| `droppedActions` | Permanently failed after max retries — **S0/S1** |
| `apiLogs` | `source: sync-engine` failures, HTTP status, timeouts |
| `offlinePerf` | Resume path slow? `interactive_ready` before network? |

### 4. First-response actions (support)

1. **Pending queue, online** — Sync Center → Sync Now; check API health
2. **Conflicts** — guide user: concurrency → Keep vs Accept server; 422 → fix blocking issues then Remove from queue
3. **Not downloaded** — connect → Sync Center → Download now (Offline readiness)
4. **Token expired** — re-login; queue should preserve (verify in bundle `pendingActions`)
5. **Duplicates after sync** — escalate **S0**; attach bundle + server logs for run id

### 5. Engineering fix criteria

- Reproduce on staging with same app/API versions
- Offline/sync fixes: pass [`OFFLINE_ACCEPTANCE_MATRIX.md`](./OFFLINE_ACCEPTANCE_MATRIX.md) rows relevant to the bug
- Add regression test for S0/S1 when feasible (`syncSupportBundleService`, sync engine, or API)

See also: [`OFFLINE_OPS_PLAYBOOK.md`](./OFFLINE_OPS_PLAYBOOK.md) (quarterly staging QA), [`OFFLINE_FIRST_UX.md`](./OFFLINE_FIRST_UX.md).

---

## Escalation

- **S0 active in production** — Stop staged phone rollout; notify ops + product; war room until mitigated.
- **Security** (auth bypass, data exposure) — Treat as S0; rotate JWT if compromise suspected.

See also: `docs/RELEASE_CHECKLIST.md`, `docs/MOBILE_BUILD.md`.
