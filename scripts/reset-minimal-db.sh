#!/usr/bin/env bash
# Bring the local SQLite database back to a clean catalog for field testing.
#
#   --clean (default)  keep the database, boot with SeedProfile=Minimal so the demo
#                      project/catalog is purged. Users, SMTP settings and anything
#                      you created are preserved.
#   --wipe             delete the database first, then seed admin + installer only.
#                      SMTP settings are lost and must be re-entered.
#
# Either way the app ends up with the default divisions: Strata Connect,
# Strata Protect, Strata AI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="clean"
DB="$ROOT/server/Commtrac.Api/commtrac.db"
# From-scratch migrates ~98 EF migrations before seeding; cold machines need more than 10s.
BOOT_TIMEOUT_SEC="${BOOT_TIMEOUT_SEC:-120}"
BOOT_URL="${BOOT_URL:-http://127.0.0.1:4000/api/health}"

for arg in "$@"; do
  case "$arg" in
    --clean) MODE="clean" ;;
    --wipe)  MODE="wipe" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) DB="$arg" ;;
  esac
done

if [[ "$MODE" == "wipe" && -f "$DB" ]]; then
  echo "Removing $DB"
  rm -f "$DB" "${DB}-wal" "${DB}-shm"
fi

echo "Starting API with SeedProfile=Minimal ($MODE)..."
export ASPNETCORE_ENVIRONMENT=Development
export SeedProfile=Minimal
export ConnectionStrings__DefaultConnection="Data Source=$DB"
export ASPNETCORE_URLS="${ASPNETCORE_URLS:-http://127.0.0.1:4000}"
cd "$ROOT/server/Commtrac.Api"
dotnet run --no-launch-profile &
PID=$!

ready=0
for ((i=1; i<=BOOT_TIMEOUT_SEC; i++)); do
  if curl -sf "$BOOT_URL" >/dev/null 2>&1; then
    ready=1
    echo "API healthy after ${i}s."
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "API process exited before becoming healthy." >&2
    wait "$PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Timed out waiting for $BOOT_URL after ${BOOT_TIMEOUT_SEC}s." >&2
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  exit 1
fi

# Give DbInitializer one beat to finish SaveChanges after /health is up.
sleep 2
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

if command -v sqlite3 >/dev/null 2>&1 && [[ -f "$DB" ]]; then
  echo "Projects:  $(sqlite3 "$DB" 'select count(*) from Projects;')"
  echo "Divisions: $(sqlite3 "$DB" "select group_concat(Name, ', ') from Divisions;")"
fi

echo "Done. Restart the API normally with SeedProfile=Minimal (or --launch-profile Minimal)."
if [[ "$MODE" == "wipe" ]]; then
  echo "Default logins:"
  echo "  admin@commtrac.local / Admin123!"
  echo "  installer@commtrac.local / Installer123!"
  echo "Re-enter SMTP settings in Settings → Notifications."
fi
