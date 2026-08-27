# Mac agent — AWS staging rebuild (API + web) with Docker cleanup

**Copy everything between PROMPT START and PROMPT END into Claude Code on the Mac.**

**When to use:** After merging a PR that needs **new API image** (`docker build`), **new web `dist/`** (S3/CloudFront), or both — e.g. **PR #311** (public link / invite URL fix).

**Prerequisites:** AWS MCP + profile **`strata-agent`**. Handoff: [`CLAUDE_CODE_AWS_HANDOFF.md`](./CLAUDE_CODE_AWS_HANDOFF.md).

**Do not commit:** `.env.staging.local`, secrets, or LAN IPs.

---

## PROMPT START

You are the **Mac AWS staging rebuild agent** for Commtrac / **Strata NGo**.

### Your job

Deploy merged `main` to **AWS staging**: new API image to ECR + ECS, new web build to S3/CloudFront if frontend changed, sync ALB priority‑10 rule after ECS deploy, verify health and public links.

**Execute every command yourself.** Use AWS MCP + `--profile strata-agent`. Fill in the report at the end.

---

## Step 0 — Docker / disk cleanup (**MANDATORY — do this first**)

Christian’s Mac Docker disk/memory is often full. **Run the full cleanup block before any `docker build` or large `npm run build`.**

Follow **`docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`** (entire PROMPT START…END section).

| ID | PASS if |
|----|---------|
| D1 | ≥ **8 GB free** on `/` |
| D2 | Docker build cache pruned |
| D3 | Cleanup completed **before** Step 3 `docker build` |

**If any later build fails with ENOSPC / no space / Docker memory:** stop, re-run Step 0 entirely, then retry that step once.

---

## Step 1 — Sync repo

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git checkout main
git pull --no-rebase origin main
git log -1 --oneline
```

| ID | PASS if |
|----|---------|
| G1 | On `main`, pull succeeded |
| G2 | Expected commits present (Christian/Cursor will name PR — e.g. invite link fix #311) |

---

## Step 2 — Preflight API health

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"
curl -sf "${STAGING_API%/}/health" | head -c 500
echo
```

| ID | PASS if |
|----|---------|
| P0 | JSON contains `"status":"healthy"` and `"database":"connected"` |

If P0 fails, inspect ECS/ALB before deploying (see handoff doc).

---

## Step 3 — Build API Docker image

**Only after Step 0 PASS.**

```bash
docker build -t commtrac-api:staging .
```

| ID | PASS if |
|----|---------|
| B1 | `docker build` exits 0 |

**On failure:** re-run Step 0, `docker rmi commtrac-api:staging 2>/dev/null || true`, retry once.

---

## Step 4 — Push to ECR

```bash
aws ecr get-login-password --region ap-southeast-2 --profile strata-agent \
  | docker login --username AWS --password-stdin 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com

docker tag commtrac-api:staging 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
```

| ID | PASS if |
|----|---------|
| E1 | Push exits 0 |

---

## Step 5 — ECS task definition + deploy

Ensure task env includes (register new revision if missing):

| Env var | Value |
|---------|--------|
| `Email__FrontendBaseUrl` | `https://www.strata-ngo.com` |
| `Cors__AllowedOrigins__0` | `https://www.strata-ngo.com` |
| `ASPNETCORE_ENVIRONMENT` | `Staging` |

Then:

```bash
aws ecs update-service \
  --cluster default \
  --service commtrac-api-ae2c \
  --force-new-deployment \
  --profile strata-agent \
  --region ap-southeast-2
```

Wait until deployment stable and target **Healthy**.

**ALB:** After every ECS deploy, sync **priority‑10** custom-domain rule weights to match rule **44990** (see handoff — `ModifyRule` on scoped ARN only).

| ID | PASS if |
|----|---------|
| S1 | Service stable, task Running |
| S2 | ALB target healthy, `/api/health` 200 |
| S3 | CloudWatch logs — no fatal startup errors |

---

## Step 6 — Web rebuild + S3/CloudFront (if frontend changed)

**If disk was tight, run Step 0 cleanup again before `npm run build`.**

```bash
VITE_API_BASE=https://api.staging.strata-ngo.com/api npm run build:cloud-web
```

Upload `dist/` to bucket **`strata-ngo-web-staging`** with cache headers (immutable `/assets/*`, no-cache `index.html`). Invalidate CloudFront **`E1YN5XTWDWRHYP`** for `/*` or at minimum `/index.html`.

| ID | PASS if |
|----|---------|
| W1 | `npm run build` exits 0 |
| W2 | `https://www.strata-ngo.com` loads login |
| W3 | Browser calls `api.staging.strata-ngo.com` (not localhost) |

---

## Step 7 — Verify public links (PR #311 / invite fix)

| ID | Check | PASS if |
|----|-------|---------|
| L1 | Settings → Notifications → Public frontend URL | Shows `https://www.strata-ngo.com` (or fix + save) |
| L2 | Re-send test user invite | Email link host is **`www.strata-ngo.com`**, not `staging.` |
| L3 | Open invite link | Create-password page loads |
| L4 | Dashboard → workflow → phone upload QR | QR URL starts with `https://www.strata-ngo.com/mobile-upload` |
| L5 | Request customer signature (test) | Email or copy link uses `www.strata-ngo.com/sign/…` |

---

## Step 8 — Optional iPhone rebuild

Only if Christian needs native changes on device:

```bash
# Optional: rm -rf dist before native build if disk low
VITE_API_BASE="$STAGING_API" npm run build:cloud-native:staging
npx cap sync ios
# Xcode → Run on device
```

Full iOS prompt: [`MAC_AGENT_AWS_STAGING_IOS_PROMPT.md`](./MAC_AGENT_AWS_STAGING_IOS_PROMPT.md) — **run Docker cleanup first if you also built API in the same session.**

---

## Report template (fill in and return to Christian)

```
Mac AWS staging rebuild — report
Date:
Git: 
Disk before cleanup:
Disk after cleanup:

D1-D3 cleanup:     PASS / FAIL
G1-G2 git:         PASS / FAIL
P0 API health:     PASS / FAIL
B1 docker build:   PASS / FAIL
E1 ECR push:       PASS / FAIL
S1-S3 ECS:         PASS / FAIL
W1-W3 web:         PASS / FAIL / SKIPPED
L1-L5 links:       PASS / FAIL

Blockers:
Notes:
```

## PROMPT END
