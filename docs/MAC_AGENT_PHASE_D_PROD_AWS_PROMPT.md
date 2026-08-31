# Phase D — Production AWS (isolated stack, no traffic)

**Goal:** Stand up a **completely isolated** Production AWS stack — new RDS, S3, ECS, Secrets Manager, CloudFront, ALB — with a **clean database** and **approved seed data only**. **Zero user traffic** until Phase F.

**Prerequisites:** Phase C **CLOSED / PASS** · main at **`96e4e797…`** or newer · Christian **Phase D seed decision** recorded below · **Do not start Phase F** in this phase.

**Region:** `ap-southeast-2` · AWS profile: **`strata-agent`** · Account: `920154935299`

**References:**
- `docs/STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md` (D1–D11)
- `docs/CLOUD_HOSTING_AWS_PLAN.md` · `docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`
- `docs/CLAUDE_CODE_AWS_HANDOFF.md` (DEV live state — **do not modify DEV resources**)
- `server/Commtrac.Api/appsettings.Production.StrataNgo.json` (prod config template)

---

## Hard rules (Phase D)

| Rule | Detail |
|------|--------|
| **Isolation** | New ECS service — **not** `commtrac-api-ae2c`. New RDS — **not** `strata-ngo-staging`. New buckets — **not** `strata-ngo-*-staging`. |
| **No DEV mutation** | Do not redeploy, retag, or reconfigure DEV ECS/S3/RDS unless fixing a DEV defect unrelated to Phase D. |
| **No DNS cutover** | Do **not** point `www.strata-ngo.com` or `api.strata-ngo.com` at prod yet. Phase F only. |
| **No DEV data copy** | Do **not** snapshot/restore DEV RDS into prod. Prod gets migrations + approved seed only. |
| **Secrets** | Christian creates prod secrets in Secrets Manager. Mac agent never reads or logs secret values. |
| **Migrations** | `Database:RunMigrationsOnStartup=false` on prod ECS. Run `scripts/cloud-migrate.sh` **before** first prod API boot. |
| **Seed** | Christian-approved profile only (see [Seed decision](#seed-decision-christian-decide-before-d9)). |

---

## Target architecture (Production)

```
Cloudflare (DNS — Phase F only for public cutover)
    │
    ├─► www.strata-ngo.com ──► CloudFront (NEW) ──► S3 strata-ngo-web-prod
    │
    └─► api.strata-ngo.com ──► ALB (NEW) ──► ECS commtrac-api-prod (NEW Fargate)
                                        │
                                        ├─► RDS strata-ngo-prod (NEW PostgreSQL)
                                        ├─► S3 strata-ngo-media-prod
                                        └─► Secrets Manager strata_ngo/production/app
```

**Phase D delivers:** all resources healthy on **direct AWS hostnames** (ALB DNS, CloudFront domain). Christian may use `/etc/hosts` or Cloudflare grey-cloud test records for pre-cutover smoke — **not** production DNS flip.

---

## Resource naming (proposed — confirm no collisions via AWS MCP first)

| Component | Proposed name | DEV counterpart (do not touch) |
|-----------|---------------|--------------------------------|
| RDS | `strata-ngo-prod` | `strata-ngo-staging` |
| ECS service | `commtrac-api-prod` | `commtrac-api-ae2c` |
| Task family | `default-commtrac-api-prod` | `default-commtrac-api-ae2c` |
| ECR tag | `commtrac-api:prod` | `commtrac-api:staging` |
| Media S3 | `strata-ngo-media-prod` | `strata-ngo-media-staging` |
| Web S3 | `strata-ngo-web-prod` | `strata-ngo-web-staging` |
| CloudFront | **new distribution** | `E1YN5XTWDWRHYP` (DEV) |
| Secrets | `strata_ngo/production/app` | `strata_ngo/staging/app` |
| IAM task role | `commtrac-prod-ecs-s3` (new) | `commtrac-staging-ecs-s3` |
| CloudWatch log group | `/aws/ecs/default/commtrac-api-prod-*` | existing staging log group |

---

## Seed decision (Christian — DECIDE before D9)

Prod first boot must **not** inherit DEV field data. Choose **one**:

| Option | ECS env | First-boot result | Recommended for |
|--------|---------|-------------------|-----------------|
| **A — Minimal (recommended)** | `SeedProfile=Minimal` | Admin + installer, Newcastle office, divisions only — **no projects/workflows** | Internal pilot, clean slate |
| **B — Admin only** | *(no SeedProfile)* | Admin user + empty divisions catalog | Strictest empty prod |
| **C — StrataNgo full** | `SeedProfile=StrataNgo` | Same rich seed as DEV Docker staging | **Not recommended** unless explicitly approved |

**Default if Christian does not specify:** **Option A (Minimal)**.

Record decision:
```
Phase D seed decision: Minimal / Admin-only / StrataNgo — YES
Prod admin email: admin@StrataNgo.local (default)
```

---

## Task checklist (D1–D11)

| ID | Task | Owner | Gate |
|----|------|-------|------|
| D0 | Christian seed decision + secrets prep prompt sent | Christian | Decision recorded |
| D1 | RDS PostgreSQL `strata-ngo-prod` (private subnet, SG from VPC) | Mac agent | Instance available |
| D2 | S3 `strata-ngo-media-prod` + `strata-ngo-web-prod` (block public access) | Mac agent | Buckets created |
| D3 | Build + push `commtrac-api:prod` from main (`GIT_SHA`, digest-pinned) | Mac agent | ECR digest recorded |
| D4 | ECS service **`commtrac-api-prod`** (new; not ae2c) | Mac agent | Service created |
| D5 | Secrets Manager `strata_ngo/production/app` | **Christian** | "secrets created" confirmation |
| D6 | IAM task role `commtrac-prod-ecs-s3` (S3 read/write on media bucket) | Christian console + Mac registers task def | Role attached |
| D7 | CloudFront + ACM (us-east-1) for **`www.strata-ngo.com`** → web bucket | Mac agent | Distribution Deployed |
| D8 | ALB + target group + **`api.strata-ngo.com`** cert (ap-southeast-2 ACM) | Mac agent | TG healthy |
| D9 | `scripts/cloud-migrate.sh` against prod RDS **before** ECS scale-up | Mac agent | Migrations applied |
| D10 | Prod ECS env (see [Prod ECS env vars](#prod-ecs-env-vars)) | Mac agent | Task def registered |
| D11 | Health checks on **direct URLs** (not public DNS yet) | Mac agent | `/api/health` + `/api/version` PASS |

---

## Prod ECS env vars

Copy DEV task def pattern but **Production** profile:

| Variable | Value |
|----------|--------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ASPNETCORE_URLS` | `http://+:80` |
| `Database__Provider` | `Postgres` |
| `Database__RunMigrationsOnStartup` | `false` |
| `Storage__Provider` | `S3` |
| `Storage__Bucket` | `strata-ngo-media-prod` |
| `Storage__Region` | `ap-southeast-2` |
| `Storage__KeyPrefix` | `commtrac-prod` |
| `Email__FrontendBaseUrl` | `https://www.strata-ngo.com` |
| `Cors__AllowedOrigins__0` | `https://www.strata-ngo.com` |
| `Cors__AllowDeviceOrigins` | `false` |
| `SeedProfile` | `Minimal` *(or per Christian decision)* |
| `SeedAdmin__Email` | `admin@StrataNgo.local` |
| Secrets (ValueFrom) | `Jwt__Key`, `ConnectionStrings__DefaultConnection`, `SeedAdmin__Password` |

**Do not set** DEV URLs, `AllowDeviceOrigins=true`, or staging CORS origins on prod.

---

## Mac agent — paste into Claude Code

```
PHASE D — Production AWS stack (isolated, NO traffic, NO DNS cutover)

Read first:
- docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md
- docs/STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md (Phase D)
- docs/CLAUDE_CODE_AWS_HANDOFF.md
- server/Commtrac.Api/appsettings.Production.StrataNgo.json

AWS profile: strata-agent · region ap-southeast-2
Do NOT modify DEV (commtrac-api-ae2c, strata-ngo-staging RDS, staging buckets, E1YN5XTWDWRHYP).
Do NOT point www or api.strata-ngo.com DNS at prod (Phase F).
Do NOT copy DEV database into prod.

STOP until Christian confirms:
1. Phase D seed decision (default: SeedProfile=Minimal)
2. Secrets Manager strata_ngo/production/app created ("secrets created" — no values in chat)

═══════════════════════════════════════════════════════════════
STEP 0 — Sync + inventory (read-only)
═══════════════════════════════════════════════════════════════
git checkout main && git pull origin main
export MAIN_SHA="$(git rev-parse HEAD)"
aws sts get-caller-identity --profile strata-agent

Via AWS MCP / CLI — confirm DEV untouched; list whether proposed prod names exist:
  strata-ngo-prod (RDS), commtrac-api-prod (ECS), strata-ngo-media-prod, strata-ngo-web-prod

═══════════════════════════════════════════════════════════════
STEP 1 — RDS (D1)
═══════════════════════════════════════════════════════════════
Create PostgreSQL RDS strata-ngo-prod:
- Same engine major as staging (PostgreSQL 16 if staging uses 16)
- Private, same VPC as staging ECS pattern
- db.t4g.micro or staging-equivalent for pilot
- Backup retention ≥7 days
- Master password → Christian stores in Secrets Manager only

Record: endpoint, port, database name, master user (for connection string assembly in secret).

═══════════════════════════════════════════════════════════════
STEP 2 — S3 buckets (D2)
═══════════════════════════════════════════════════════════════
Create strata-ngo-media-prod and strata-ngo-web-prod:
- Block all public access
- SSE-S3 or SSE-KMS (match staging)
- Web bucket: static website / CloudFront OAC origin pattern (match DEV)

═══════════════════════════════════════════════════════════════
STEP 3 — Christian secrets (D5) — BLOCKING
═══════════════════════════════════════════════════════════════
Christian creates strata_ngo/production/app:
- Jwt__Key — random ≥32 UTF-8 bytes (NOT staging key)
- ConnectionStrings__DefaultConnection — prod RDS connection string
- SeedAdmin__Password — strong unique password

Reply "secrets created" only.

═══════════════════════════════════════════════════════════════
STEP 4 — IAM task role (D6)
═══════════════════════════════════════════════════════════════
Christian console: commtrac-prod-ecs-s3 (mirror staging S3 policy for media-prod bucket).
Mac: register ECS task def with taskRoleArn.

═══════════════════════════════════════════════════════════════
STEP 5 — Migrations (D9) — BEFORE API boot
═══════════════════════════════════════════════════════════════
export Database__Provider=Postgres
export ConnectionStrings__DefaultConnection="<from secret ARN or Christian-provided host/db/user — NOT password in shell history>"
./scripts/cloud-migrate.sh

Verify: schema applied, __EFMigrationsHistory populated.

═══════════════════════════════════════════════════════════════
STEP 6 — API image + ECS (D3, D4, D10)
═══════════════════════════════════════════════════════════════
Docker cleanup first (MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md).

docker build --build-arg GIT_SHA="$MAIN_SHA" --build-arg BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" -t commtrac-api:prod .
ECR push → commtrac-api:prod
Register NEW task family default-commtrac-api-prod with digest-pinned image + prod env vars above.
Create ECS service commtrac-api-prod (Fargate, port 80, /api/health).

Wait stable + ALB target healthy.

Verify via ALB DNS (direct, not api.strata-ngo.com until DNS test):
  curl -sf https://<prod-alb-or-test-host>/api/health
  curl -sf https://<prod-alb-or-test-host>/api/version
  environment=Production, gitSha=MAIN_SHA, database=connected

First boot: confirm seed profile result (Minimal → admin+installer only, no demo projects).

═══════════════════════════════════════════════════════════════
STEP 7 — CloudFront web (D7)
═══════════════════════════════════════════════════════════════
NEW CloudFront distribution:
- Origin: strata-ngo-web-prod (OAC)
- Alternate domain: www.strata-ngo.com ONLY (not staging)
- ACM cert us-east-1 covering www.strata-ngo.com
- SPA error pages → index.html

Do NOT attach staging.strata-ngo.com to prod distribution.

npm run build:prod-web
npm run check:artifact-isolation -- --profile prod --dist dist
aws s3 sync dist/ s3://strata-ngo-web-prod/ --delete --profile strata-agent
(create-invalidation after test upload)

Verify via CloudFront domain (direct):
  curl -sS https://<prod-cf-domain>/build-manifest.json
  profile=prod, apiBase=https://api.strata-ngo.com/api

═══════════════════════════════════════════════════════════════
STEP 8 — ALB + api.strata-ngo.com cert (D8)
═══════════════════════════════════════════════════════════════
ALB listener + ACM (ap-southeast-2) for api.strata-ngo.com.
Target group → commtrac-api-prod, health /api/health → 200.

Optional pre-cutover test: Christian grey-cloud or hosts-file api.strata-ngo.com → prod ALB.

═══════════════════════════════════════════════════════════════
STEP 9 — Phase D verification (D11)
═══════════════════════════════════════════════════════════════
| Check | PASS if |
|-------|---------|
| P1 | Prod RDS reachable from ECS task only |
| P2 | Prod API /api/health healthy + Postgres |
| P3 | /api/version environment=Production |
| P4 | Prod web manifest profile=prod, apiBase=api.strata-ngo.com |
| P5 | DEV stack unchanged (staging still 200, ECS ae2c healthy) |
| P6 | No public DNS cutover to prod |
| P7 | Seed matches Christian decision (no DEV projects copied) |
| P8 | Secrets not defaults / not staging values |

Report: all ARNs, ECS rev, image digest, CloudFront ID, ALB DNS, seed profile, P1–P8 PASS/FAIL.

Phase F is separate — do not cut over DNS.
```

---

## Christian — Phase D prompts

### Secrets (required before API boot)

See Appendix C2 in `STRATA_NGO_DEV_PRODUCTION_IMPLEMENTATION_PLAN.md`.

### Seed decision (required before migrations)

```
Phase D seed decision for Production first boot:
- Minimal (recommended): admin + installer, no demo projects — reply "seed Minimal"
- Admin-only: single admin, empty catalog — reply "seed Admin-only"
- StrataNgo full: same as DEV rich seed — reply "seed StrataNgo" (explicit approval only)
```

### IAM role (if Mac agent blocked)

Create `commtrac-prod-ecs-s3` mirroring `commtrac-staging-ecs-s3` but `strata-ngo-media-prod` ARNs.

---

## Phase D gate

| Check | PASS if |
|-------|---------|
| Isolation | All prod resources new; DEV unchanged |
| API | Prod `/api/health` + `/api/version` on direct URL |
| Web | Prod `build:prod-web` artifact in `strata-ngo-web-prod`; manifest `profile=prod` |
| Data | Clean DB; seed matches approved profile; **no DEV RDS copy** |
| DNS | `www` / `api` still on DEV (or unpointed) — prod reachable only via direct AWS URLs |
| Secrets | Christian confirms prod secrets created; not staging defaults |

**Phase D CLOSED** when Mac report P1–P8 PASS + Christian confirms prod stack ready for Phase F pre-smoke.

**Next:** Phase E (mobile identity) can parallelize after D3; Phase F (DNS cutover + go-live) waits on Phase D + E gates.

---

## Rollback (Phase D)

| Layer | Action |
|-------|--------|
| ECS | Delete/stop `commtrac-api-prod` service |
| RDS | Snapshot then delete (if aborting entirely) |
| S3 | Empty and delete buckets if aborting |
| DNS | N/A — no cutover in Phase D |
| DEV | Unaffected |

---

## Related documents

| Doc | Purpose |
|-----|---------|
| `docs/TEAM_DEV_ENVIRONMENT_UPDATE.md` | Phase C5 team comms (sent 2026-08-31) |
| `docs/MAC_AGENT_PHASE_C_DEV_DNS_PROMPT.md` | Phase C closure record |
| `docs/PRODUCTION_READINESS_AUDIT.md` | P0 gates for Phase F |
