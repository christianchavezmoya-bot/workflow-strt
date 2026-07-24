# Release checklist

Use this checklist for **every** production release (web, API, and/or phone). Nothing ships without staging sign-off.

Related docs: `docs/BUG_TRIAGE.md`, `docs/MOBILE_BUILD.md`, `docs/FIELD_RUN_QA_CHECKLIST.md`, `docs/OFFLINE_FIRST_UX.md`, `docs/OFFLINE_FIRST_IMPLEMENTATION_PLAN.md`, `docs/OFFLINE_ACCEPTANCE_MATRIX.md`, `docs/OFFLINE_INSTALLER_QUICK_REF.md`.

---

## Release train timeline

| When | Action |
|---|---|
| **T-7** | Freeze scope; list migrations and whether a phone build is required |
| **T-3** | Deploy release candidate to **staging**; run automated + manual checks below |
| **T-1** | Go/no-go; backup production DB + `Storage/` |
| **Release day** | Tag `vX.Y.Z` → deploy API → deploy web → staged phone rollout |
| **T+1–7** | Monitor health, sync errors, support tickets |

---

## Layer A — Automated gates (required)

Run on the **exact commit** being released:

```bash
npm run release-gates     # typecheck + backend + vitest + e2e smoke + offline perf
npm run test:e2e:full     # login flow (API + frontend)
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs backendtest  # same as CI backend job
```

| Gate | Must pass |
|---|---|
| `npm run release-gates` | Yes |
| Typecheck + Vite build | Yes (included in release-gates) |
| `dotnet build` | Yes (included in release-gates) |
| Vitest (`npm test`) | Yes (included in release-gates) |
| Backend tests (`dotnet test`) | Yes |
| E2E smoke | Yes (included in release-gates) |
| E2E offline perf | Yes (included in release-gates) |
| E2E full (login) | Yes before production |

---

## Layer B — Staging deploy

- [ ] API on staging with persistent disk (`commtrac.db`, `Storage/`, `backups/`)
- [ ] Web built with `VITE_API_BASE=<staging-api-url>/api`
- [ ] JWT, SeedAdmin, SMTP, `Email:FrontendBaseUrl` set for staging (not dev defaults)
- [ ] `/api/health` returns OK

---

## Layer C — Manual regression (web + one phone)

Tester, date, app version, API tag: _______________

### Auth

- [ ] Login / logout
- [ ] Token refresh after idle period
- [ ] Role permissions (Viewer / field user / admin)
- [ ] Native: biometric/PIN if enabled
- [ ] Native: offline grace — cached session works in airplane mode

### Core flows

- [ ] Projects — list and open
- [ ] Assets / installations — list, assign user
- [ ] Start workflow (Assets page)
- [ ] Resume workflow (Dashboard quick action)
- [ ] Complete steps: text, photo, signature
- [ ] Pause / resume run
- [ ] Issues — flag and resolve
- [ ] Complete run → field sign-off → customer sign-off
- [ ] Documents — browse index

### Offline-first (phone — required before phone release)

Record device results in [`docs/OFFLINE_ACCEPTANCE_MATRIX.md`](OFFLINE_ACCEPTANCE_MATRIX.md). Share [`docs/OFFLINE_INSTALLER_QUICK_REF.md`](OFFLINE_INSTALLER_QUICK_REF.md) with field teams.

- [ ] Online bootstrap completes (assigned assets + configs cached)
- [ ] Airplane mode: open cached workflow in ≤1s (target)
- [ ] Save step offline → pending sync indicator
- [ ] Kill app offline → reopen → data intact
- [ ] Restore network → queue syncs without duplicates
- [ ] Installer + customer signatures queued separately offline

### Sync

- [ ] Sync Center: pending → synced
- [ ] Conflict surfaced and resolvable
- [ ] No S0/S1 sync defects open

### Server

- [ ] Fresh DB boot on clean volume (migrations apply)
- [ ] Backup job runs; restore tested on staging at least quarterly

---

## Layer D — Production deploy order

1. [ ] Tag `vX.Y.Z` on `main`
2. [ ] **Backup** production `commtrac.db` + `Storage/`
3. [ ] Deploy **API** → verify `/api/health`
4. [ ] Deploy **web** `dist/` (built with production `VITE_API_BASE`)
5. [ ] **Phone build** (if applicable) — see `docs/MOBILE_BUILD.md`; staged rollout 10% → 100%
6. [ ] Production smoke: login + one workflow open

---

## Rollback

| Component | Rollback |
|---|---|
| API | Previous binaries + restore DB backup if migration ran |
| Web | Redeploy previous `dist/` artifact |
| Phone | MDM previous APK/IPA; halt store rollout |

---

## Sign-off

| Role | Name | Date | Approved |
|---|---|---|---|
| Dev lead | | | |
| QA / field lead | | | |
| Product / ops | | | |
