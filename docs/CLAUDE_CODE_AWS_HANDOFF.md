# Claude Code — AWS staging handoff (Strata NGO)

**Owner:** Christian Chavez · AWS `920154935299` · Sydney `ap-southeast-2`  
**Domain:** `strata-ngo.com` (Cloudflare DNS)  
**Repo:** `workflow-strt` · branch `main`

This doc is the **single source of truth** for Claude Code taking over Mac-side work (AWS CLI, Docker, web/native builds, polish). The **Cursor cloud agent** guides architecture and tells Christian what to ask Claude Code to run.

---

## Current state (last verified ~2026-08-25)

### Done

| Item | Detail |
|------|--------|
| ECR image | `920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging` |
| ECS Express service | `commtrac-api-ae2c` in cluster `default` |
| API health (ECS URL) | `https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api/health` → healthy, Postgres |
| RDS | `strata-ngo-staging.ctk6wce0yhak.ap-southeast-2.rds.amazonaws.com` · DB `commtrac` |
| S3 media | `strata-ngo-media-staging` |
| Secrets | `strata_ngo/staging/app` (Jwt, connection string, SeedAdmin password) |
| IAM task role (S3) | `commtrac-staging-apprunner-s3` |
| ECS execution role | `ecsTaskExecutionRole` (+ secrets policy) |
| RDS inbound | PostgreSQL 5432 from `172.31.0.0/16` |
| ALB listener rule | Host `api.staging.strata-ngo.com` → TG `ecs-gateway-tg-189cba27392c2044c` |
| Task definition secrets | ValueFrom full Secrets Manager ARN + `:Key::` suffix |
| Container port | 80 + env `ASPNETCORE_URLS=http://+:80` |
| Target group health | Path `/api/health`, success 200 (both TGs if possible) |

### Not done / broken

| Item | Blocker |
|------|---------|
| **`api.staging.strata-ngo.com`** | Cloudflare CNAME missing → `DNS_PROBE_FINISHED_NXDOMAIN` |
| **Web staging** | `staging.strata-ngo.com` — no S3/CloudFront deploy yet |
| **iPhone cloud build** | Waiting on stable API URL (ECS URL works interim) |
| **Push (APNs/FCM)** | Not configured on server |

---

## Roles

| Who | Does what |
|-----|-----------|
| **Christian** | AWS console clicks when needed; relays messages between agents; physical iPhone |
| **Cursor cloud agent** | Architecture, step-by-step console guidance, PRs, runbooks, review |
| **Claude Code (Mac)** | `git pull`, Docker/ECR push, `aws cli`, `npm run build`, Xcode/Capacitor, app polish commits |

---

## Claude Code — session startup prompt

Copy into a **new Claude Code session** on the Mac (repo root, AWS CLI configured, Docker running):

```
You are the Mac deployment agent for Commtrac / Strata NGo (workflow-strt).

Read first:
- docs/CLAUDE_CODE_AWS_HANDOFF.md
- docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md
- .env.staging.strata-ngo.example

AWS: account 920154935299, region ap-southeast-2.
API (working now): https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api
API (target):       https://api.staging.strata-ngo.com/api

Rules:
- git pull origin main before work; feature branches cursor/*-cd21; never commit .env.*.local
- Do not change AWS infrastructure without explicit task from Christian/Cursor agent
- Report PASS/FAIL with command output for every step
- App polish: minimal diffs, match repo conventions (see CLAUDE.md)

Immediate queue (ask Christian which to run first):
1. Verify curl API health on both URLs
2. After Christian adds Cloudflare CNAME api.staging → ALB, verify custom domain health
3. iOS: VITE_API_BASE → build:cloud-native:staging → cap sync → Xcode install
4. Web: build:cloud-web:staging → S3 sync to strata-ngo-web-staging (when bucket ready)
5. Polish: field-test bugs Christian reports (web + native)
```

---

## Priority task list for Claude Code

### P0 — DNS verification (after Christian adds Cloudflare record)

Christian must add in Cloudflare → `strata-ngo.com` → DNS:

- **Type:** CNAME  
- **Name:** `api.staging`  
- **Target:** `ecs-express-gateway-alb-02b54f25-XXXXXXXX.ap-southeast-2.elb.amazonaws.com`  
- **Proxy:** DNS only (grey) first  

Claude Code runs:

```bash
curl -sf https://api.staging.strata-ngo.com/api/health
dig +short api.staging.strata-ngo.com
```

### P1 — iOS staging install

See **`docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`** (full checklist).

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"   # or ECS URL if DNS not ready
cp .env.staging.strata-ngo.example .env.staging.local
VITE_API_BASE="$STAGING_API" npm run build:cloud-native:staging
npx cap sync ios && open ios/App/App.xcworkspace
```

Login: `admin@StrataNgo.local` / password from Secrets Manager.

### P2 — Web staging (local preview first)

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"
VITE_API_BASE="$STAGING_API" npm run build:cloud-web:staging
npm run preview -- --host 0.0.0.0 --port 5174
# Mac browser: http://localhost:5174
```

### P3 — Web deploy to AWS (when Cursor agent confirms bucket + CloudFront plan)

```bash
VITE_API_BASE="https://api.staging.strata-ngo.com/api" npm run build:cloud-web:staging
aws s3 sync dist/ s3://strata-ngo-web-staging/ --delete --region ap-southeast-2
```

CloudFront + `staging.strata-ngo.com` DNS = console or scripted later.

### P4 — API image updates (routine deploy)

```bash
git pull origin main
docker build -t commtrac-api:staging .
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com
docker tag commtrac-api:staging 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
# ECS → commtrac-api-ae2c → Update service → Force new deployment
```

---

## What Claude Code must NOT do without asking

- Delete RDS, secrets, or ECS service  
- Change security groups except as documented  
- Commit secrets, LAN IPs, or `.env.staging.local`  
- Switch production DNS  
- Enable Cloudflare orange proxy until HTTPS on origin is confirmed  

---

## Key URLs & names (copy-paste)

```
API ECS:     https://co-7c80ff093f614e849c3eb733fb76c42c.ecs.ap-southeast-2.on.aws/api
API custom:  https://api.staging.strata-ngo.com/api
Web target:  https://staging.strata-ngo.com
ECR:         920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
ECS service: commtrac-api-ae2c
Task family: default-commtrac-api-ae2c
Secret:      strata_ngo/staging/app
RDS:         strata-ngo-staging.ctk6wce0yhak.ap-southeast-2.rds.amazonaws.com
Media S3:    strata-ngo-media-staging
Web S3:      strata-ngo-web-staging
ALB:         ecs-express-gateway-alb-02b54f25
Healthy TG:  ecs-gateway-tg-189cba27392c2044c
```

---

## How Christian relays work between agents

1. **Cursor agent** → gives numbered steps or a Claude Code prompt block  
2. **Christian** → pastes into Claude Code on Mac  
3. **Claude Code** → runs commands, returns report (PASS/FAIL + logs)  
4. **Christian** → pastes report back to Cursor agent  
5. **Cursor agent** → next steps or PR for app polish  

For **app polish** (UI/bugs): describe the bug + screenshot → Claude Code fixes on branch → PR → Cursor agent reviews if needed.

---

## Related docs

- `docs/STRATA_NGO_AWS_STAGING_STEP2.md` — infrastructure checklist  
- `docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md` — full cloud runbook  
- `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md` — iPhone install  
- `CLAUDE.md` — repo dev commands  
