#!/usr/bin/env bash
# Phase D — Production AWS deploy (isolated stack, NO public DNS cutover).
# Requires: AWS CLI profile strata-agent, Docker, npm, git on Mac agent.
#
# Prerequisites (Christian / Mac MCP — before this script):
#   - RDS strata-ngo-prod (private Postgres)
#   - S3 strata-ngo-media-prod + strata-ngo-web-prod
#   - Secrets Manager strata_ngo/production/app (see docs Appendix C2)
#   - IAM role commtrac-prod-ecs-s3 (S3 media bucket)
#   - ECS service commtrac-api-prod created (Express/Fargate) OR set CREATE_ECS_SERVICE=1 after task def
#   - ALB + prod CloudFront (optional for D11 direct-URL checks)
#
# Usage:
#   export PROD_DB_CONNECTION='Host=...;Database=commtrac;Username=commtrac;Password=...'
#   ./scripts/deploy-phase-d-aws.sh
#   INFRA_CHECK_ONLY=1 ./scripts/deploy-phase-d-aws.sh
#   SKIP_MIGRATE=1 ./scripts/deploy-phase-d-aws.sh   # after migrations already applied
#
# See docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="${AWS_PROFILE:-strata-agent}"
REGION="${AWS_REGION:-ap-southeast-2}"
ACCOUNT="920154935299"
ECR="${ACCOUNT}.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api"
ECR_REPO="${ACCOUNT}.dkr.ecr.ap-southeast-2.amazonaws.com"
SECRET_NAME="strata_ngo/production/app"
TASK_FAMILY="default-commtrac-api-prod"
ECS_CLUSTER="${ECS_CLUSTER:-default}"
ECS_SERVICE="commtrac-api-prod"
MEDIA_BUCKET="strata-ngo-media-prod"
WEB_BUCKET="strata-ngo-web-prod"
RDS_ID="strata-ngo-prod"
TASK_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/commtrac-prod-ecs-s3"
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/service-role/ecsTaskExecutionRole"
PROD_API_HOST="${PROD_API_HOST:-}"   # ALB DNS or test host for curl (no public DNS cutover)
PROD_CF_DOMAIN="${PROD_CF_DOMAIN:-}" # new prod CloudFront domain for web verify

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }
info() { echo "[phase-d] $*"; }
warn() { echo "WARN: $*"; }

info "AWS profile=$PROFILE region=$REGION"

aws sts get-caller-identity --profile "$PROFILE" >/dev/null \
  || fail "strata-agent profile not configured — see docs/CLAUDE_CODE_AWS_HANDOFF.md"

git checkout main
git pull origin main
MAIN_SHA="$(git rev-parse HEAD)"
info "MAIN_SHA=$MAIN_SHA"

# ── Pre-flight: secrets + infra inventory ────────────────────────────────────
info "Checking Secrets Manager secret exists (not reading values)…"
aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
  --profile "$PROFILE" --region "$REGION" >/dev/null \
  || fail "Secret $SECRET_NAME missing — Christian must create per Appendix C2"

for bucket in "$MEDIA_BUCKET" "$WEB_BUCKET"; do
  aws s3api head-bucket --bucket "$bucket" --profile "$PROFILE" 2>/dev/null \
    && pass "S3 bucket $bucket" \
    || fail "S3 bucket $bucket missing — create before deploy"
done

RDS_STATUS="$(aws rds describe-db-instances --db-instance-identifier "$RDS_ID" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo missing)"
[[ "$RDS_STATUS" == "available" ]] && pass "RDS $RDS_ID available" \
  || fail "RDS $RDS_ID status=$RDS_STATUS (want available)"

aws iam get-role --role-name commtrac-prod-ecs-s3 --profile "$PROFILE" >/dev/null 2>&1 \
  && pass "IAM role commtrac-prod-ecs-s3" \
  || fail "IAM role commtrac-prod-ecs-s3 missing — Christian console (see Phase D doc)"

# DEV untouched sanity
DEV_SHA="$(curl -sf https://api.staging.strata-ngo.com/api/version | python3 -c "import sys,json; print(json.load(sys.stdin).get('gitSha',''))" 2>/dev/null || echo unknown)"
info "DEV API still live gitSha=$DEV_SHA (must remain healthy)"

if [[ "${INFRA_CHECK_ONLY:-}" == "1" ]]; then
  info "INFRA_CHECK_ONLY=1 — stopping after inventory"
  exit 0
fi

# ── Step 1: EF migrations (before API boot) ────────────────────────────────
if [[ "${SKIP_MIGRATE:-}" != "1" ]]; then
  info "Step 1 — cloud-migrate.sh against prod RDS"
  [[ -n "${PROD_DB_CONNECTION:-}" ]] \
    || fail "Set PROD_DB_CONNECTION env var (from Secrets Manager — do not paste in chat/logs)"
  export Database__Provider=Postgres
  export ConnectionStrings__DefaultConnection="$PROD_DB_CONNECTION"
  ./scripts/cloud-migrate.sh
  pass "EF migrations applied"
else
  info "Step 1 skipped (SKIP_MIGRATE=1)"
fi

# ── Step 2: Docker build + ECR push (prod tag) ───────────────────────────────
info "Step 2 — Docker build + ECR push commtrac-api:prod"
if [[ -f docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md ]]; then
  info "Run Docker cleanup first if disk is low"
fi
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker build \
  --build-arg GIT_SHA="$MAIN_SHA" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t commtrac-api:prod .
pass "docker build"

aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
  | docker login --username AWS --password-stdin "$ECR_REPO"
docker tag commtrac-api:prod "$ECR:prod"
docker push "$ECR:prod"
pass "ECR push"

IMAGE_DIGEST="$(aws ecr describe-images --repository-name commtrac-api --region "$REGION" \
  --profile "$PROFILE" --image-ids imageTag=prod \
  --query 'imageDetails[0].imageDigest' --output text)"
info "IMAGE_DIGEST=$IMAGE_DIGEST"

# ── Step 3: ECS task def (digest-pinned + Production env) ────────────────────
info "Step 3 — ECS task definition + deploy commtrac-api-prod"

SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
  --profile "$PROFILE" --region "$REGION" --query ARN --output text)"

TMP_TD="$(mktemp)"
if aws ecs describe-task-definition --task-definition "$TASK_FAMILY" \
  --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  aws ecs describe-task-definition --task-definition "$TASK_FAMILY" \
    --profile "$PROFILE" --region "$REGION" \
    --query taskDefinition > "$TMP_TD.json"
else
  info "No existing $TASK_FAMILY — cloning from DEV task def as template"
  aws ecs describe-task-definition --task-definition default-commtrac-api-ae2c \
    --profile "$PROFILE" --region "$REGION" \
    --query taskDefinition > "$TMP_TD.json"
  python3 - "$TMP_TD.json" "$TASK_FAMILY" "$ECS_SERVICE" <<'PY'
import json, sys
path, family, service = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    td = json.load(f)
td["family"] = family
for key in ("taskDefinitionArn", "revision", "status", "requiresAttributes",
            "compatibilities", "registeredAt", "registeredBy"):
    td.pop(key, None)
with open(path, "w") as f:
    json.dump(td, f, indent=2)
PY
fi

python3 - "$TMP_TD.json" "$ECR" "$IMAGE_DIGEST" "$TASK_ROLE_ARN" "$EXEC_ROLE_ARN" "$SECRET_ARN" <<'PY'
import json, sys
path, ecr, digest, task_role, exec_role, secret_arn = sys.argv[1:]
with open(path) as f:
    td = json.load(f)
for key in ("taskDefinitionArn", "revision", "status", "requiresAttributes",
            "compatibilities", "registeredAt", "registeredBy"):
    td.pop(key, None)
td["family"] = "default-commtrac-api-prod"
td["taskRoleArn"] = task_role
td["executionRoleArn"] = exec_role
container = td["containerDefinitions"][0]
container["name"] = container.get("name") or "Main"
container["image"] = f"{ecr}@{digest}"
container["portMappings"] = [{"containerPort": 80, "hostPort": 80, "protocol": "tcp"}]
secrets = [
    ("Jwt__Key", "Jwt__Key"),
    ("ConnectionStrings__DefaultConnection", "ConnectionStrings__DefaultConnection"),
    ("SeedAdmin__Password", "SeedAdmin__Password"),
    ("SeedProjectManager__Password", "SeedProjectManager__Password"),
]
container["secrets"] = [
    {"name": name, "valueFrom": f"{secret_arn}:{key}::"}
    for name, key in secrets
]
env = {e["name"]: e for e in container.get("environment", []) if "name" in e}
updates = {
    "ASPNETCORE_ENVIRONMENT": "Production",
    "ASPNETCORE_URLS": "http://+:80",
    "Database__Provider": "Postgres",
    "Database__RunMigrationsOnStartup": "false",
    "Storage__Provider": "S3",
    "Storage__Bucket": "strata-ngo-media-prod",
    "Storage__Region": "ap-southeast-2",
    "Storage__KeyPrefix": "commtrac-prod",
    "Email__FrontendBaseUrl": "https://www.strata-ngo.com",
    "Cors__AllowedOrigins__0": "https://www.strata-ngo.com",
    "Cors__AllowDeviceOrigins": "false",
    "SeedProfile": "StrataNgo",
    "SeedAdmin__Email": "admin@StrataNgo.local",
    "SeedProjectManager__Email": "project.manager@StrataNgo.local",
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

if aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'services[0].status' --output text 2>/dev/null | grep -q ACTIVE; then
  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
    --task-definition "$TASK_FAMILY:$NEW_REV" --force-new-deployment \
    --profile "$PROFILE" --region "$REGION" >/dev/null
else
  warn "ECS service $ECS_SERVICE not found — create via AWS MCP/Console (Express Mode), then re-run"
  warn "Task def $TASK_FAMILY:$NEW_REV is registered and ready"
  exit 2
fi

info "Waiting for ECS service stable…"
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
  --profile "$PROFILE" --region "$REGION"
pass "ECS service stable"

# ── Step 4: Prod web build + S3 ────────────────────────────────────────────
info "Step 4 — prod web build + S3 sync"
npm run build:prod-web
npm run check:artifact-isolation -- --profile prod --dist dist
MANIFEST_SHA="$(python3 -c "import json; print(json.load(open('dist/build-manifest.json'))['buildSha'])")"
[[ "$MANIFEST_SHA" == "$MAIN_SHA" ]] && pass "build-manifest buildSha=$MAIN_SHA" \
  || fail "build-manifest buildSha=$MANIFEST_SHA (want $MAIN_SHA)"

aws s3 sync dist/ "s3://$WEB_BUCKET/" --delete \
  --profile "$PROFILE" --region "$REGION"
aws s3 cp dist/index.html "s3://$WEB_BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --profile "$PROFILE" --region "$REGION"
aws s3 cp dist/build-manifest.json "s3://$WEB_BUCKET/build-manifest.json" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --profile "$PROFILE" --region "$REGION"
pass "S3 web sync"

# ── Step 5: Verification ───────────────────────────────────────────────────
info "Step 5 — verification (direct URLs — no DNS cutover)"

if [[ -n "$PROD_API_HOST" ]]; then
  HEALTH="$(curl -sf "https://${PROD_API_HOST}/api/health" || curl -sf "http://${PROD_API_HOST}/api/health")"
  echo "$HEALTH"
  echo "$HEALTH" | grep -qi healthy && pass "/api/health" || fail "/api/health"
  VERSION_JSON="$(curl -sf "https://${PROD_API_HOST}/api/version" || curl -sf "http://${PROD_API_HOST}/api/version")"
  echo "$VERSION_JSON"
  echo "$VERSION_JSON" | grep -q "$MAIN_SHA" && pass "/api/version gitSha" || warn "version gitSha mismatch"
  echo "$VERSION_JSON" | grep -qi Production && pass "environment=Production" || fail "environment not Production"
else
  warn "PROD_API_HOST not set — skip API curl (set ALB DNS after D8)"
fi

if [[ -n "$PROD_CF_DOMAIN" ]]; then
  MANIFEST="$(curl -sS "https://${PROD_CF_DOMAIN}/build-manifest.json")"
  echo "$MANIFEST"
  echo "$MANIFEST" | grep -q '"profile":"prod"' && pass "prod web manifest profile=prod" \
    || fail "prod web manifest"
else
  warn "PROD_CF_DOMAIN not set — skip web curl (set after D7 CloudFront)"
fi

# DEV still healthy
curl -sf https://api.staging.strata-ngo.com/api/health | grep -qi healthy \
  && pass "DEV API unchanged" || fail "DEV API unhealthy — investigate"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Phase D deploy report"
echo "═══════════════════════════════════════════════════════════════"
echo "MAIN_SHA:        $MAIN_SHA"
echo "ECS revision:    $TASK_FAMILY:$NEW_REV"
echo "IMAGE_DIGEST:    $IMAGE_DIGEST"
echo "SeedProfile:     StrataNgo"
echo "DNS cutover:     NOT DONE (Phase F)"
echo "Next:            D7/D8 if not done; Christian P1–P8 gate; Phase F separate"
