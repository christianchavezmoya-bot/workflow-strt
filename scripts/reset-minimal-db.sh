#!/usr/bin/env bash
# Reset local SQLite to a clean Minimal seed (admin + installer, no projects/assets).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${1:-$ROOT/server/Commtrac.Api/commtrac.db}"

if [[ -f "$DB" ]]; then
  echo "Removing $DB"
  rm -f "$DB" "${DB}-wal" "${DB}-shm"
fi

echo "Starting API with SeedProfile=Minimal..."
export ASPNETCORE_ENVIRONMENT=Development
export SeedProfile=Minimal
cd "$ROOT/server/Commtrac.Api"
dotnet run --no-launch-profile &
PID=$!
sleep 8
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

echo "Done. Default logins:"
echo "  admin@commtrac.local / Admin123!"
echo "  installer@commtrac.local / Installer123!"
