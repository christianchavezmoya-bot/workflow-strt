# Commtrac — Cloud Hosting: Assessment, Opinion & AWS Migration Plan

One document: (1) honest readiness assessment, (2) opinion, (3) a concrete AWS migration
plan built around a **two-profile model (local + cloud)** so you can keep developing and
testing locally at every step and only deploy when ready.

**Status:** Phase 0 + Phase 1 *parity prep* + Phase 2 *abstraction* + Phase 3 *partial* + Phase 5
*Dockerfile* landed in code. **Sqlite** and **local disk** remain defaults — local dev
unchanged.

**Staging standup:** [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md) — local Docker first, then AWS.

---

# PART 1 — ASSESSMENT (what the code is today)

The app is a **standard ASP.NET Core 8 API + a static Vite/React frontend + a
Capacitor mobile app** — one of the most cloud-portable stacks there is. But it's
currently wired for a **single LAN machine**. Findings:

| Area | Today | Cloud-ready? |
|---|---|---|
| Database | **SQLite file** (`Data Source=commtrac.db`) on local disk | 🔴 No — must move |
| Secrets | Were **committed** in `appsettings.json` | 🟠 Phase 0 removes them; use Development + secrets |
| Media/report files | Written to **local disk** under `Storage/` | 🔴 No — must move |
| CORS | **LAN-only** by default; optional `Cors:AllowedOrigins` for prod | 🟠 Config hook added |
| HTTPS/TLS | Plain HTTP on LAN | 🟠 Needs TLS + forwarded headers |
| Frontend API base | `VITE_API_BASE` → localhost/LAN, baked at build | 🟠 Needs per-env builds |
| Statelessness | In-memory/disk state (SSE registry, SQLite backup, search queue) | 🟠 Audit for multi-instance |
| DB migrations | EF Core Migrations present | 🟢 Good — eases DB move |
| Auth | Stateless JWT | 🟢 Cloud-friendly (once key is a secret) |
| Offline-first FE | Tolerates connectivity gaps by design | 🟢 Real advantage in cloud |
| Config injection | `builder.Configuration[...]` already used | 🟢 Plumbing for env secrets exists |

Concrete anchors (validated against repo):

- DB provider switch: `Program.cs` — `Database:Provider` = `Sqlite` (default) or `Postgres`.
- **Npgsql** package added; **Postgres is opt-in** — local dev unchanged.
- **Dockerfile** at repo root (API only; port 8080) — ready for container hosting.
- **Storage abstraction** (`IFileStorageService`) — **Local** default; **S3** via `Storage:Provider=S3`.
- Frontend builds via `tsc -b && vite build` → static `dist/` (ready for S3/CDN).

### Disk writers (Phase 2 scope — broader than report shares alone)

| Controller / service | Path |
|---|---|
| `DocumentsController` | `Storage/Documents` |
| `AssetDocumentsController` / links | `Storage/Documents/{assetId}` |
| `MobileUploadController` | `Storage/Documents` |
| `WorkflowTemplatesController` / `WorkflowConfigsController` | `Storage/WorkflowMedia` |
| `AssetReportSharesController` | `Storage/AssetReportShares` |
| `InspectionImportsController` | import archives on disk |

**Workflow run step photos/videos** are mostly **base64 in DB JSON** (`StepResultsJson`) —
not separate files.

### SQLite-only bootstrap (Phase 1 complexity)

`DbInitializer.cs` runs **~20 `Ensure*` patches** using `pragma_table_info` / `sqlite_master`.
These are **skipped when `Database:Provider=Postgres`**. Postgres relies on EF migrations only
until those patches are ported or folded into migrations.

`SearchDocumentChunks` uses SQLite DDL in raw SQL — needs a Postgres equivalent before search
works on RDS.

---

# PART 2 — OPINION

**It's a straightforward cloud candidate — but do NOT lift-and-shift as-is.**

**The single most important principle: environment parity through CONFIG, not code.**
Same build, two profiles (local + cloud).

**Local database recommendation:** run **Postgres locally via Docker** when testing the cloud
profile. Keep **Sqlite as default** for day-to-day dev until the team is ready.

**AWS caution:** App Runner is simple but **validate SSE** (`SseHub` long-lived connections)
before committing — Beanstalk/ECS+ALB may be safer if SSE cannot tolerate timeouts.

---

# PART 3 — AWS MIGRATION PLAN (two-profile: local + cloud)

### The two profiles

| Concern | LOCAL profile (dev/testing) | AWS profile (production) |
|---|---|---|
| Database | SQLite (default) or local Postgres (Docker) | **RDS for PostgreSQL** |
| Secrets | `appsettings.Development.json` + user-secrets | **AWS Secrets Manager / SSM** |
| Media/files | Local `Storage/` folder or MinIO | **S3 bucket** |
| API host | `dotnet run` on localhost:4000 | **App Runner** or **Beanstalk** |
| Web host | `vite` dev server / local `dist` | **S3 + CloudFront** |
| API base URL | `http://localhost:4000/api` | `https://api.yourdomain.com/api` |
| CORS allow | LAN policy (default) | `Cors:AllowedOrigins` in config |
| TLS | HTTP (fine locally) | HTTPS (terminate at edge) |

---

### PHASE 0 — Secrets hygiene ✅ (implemented, non-breaking)

**What shipped:**

1. Removed production secrets from committed `appsettings.json` (JWT key, admin password,
   push paths, LAN URLs).
2. **Development-only** defaults in `appsettings.Development.json` — `dotnet run` unchanged.
3. `appsettings.Example.json` documents required keys (names only).
4. `JwtKeyResolver` + `HostingSecretGuard` — **Production fails fast** on missing/weak JWT.
5. `DbInitializer` requires `SeedAdmin:Password` on **first run** in non-Development.

**Local dev:** unchanged — `ASPNETCORE_ENVIRONMENT=Development` + existing admin login.

**Gate:** ✅ app runs locally; no secrets in base `appsettings.json`.

### PHASE 1 — Database: SQLite → PostgreSQL (parity prep ✅ partial)

**What shipped (safe prep only):**

- `Database:Provider` config (`Sqlite` default).
- Npgsql package + `UseNpgsql` branch in `Program.cs`.
- SQLite-only `Ensure*` / `Fix*` gated behind `db.Database.IsSqlite()`.
- **`PostgresSchemaEnsurer`** — PostgreSQL equivalents of all 20 Ensure* patches.
- **`docker-compose.yml`** — Postgres 16 for local cloud-profile testing.
- **`appsettings.PostgresLocal.json`** + `PostgresLocal` launch profile.
- Provider-aware **`SearchDocumentChunks`** (SQLite + Postgres DDL).
- Migrations: `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (cross-database).
- SQLite backup hosted service skipped when `Database:Provider=Postgres`.
- Optional test: `COMMTRAC_POSTGRES_TEST=1 dotnet test`.

**Still required before switching prod to Postgres:**

1. End-to-end soak on Postgres (login, workflows, search, uploads).
2. One-time data migration from `commtrac.db` if keeping field data.
3. Controlled migrations in CI (not N instances racing `Migrate()` on boot).

**Gate:** app runs end-to-end locally on Postgres; migrations apply cleanly.

### PHASE 2 — Media/files: local disk → S3 ✅ (provider shipped)

**What shipped:**

- `IFileStorageService` + `LocalFileStorageService` (`Storage:Provider=Local` default).
- **`S3FileStorageService`** behind `Storage:Provider=S3` (AWS SDK; IAM/env credentials).
- All disk writers use the abstraction; downloads/indexing use streams (no `PhysicalFile` dependency).
- `ListFileNames` for workflow media lookup on S3.
- **MinIO** in `docker-compose.yml` + `S3Local` launch profile for local S3 parity.
- `appsettings.Production.json` template uses `Storage:Provider=S3`.

**Still optional before cloud:**

1. CloudFront signed URLs for large media.
2. Staging soak with real S3 bucket + IAM role.

**Gate:** read/write through abstraction locally ✅; S3 provider available for staging.

### PHASE 3 — CORS, HTTPS, forwarded headers, API base URL (partial ✅)

**What shipped:**
- `UseForwardedHeaders` in non-Development (respects `X-Forwarded-Proto` behind App Runner/CloudFront)
- `appsettings.Production.json` + **`appsettings.Staging.json`** templates
- `/api/health` checks database connectivity + reports `databaseProvider`
- Optional `Cors:AllowedOrigins` (LAN fallback unchanged when empty)
- **`.env.production.example`** + **`.env.staging.example`**
- **`npm run build:cloud-web`** / **`build:cloud-native`** — validates `VITE_API_BASE` (HTTPS for prod)
- **`docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`** — staging → prod AWS steps

**Still required:** Staging build deployed to real URL; CORS + Capacitor store release verified.

**Gate:** prod-config build + CORS verified in staging.

### PHASE 4 — Statelessness audit (partial)

**What shipped:**

- `Database:RunMigrationsOnStartup` — default `true` (dev); **`false` in Production** template so CI applies migrations before instances boot (`scripts/cloud-migrate.ps1` / `.sh`).
- **`docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`** — full **web + phone** verification gate before AWS deploy.

**Still required:**

1. SSE hub multi-instance strategy (stick to **single instance** for v1).
2. Document search queue behavior on restart (rebuild acceptable for v1).
3. Production SSE soak on chosen host (App Runner vs Beanstalk).

**Gate:** pre-deploy checklist PASS on staging; single-instance deploy only until SSE resolved.

### PHASE 5 — Containerize + deploy to AWS (Dockerfile ✅, runbook ✅)

**What shipped:** multi-stage `Dockerfile` + `.dockerignore` (API on port 8080); **[`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md)**.

**Execute in AWS (after pre-deploy checklist PASS):**

1. RDS Postgres + Secrets Manager.
2. S3 for media.
3. App Runner **or** Beanstalk (SSE spike first).
4. S3 + CloudFront for web `dist/`.
5. Custom domains via ACM.
6. Migration as CI/CD step, not blind multi-instance startup migrate.

---

## Recommended sequence

1. ✅ **Phase 0** — done
2. ✅ **Phase 1 parity prep** — PostgresSchemaEnsurer, docker-compose, SearchDocumentChunks port
3. **Phase 1 gate** — full Postgres soak + optional data migration (Sqlite stays default until passes)
4. ✅ **Phase 2 S3 provider** — S3FileStorageService + MinIO local parity
5. ✅ **Phase 3 build scripts + deploy runbook** — `build:cloud-web`, AWS runbook
6. **Pre-deploy gate** — checklist PASS on staging (web + phone)
7. **Phase 4 complete** — SSE soak on staging host
8. **Phase 5 execute** — AWS cutover per runbook after sign-off

## Open decisions

1. Migrate existing `commtrac.db` data or fresh RDS start?
2. Single instance day one (recommended) or multi-instance?
3. Own domain ready?
4. App Runner vs Beanstalk — **run SSE soak test first**

## Local secrets quick reference

```bash
# From server/Commtrac.Api — optional overrides (git-ignored via user-secrets)
dotnet user-secrets set "Jwt:Key" "your-32+-char-random-key-here"
dotnet user-secrets set "SeedAdmin:Password" "YourStrongPassword!"
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Data Source=C:\path\to\commtrac.db"
```

See also: `docs/RESEND_EMAIL_SETUP.md`, `server/README.md`, `docs/CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`, `docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`, `docs/WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`, `docs/IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`.
