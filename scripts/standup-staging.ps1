# Stand up local Docker staging (Postgres + MinIO + API). Requires Docker Desktop.
param(
    [switch]$BuildWeb
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "[standup-staging] docker not found. Install Docker Desktop."
}

Write-Host "[standup-staging] Starting Postgres + MinIO + API…"
docker compose -f docker-compose.staging.yml up -d --build

Write-Host "[standup-staging] Waiting for API health…"
$healthy = $false
for ($i = 1; $i -le 60; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/health" -TimeoutSec 5
        if ($resp.status -eq "healthy") {
            $healthy = $true
            $resp | ConvertTo-Json -Compress
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $healthy) {
    Write-Error "[standup-staging] API did not become healthy. Logs: docker compose -f docker-compose.staging.yml logs api"
}

if ($BuildWeb) {
    if (-not (Test-Path ".env.staging.local")) {
        Copy-Item ".env.staging.docker.example" ".env.staging.local"
        Write-Host "[standup-staging] Created .env.staging.local"
    }
    Write-Host "[standup-staging] Building web bundle…"
    npm run build:cloud-web:staging
    Write-Host "[standup-staging] Starting nginx on :5174…"
    # Force-recreate so bind-mounted ./dist is picked up when an old web container
    # was left running from a prior session (otherwise nginx can serve an empty dir → 403).
    docker compose -f docker-compose.staging.yml --profile with-web up -d --force-recreate web
    Write-Host "[standup-staging] Verifying web on :5174…"
    $webOk = $false
    for ($i = 1; $i -le 15; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:5174/" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) {
                $webOk = $true
                Write-Host "[standup-staging] Web healthy (HTTP 200)."
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $webOk) {
        Write-Error "[standup-staging] Web did not return HTTP 200. Logs: docker compose -f docker-compose.staging.yml logs web"
    }
}

Write-Host @"

[standup-staging] Local staging is up.

  API:           http://localhost:8080/api
  Health:        http://localhost:8080/api/health
  MinIO console: http://localhost:9001  (commtrac / commtrac_dev)
  Login:         admin@StrataNgo.local / Admin123!

"@

if ($BuildWeb) {
    Write-Host "  Web (nginx):   http://localhost:5174"
} else {
    Write-Host "  Web dev:       npm run dev  (set VITE_API_BASE=http://localhost:8080/api)"
    Write-Host "  Or re-run:     .\scripts\standup-staging.ps1 -BuildWeb"
}

Write-Host @"
Next: docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md then AWS: docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md
Teardown: docker compose -f docker-compose.staging.yml down
"@
