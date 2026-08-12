# Commtrac — Cloud Hosting: Assessment, Opinion & AWS Migration Plan

One document: (1) honest readiness assessment, (2) opinion, (3) a concrete AWS migration
plan built around a **two-profile model (local + cloud)** so you can keep developing and
testing locally at every step and only deploy when ready.

**Status:** Phase 0 + Phase 1 *prep* landed in code (secrets hygiene, Postgres provider
switch defaulting to **Sqlite**). The app continues to run locally unchanged.

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
- **No Dockerfile yet** — needed for container hosting.
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

### PHASE 1 — Database: SQLite → PostgreSQL (prep started)

**What shipped (safe prep only):**

- `Database:Provider` config (`Sqlite` default).
- Npgsql package + `UseNpgsql` branch in `Program.cs`.
- SQLite-only `Ensure*` / `Fix*` gated behind `db.Database.IsSqlite()`.

**Still required before switching prod to Postgres:**

1. Regenerate/test EF migrations on Postgres.
2. Port or replace `SearchDocumentChunks` raw SQL.
3. One-time data migration from `commtrac.db` if keeping field data.
4. Local Docker Postgres parity testing.

**Gate:** app runs end-to-end locally on Postgres; migrations apply cleanly.

### PHASE 2 — Media/files: local disk → S3

1. Storage abstraction (local folder / MinIO vs S3).
2. Replace all `Storage/` writers listed above.
3. Local: folder or MinIO; cloud: S3 (+ optional CloudFront).

**Gate:** read/write through abstraction locally.

### PHASE 3 — CORS, HTTPS, forwarded headers, API base URL

1. **CORS:** set `Cors:AllowedOrigins` in production config (hook exists).
2. **Forwarded headers:** `UseForwardedHeaders` behind App Runner/CloudFront.
3. **Frontend:** per-environment `VITE_API_BASE` builds (web + Capacitor release).

**Gate:** prod build + prod CORS verified.

### PHASE 4 — Statelessness audit

1. SSE hub, document search queue, SQLite backup service.
2. Retire `SqliteBackupService` on Postgres/RDS.
3. Controlled migrations (not N instances racing `Migrate()` on boot).

**Gate:** safe restart; no single-instance assumptions for correctness.

### PHASE 5 — Containerize + deploy to AWS

1. Dockerfile for API.
2. RDS Postgres + Secrets Manager.
3. S3 for media.
4. App Runner **or** Beanstalk (SSE spike first).
5. S3 + CloudFront for web `dist/`.
6. Custom domains via ACM.
7. Migration as CI/CD step, not blind multi-instance startup migrate.

---

## Recommended sequence

1. ✅ **Phase 0** — done
2. **Phase 1** — Postgres migrations + local Docker parity (Sqlite stays default until gate passes)
3. **Phase 2 + 3** — S3 abstraction + prod CORS/TLS/API URL
4. **Phase 4** — before scaling past one instance
5. **Phase 5** — AWS deploy

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

See also: `docs/RESEND_EMAIL_SETUP.md`, `server/README.md`.
