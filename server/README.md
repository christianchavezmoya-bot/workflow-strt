# Commtrac API (ASP.NET Core 8)

## Quick start (dev)
- From `server/Commtrac.Api`, run `dotnet run`
- API base URL: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/swagger`

## Seeded admin (Development only)
- Email: `admin.dev@stratango.local`
- Password: `Admin123!` (from `appsettings.Development.json`)
- Override via user-secrets: `dotnet user-secrets set "SeedAdmin:Password" "..." --project server/Commtrac.Api`

## Secrets & environments
- **Base** `appsettings.json` — no secrets; safe to commit.
- **Development** `appsettings.Development.json` — local dev defaults (JWT, seed admin).
- **Example** `appsettings.Example.json` — documents all keys; copy names to user-secrets or env vars.
- **Production / Staging** — must set `Jwt:Key` (strong random) and `SeedAdmin:Password` on first deploy.

Cloud migration plan: `docs/CLOUD_HOSTING_AWS_PLAN.md`

## Database
- **Default:** SQLite file `commtrac.db` (created on first run)
- **Optional:** `Database:Provider=Postgres` + Postgres connection string (cloud prep; Sqlite remains default)
- Migrations applied at startup by default (`Database:RunMigrationsOnStartup=true`)

### Local Postgres parity (optional)
```bash
# From repo root
docker compose up -d postgres

# Run API against local Postgres (throwaway profile)
cd server/Commtrac.Api
dotnet run --launch-profile PostgresLocal
```
Uses `appsettings.PostgresLocal.json` (same admin login as Development).

### Local S3 parity via MinIO (optional)
```bash
docker compose up -d minio
# Create bucket "commtrac" in MinIO console: http://localhost:9001

cd server/Commtrac.Api
dotnet run --launch-profile S3Local
```
Uses `appsettings.S3Local.json` (MinIO at localhost:9000). **Default dev still uses local disk.**

Optional integration test (requires Postgres running):
```bash
COMMTRAC_POSTGRES_TEST=1 dotnet test server/Commtrac.Api.Tests
```

## Migrations (EF Core)
- Add a migration: `dotnet tool run dotnet-ef migrations add <Name>`
- Update DB: `dotnet tool run dotnet-ef database update`
- **Cloud / Production:** set `Database:RunMigrationsOnStartup=false`; run `scripts/cloud-migrate.ps1` (or `.sh`) from CI before instances boot.

## Pre-deploy verification

Before AWS cutover, complete [`docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](../docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md) — full web + phone sign-off on staging.

Deploy steps: [`docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](../docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md).

Staging standup: [`docs/CLOUD_HOSTING_STAGING_STANDUP.md`](../docs/CLOUD_HOSTING_STAGING_STANDUP.md).

```powershell
# Local Docker staging (Postgres + MinIO + API on :8080)
.\scripts\standup-staging.ps1 -BuildWeb
```

### Cloud web / native builds

```bash
cp .env.staging.example .env.staging.local   # set VITE_API_BASE
npm run build:cloud-web:staging              # web dist/
npm run build:cloud-native:staging           # web + cap sync
```

## IIS / production environment variables
- `ConnectionStrings__DefaultConnection`
- `Jwt__Key`, `Jwt__Issuer`, `Jwt__Audience`
- `SeedAdmin__Email`, `SeedAdmin__Password` (required on first run)
- `Cors__AllowedOrigins__0=https://app.yourdomain.com` (repeat index for multiple origins)
- `Email__*` / `Push__*` as needed

## CORS
- **Development:** LAN-friendly policy (localhost, private IPs) — unchanged for phone testing.
- **Production:** set `Cors:AllowedOrigins` in config when deploying to a fixed web domain.

## Auth
- JWT bearer authentication
- `POST /api/auth/login` returns `{ token, user, isFirstLogin }`
