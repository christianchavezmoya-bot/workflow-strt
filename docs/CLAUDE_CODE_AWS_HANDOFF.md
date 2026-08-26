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
| Task role | **None** (do not add unless runtime AWS API access required) |
| ECR | `920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging` |
| RDS | `strata-ngo-staging` (PostgreSQL, private) |
| S3 media | `strata-ngo-media-staging` |
| Secrets | `strata_ngo/staging/app` (refs: `Jwt__Key`, `ConnectionStrings__DefaultConnection`, `SeedAdmin__Password`) |
| CloudWatch | `/aws/ecs/default/commtrac-api-ae2c-219a` |
| ALB | `ecs-express-gateway-alb-02b54f25` |
| Express target groups | **`ecs-gateway-tg-189cba27392c2044c`** and **`ecs-gateway-tg-ad0f64ab1794c600d`** — ECS Express **alternates** which group gets the active task on each deploy |
| Custom-domain listener rule | Priority **10**, host `api.staging.strata-ngo.com` — must forward to **both** TGs (weighted), not a single pinned TG (see **ALB custom-domain routing** below) |
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
- Target group health path `/api/health`, success 200
- AWS MCP + `StrataClaudeAgentRole` + deployment policy
- **Task definition revision 10 deployed** (2026-08-26) — `Database__RunMigrationsOnStartup=false`; ECS deployment SUCCESSFUL

### Pending / broken
- **ALB custom-domain routing (503)** — after rev-10 deploy, active task registered in `ad0f64ab` but priority-10 rule still forwards `api.staging.strata-ngo.com` only to `189cba` (draining). **Fix in console** (Christian) — see **ALB custom-domain routing** below. Do **not** proceed to iOS build until `curl https://api.staging.strata-ngo.com/api/health` passes.
- **Web staging** at `staging.strata-ngo.com` (S3/CloudFront)
- **iPhone build** against `https://api.staging.strata-ngo.com/api`
- **APNs/FCM** push on server

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
8. **Both** Express target groups checked — active TG has a **Healthy** target on :80 (TG name **changes** each deploy)  
9. **`curl -sf https://api.staging.strata-ngo.com/api/health`** → `"status":"healthy"`, `"database":"connected"` (**mandatory** — custom-domain rule can 503 even when ECS is healthy)  
10. CloudWatch startup logs — no fatal errors  

Use **`--profile strata-agent`** for all AWS CLI from Claude Code.

---

## ALB custom-domain routing (ECS Express gotcha)

ECS Express Mode maintains **two** gateway target groups and **swaps** which one receives the running task on each deployment. The auto-managed rule for the `.on.aws` hostname (priority ~44990) uses **weighted forward to both TGs** — Express updates weights during deploy.

The **human-created** rule for `api.staging.strata-ngo.com` (priority **10**) was a **single-TG forward** pinned to `189cba`. That worked until the first deploy moved the task to `ad0f64ab`, leaving `189cba` draining and the custom domain returning **503**.

### Immediate restore (Christian — AWS Console, ~2 min)

1. **EC2** → **Load balancers** → `ecs-express-gateway-alb-02b54f25`
2. **Listeners** → **HTTPS:443** → **View/edit rules**
3. Rule **priority 10** (condition: host `api.staging.strata-ngo.com`)
4. **Edit rule** → Forward action:
   - **Quick fix:** forward 100% to **`ecs-gateway-tg-ad0f64ab1794c600d`** (currently active TG — verify in **Target groups** which has the healthy target before saving)
   - **Durable fix (recommended):** forward **weighted** to **both** `ecs-gateway-tg-189cba27392c2044c` and `ecs-gateway-tg-ad0f64ab1794c600d`, mirroring the `.on.aws` rule — set 100% on whichever TG currently has the healthy task, 0% on the other. Express will flip weights on future deploys **only if both TGs are in the rule**.
5. **Save**
6. Verify: `curl -sf https://api.staging.strata-ngo.com/api/health`

Claude Code **does not** have `elbv2:ModifyRule` — ALB listener edits are **Christian console** (or admin CLI), not agent deploy scope.

### After ALB fix

Re-run Phase 2a verification (custom-domain curl + both TGs). Then proceed to iOS build per `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`.

---

## End-to-end deploy workflow (Claude Code)

1. Read-only repo assessment (first session — see startup prompt)  
2. `git pull origin main`  
3. Code change + `npm run build` / `dotnet build` as needed  
4. `docker build -t commtrac-api:staging .`  
5. ECR login + push `commtrac-api:staging`  
6. Register new task definition revision (if env/config changed) OR force new deployment (image-only)  
7. `ecs update-service --cluster default --service commtrac-api-ae2c --force-new-deployment`  
8. Wait for stable deployment + healthy target  
9. `curl` health endpoint  
10. Tail CloudWatch logs  
11. Report PASS/FAIL block to Christian → Cursor agent  

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

- `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`  
- `docs/STRATA_NGO_AWS_STAGING_STEP2.md`  
- `docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`  
