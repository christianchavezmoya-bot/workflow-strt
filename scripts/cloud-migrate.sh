#!/usr/bin/env bash
# Apply EF migrations before cloud instances boot (Production sets RunMigrationsOnStartup=false).
# Usage from repo root:
#   export ConnectionStrings__DefaultConnection="Host=...;Database=commtrac;..."
#   export Database__Provider=Postgres
#   ./scripts/cloud-migrate.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server/Commtrac.Api"

echo "[cloud-migrate] Provider=${Database__Provider:-Sqlite}"
dotnet ef database update
echo "[cloud-migrate] Done."
