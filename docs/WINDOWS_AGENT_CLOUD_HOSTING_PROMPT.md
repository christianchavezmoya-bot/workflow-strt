# Windows agent — Cloud hosting AWS plan (verify + continue)

**Copy everything below the line into your Windows Cursor agent.**

**Branch:** `main` @ **`c54c0a7`** (or newer)  
**Plan:** [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md)  
**Server guide:** [`../server/README.md`](../server/README.md)  
**Mac prompt:** [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md)  
**Login (dev profiles):** `admin.dev@stratango.local` / `Admin123!`

**Goal:** (1) Quick-verify cloud prep on `main` without breaking default dev. (2) Continue implementing remaining AWS plan phases (4→5).

---

## PROMPT START

You are the **Windows web/API agent** for Commtrac **cloud hosting**.

### What's already implemented (on `main` — do not re-build unless fixing bugs)

| Phase | Status | Config / files |
|-------|--------|----------------|
| **0 Secrets** | ✅ | Sanitized `appsettings.json`; dev defaults in `appsettings.Development.json`; prod fail-fast JWT |
| **1 Postgres prep** | ✅ | `Database:Provider=Postgres`; `PostgresSchemaEnsurer`; `docker-compose` postgres; `PostgresLocal` profile |
| **2 Storage** | ✅ | `IFileStorageService`; Local default; **S3** via `Storage:Provider=S3`; MinIO in docker-compose; `S3Local` profile |
| **3 Partial** | ✅ | Forwarded headers (non-Dev); `Cors:AllowedOrigins`; `/api/health` DB check; `.env.production.example` |
| **5 Dockerfile** | ✅ | Root `Dockerfile` (API port 8080) |

**Defaults unchanged:** day-to-day dev = **Sqlite** + **local `Storage/`** — `dotnet run` + `npm run dev` with no extra config.

### What's left to implement (your coding work, in order)

1. **Phase 1 gate** — full Postgres soak (login, uploads, search, workflows); optional `commtrac.db` → Postgres migration tool/script.
2. **Phase 3** — prod web/mobile build pipeline docs + staging CORS verification.
3. **Phase 4** — statelessness (SSE hub, search queue, migrate-on-boot races); single-instance recommendation documented.
4. **Phase 5** — AWS: RDS + S3 bucket + Secrets Manager + App Runner/Beanstalk + CloudFront for `dist/`; **SSE soak before App Runner**.

**Rules:** Same build, two profiles via **config only**. Never switch repo defaults to Postgres/S3. Do not commit LAN IPs, JWT overrides, or `.env.production.local`.

---

## Part 0 — Pull + default dev sanity (~2 min)

```powershell
cd C:\Users\cchavez\Documents\Commtrac\workflow-strt   # adjust path
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
# expect: c54c0a7 Merge pull request #169 ...  (or newer)
```

**Terminal 1 — API (default Sqlite):**

```powershell
cd server\Commtrac.Api
dotnet run
```

**Terminal 2 — Web:**

```powershell
npm run dev
```

| ID | Check | PASS if |
|----|-------|---------|
| D0 | Health | `curl http://localhost:4000/api/health` → 200, DB ok |
| D1 | Login | Web login `admin.dev@stratango.local` / `Admin123!` → Dashboard loads |
| D2 | Upload | Tips or Documents: upload a small PDF/image → preview/download works |

Post when ready:

```
Windows cloud-hosting ready @ <hash>
Default dev: PASS / FAIL
API: http://<LAN-IP>:4000/api/health
Mac: pull same hash for native smoke
```

---

## Part 1 — Automated gates (~1 min)

```powershell
cd server\Commtrac.Api
dotnet build

cd ..\Commtrac.Api.Tests
dotnet test
# expect: 4 passed (includes optional Postgres test that skips unless env set)
```

| ID | PASS if |
|----|---------|
| A1 | `dotnet build` — 0 errors |
| A2 | `dotnet test` — all passed |

Optional frontend typecheck:

```powershell
npx tsc -b
```

---

## Part 2 — Cloud profiles (optional parity — needs Docker Desktop)

Skip entire Part 2 if Docker is not installed; report **SKIPPED**.

### P1 — Postgres profile

```powershell
# repo root
docker compose up -d postgres
# wait ~10s

cd server\Commtrac.Api
dotnet run --launch-profile PostgresLocal
```

New terminal:

```powershell
curl http://localhost:4000/api/health
# login on web — same admin credentials
```

| ID | PASS if |
|----|---------|
| P1a | API starts without migration crash |
| P1b | Login + Dashboard load |
| P1c | Settings → backups returns **501** (SQLite backups disabled on Postgres) — expected |

Optional automated Postgres migration test (destroys/resets `commtrac` DB in Docker):

```powershell
$env:COMMTRAC_POSTGRES_TEST="1"
dotnet test server\Commtrac.Api.Tests --filter Postgres
```

### S1 — S3 / MinIO profile

```powershell
docker compose up -d minio
# Open http://localhost:9001 — login commtrac / commtrac_dev
# Create bucket named: commtrac

cd server\Commtrac.Api
dotnet run --launch-profile S3Local
```

| ID | PASS if |
|----|---------|
| S1a | Console shows `[Storage] Provider: S3 (bucket=commtrac)` |
| S1b | Upload a document → download/preview works (object in MinIO) |
| S1c | Workflow template media upload + serve image works |

### C1 — Container smoke

```powershell
# repo root — after docker build
docker build -t commtrac-api:local .
docker run --rm -p 8080:8080 -e ASPNETCORE_ENVIRONMENT=Development commtrac-api:local
curl http://localhost:8080/api/health
```

| ID | PASS if |
|----|---------|
| C1 | Container starts; health returns 200 (Dev + Sqlite in container is OK for smoke) |

---

## Part 3 — Continue AWS plan (when verification passes)

Pick **one** phase per PR; branch name `cursor/cloud-hosting-<topic>-cd21`.

| Next work | Suggested branch focus |
|-----------|------------------------|
| Phase 1 gate | Postgres soak fixes, data migration script |
| Staging AWS | Follow [`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md) |
| **Stand up + verify local Docker staging** | Field test: [`WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`](./WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md) · `.\scripts\standup-staging.ps1 -BuildWeb` · [`CLOUD_HOSTING_STAGING_STANDUP.md`](./CLOUD_HOSTING_STAGING_STANDUP.md) |
| Phase 4 | SSE multi-instance spike doc/code |

Update `docs/CLOUD_HOSTING_AWS_PLAN.md` when shipping. Run `dotnet build` + `dotnet test` + `npm run build` before push.

---

## Part 4 — Report format (paste back)

```
Cloud hosting Windows @ <hash>

DEFAULT DEV
D0 health: PASS / FAIL
D1 login: PASS / FAIL
D2 upload: PASS / FAIL

AUTOMATED
A1 build: PASS / FAIL
A2 tests: PASS / FAIL (<n> passed)

CLOUD PROFILES (or SKIPPED — no Docker)
P1 Postgres: PASS / FAIL / SKIPPED
S1 MinIO S3: PASS / FAIL / SKIPPED
C1 Docker image: PASS / FAIL / SKIPPED

Blockers: none / <list>
Next phase implemented: none / Phase <n> — <summary>
```

**Rules:** Do not commit LAN IPs or secrets. Report before merging cloud-hosting PRs. Tell Mac agent your hash when default dev passes.

### Before AWS deploy (mandatory gate)

When cloud **prep** is done and staging is wired (Postgres + S3 + HTTPS + prod `VITE_API_BASE`):

1. Run **[`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)** — full **web (W1–W11)** + **phone (P1–P8)** on staging.
2. Mac agent owns phone section; Windows owns web + automated gates.
3. **Do not deploy to AWS production** until sign-off section is YES.

## PROMPT END
