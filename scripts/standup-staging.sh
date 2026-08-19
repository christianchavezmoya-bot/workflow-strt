#!/usr/bin/env bash
# Stand up local Docker staging (Postgres + MinIO + API). Requires Docker Desktop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_WEB=false
for arg in "$@"; do
  case "$arg" in
    --build-web) BUILD_WEB=true ;;
    --help|-h)
      echo "Usage: $0 [--build-web]"
      echo "  --build-web  Build dist/ and start nginx on http://localhost:5174"
      exit 0
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "[standup-staging] ERROR: docker not found. Install Docker Desktop."
  exit 1
fi

echo "[standup-staging] Starting Postgres + MinIO + API…"
docker compose -f docker-compose.staging.yml up -d --build

echo "[standup-staging] Waiting for API health…"
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "[standup-staging] API healthy."
    curl -s http://localhost:8080/api/health | head -c 200
    echo ""
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "[standup-staging] ERROR: API did not become healthy in time."
    docker compose -f docker-compose.staging.yml logs api --tail 40
    exit 1
  fi
  sleep 2
done

if [[ "$BUILD_WEB" == true ]]; then
  if [[ ! -f .env.staging.local ]]; then
    cp .env.staging.docker.example .env.staging.local
    echo "[standup-staging] Created .env.staging.local from docker example."
  fi
  echo "[standup-staging] Building web bundle…"
  npm run build:cloud-web:staging
  echo "[standup-staging] Starting nginx web on :5174…"
  # Force-recreate so bind-mounted ./dist is picked up when an old web container
  # was left running from a prior session (otherwise nginx can serve an empty dir → 403).
  docker compose -f docker-compose.staging.yml --profile with-web up -d --force-recreate web
  echo "[standup-staging] Verifying web on :5174…"
  for i in $(seq 1 15); do
    code=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:5174/ 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      echo "[standup-staging] Web healthy (HTTP 200)."
      break
    fi
    if [[ "$i" -eq 15 ]]; then
      echo "[standup-staging] ERROR: web returned HTTP $code (expected 200). Try: docker compose -f docker-compose.staging.yml --profile with-web up -d --force-recreate web"
      docker compose -f docker-compose.staging.yml logs web --tail 20
      exit 1
    fi
    sleep 1
  done
fi

cat <<EOF

[standup-staging] Local staging is up.

  API:          http://localhost:8080/api
  Health:       http://localhost:8080/api/health
  MinIO console http://localhost:9001  (commtrac / commtrac_dev)
  Login:        admin@StrataNgo.local / Admin123!

EOF

if [[ "$BUILD_WEB" == true ]]; then
  echo "  Web (nginx):  http://localhost:5174"
else
  echo "  Web dev:      npm run dev  (VITE_API_BASE=http://localhost:8080/api in .env)"
  echo "  Or re-run:    $0 --build-web"
fi

cat <<EOF

Next: run pre-deploy checklist (web + phone) against this stack, then AWS per:
  docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md

Teardown: docker compose -f docker-compose.staging.yml down
EOF
