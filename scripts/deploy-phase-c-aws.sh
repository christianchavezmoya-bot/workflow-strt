#!/usr/bin/env bash
# Phase C — DEV DNS deploy (staging.strata-ngo.com canonical web host).
# Requires: AWS CLI profile strata-agent, Docker, npm, git on Mac agent.
#
# Usage:
#   ./scripts/deploy-phase-c-aws.sh
#   SKIP_CLOUDFRONT=1 ./scripts/deploy-phase-c-aws.sh   # API + web only
#   SKIP_API=1 ./scripts/deploy-phase-c-aws.sh          # CloudFront + web only
#
# See docs/MAC_AGENT_PHASE_C_DEV_DNS_PROMPT.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="${AWS_PROFILE:-strata-agent}"
REGION="${AWS_REGION:-ap-southeast-2}"
CF_REGION="us-east-1"
CF_DIST_ID="E1YN5XTWDWRHYP"
CF_DOMAIN="d1cd0cll7o925f.cloudfront.net"
ECR="920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api"
ECR_REPO="920154935299.dkr.ecr.ap-southeast-2.amazonaws.com"
TASK_FAMILY="default-commtrac-api-ae2c"
ECS_CLUSTER="default"
ECS_SERVICE="commtrac-api-ae2c"
S3_BUCKET="strata-ngo-web-staging"
STAGING_WEB="https://staging.strata-ngo.com"
WWW_WEB="https://www.strata-ngo.com"
STAGING_API="https://api.staging.strata-ngo.com/api"
EXPECTED_SHA="${EXPECTED_SHA:-96e4e7972ad8836f879c005779fb7f77582c483b}"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }
info() { echo "[phase-c] $*"; }

info "AWS profile=$PROFILE region=$REGION"

aws sts get-caller-identity --profile "$PROFILE" >/dev/null \
  || fail "strata-agent profile not configured — see docs/CLAUDE_CODE_AWS_HANDOFF.md"

git checkout main
git pull origin main
MAIN_SHA="$(git rev-parse HEAD)"
info "MAIN_SHA=$MAIN_SHA"
if [[ "$MAIN_SHA" != "$EXPECTED_SHA" && "${ALLOW_SHA_MISMATCH:-}" != "1" ]]; then
  echo "WARN: HEAD ($MAIN_SHA) != expected ($EXPECTED_SHA). Set ALLOW_SHA_MISMATCH=1 to continue."
fi

# ── Step 1: CloudFront alternate domain + ACM ────────────────────────────────
if [[ "${SKIP_CLOUDFRONT:-}" != "1" ]]; then
  info "Step 1 — CloudFront alternate domain + ACM (us-east-1)"

  CERT_ARN="$(aws acm list-certificates --region "$CF_REGION" --profile "$PROFILE" \
    --query "CertificateSummaryList[?contains(DomainName, 'strata-ngo.com')].CertificateArn | [0]" \
    --output text 2>/dev/null || true)"

  if [[ -z "$CERT_ARN" || "$CERT_ARN" == "None" ]]; then
    info "No ACM cert found — request one in us-east-1 covering staging.strata-ngo.com + www.strata-ngo.com"
    fail "ACM certificate required in us-east-1 for CloudFront"
  fi
  info "ACM cert: $CERT_ARN"

  TMP_CF="$(mktemp)"
  ETAG="$(aws cloudfront get-distribution-config --id "$CF_DIST_ID" --profile "$PROFILE" \
    --query ETag --output text > "$TMP_CF.etag" && cat "$TMP_CF.etag")"
  aws cloudfront get-distribution-config --id "$CF_DIST_ID" --profile "$PROFILE" \
    --query DistributionConfig > "$TMP_CF.json"

  python3 - "$TMP_CF.json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
aliases = cfg.setdefault("Aliases", {"Quantity": 0, "Items": []})
items = set(aliases.get("Items") or [])
items.add("staging.strata-ngo.com")
items.add("www.strata-ngo.com")
aliases["Items"] = sorted(items)
aliases["Quantity"] = len(aliases["Items"])
cfg["ViewerCertificate"] = {
    "ACMCertificateArn": None,  # filled below
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "Certificate": None,
    "CertificateSource": "acm",
}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY

  python3 - "$TMP_CF.json" "$CERT_ARN" <<'PY'
import json, sys
path, arn = sys.argv[1], sys.argv[2]
with open(path) as f:
    cfg = json.load(f)
cfg["ViewerCertificate"]["ACMCertificateArn"] = arn
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY

  aws cloudfront update-distribution --id "$CF_DIST_ID" --profile "$PROFILE" \
    --if-match "$ETAG" --distribution-config "file://$TMP_CF.json" >/dev/null

  info "Waiting for CloudFront deployment (may take 5–15 min)…"
  aws cloudfront wait distribution-deployed --id "$CF_DIST_ID" --profile "$PROFILE"

  STAGING_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$STAGING_WEB/" || echo 000)"
  WWW_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$WWW_WEB/" || echo 000)"
  info "staging HTTP $STAGING_CODE · www HTTP $WWW_CODE"
  [[ "$STAGING_CODE" == "200" ]] && pass "staging.strata-ngo.com HTTPS 200" \
    || fail "staging.strata-ngo.com HTTP $STAGING_CODE (expected 200 after CF deploy)"
  [[ "$WWW_CODE" == "200" ]] && pass "www.strata-ngo.com HTTPS 200" \
    || fail "www.strata-ngo.com HTTP $WWW_CODE"
else
  info "Step 1 skipped (SKIP_CLOUDFRONT=1)"
fi

# ── Step 2: Docker build + ECR push ──────────────────────────────────────────
IMAGE_DIGEST=""
if [[ "${SKIP_API:-}" != "1" ]]; then
  info "Step 2 — Docker build + ECR push"
  if [[ -f docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md ]]; then
    info "Run Docker cleanup first if disk is low — see MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md"
  fi

  export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker build \
    --build-arg GIT_SHA="$MAIN_SHA" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    -t commtrac-api:staging .
  pass "docker build"

  aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
    | docker login --username AWS --password-stdin "$ECR_REPO"
  docker tag commtrac-api:staging "$ECR:staging"
  docker push "$ECR:staging"
  pass "ECR push"

  IMAGE_DIGEST="$(aws ecr describe-images --repository-name commtrac-api --region "$REGION" \
    --profile "$PROFILE" --image-ids imageTag=staging \
    --query 'imageDetails[0].imageDigest' --output text)"
  info "IMAGE_DIGEST=$IMAGE_DIGEST"

  # ── Step 3: ECS task def (digest-pinned + Phase C env) ─────────────────────
  info "Step 3 — ECS task definition + deploy"
  TMP_TD="$(mktemp)"
  aws ecs describe-task-definition --task-definition "$TASK_FAMILY" \
    --profile "$PROFILE" --region "$REGION" \
    --query taskDefinition > "$TMP_TD.json"

  python3 - "$TMP_TD.json" "$ECR" "$IMAGE_DIGEST" <<'PY'
import json, sys
path, ecr, digest = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    td = json.load(f)
for key in ("taskDefinitionArn", "revision", "status", "requiresAttributes",
            "compatibilities", "registeredAt", "registeredBy"):
    td.pop(key, None)
container = td["containerDefinitions"][0]
container["image"] = f"{ecr}@{digest}"
env = {e["name"]: e for e in container.get("environment", [])}
updates = {
    "Email__FrontendBaseUrl": "https://staging.strata-ngo.com",
    "Cors__AllowedOrigins__0": "https://staging.strata-ngo.com",
    "Cors__AllowedOrigins__1": "https://www.strata-ngo.com",
    "ASPNETCORE_ENVIRONMENT": "Staging",
}
for k, v in updates.items():
    env[k] = {"name": k, "value": v}
container["environment"] = list(env.values())
with open(path, "w") as f:
    json.dump(td, f, indent=2)
PY

  NEW_REV="$(aws ecs register-task-definition --cli-input-json "file://$TMP_TD.json" \
    --profile "$PROFILE" --region "$REGION" \
    --query 'taskDefinition.revision' --output text)"
  info "Registered $TASK_FAMILY:$NEW_REV"

  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
    --task-definition "$TASK_FAMILY:$NEW_REV" --force-new-deployment \
    --profile "$PROFILE" --region "$REGION" >/dev/null

  info "Waiting for ECS service stable…"
  aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --profile "$PROFILE" --region "$REGION"

  curl -sf "$STAGING_API/health" | grep -qi healthy && pass "/api/health" \
    || fail "/api/health"
  VERSION_JSON="$(curl -sf "$STAGING_API/version")"
  echo "$VERSION_JSON"
  echo "$VERSION_JSON" | grep -q "$MAIN_SHA" && pass "/api/version gitSha=$MAIN_SHA" \
    || fail "/api/version gitSha mismatch (want $MAIN_SHA)"
else
  info "Steps 2–3 skipped (SKIP_API=1)"
  NEW_REV="$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --profile "$PROFILE" --region "$REGION" \
    --query 'services[0].taskDefinition' --output text | awk -F: '{print $NF}')"
fi

# ── Step 4: DEV web deploy ───────────────────────────────────────────────────
info "Step 4 — DEV web build + S3 + CloudFront invalidation"
npm run build:dev-web
npm run check:artifact-isolation -- --profile dev --dist dist
MANIFEST_SHA="$(python3 -c "import json; print(json.load(open('dist/build-manifest.json'))['buildSha'])")"
[[ "$MANIFEST_SHA" == "$MAIN_SHA" ]] && pass "build-manifest buildSha=$MAIN_SHA" \
  || fail "build-manifest buildSha=$MANIFEST_SHA (want $MAIN_SHA)"

aws s3 sync dist/ "s3://$S3_BUCKET/" --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" --exclude "build-manifest.json" \
  --profile "$PROFILE" --region "$REGION"
aws s3 cp dist/index.html "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --profile "$PROFILE" --region "$REGION"
aws s3 cp dist/build-manifest.json "s3://$S3_BUCKET/build-manifest.json" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --profile "$PROFILE" --region "$REGION"
pass "S3 sync"

INVALIDATION_ID="$(aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" \
  --paths "/*" --profile "$PROFILE" --query 'Invalidation.Id' --output text)"
info "CloudFront invalidation $INVALIDATION_ID"
aws cloudfront wait invalidation-completed --distribution-id "$CF_DIST_ID" \
  --id "$INVALIDATION_ID" --profile "$PROFILE"
pass "CloudFront invalidation complete"

STAGING_BUNDLE="$(curl -sS "$STAGING_WEB/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
WWW_BUNDLE="$(curl -sS "$WWW_WEB/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
STAGING_MANIFEST="$(curl -sS "$STAGING_WEB/build-manifest.json")"
WWW_MANIFEST="$(curl -sS "$WWW_WEB/build-manifest.json")"
info "staging bundle: $STAGING_BUNDLE"
info "www bundle:     $WWW_BUNDLE"
echo "$STAGING_MANIFEST"
echo "$WWW_MANIFEST"
[[ -n "$STAGING_BUNDLE" && "$STAGING_BUNDLE" == "$WWW_BUNDLE" ]] && pass "both hosts same bundle" \
  || fail "bundle mismatch staging=$STAGING_BUNDLE www=$WWW_BUNDLE"
echo "$STAGING_MANIFEST" | grep -q "$MAIN_SHA" && pass "staging manifest buildSha" \
  || fail "staging manifest buildSha"
echo "$WWW_MANIFEST" | grep -q "$MAIN_SHA" && pass "www manifest buildSha" \
  || fail "www manifest buildSha"

# ── Step 5: L1–L5 (API-assisted where possible) ────────────────────────────
info "Step 5 — L1–L5 link checks (requires ADMIN_PASS from Secrets Manager if set)"
if [[ -n "${ADMIN_PASS:-}" ]]; then
  LOGIN="$(curl -sf -X POST "$STAGING_API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL:-admin@StrataNgo.local}\",\"password\":\"$ADMIN_PASS\"}")"
  TOKEN="$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')")"
  NOTIF="$(curl -sf -H "Authorization: Bearer $TOKEN" "$STAGING_API/settings/notifications")"
  echo "$NOTIF" | grep -qi 'staging.strata-ngo.com' && pass "L1 Public frontend URL = staging" \
    || echo "WARN L1: check Settings → Notifications manually"
else
  info "Set ADMIN_PASS to auto-check L1; L2–L5 require browser/email (Christian)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Phase C deploy report"
echo "═══════════════════════════════════════════════════════════════"
echo "MAIN_SHA:        $MAIN_SHA"
echo "ECS revision:    $TASK_FAMILY:$NEW_REV"
echo "IMAGE_DIGEST:    ${IMAGE_DIGEST:-skipped}"
echo "CloudFront:      $CF_DIST_ID ($CF_DOMAIN)"
echo "staging bundle:  $STAGING_BUNDLE"
echo "www bundle:      $WWW_BUNDLE"
echo "Phase C:         PASS (automated checks)"
echo "L2–L5:           Manual — invite email, QR, signature link on $STAGING_WEB"
