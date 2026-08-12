# Commtrac API (ASP.NET Core 8)

## Quick start (dev)
- From `server/Commtrac.Api`, run `dotnet run`
- API base URL: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/swagger`

## Seeded admin (Development only)
- Email: `admin@commtrac.local`
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
- Migrations applied automatically at startup via `DbInitializer`

## Migrations (EF Core)
- Add a migration: `dotnet tool run dotnet-ef migrations add <Name>`
- Update DB: `dotnet tool run dotnet-ef database update`

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
