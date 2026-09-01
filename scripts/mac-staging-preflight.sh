#!/usr/bin/env bash
# Automated API + web checks against local Docker staging.
# Run on the Mac after: ./scripts/standup-staging.sh --build-web
#
# Usage:
#   ./scripts/mac-staging-preflight.sh
#   LANIP=192.168.1.50 ./scripts/mac-staging-preflight.sh   # also verify phone path
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API="${API:-http://localhost:8080/api}"
WEB="${WEB:-http://localhost:5174}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@StrataNgo.local}"
ADMIN_PASS="${ADMIN_PASS:-Admin123!}"
PM_EMAIL="${PM_EMAIL:-project.manager@StrataNgo.local}"
PM_PASS="${PM_PASS:-Pm123!}"
CHAMBERS_PRODUCT_ID="${CHAMBERS_PRODUCT_ID:-prod-chambers}"

fail=0
pass() { echo "PASS: $1"; }
fail_msg() { echo "FAIL: $1"; fail=1; }

echo "[preflight] API=$API WEB=$WEB"

HEALTH=$(curl -sf "$API/health" 2>/dev/null) || { fail_msg "health endpoint"; HEALTH=""; }
echo "$HEALTH" | grep -qi postgres && pass "health Postgres provider" || fail_msg "health Postgres provider"
echo "$HEALTH" | grep -qi healthy && pass "health status" || fail_msg "health status"

LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null) || LOGIN=""
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')" 2>/dev/null)
[[ -n "$TOKEN" ]] && pass "admin login token" || fail_msg "admin login token"

auth() { curl -sf -H "Authorization: Bearer $TOKEN" "$1" 2>/dev/null; }

BRAND=$(auth "$API/brand-settings")
echo "$BRAND" | grep -qi "Strata N-Go" && pass "brand app-name Strata N-Go" || fail_msg "brand app-name Strata N-Go"

OFFICES=$(auth "$API/offices")
echo "$OFFICES" | grep -qi Newcastle && pass "office Newcastle" || fail_msg "office Newcastle"
echo "$OFFICES" | grep -qi Perth && pass "office Perth" || fail_msg "office Perth"

CUSTOMERS=$(auth "$API/customers")
echo "$CUSTOMERS" | grep -qi "BHP/Mining" && pass "customer BHP/Mining" || fail_msg "customer BHP/Mining"

USERS=$(auth "$API/users")
echo "$USERS" | grep -qi "admin@StrataNgo.local" && pass "user admin seeded" || fail_msg "user admin seeded"
echo "$USERS" | grep -qi "project.manager@StrataNgo.local" && pass "user PM seeded" || fail_msg "user PM seeded"

PRODUCTS=$(auth "$API/products")
echo "$PRODUCTS" | grep -qi '"name":"AIM-100"' && pass "product AIM-100 seeded" || fail_msg "product AIM-100 seeded"

WFS=$(auth "$API/workflow-configs/by-product/$CHAMBERS_PRODUCT_ID?status=Published")
echo "$WFS" | grep -qi "Chambers_default" && pass "Chambers_default workflow" || fail_msg "Chambers_default workflow"

BOM_CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/bom-import-runs")
[[ "$BOM_CODE" == "200" ]] && pass "BOM API enabled (HTTP 200)" || fail_msg "BOM API enabled (HTTP $BOM_CODE, want 200)"

PM_LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PM_EMAIL\",\"password\":\"$PM_PASS\"}" 2>/dev/null) || PM_LOGIN=""
PM_TOKEN=$(echo "$PM_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')" 2>/dev/null)
[[ -n "$PM_TOKEN" ]] && pass "PM login token" || fail_msg "PM login token"

if [[ -d dist/assets ]]; then
  grep -rq "bom-project\|BomDashboard" dist/assets/*.js 2>/dev/null && pass "web bundle includes BOM module" || fail_msg "web bundle includes BOM module"
else
  fail_msg "dist/ missing — run standup with --build-web or npm run build:cloud-web:staging"
fi

WEB_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "$WEB/" 2>/dev/null || echo "000")
[[ "$WEB_CODE" == "200" ]] && pass "web serves login shell ($WEB)" || fail_msg "web ($WEB HTTP $WEB_CODE)"

if [[ -n "${LANIP:-}" ]]; then
  LAN_API="http://$LANIP:8080/api"
  LAN_WEB="http://$LANIP:5174"
  curl -sf "$LAN_API/health" >/dev/null && pass "LAN API health ($LAN_API)" || fail_msg "LAN API health ($LAN_API)"
  LAN_WEB_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "$LAN_WEB/" 2>/dev/null || echo "000")
  [[ "$LAN_WEB_CODE" == "200" ]] && pass "LAN web ($LAN_WEB)" || fail_msg "LAN web ($LAN_WEB HTTP $LAN_WEB_CODE)"
fi

echo "--- preflight done; failures=$fail ---"
exit $fail
