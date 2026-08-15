#!/usr/bin/env bash
# Local helper: apply the full EF migration chain to a throwaway Postgres database.
# Not part of CI — CI runs the same test via COMMTRAC_POSTGRES_TEST=1.
set -uo pipefail

cd "$(dirname "$0")/../server/Commtrac.Api.Tests" || exit 1

COMMTRAC_POSTGRES_TEST=1 \
COMMTRAC_POSTGRES_CONNECTION="Host=localhost;Port=5432;Database=commtrac;Username=commtrac;Password=commtrac_dev" \
  dotnet test --nologo --filter "FullyQualifiedName~PostgresMigrationsTests" 2>&1 \
  | grep -E "Passed!|Failed!|PostgresException|error Message|42[0-9]{3}|22[0-9]{3}|Applying" \
  | head -20

echo "--- last applied migration ---"
PGPASSWORD=commtrac_dev psql -h localhost -U commtrac -d commtrac -t \
  -c 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId" DESC LIMIT 1;' 2>/dev/null
