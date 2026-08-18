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
cd "$ROOT/server/Commtrac.Api"
dotnet run --no-launch-profile &
PID=$!
sleep 10
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
