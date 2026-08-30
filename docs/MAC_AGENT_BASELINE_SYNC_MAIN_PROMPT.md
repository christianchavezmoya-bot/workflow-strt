# Mac agent — baseline sync: `main` → AWS staging → iPhone

**Copy everything between PROMPT START and PROMPT END into Claude Code on the Mac.**

**Purpose:** After PR #321 merge and Christian staging **ALL PASS**, redeploy so one commit is the single source of truth everywhere:

```
GitHub main (f2fc7920) = AWS staging API + web = iPhone build source
```

This is the **clean baseline** before implementing **Development → Staging → Production** separation (no more day-to-day dev on the environment testers use).

**Target commit:** `f2fc7920` — `fix: document uploads, header clocks, stale asset purge, label refresh (#321)`

**Christian acceptance already recorded (2026-08-30):** uploads 1–2 PASS, clocks 3–4 PASS, Save PDF 5 PASS.

---

## PROMPT START

You are the **Mac baseline sync agent** for Commtrac / **Strata NGo**.

### Primary goal

Deploy **`main` @ `f2fc7920`** to AWS staging (API + web), verify health and bundle identity, rebuild and install the **iPhone app from the same commit**, run a **brief phone smoke test**, and report a **VERSION STATUS** table proving alignment.

### Hard constraints

1. **Do NOT modify S3 IAM / task role configuration.**  
   - Keep `taskRoleArn`: `arn:aws:iam::920154935299:role/commtrac-staging-ecs-s3`  
   - Keep `executionRoleArn`: `arn:aws:iam::920154935299:role/service-role/ecsTaskExecutionRole`  
   - Uploads are **PASS** — no changes to Storage env vars, IAM policies, or bucket config.

2. **ECS deploy:** Prefer **`force-new-deployment`** with existing task definition **rev :22** after ECR push.  
   - Only register a **new** task definition if the image URI/tag requires it — and then **copy rev :22 verbatim** (including `taskRoleArn`), changing **nothing** except the container image digest/reference if needed.

3. **Do not merge, revert, or touch GitHub `main`** beyond `git pull` — deploy what's already merged.

4. Use AWS profile **`strata-agent`** only. Region **`ap-southeast-2`**.

5. **Docker cleanup first** if disk tight: `docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`.

---

## Step 0 — Git pin

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git checkout main
git pull --no-rebase origin main
git log -1 --oneline
```

| ID | PASS if |
|----|---------|
| G1 | HEAD is **`f2fc7920`** (or newer only if Christian explicitly approved a later main) |
| G2 | Working tree clean (or only untracked `.env.*.local`) |

**Record:** `GIT_SHA=$(git rev-parse HEAD)`

---

## Step 1 — Local gates (before any deploy)

```bash
npm run test -- --run
npm run build
dotnet build server/Commtrac.Api/Commtrac.Api.csproj
```

| ID | PASS if |
|----|---------|
| T1 | 568/568 frontend tests (or current count on main) |
| T2 | `npm run build` exits 0 |
| T3 | `dotnet build` exits 0 |

---

## Step 2 — Preflight staging API

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"
curl -sf "${STAGING_API%/}/health"
```

| ID | PASS if |
|----|---------|
| P0 | `"status":"healthy"`, `"database":"connected"` |

---

## Step 3 — API Docker build + ECR push

```bash
docker build -t commtrac-api:staging .

aws ecr get-login-password --region ap-southeast-2 --profile strata-agent \
  | docker login --username AWS --password-stdin 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com

docker tag commtrac-api:staging 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
```

| ID | PASS if |
|----|---------|
| B1 | `docker build` exit 0 |
| E1 | ECR push exit 0 |

**Record:** image digest from push output → `API_IMAGE_DIGEST=sha256:…`

---

## Step 4 — ECS deploy (**preserve IAM**)

**4a — Confirm current task def has task role (read-only):**

```bash
aws ecs describe-task-definition \
  --task-definition default-commtrac-api-ae2c:22 \
  --profile strata-agent --region ap-southeast-2 \
  --query 'taskDefinition.{revision:revision,taskRoleArn:taskRoleArn,executionRoleArn:executionRoleArn}'
```

| ID | PASS if |
|----|---------|
| I1 | `taskRoleArn` ends with **`commtrac-staging-ecs-s3`** |
| I2 | `executionRoleArn` is **`ecsTaskExecutionRole`** (unchanged) |

**4b — Deploy (image-only, no IAM edits):**

```bash
aws ecs update-service \
  --cluster default \
  --service commtrac-api-ae2c \
  --task-definition default-commtrac-api-ae2c:22 \
  --force-new-deployment \
  --profile strata-agent \
  --region ap-southeast-2
```

Wait until `rolloutState: COMPLETED`, running count 1/1, target **Healthy**.

**4c — ALB canary fix if needed (narrow weight only):**

If healthy task lands in wrong target group vs public rule — apply the **weight fix only**; do **not** change host-header conditions (see `docs/CLAUDE_CODE_AWS_HANDOFF.md`).

| ID | PASS if |
|----|---------|
| S1 | Deployment COMPLETED, 1/1 healthy |
| S2 | `/api/health` 200 stable (12/12 curl or equivalent) |
| S3 | CloudWatch: 0 fatal/exception lines in last 300 log lines |
| S4 | CloudWatch: 0 IAM credential / AccessDenied lines after deploy |

**Record:** `ECS_REVISION=22` (or new rev if you had to register — must still have same `taskRoleArn`)

---

## Step 5 — Web build + S3/CloudFront

```bash
npm run build:cloud-web:staging
# Or explicitly:
# VITE_API_BASE=https://api.staging.strata-ngo.com/api npm run build:cloud-web
```

**Record local bundle id before upload:**

```bash
ls dist/assets/index-*.js
# e.g. dist/assets/index-XXXXXXXX.js → WEB_BUNDLE_LOCAL=index-XXXXXXXX.js
```

Upload to **`strata-ngo-web-staging`** (immutable cache on `/assets/*`, no-cache `index.html`). Invalidate CloudFront **`E1YN5XTWDWRHYP`**.

| ID | PASS if |
|----|---------|
| W1 | Build exit 0, `VITE_API_BASE` points at `api.staging.strata-ngo.com` |
| W2 | Live site serves **same** `index-*.js` hash as local build (not old `index-4daJy4H_.js` unless rebuild produced identical hash — record actual) |
| W3 | `https://www.strata-ngo.com` loads login; browser network shows API host `api.staging.strata-ngo.com` |

**Verify live bundle:**

```bash
curl -sf https://www.strata-ngo.com/ | grep -o 'assets/index-[^"]*\.js' | head -1
```

---

## Step 6 — iPhone rebuild (**same commit as Step 0**)

```bash
git rev-parse HEAD   # must still match f2fc7920
npm run build:cloud-native:staging
npx cap sync ios
```

Open **`ios/App/App.xcworkspace`** in Xcode → select Christian's iPhone → Run.

| ID | PASS if |
|----|---------|
| M1 | Build + install on physical device exit 0 |
| M2 | App opens, login works against staging API |
| M3 | `GIT_SHA` baked build matches deployed main |

Full iOS detail: `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md` (Steps 1–4).

---

## Step 7 — Brief phone smoke test (Christian or agent on device)

| # | Check | PASS / FAIL |
|---|--------|-------------|
| PH1 | Login as Installer (or test user) | |
| PH2 | Dashboard loads without long 404 storm in debug panel | |
| PH3 | Debug panel 404 text (if any) shows **"Not found (stale local id — purged from cache)"** not old axios message | |
| PH4 | Open one assigned asset / workflow (smoke) | |
| PH5 | Optional: one small photo or document upload | |

**Do not** run a full regression — this is baseline alignment only.

---

## Step 8 — VERSION STATUS report (mandatory)

Fill in and return to Christian / Cursor:

```
BASELINE SYNC REPORT — Strata NGo staging
Date:
Operator:

GitHub main:     <sha>  (expect f2fc7920)
AWS ECS rev:     <N>    taskRoleArn: commtrac-staging-ecs-s3 YES/NO
API image:       <digest>
Web bundle live: index-________.js  (matches local build YES/NO)
/api/health:     PASS/FAIL
iPhone build:    from sha ________  installed YES/NO

G1-G2 git:       PASS/FAIL
T1-T3 tests:     PASS/FAIL
P0 preflight:    PASS/FAIL
B1/E1 image:     PASS/FAIL
I1-I2 IAM kept:  PASS/FAIL
S1-S4 ECS:       PASS/FAIL
W1-W3 web:       PASS/FAIL
M1-M3 iOS:       PASS/FAIL
PH1-PH5 phone:   PASS/FAIL / SKIPPED

ALIGNMENT: GitHub main = AWS staging = iPhone source  YES/NO

Blockers:
Next recommended step: Implement Dev → Staging → Production separation (see docs/DEV_STAGING_PRODUCTION_ROADMAP.md)
```

## PROMPT END

---

## Christian — what to do

1. Paste **PROMPT START…END** into **Claude Code on the Mac**.
2. Connect iPhone by USB before Step 6.
3. When report returns **ALIGNMENT: YES**, reply **BASELINE PASS** — then we start the Dev/Staging/Prod architecture work.

**You do not need to retest uploads/clocks** unless the Mac report shows a bundle or ECS regression.

---

## Related docs

- Full rebuild flow: `docs/MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md`
- iOS detail: `docs/MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`
- AWS handoff (IAM, ALB): `docs/CLAUDE_CODE_AWS_HANDOFF.md`
- Next architecture: `docs/DEV_STAGING_PRODUCTION_ROADMAP.md`
