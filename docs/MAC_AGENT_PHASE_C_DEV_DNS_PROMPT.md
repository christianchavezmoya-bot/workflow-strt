# Phase C — DEV DNS clarity (`staging.strata-ngo.com`)

**Goal:** Canonical DEV web at **`https://staging.strata-ngo.com`**. **`www.strata-ngo.com`** keeps serving the same DEV app until Phase F, then flips to production.

**Prerequisites:** Phase B **CLOSED / PASS** · main at **`96e4e797…`** (#331 merged) · Christian **DNS C done**.

**DNS (confirmed 2026-08-31):**
- `staging.strata-ngo.com` → CNAME → **`d1cd0cll7o925f.cloudfront.net`** (Proxy ON)
- `www.strata-ngo.com` unchanged
- Until CloudFront alternate domain is added, staging may return **Cloudflare 530** — expected.

**Order:** CloudFront alias + ACM → Mac API ECS env redeploy → Mac web deploy → verify both hosts → link smoke on staging host.

---

## Christian — DNS ✅ DONE (2026-08-31)

| Record | Value |
|--------|--------|
| Name | `staging.strata-ngo.com` |
| Type | CNAME |
| Target | **`d1cd0cll7o925f.cloudfront.net`** |
| Proxy | ON |
| `www` | **unchanged** |

Mac agent: proceed from **Step 1 (CloudFront alternate domain)** below.

---

## Mac agent — paste into Claude Code

```
PHASE C — DEV DNS deploy (DNS C DONE — execute now)

Main SHA: 96e4e7972ad8836f879c005779fb7f77582c483b
CloudFront distribution: E1YN5XTWDWRHYP
CloudFront domain: d1cd0cll7o925f.cloudfront.net
DNS: staging.strata-ngo.com CNAME → d1cd0cll7o925f.cloudfront.net (Proxy ON) ✅

Current state: https://staging.strata-ngo.com returns Cloudflare 530 until Step 1 completes.
https://www.strata-ngo.com returns 200 (unchanged DEV).

AWS profile: strata-agent · region ap-southeast-2
Do NOT start Phase D/F. Do not move www to production.

═══════════════════════════════════════════════════════════════
STEP 0 — Sync repo
═══════════════════════════════════════════════════════════════
git checkout main && git pull origin main
export MAIN_SHA="$(git rev-parse HEAD)"
echo "MAIN_SHA=$MAIN_SHA"   # must be 96e4e797…

═══════════════════════════════════════════════════════════════
STEP 1 — CloudFront alternate domain + ACM (us-east-1)
═══════════════════════════════════════════════════════════════
Distribution ID: E1YN5XTWDWRHYP

1. ACM (us-east-1): ensure cert covers staging.strata-ngo.com (request/DNS-validate if missing).
2. Update distribution alternate domain names:
   - ADD staging.strata-ngo.com
   - KEEP existing www.strata-ngo.com alias
3. Attach ACM cert to distribution; wait for Deployed.

Verify (530 must become 200):
  curl -sS -o /dev/null -w "staging:%{http_code}\n" https://staging.strata-ngo.com/
  curl -sS -o /dev/null -w "www:%{http_code}\n" https://www.strata-ngo.com/

═══════════════════════════════════════════════════════════════
STEP 2 — Build + push API (Phase C code on main)
═══════════════════════════════════════════════════════════════
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker build \
  --build-arg GIT_SHA="$MAIN_SHA" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t commtrac-api:staging .

aws ecr get-login-password --region ap-southeast-2 --profile strata-agent \
  | docker login --username AWS --password-stdin 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com
docker tag commtrac-api:staging 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging

Record IMAGE_DIGEST from push output.

═══════════════════════════════════════════════════════════════
STEP 3 — ECS task def (digest-pinned + Phase C env)
═══════════════════════════════════════════════════════════════
Fetch current rev (default-commtrac-api-ae2c), copy verbatim except:

  container image → 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api@$IMAGE_DIGEST
  Email__FrontendBaseUrl → https://staging.strata-ngo.com
  Cors__AllowedOrigins__0 → https://staging.strata-ngo.com
  Cors__AllowedOrigins__1 → https://www.strata-ngo.com
  ASPNETCORE_ENVIRONMENT → Staging (unchanged)

Register new revision. update-service with --task-definition …:<NEW_REV> (NOT force-new-deployment alone).
Sync ALB priority-10 weights after deploy (handoff doc).

Verify:
  curl -sf https://api.staging.strata-ngo.com/api/health
  curl -sf https://api.staging.strata-ngo.com/api/version
  gitSha must equal MAIN_SHA (96e4e797…)

═══════════════════════════════════════════════════════════════
STEP 4 — DEV web deploy
═══════════════════════════════════════════════════════════════
npm run build:dev-web
npm run check:artifact-isolation -- --profile dev --dist dist
cat dist/build-manifest.json   # buildSha = MAIN_SHA

aws s3 sync dist/ s3://strata-ngo-web-staging/ --delete --profile strata-agent --region ap-southeast-2
aws cloudfront create-invalidation --distribution-id E1YN5XTWDWRHYP --paths "/*" --profile strata-agent --region ap-southeast-2

Verify BOTH hosts (same bundle hash):
  curl -sS https://staging.strata-ngo.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
  curl -sS https://staging.strata-ngo.com/build-manifest.json
  curl -sS https://www.strata-ngo.com/build-manifest.json

═══════════════════════════════════════════════════════════════
STEP 5 — L1–L5 on https://staging.strata-ngo.com
═══════════════════════════════════════════════════════════════
L1 Public frontend URL = staging.strata-ngo.com
L2 Invite email link host = staging.strata-ngo.com
L3 Invite link loads
L4 QR = https://staging.strata-ngo.com/mobile-upload…
L5 Signature link = staging.strata-ngo.com/sign/…

Report: ECS rev, IMAGE_DIGEST, /api/version JSON, CF/ACM status, live bundles, L1–L5, Phase C PASS/FAIL
```

**One-shot automation (Mac):** `./scripts/deploy-phase-c-aws.sh` — runs Steps 1–4 + partial L1 when `ADMIN_PASS` is set. Cloud agent pre-validated web build at `96e4e797…` (`index-B6Gt7K7t.js`).

---

## Phase C gate

| Check | PASS if |
|-------|---------|
| `staging.strata-ngo.com` resolves + HTTPS 200 | Login loads |
| Invite/QR links | Use **staging** host |
| `www.strata-ngo.com` | Still serves DEV (unchanged origin) |
| API CORS | Both staging + www origins allowed |
| Team comms | Christian notifies team to use staging for DEV testing |

**Phase C CLOSED** when Mac report PASS + Christian confirms staging URL in daily use.

**Phase D** (prod AWS stack) is separate — do not start automatically.
