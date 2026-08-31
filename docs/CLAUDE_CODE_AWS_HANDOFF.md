# Claude Code — AWS staging handoff (Strata NGO)

**Owner:** Christian Chavez · AWS `920154935299` · Sydney `ap-southeast-2`  
**Domain:** `strata-ngo.com` (Cloudflare DNS)  
**Repo:** `workflow-strt` · branch `main`

**Cursor cloud agent** = architecture, console guidance, PRs, review.  
**Claude Code (Mac)** = repo, builds, AWS MCP inspect/deploy, app polish.  
**Christian** = relay, console when needed, iPhone testing.

See also: `Strata_NGo_Claude_AWS_MCP_Setup_Handover_Record.pdf` (in repo or Mac uploads).

---

## Claude Code AWS MCP (DONE — do not reconfigure)

| Item | Value |
|------|--------|
| MCP server | `aws-mcp` — connected, 9 tools |
| MCP proxy | `uvx mcp-proxy-for-aws@1.6.4` → `https://aws-mcp.us-east-1.api.aws/mcp` |
| MCP metadata | `AWS_REGION=ap-southeast-2` |
| AWS CLI profile | **`strata-agent`** (NOT `Christian_admin`) |
| Assumed role | **`StrataClaudeAgentRole`** |
| MCP timeout | `export MCP_TIMEOUT=100000` in `~/.zshrc` |

**Identity chain:** `Christian_admin` → assume → `StrataClaudeAgentRole` → AWS MCP → Claude Code.

Verify anytime:
```bash
aws sts get-caller-identity --profile strata-agent
# Expect: arn:aws:sts::920154935299:assumed-role/StrataClaudeAgentRole/...
```

**Do NOT** replace `strata-agent` with root or `Christian_admin` for normal agent work.

---

## IAM security model (DONE)

**Role:** `StrataClaudeAgentRole`

**Policies:**
- `StrataClaudeAgentPolicy` (read/inspect)
- `StrataClaudeStagingDeploymentPolicy` (narrow deploy)

**Simulator ALLOWED (staging deploy):**
- `ecs:RegisterTaskDefinition`
- `ecs:UpdateService` (service `commtrac-api-ae2c` only)
- `iam:PassRole` → `ecsTaskExecutionRole` (condition `ecs-tasks.amazonaws.com`)
- `ecr:GetAuthorizationToken`, `ecr:PutImage` → `commtrac-api`

**Simulator DENIED (must stay denied):**
- `ecs:DeleteService`, `rds:ModifyDBInstance`, `rds:DeleteDBInstance`
- `iam:CreateRole`, `secretsmanager:GetSecretValue`
- `ec2:CreateVpc`, `s3:DeleteBucket`

Do **not** broaden Claude permissions unless Cursor agent + Christian explicitly approve.

Claude **cannot read secret values** — diagnose from config names, logs, and `/api/health` only.

---

## Live staging environment

| Component | Value |
|-----------|--------|
| ECS cluster | `default` |
| ECS service | `commtrac-api-ae2c` (Express Mode, Fargate) |
| Task family | `default-commtrac-api-ae2c` |
| Container | `Main` · port **80** · `ASPNETCORE_URLS=http://+:80` |
| CPU / memory | 1024 / 2048 |
| Execution role | `arn:aws:iam::920154935299:role/service-role/ecsTaskExecutionRole` |
| Task role | `arn:aws:iam::920154935299:role/commtrac-staging-ecs-s3` — uploads PASS — **do not change** |
| Current ECS revision | **`default-commtrac-api-ae2c:25`** (Phase C deploy, 2026-08-31) |
| GitHub `main` | **`96e4e797`** (#331 Phase C URL policy) |
| ECR image digest | `sha256:4eede100f8d68cad1627383fcaa118f9706bcfaac9ff86f59a567ba88e9f8445` |
| CloudFront | **`E1YN5XTWDWRHYP`** · aliases: `staging.strata-ngo.com`, `www.strata-ngo.com` |
| ACM (us-east-1) | `e34a2977-d3e5-4979-92cb-d17d1e0e0dd0` (ISSUED; staging + www SANs) |
| DEV web bundle | `assets/index-D0SL7wSz.js` · buildSha `96e4e797…` |
| ECR | `920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging` |
| RDS | `strata-ngo-staging` (PostgreSQL, private) |
| S3 media | `strata-ngo-media-staging` |
| Secrets | `strata_ngo/staging/app` (refs: `Jwt__Key`, `ConnectionStrings__DefaultConnection`, `SeedAdmin__Password`) — **`Jwt__Key` must be ≥32 UTF-8 bytes** (HS256); API now **fails fast at startup** if too short |
| CloudWatch | `/aws/ecs/default/commtrac-api-ae2c-219a` |
| ALB | `ecs-express-gateway-alb-02b54f25` |
| Healthy TG | `ecs-gateway-tg-189cba27392c2044c` |
| Health check | HTTP GET **`/api/health`** port 80 → expect **200** (not 401) |

**API URLs:**
- **Primary (use for phone/web builds):** `https://api.staging.strata-ngo.com/api`
- **ECS Express hostname (cert mismatch on strict TLS):** `https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api` — ALB cert is for `api.staging.strata-ngo.com` only; `curl` without `-k` fails exit 60. Routing is fine; use custom domain for production-like testing.

---

## Infrastructure status

### Done
- ECR image pushed; ECS service running; `/api/health` healthy + Postgres
- **Custom domain live:** `https://api.staging.strata-ngo.com/api/health` → healthy (Cloudflare CNAME → ALB)
- Secrets via Secrets Manager (ValueFrom ARNs in task definition)
- RDS inbound from VPC `172.31.0.0/16`
- ALB listener rule: Host `api.staging.strata-ngo.com` → healthy target group
- Target group health path `/api/health`, success 200
- AWS MCP + `StrataClaudeAgentRole` + deployment policy
- **ECS S3 task role** — `commtrac-staging-ecs-s3` live; uploads PASS (see `ECS_S3_TASK_ROLE_FIX.md`)
- **Phase C CLOSED / PASS (2026-08-31):** canonical DEV web at **`https://staging.strata-ngo.com`**; Christian acceptance L1–L5 all PASS; `www` still serves same DEV app until Phase F
- **CloudFront `E1YN5XTWDWRHYP`:** both `staging.strata-ngo.com` and `www.strata-ngo.com` aliases deployed
- **Phase C ECS env:** `Email__FrontendBaseUrl=https://staging.strata-ngo.com`; CORS allows staging + www
- **API `/api/version`:** `gitSha=96e4e797…` matches main

### Pending
- **Native first-login perf** — rebuild iOS app after relevant merges if dashboard slow on cold start
- **iPhone build** against `https://api.staging.strata-ngo.com/api` (no Phase C native rebuild required)
- **APNs/FCM** push on server
- **Phase C:** CLOSED / PASS — Christian acceptance L1–L5 + C5 team comms (2026-08-31)
- **Phase D:** **NEXT** — isolated prod AWS stack; see `docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md`
- **Phase D/F** — do not start without explicit approval

### Invite / password-reset email links — RESOLVED (Phase C, 2026-08-31)

**Was:** Invite links pointed at `staging.strata-ngo.com` before host was live (Safari could not open).

**Now:** Staging host serves HTTPS 200; ECS rev `:25` + startup DB patch set `NotificationSettings.FrontendBaseUrl` to `https://staging.strata-ngo.com`. L1 verified via GET `/api/settings/notifications`.

**Transition:** `https://www.strata-ngo.com` still serves the same DEV app (same CloudFront origin) until Phase F prod cutover.

**Note:** ECS `runtime-frontend-base` may return a private IP (`http://172.31.x.x:5173`) — harmless; browser origin short-circuits first in `resolvePublicFrontendBaseUrl()`.

### Public link audit (all link types)

Single config source: **`NotificationSettings.FrontendBaseUrl`** (DB) with fallback **`Email:FrontendBaseUrl`** (ECS env / appsettings). PR #311 patches stale `staging.strata-ngo.com` on API startup and in runtime resolution.

| Link type | URL pattern | Built where | Delivery | Fixed by |
|-----------|-------------|-------------|----------|----------|
| User invite email | `/reset-password?token=…&invite=true` | `UsersController` | Email | Server PR #311 |
| Password reset email | `/reset-password?token=…` | `AuthController` | Email | Server PR #311 |
| Customer signature email | `/sign/{tokenId}` | `SignatureTokensController` | Email | Server PR #311 |
| Installer signature email | `/sign/{tokenId}` | `SignatureTokensController` | Email | Server PR #311 |
| Report share email (preview) | `/share/reports/{shareId}` | `AssetReportSharesController` | Email | Server PR #311 |
| Report share email (ZIP) | `api.staging.strata-ngo.com/api/asset-report-shares/…/download` | `AssetReportSharesController` | Email | **OK** — API URL is correct |
| Workflow completion email | `/projects/{id}/installations` | `NotificationService` | Email | Server PR #311 |
| Scheduled project report email | `/projects/{id}` | `ProjectScheduledReportWorker` | Email | Server PR #311 |
| Phone upload QR (workflow photos) | `/mobile-upload?token=…` | `QRUploadButton`, `PhotoUploadDialog` | QR on screen | Frontend `publicFrontendBase.ts` + server settings |
| Phone upload QR (documents/tips) | `/mobile-upload?token=…` | `QRUploadButton` | QR on screen | Frontend `publicFrontendBase.ts` |
| Copy signature link (no email) | `/sign/{tokenId}` | `RequestCustomerSignatureDialog`, `WorkflowRunHistoryDialog` | Copy/paste UI | Frontend `publicFrontendBase.ts` |
| Settings → Notifications field | (stored value) | Admin UI | Config | DB patch + manual save |

**Not affected:** In-app routes, API download URLs, push notification payloads (no web deep links today), SMS (no URLs).

**Frontend QR/copy links** use `resolvePublicFrontendBaseUrl()`: when browsing **`https://staging.strata-ngo.com`** or **`https://www.strata-ngo.com`**, links use that page origin. Deprecated: `api.*` hosts only (never the web app).

---

## Deployment success criteria (mandatory)

An ECS update alone is **not** success. Claude must verify **all**:

1. Image build succeeds  
2. App tests / `npm run build` pass (if code changed)  
3. ECR push succeeds  
4. Task definition revision registered  
5. `ecs:UpdateService` on **`commtrac-api-ae2c`** only  
6. Deployment stabilizes (no rollback)  
7. Task stays **Running**  
8. ALB target **Healthy** (not 401)  
9. `/api/health` → `"status":"healthy"`, `"database":"connected"`  
10. CloudWatch startup logs — no fatal errors  

Use **`--profile strata-agent`** for all AWS CLI from Claude Code.

---

## End-to-end deploy workflow (Claude Code)

**Before any `docker build`:** run Step 0 in [`docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`](./MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md). Christian’s Mac Docker disk is often full — **always clean first**, and **repeat** if build fails with ENOSPC / no space / out of memory.

**Full rebuild prompt (API + web + link checks):** [`docs/MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md`](./MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md)

1. **Docker/disk cleanup** (mandatory — see cleanup doc)  
2. Read-only repo assessment (first session — see startup prompt)  
3. `git pull origin main`  
4. Code change + `npm run build` / `dotnet build` as needed  
5. `docker build -t commtrac-api:staging .` — **only after cleanup PASS**  
6. ECR login + push `commtrac-api:staging`  
7. Register new task definition revision (if env/config changed) OR force new deployment (image-only)  
8. `ecs update-service --cluster default --service commtrac-api-ae2c --force-new-deployment`  
9. Sync ALB priority-10 rule to match rule 44990  
10. Wait for stable deployment + healthy target  
11. `curl` health endpoint  
12. Tail CloudWatch logs  
13. Rebuild/upload web `dist/` if frontend changed  
14. Report PASS/FAIL block to Christian → Cursor agent  

---

## Claude Code — session startup prompt

```
You are the Mac agent for Commtrac / Strata NGo (workflow-strt).

READ FIRST (read-only, no deploy yet):
- docs/CLAUDE_CODE_AWS_HANDOFF.md
- CLAUDE.md
- Dockerfile, .dockerignore, docker-compose.staging.yml if present
- scripts/build-cloud-*.mjs, package.json deploy scripts
- git status, branch, remotes

AWS MCP: use profile strata-agent only (StrataClaudeAgentRole). Never Christian_admin.
Region: ap-southeast-2. Service: commtrac-api-ae2c only.

Phase 1 — Repository assessment (this session):
Report: repo path, branch, dirty files, backend project, Docker build cmd, existing deploy scripts, env examples.
Compare task definition (via MCP) to repo Dockerfile port/env expectations.
Do NOT deploy until Christian/Cursor agent approves.

Phase 2 — when approved:
- **Docker cleanup first** if rebuilding: docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md
- **Full AWS rebuild:** docs/MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md
- Health checks on ECS URL + custom domain (if DNS live)
- iOS: docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md
- API deploy: ECR push + ECS update + full success criteria above
- App polish: minimal diffs on feature branches

Never commit .env.*.local or secrets.
```

---

## Christian console tasks (not Claude)

| Task | Where |
|------|--------|
| ~~Cloudflare CNAME `api.staging` → ALB~~ | **Done** |
| ACM cert validation records | Cloudflare + ACM (done if custom domain works) |
| Broad IAM changes | AWS Console (admin) |
| Secrets Manager value edits | AWS Console |

---

## Relay workflow

1. **Cursor agent** → instructions / prompt for Claude Code  
2. **Christian** → paste into Claude Code  
3. **Claude Code** → MCP inspect + Mac commands → report  
4. **Christian** → paste report to Cursor agent  
5. **Cursor agent** → next steps, PR review, architecture  

---

## Related docs

- **`docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`** — mandatory before any `docker build`  
- **`docs/MAC_AGENT_AWS_STAGING_PHONE_WEB_TEST_PROMPT.md`** — iOS + Android reinstall against AWS (no local Docker)  
- **`docs/MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md`** — API + web rebuild with cleanup + link checks  
- `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`  
- `docs/STRATA_NGO_AWS_STAGING_STEP2.md`  
- `docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`  
