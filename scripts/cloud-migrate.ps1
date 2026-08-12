# Apply EF migrations before cloud instances boot (Production sets RunMigrationsOnStartup=false).
# Usage from repo root:
#   $env:ConnectionStrings__DefaultConnection = "Host=...;Database=commtrac;..."
#   $env:Database__Provider = "Postgres"
#   .\scripts\cloud-migrate.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "server\Commtrac.Api")

Write-Host "[cloud-migrate] Provider=$($env:Database__Provider ?? 'Sqlite')"
dotnet ef database update
Write-Host "[cloud-migrate] Done."
