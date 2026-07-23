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
| API timing/errors | `window.__apiDebugLogs` |
| Pending sync | Sync Center → pending / failed / conflict rows |

## Escalation

- **S0 active in production** — Stop staged phone rollout; notify ops + product; war room until mitigated.
- **Security** (auth bypass, data exposure) — Treat as S0; rotate JWT if compromise suspected.

See also: `docs/RELEASE_CHECKLIST.md`, `docs/MOBILE_BUILD.md`.
