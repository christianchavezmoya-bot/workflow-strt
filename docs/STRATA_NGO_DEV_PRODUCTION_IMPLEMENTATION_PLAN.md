# Strata N-Go — Dev + Production Implementation Plan

**Status:** Approved for execution — agents lead; Christian approves gates and human-only tasks.  
**Baseline (do not regress):** Git `6e4018c3` — DEV web PASS, API healthy, iPhone PASS, offline sync PASS, S3 upload PASS.  
**Audit input:** `docs/PRODUCTION_READINESS_AUDIT.md` (PR #325 — merge before Phase A code work).  
**Region:** `ap-southeast-2` · AWS profile for Mac agent: **`strata-agent`**

---

## Terminology (use everywhere)

| Name | URLs / resources | Notes |
|------|------------------|-------|
| **DEV** | Web: **`staging.strata-ngo.com`**. API: `api.staging.strata-ngo.com`. AWS: existing `staging-*` resources, ECS `commtrac-api-ae2c`. | **Do not rename** `staging-*` AWS resources to “dev”. |
| **PRODUCTION** | Web: `www.strata-ngo.com`. API: `api.strata-ngo.com`. AWS: **new** isolated stack (RDS, S3, ECS, Secrets Manager, CloudFront). | Real users only after Phase F gate. |
| **LOCAL** | `localhost:5173` / `localhost:4000`, Docker staging, LAN IPs. | Day-to-day feature development. |

---

## Who does what

| Owner | Responsibility |
|-------|----------------|
| **Cursor Cloud Agent** | Code PRs (Phases A–B), backend hardening, tests/builds, PR CI, docs, cloud-agent verification curls |
| **Claude Code (Mac)** | Docker/ECR/ECS deploys, S3/CloudFront sync, iOS/Android Xcode builds, AWS MCP read/write, disk cleanup, device install handoff |
| **Christian** | DNS/Cloudflare (when prompted), Apple/Google corporate developer accounts, Secrets Manager values (passwords), physical iPhone Run in Xcode, go/no-go gates, business decisions marked **DECIDE** |

**Rule:** Agents execute end-to-end. Christian is pinged only for tasks that require his credentials, DNS console, App Store signing, or explicit PASS/FAIL on acceptance.

**Deploy order (always):** `API → web → mobile`

---

## Phase overview

```
Phase 0  Prerequisites     Christian decisions + merge audit PR
Phase A  Code hardening      Cursor PRs → merge → Claude deploy DEV
Phase B  Build lanes         Cursor PRs → merge
Phase C  DEV DNS clarity     ✅ CLOSED / PASS (2026-08-31)
Phase D  Production AWS      Claude Code (new stack) + Christian secrets ← **NEXT**
Phase E  Mobile identity     Christian corp accounts + Claude builds
Phase F  Production go-live  Claude deploy + Christian acceptance
Phase G  Steady state        Promotion rules + monitoring
```

---

## Phase 0 — Prerequisites

**Goal:** Decisions recorded; audit merged; agents unblocked.

| ID | Task | Owner | Gate |
|----|------|-------|------|
| 0.1 | Merge PR #325 (`PRODUCTION_READINESS_AUDIT.md`) | Christian | Audit on `main` |
| 0.2 | Confirm bundle ID prefix (default: `com.strata.ngo.field` + `.dev` suffix for DEV app) | Christian **DECIDE** | Written in this doc |
| 0.3 | Confirm DEV web migration: `www` → PRODUCTION, DEV web → `staging.strata-ngo.com` | Christian **DECIDE** | Default: **yes** (recommended in audit) |
| 0.4 | Confirm prod iOS: TestFlight internal first, then App Store | Christian **DECIDE** | Record choice |
| 0.5 | Create/track GitHub Project or checklist from Phase A–F tables | Cursor | Optional |

### Phase 0 decisions — recorded 2026-08-31 (Christian)

| Decision | Answer |
|----------|--------|
| Bundle ID prefix | **`com.strata.ngo.field`** with **`.dev`** suffix for DEV app → DEV: `com.strata.ngo.field.dev`, PROD: `com.strata.ngo.field` |
| DEV web hostname | **`staging.strata-ngo.com`** for DEV; **`www.strata-ngo.com`** reserved for PRODUCTION |
| Prod iOS path | **TestFlight internal first** |
| First production users | **Internal pilot** |

**Phase 0 gate:** **PASS** (decisions recorded). Merge #325 + #326 when ready; Phase A may proceed in parallel on code branch.

---

## Phase A — Code hardening (no new AWS)

**Goal:** Close exploitable P0s on **production build profile** while DEV (`staging` API) keeps working.

| ID | Task | Owner | Closes | Acceptance |
|----|------|-------|--------|------------|
| A1 | Gate/remove `DebugPanel` + `__apiDebugLogs` when `VITE_APP_ENV=prod` or `import.meta.env.PROD` | Cursor | P0-5 | Prod build: no bug icon; dev build unchanged |
| A2 | Remove `dev_role_override` from prod builds; keep Admin “Test as role” on DEV web only | Cursor | P0-1 | Prod: `localStorage` override ignored |
| A3 | Remove auth `console.log` including `Login.tsx:197` full 2FA result | Cursor | P0-2 | Grep prod bundle: no token logging |
| A4 | `StrataNgoSeeder` uses `ResolveSeedAdminPassword()`; no `Admin123!` fallbacks | Cursor | P0-3 | Unit test: non-Dev throws if password missing |
| A5 | Delete tracked `.env.production`; add `.env.production.strata-ngo.example`; gitignore LAN files | Cursor | P0-6 | No LAN IP in git |
| A6 | Purge `server/Commtrac.Api/.tmp-build/` from git | Cursor | S-001 | `git ls-files .tmp-build` empty |
| A7 | CORS: fail startup if non-Development and `AllowedOrigins` empty | Cursor | P0-8 | Staging still starts with staging appsettings |
| A8 | Reject SSE `?token=` when not Development | Cursor | P0-8 | Integration test or manual curl 401 |
| A9 | `/sync-bundle` 404 → fall back to per-op flush (no silent drop) | Cursor | P0-9 | Test added |
| A10 | `npm test` + `npm run build` + `dotnet test` green | Cursor | — | CI pass |

**Branch naming:** one PR per theme or one PR `cursor/phase-a-prod-hardening-cd21` — prefer **one cohesive PR** for easier DEV deploy.

**Phase A gate — Claude Code deploys hardened `main` to DEV:**

```bash
# After Phase A merge to main
git pull origin main && npm test -- --run && npm run build
# Web only if frontend changed:
VITE_API_BASE=https://api.staging.strata-ngo.com/api npm run build:cloud-web:staging
# S3 strata-ngo-web-staging + CloudFront E1YN5XTWDWRHYP
# API only if backend changed:
# docker build → ECR → ECS commtrac-api-ae2c force-new-deployment
curl -sf https://api.staging.strata-ngo.com/api/health
```

**Christian (Phase A):** 5-minute smoke on `www.strata-ngo.com` — login, dashboard, confirm no debug bug icon on prod-profile web build *after* Phase B env flag (or skip until B3).

---

## Phase B — Build lanes & release identity

**Goal:** Explicit DEV vs PRODUCTION build commands; env visible in UI; version unified.

| ID | Task | Owner | Closes |
|----|------|-------|--------|
| B1 | Add `build:dev-web` → `api.staging.strata-ngo.com` | Cursor | E-011 |
| B2 | Add `build:prod-web` → `api.strata-ngo.com` (HTTPS validated, not deployed yet) | Cursor | E-011 |
| B3 | Add `build:dev-native` / `build:prod-native` wrapping existing cloud-native scripts | Cursor | E-011 |
| B4 | `VITE_APP_ENV=dev\|prod` baked at build; DEV badge in Topbar/About | Cursor | R-007, W-006 |
| B5 | Single version: `package.json` → Vite define → `APP_VERSION`; wire fault reports | Cursor | R-001, R-002 |
| B6 | Author Strata `appsettings.Production.json` (ap-southeast-2, `www`, prod bucket placeholders) | Cursor | E-008, E-009 |
| B7 | CI: document that deploy artifacts must use `build:cloud-web*` not bare `npm run build` | Cursor | E-012 |
| B8 | Backend `GET /api/version` (version, gitSha, environment) | Cursor | R-004 |

**Phase B gate:** `npm run build:prod-web` exits 0 with validated URL; `build:dev-web` still targets staging API.

---

## Phase C — DEV DNS clarity

**Goal:** DEV web moves to `staging.strata-ngo.com`; `www.strata-ngo.com` reserved for PRODUCTION cutover.

| ID | Task | Owner | Gate |
|----|------|-------|------|
| C1 | Cloudflare: add `staging.strata-ngo.com` → same DEV S3/CloudFront origin (or path-based origin) | **Christian** | DNS resolves |
| C2 | Update DEV deploy docs + `Email__FrontendBaseUrl` for DEV to use `staging.strata-ngo.com` when cutover complete | Cursor | Docs PR |
| C3 | Claude: deploy DEV web; verify both hosts during transition | Claude Code | 200 on both URLs |
| C4 | Update invite/QR smoke (L1–L5 from rebuild prompt) on DEV host | Claude Code + Christian | **PASS** (2026-08-31 acceptance) |
| C5 | Communicate to team: use `staging.strata-ngo.com` for DEV testing | Christian | **DONE** (2026-08-31 — see `docs/TEAM_DEV_ENVIRONMENT_UPDATE.md`) |

**Christian prompt — Phase C DNS:** see [Appendix C1](#appendix-c1--christian--phase-c-dns).

**Phase C gate:** **CLOSED / PASS (2026-08-31)** — Christian acceptance L1–L5 + infrastructure verified. See `docs/MAC_AGENT_PHASE_C_DEV_DNS_PROMPT.md`. `www` still serves DEV until Phase F.

---

## Phase D — Production AWS (new isolated stack)

**Goal:** Prod RDS, S3, ECS, Secrets Manager, CloudFront — **no traffic** until Phase F.

| ID | Task | Owner | Reference |
|----|------|-------|-----------|
| D1 | Prod RDS PostgreSQL (`strata-ngo-prod` or equivalent) | Claude Code | `CLOUD_HOSTING_AWS_PLAN.md` |
| D2 | S3 buckets: `strata-ngo-media-prod`, `strata-ngo-web-prod` | Claude Code | Same |
| D3 | ECR repo tag `commtrac-api:prod` or shared repo prod tag | Claude Code | Handoff doc pattern |
| D4 | ECS service **new** (not `commtrac-api-ae2c`) e.g. `commtrac-api-prod` | Claude Code | Isolated from DEV |
| D5 | Secrets Manager `strata_ngo/production/app` — JWT (≥32 bytes), DB conn, SeedAdmin password | **Christian** creates values; Claude registers task def | Never commit secrets |
| D6 | Task role S3 prod (copy staging `commtrac-staging-ecs-s3` pattern) | Claude Code | Day-one uploads |
| D7 | CloudFront + ACM for `www.strata-ngo.com` (web) | Claude Code + **Christian** DNS | CNAME to CF |
| D8 | ALB + `api.strata-ngo.com` | Claude Code + **Christian** DNS | Health 200 |
| D9 | Run `scripts/cloud-migrate.sh` against prod RDS **before** ECS scale-up | Claude Code | Migrations applied |
| D10 | Prod ECS env: `ASPNETCORE_ENVIRONMENT=Production`, no `SeedProfile`, `RunMigrationsOnStartup=false`, CORS `www` only, `AllowDeviceOrigins=false` | Claude Code | Config review |
| D11 | `curl https://api.strata-ngo.com/api/health` + `/api/version` | Claude Code | healthy + connected |

**Christian prompt — Phase D secrets:** see [Appendix C2](#appendix-c2--christian--phase-d-production-secrets).

**Mac agent runbook:** [`docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md`](./MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md)

**Phase D gate:** Prod API healthy; **zero** prod web/mobile traffic yet; Christian confirms secrets rotated and not defaults.

---

## Phase E — Mobile identity (N-Go Dev + N-Go)

**Goal:** Two installable apps; corporate signing; prod lane not distributed until Phase F.

| ID | Task | Owner |
|----|------|-------|
| E1 | Register Apple/Google apps under **Strata corporate** account | **Christian** |
| E2 | Bundle IDs: DEV `com.strata.ngo.field.dev`, PROD `com.strata.ngo.field` (adjust if 0.2 differs) | Cursor updates `capacitor.config` flavors + Claude sync |
| E3 | Display names: **N-Go Dev** / **N-Go** | Cursor |
| E4 | DEV build: `build:dev-native` → staging API; Claude Xcode install on Christian's iPhone | Claude Code |
| E5 | PROD build: `build:prod-native` → prod API; cleartext off, ATS restricted, no `VITE_SKIP_BIOMETRIC` | Cursor + Claude |
| E6 | `version:sync` before each store/upload | Claude Code |
| E7 | Christian device acceptance: DEV lane full offline suite | **Christian** |
| E8 | TestFlight internal for PROD lane (no external testers yet) | **Christian** + Claude |

**Christian prompt — Phase E Apple/Google:** see [Appendix C3](#appendix-c3--christian--phase-e-corporate-mobile).

**Phase E gate:** N-Go Dev PASS on staging API; N-Go prod build installs against prod API in TestFlight internal.

---

## Phase F — Production go-live

**Goal:** Real users on PRODUCTION; promotion from tested artifacts.

| ID | Task | Owner |
|----|------|-------|
| F1 | Tag release on `main` (e.g. `v1.2.0`) | Cursor or Christian |
| F2 | Deploy **same digests** tested on DEV: ECR image digest, web `index-*.js` hash | Claude Code |
| F3 | DNS: point `www.strata-ngo.com` to **prod** CloudFront; `api.strata-ngo.com` to prod ALB | **Christian** |
| F4 | Prod web deploy from `build:prod-web` | Claude Code |
| F5 | Prod smoke: login, workflow, document upload, health | Claude Code |
| F6 | Christian acceptance (short checklist) | **Christian** |
| F7 | Enable external TestFlight / Play internal → production rollout per decision 0.4 | **Christian** |
| F8 | Monitor CloudWatch 24h | Claude Code reports; Christian escalations |

**Go-live gate checklist:**

- [ ] All Phase A P0s closed on `main`
- [ ] Phase B build lanes in use
- [ ] Prod stack healthy; secrets not defaults
- [ ] DNS cutover complete
- [ ] Christian PASS on prod smoke
- [ ] Rollback plan documented (RDS snapshot + previous CF origin)

---

## Phase G — Steady state

| Rule | Detail |
|------|--------|
| Feature work | LOCAL → PR → merge `main` |
| DEV deploy | Claude Code after merge; target `staging.strata-ngo.com` + `api.staging.strata-ngo.com` |
| Christian acceptance | Short checklist on DEV before prod consideration |
| PRODUCTION deploy | Tagged release only; same artifacts; manual gate |
| Never | Feature branch → PRODUCTION; never mobile before API |

**Version status table (update each DEV deploy):**

| Component | Git SHA | Web bundle | ECS rev | Mobile build |
|-----------|---------|------------|---------|--------------|
| DEV | | | | N-Go Dev |
| PRODUCTION | | | | N-Go |

---

# Appendices — copy-paste prompts

## Appendix A — Claude Code master prompt (whole plan)

Copy everything between `PROMPT START` and `PROMPT END` into Claude Code on the Mac.

### PROMPT START

You are the **Mac execution agent** for Strata N-Go Dev + Production separation.

**Read first (in order):**
1. `docs/STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md` (this plan)
2. `docs/PRODUCTION_READINESS_AUDIT.md` (findings — merge from main if missing)
3. `docs/CLAUDE_CODE_AWS_HANDOFF.md`
4. `CLAUDE.md`

**Terminology:**
- **DEV** = existing AWS staging (`api.staging.strata-ngo.com`, `staging-*` resources). Do **not** rename staging resources.
- **PRODUCTION** = new isolated stack (`www.strata-ngo.com`, `api.strata-ngo.com`).

**Your responsibilities:** Docker/ECR/ECS, S3/CloudFront, AWS MCP with profile **`strata-agent`**, `npm run build*` when deploying, iOS/Android via `npx cap open ios` (SPM — no `.xcworkspace`), disk cleanup before docker builds.

**Baseline to preserve:** offline sync, S3 upload, queue drain — do not regress DEV at `6e4018c3` behavior.

**Execute the current phase** Christian or the Cursor agent assigns. Default starting point if none specified:

1. Check `git log -1` on `main` and which plan phase is active.
2. If Phase A code merged → deploy DEV web/API per handoff rebuild prompt.
3. Report using the template below.

**Deploy order:** API → web → mobile. Always.

**Before docker build:** run `docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`.

**Do not commit:** `.env.*.local`, secrets, LAN IPs.

**Report template:**
```
Strata N-Go plan — Mac agent report
Phase: 
Date:
Git HEAD:
Phase tasks attempted:
DEV API health: PASS/FAIL
DEV web URL + bundle hash:
PROD API health: PASS/FAIL/N/A
PROD web: PASS/FAIL/N/A
iOS N-Go Dev install: PASS/FAIL/N/A
Blockers needing Christian:
Next phase ready: YES/NO
```

### PROMPT END

---

## Appendix B — Cursor Cloud Agent master prompt

Use when spawning cloud agents for code phases (A, B, E config).

### PROMPT START

You are a **Cursor Cloud Agent** executing Strata N-Go **Dev/Production implementation plan**.

**Read:** `docs/STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md`, `docs/PRODUCTION_READINESS_AUDIT.md`, `CLAUDE.md`.

**Current assignment:** Phase ___ (A/B/E config) — implement only tasks listed for that phase.

**Rules:**
- Branch: `cursor/<phase-task>-cd21`
- Minimal diff; match repo conventions
- Run `npm test -- --run`, `npm run build`, `dotnet test` in `server/Commtrac.Api.Tests`
- No AWS deploy (Mac agent deploys)
- Prod build profile: `VITE_APP_ENV=prod` must gate debug UI, dev_role_override, verbose console
- DEV profile must keep Admin test tools on web
- Commit, push, create draft PR, report task IDs closed (e.g. A1, A2)

**Do not:** create production AWS resources, change DNS, or merge without CI green.

### PROMPT END

---

## Appendix C — Christian prompts (human-only)

### Appendix C1 — Christian — Phase C DNS

```
Strata N-Go — DEV DNS (Phase C) — your tasks only

Goal: Add staging.strata-ngo.com pointing to the same DEV web origin as www.strata-ngo.com today (CloudFront E1YN5XTWDWRHYP / bucket strata-ngo-web-staging).

In Cloudflare for strata-ngo.com:
1. Add CNAME staging.strata-ngo.com → (same target as www today)
2. SSL: Full (strict)
3. Confirm https://staging.strata-ngo.com loads the app login page

Reply "DNS C done" when live. Do NOT move www to production yet — that is Phase F.

Agents will update Email__FrontendBaseUrl on DEV ECS after your confirmation if needed.
```

### Appendix C2 — Christian — Phase D production secrets

```
Strata N-Go — Production secrets (Phase D) — your tasks only

In AWS Secrets Manager (ap-southeast-2), create strata_ngo/production/app with:
- Jwt__Key — random ≥32 UTF-8 bytes (NOT the staging key)
- ConnectionStrings__DefaultConnection — from prod RDS (Claude will send host/db/user)
- SeedAdmin__Password — strong unique password (save in password manager)

Send Claude Code ONLY confirmation "secrets created" — never paste values in chat/email.

Optional: confirm corporate decision on first prod admin email (default admin@StrataNgo.local).
```

### Appendix C3 — Christian — Phase E corporate mobile

```
Strata N-Go — Corporate mobile (Phase E) — your tasks only

1. Apple Developer (Strata org): create App IDs
   - com.strata.ngo.field.dev  (N-Go Dev)
   - com.strata.ngo.field      (N-Go)
2. Google Play: same applicationIds under Strata account
3. Plug in iPhone; tell Claude Code "signing team ready"
4. When Claude opens Xcode: select iPhone → Product → Run for N-Go Dev build
5. Run offline acceptance checklist (same as 6e4018c3 suite) on N-Go Dev

Reply with PASS/FAIL per checklist item.
```

### Appendix C4 — Christian — Phase F go-live

```
Strata N-Go — Production go-live (Phase F) — your tasks only

Precondition: Claude reports prod API + web healthy on api.strata-ngo.com (may use hosts file test before DNS).

1. Cloudflare: point www.strata-ngo.com to PRODUCTION CloudFront (Claude provides distribution domain)
2. Cloudflare: point api.strata-ngo.com to PRODUCTION ALB
3. Smoke: login at https://www.strata-ngo.com with prod admin
4. Reply PASS/FAIL — or "rollback" to revert DNS to previous targets

Agents handle ECS/S3; you only flip DNS when told prod smoke passed on direct URLs.
```

### Appendix C5 — Christian — decision record (Phase 0)

Reply once with:

```
Phase 0 decisions:
- Bundle ID prefix: com.strata.ngo.field (.dev for DEV app) — YES/NO/alternative: ___
- DEV web at staging.strata-ngo.com, www reserved for prod — YES/NO
- Prod iOS path: TestFlight internal first — YES/NO
- First prod users: internal pilot / external — ___
```

---

## Appendix D — Phase kickoff one-liners

| When | Send to | Message |
|------|---------|---------|
| Start Phase A | Cursor Cloud | "Execute Phase A from STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md — single PR cursor/phase-a-prod-hardening-cd21" |
| After A merged | Claude Code | Appendix A master prompt + "Deploy Phase A to DEV only" |
| Start Phase B | Cursor Cloud | "Execute Phase B build lanes + /api/version — PR cursor/phase-b-build-lanes-cd21" |
| Start Phase C | Christian | Appendix C1 DNS prompt |
| Start Phase D | Claude Code | [`MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md`](./MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md) + Christian seed decision + Appendix C2 secrets |
| Phase D secrets | Christian | Appendix C2 |
| Start Phase E | Christian | Appendix C3; Cursor parallel for capacitor flavors |
| Start Phase F | Christian | Appendix C4 after Claude pre-smoke |

---

## Related documents

| Doc | Purpose |
|-----|---------|
| `docs/PRODUCTION_READINESS_AUDIT.md` | Findings register (P0–P3) |
| `docs/DEV_STAGING_PRODUCTION_ROADMAP.md` | High-level roadmap (superseded by this plan for execution) |
| `docs/CLAUDE_CODE_AWS_HANDOFF.md` | Live DEV ARNs, ECS, buckets |
| `docs/MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md` | DEV deploy steps |
| `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md` | iOS install (use `npx cap open ios`) |
| `docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md` | Phase D prod AWS runbook (isolated stack) |
| `docs/TEAM_DEV_ENVIRONMENT_UPDATE.md` | Phase C5 team comms (canonical DEV URLs) |
| `docs/CLOUD_HOSTING_AWS_PLAN.md` | Prod AWS architecture reference |

---

*Plan version 1.0 — 2026-08-31. Agents execute; Christian gates human-only steps.*
